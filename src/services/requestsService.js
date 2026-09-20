import { requestsRepository } from '../repositories/requestsRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { paginate } from '../utils/pagination.js';

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
        return requestsRepository.create(data);
    },

    async update(id, patch) {
        await this.getById(id);
        return requestsRepository.update(id, patch);
    },

    async changeStatus(id, status) {
        const current = await this.getById(id);
        const allowed = TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(status)) {
            throw new ConflictError(
                `Недопустимый переход статуса: ${current.status} → ${status}`,
                'INVALID_STATUS_TRANSITION',
            );
        }
        return requestsRepository.update(id, { status });
    },

    async remove(id) {
        await this.getById(id);
        await requestsRepository.remove(id);
    },
};