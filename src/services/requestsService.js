import { requestsRepository } from '../repositories/requestsRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { ForbiddenError } from '../errors/ForbiddenError.js';
import { getLog } from '../utils/context.js';
import { resolveOffset } from '../utils/paging.js';
import { countCreatedRequest } from '../metrics/index.js';

const TRANSITIONS = {
    new: ['in_progress', 'rejected'],
    in_progress: ['done', 'rejected'],
    done: [],
    rejected: [],
};

// Автор в истории изменений: авторизации в сервисе нет, все изменения приходят через API.
const HISTORY_AUTHOR = 'api';

const ASSIGNEE_REQUIRED_CODE = 'ASSIGNEE_REQUIRED';
const NO_CREW_MESSAGE = 'Нельзя перевести заявку в in_progress без назначенных исполнителей';
const NO_LAST_ASSIGNEE_MESSAGE = 'Нельзя снять последнего исполнителя с заявки в статусе in_progress';
const NOT_ASSIGNED_MESSAGE = 'Специалист может менять статус только тех заявок, на которые он назначен';

// Правило живёт в сервисе, а не только в маршрутах: сервис должен отличать
// «не хватает прав» от «недопустимое состояние» даже при вызове из другого места.
function assertCanChangeStatus(actor, request) {
    if (!actor || actor.role === 'admin') return;

    if (actor.role !== 'technician') {
        throw new ForbiddenError('Роль viewer не позволяет менять статус заявок', 'ROLE_REQUIRED');
    }

    const isAssigned =
        actor.technicianId !== null &&
        request.assignees.some((assignee) => assignee.technicianId === actor.technicianId);
    if (!isAssigned) {
        getLog().warn(
            { event: 'status_change_forbidden', requestId: request.id, userId: actor.id, technicianId: actor.technicianId },
            'Смена статуса заявки, на которой специалист не назначен',
        );
        throw new ForbiddenError(NOT_ASSIGNED_MESSAGE, 'NOT_ASSIGNED');
    }
}

export const requestsService = {
    async list({ page, limit, offset, ...filters }) {
        const { rows, total } = await requestsRepository.findPage(filters, {
            limit,
            offset: resolveOffset({ page, limit, offset }),
        });
        return { data: rows, meta: { total, page, limit } };
    },

    async getById(id) {
        const item = await requestsRepository.findById(id);
        if (!item) throw new NotFoundError('Заявка');
        return item;
    },

    async create(data) {
        const equipment = await equipmentRepository.findById(data.equipmentId);
        if (!equipment) throw new NotFoundError('Оборудование');
        const created = await requestsRepository.create(data);
        countCreatedRequest(created.priority);
        getLog().info({ event: 'request_created', id: created.id, equipmentId: created.equipmentId }, 'Заявка создана');
        return created;
    },

    async update(id, patch) {
        const current = await this.getById(id);
        const updated = await requestsRepository.update(id, patch);
        getLog().info({ event: 'request_updated', id, from: current, to: patch }, 'Заявка обновлена');
        return updated;
    },

    async changeStatus(id, status, actor) {
        const current = await this.getById(id);
        assertCanChangeStatus(actor, current);

        const allowed = TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(status)) {
            getLog().warn({ event: 'invalid_status_transition', id, from: current.status, to: status }, 'Недопустимый переход статуса');
            throw new ConflictError(
                `Недопустимый переход статуса: ${current.status} → ${status}`,
                'INVALID_STATUS_TRANSITION',
            );
        }

        if (status === 'in_progress' && current.assignees.length === 0) {
            getLog().warn({ event: 'in_progress_without_assignees', id }, 'Перевод в in_progress без назначенных исполнителей');
            throw new ConflictError(NO_CREW_MESSAGE, ASSIGNEE_REQUIRED_CODE);
        }

        const updated = await requestsRepository.setStatus(id, status, { author: HISTORY_AUTHOR });
        getLog().info({ event: 'request_status_changed', id, from: current.status, to: status, userId: actor?.id }, 'Статус заявки изменён');
        return updated;
    },

    async history(id, { page, limit, offset } = {}) {
        await this.getById(id);
        const { rows, total } = await requestsRepository.findStatusHistory(id, {
            limit,
            offset: resolveOffset({ page, limit, offset }),
        });
        return { data: rows, meta: { total, page, limit } };
    },

    async assignCrew(id, assignees) {
        await this.getById(id);

        const technicianIds = assignees.map((a) => a.technicianId);
        const existing = await requestsRepository.findExistingTechnicianIds(technicianIds);
        const unknown = technicianIds.filter((technicianId) => !existing.includes(technicianId));
        if (unknown.length > 0) {
            throw new NotFoundError(`Специалист(ы) ${unknown.join(', ')}`);
        }

        // Правило бригады: ровно один специалист с ролью lead. Проверка выполняется
        // внутри транзакции replaceAssignees — нарушение откатывает снятие прежних
        // назначений и не оставляет заявку без исполнителей.
        const validateCrew = (crew) => {
            const leads = crew.filter((a) => a.role === 'lead');
            if (leads.length !== 1) {
                throw new ValidationError([
                    {
                        field: 'role',
                        message: `в бригаде должен быть ровно один специалист с ролью lead, передано: ${leads.length}`,
                    },
                ]);
            }
        };

        try {
            return await requestsRepository.replaceAssignees(id, assignees, { validateCrew });
        } catch (error) {
            if (error instanceof ValidationError) {
                getLog().warn({ event: 'crew_rule_violated', requestId: id }, 'Нарушено правило бригады: нужен ровно один lead');
            }
            throw error;
        }
    },

    async removeAssignee(id, technicianId) {
        const request = await this.getById(id);

        const isLast =
            request.status === 'in_progress' &&
            request.assignees.length === 1 &&
            request.assignees[0].technicianId === technicianId;
        if (isLast) {
            getLog().warn({ event: 'last_assignee_removed', requestId: id, technicianId }, 'Снятие последнего исполнителя с заявки в работе');
            throw new ConflictError(NO_LAST_ASSIGNEE_MESSAGE, ASSIGNEE_REQUIRED_CODE);
        }

        const removed = await requestsRepository.removeAssignee(id, technicianId);
        if (!removed) throw new NotFoundError('Назначение специалиста на заявку');

        getLog().info({ event: 'assignee_removed', requestId: id, technicianId }, 'Специалист снят с заявки');
    },

    async remove(id) {
        await this.getById(id);
        await requestsRepository.remove(id);
        getLog().info({ event: 'request_removed', id }, 'Заявка удалена');
    },
};