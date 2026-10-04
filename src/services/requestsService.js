import { requestsRepository } from '../repositories/requestsRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { getLog } from '../utils/context.js';
import { resolveOffset } from '../utils/paging.js';
import { countCreatedRequest } from '../metrics/index.js';
import {
    assertAssigneeRemovable,
    assertCanChangeStatus,
    assertCrewAssigned,
    assertTransitionAllowed,
    validateCrew,
} from './requestRules.js';

// Автор в истории изменений: авторизации в сервисе нет, все изменения приходят через API.
const HISTORY_AUTHOR = 'api';

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
        assertTransitionAllowed(current, status);

        if (status === 'in_progress') assertCrewAssigned(current);

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

        assertAssigneeRemovable(request, technicianId);

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