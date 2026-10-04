// Правила заявок, не зависящие от БД: переходы статусов, состав бригады и права.
//
// Вынесены в отдельный модуль намеренно. В сервисе эти проверки живут вперемешку
// с обращениями к репозиторию, поэтому напрямую их не проверить: модульные тесты
// (tests/unit/requestRules.test.js) работают без базы и без HTTP, а сервис
// им пользуется, чтобы правила не расходились между слоями.
import { ConflictError } from '../errors/ConflictError.js';
import { ForbiddenError } from '../errors/ForbiddenError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { getLog } from '../utils/context.js';

export const STATUS_TRANSITIONS = {
    new: ['in_progress', 'rejected'],
    in_progress: ['done', 'rejected'],
    done: [],
    rejected: [],
};

export const ASSIGNEE_REQUIRED_CODE = 'ASSIGNEE_REQUIRED';
export const NO_CREW_MESSAGE = 'Нельзя перевести заявку в in_progress без назначенных исполнителей';
export const NO_LAST_ASSIGNEE_MESSAGE = 'Нельзя снять последнего исполнителя с заявки в статусе in_progress';
export const NOT_ASSIGNED_MESSAGE = 'Специалист может менять статус только тех заявок, на которые он назначен';

export function isTransitionAllowed(from, to) {
    return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

// Правило живёт не только в маршрутах: сервис должен отличать «не хватает прав»
// от «недопустимое состояние» даже при вызове из другого места.
export function assertCanChangeStatus(actor, request) {
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

export function assertTransitionAllowed(request, status) {
    if (isTransitionAllowed(request.status, status)) return;

    getLog().warn(
        { event: 'invalid_status_transition', id: request.id, from: request.status, to: status },
        'Недопустимый переход статуса',
    );
    throw new ConflictError(`Недопустимый переход статуса: ${request.status} → ${status}`, 'INVALID_STATUS_TRANSITION');
}

export function assertCrewAssigned(request) {
    if (request.assignees.length > 0) return;

    getLog().warn({ event: 'in_progress_without_assignees', id: request.id }, 'Перевод в in_progress без назначенных исполнителей');
    throw new ConflictError(NO_CREW_MESSAGE, ASSIGNEE_REQUIRED_CODE);
}

// Ровно один специалист с ролью lead. Вызывается внутри транзакции
// replaceAssignees: нарушение откатывает снятие прежних назначений и не
// оставляет заявку без исполнителей.
export function validateCrew(crew) {
    const leads = crew.filter((assignee) => assignee.role === 'lead');
    if (leads.length === 1) return;

    throw new ValidationError([
        {
            field: 'role',
            message: `в бригаде должен быть ровно один специалист с ролью lead, передано: ${leads.length}`,
        },
    ]);
}

export function assertAssigneeRemovable(request, technicianId) {
    const isLast =
        request.status === 'in_progress' &&
        request.assignees.length === 1 &&
        request.assignees[0].technicianId === technicianId;
    if (!isLast) return;

    getLog().warn(
        { event: 'last_assignee_removed', requestId: request.id, technicianId },
        'Снятие последнего исполнителя с заявки в работе',
    );
    throw new ConflictError(NO_LAST_ASSIGNEE_MESSAGE, ASSIGNEE_REQUIRED_CODE);
}