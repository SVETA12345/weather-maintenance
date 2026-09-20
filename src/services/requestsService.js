import { requestsRepository } from '../repositories/requestsRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { paginate } from '../utils/pagination.js';
import { getLog } from '../utils/context.js';

const TRANSITIONS = {
    new: ['in_progress', 'rejected'],
    in_progress: ['done', 'rejected'],
    done: [],
    rejected: [],
};

export const requestsService = {
    async list(query) {
        const all = await requestsRepository.findAll();
        let filtered = all;
        if (query.status) filtered = filtered.filter((r) => r.status === query.status);
        if (query.priority) filtered = filtered.filter((r) => r.priority === query.priority);
        if (query.equipmentId) filtered = filtered.filter((r) => r.equipmentId === query.equipmentId);
        if (query.from) filtered = filtered.filter((r) => r.createdAt >= query.from);
        if (query.to) filtered = filtered.filter((r) => r.createdAt <= query.to);

        if (query.sortBy) {
            const dir = query.order === 'desc' ? -1 : 1;
            filtered = [...filtered].sort((a, b) =>
                a[query.sortBy] > b[query.sortBy] ? dir : a[query.sortBy] < b[query.sortBy] ? -dir : 0,
            );
        }
        return paginate(filtered, query);
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
        getLog().info({ event: 'request_created', id: created.id, equipmentId: created.equipmentId }, 'Заявка создана');
        return created;
    },

    async update(id, patch) {
        const current = await this.getById(id);
        const updated = await requestsRepository.update(id, patch);
        getLog().info({ event: 'request_updated', id, from: current, to: patch }, 'Заявка обновлена');
        return updated;
    },

    async changeStatus(id, status) {
        const current = await this.getById(id);
        const allowed = TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(status)) {
            getLog().warn({ event: 'invalid_status_transition', id, from: current.status, to: status }, 'Недопустимый переход статуса');
            throw new ConflictError(
                `Недопустимый переход статуса: ${current.status} → ${status}`,
                'INVALID_STATUS_TRANSITION',
            );
        }
        const updated = await requestsRepository.update(id, { status });
        getLog().info({ event: 'request_status_changed', id, from: current.status, to: status }, 'Статус заявки изменён');
        return updated;
    },

    async remove(id) {
        await this.getById(id);
        await requestsRepository.remove(id);
        getLog().info({ event: 'request_removed', id }, 'Заявка удалена');
    },
};