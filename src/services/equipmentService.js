import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { requestsRepository } from '../repositories/requestsRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { paginate } from '../utils/pagination.js';
import { getLog } from '../utils/context.js';

export const equipmentService = {
    async list(query) {
        const all = await equipmentRepository.findAll();
        let filtered = all;
        if (query.status) filtered = filtered.filter((e) => e.status === query.status);
        if (query.type) filtered = filtered.filter((e) => e.type === query.type);

        if (query.sortBy) {
            const dir = query.order === 'desc' ? -1 : 1;
            filtered = [...filtered].sort((a, b) =>
                a[query.sortBy] > b[query.sortBy] ? dir : a[query.sortBy] < b[query.sortBy] ? -dir : 0,
            );
        }
        return paginate(filtered, query);
    },

    async getById(id) {
        const item = await equipmentRepository.findById(id);
        if (!item) throw new NotFoundError('Оборудование');
        return item;
    },

    async create(data) {
        const existing = await equipmentRepository.findBySerial(data.serialNumber);
        if (existing) {
            getLog().warn({ event: 'equipment_serial_conflict', serialNumber: data.serialNumber }, 'Серийный номер уже занят');
            throw new ConflictError('Серийный номер уже занят', 'SERIAL_CONFLICT');
        }
        const created = await equipmentRepository.create(data);
        getLog().info({ event: 'equipment_created', id: created.id }, 'Оборудование создано');
        return created;
    },

    async update(id, patch) {
        await this.getById(id);
        const updated = await equipmentRepository.update(id, patch);
        getLog().info({ event: 'equipment_updated', id }, 'Оборудование обновлено');
        return updated;
    },

    async remove(id) {
        await this.getById(id);
        const open = await requestsRepository.findOpenByEquipmentId(id);
        if (open.length > 0) {
            getLog().warn({ event: 'equipment_remove_blocked', id, openRequests: open.length }, 'Удаление заблокировано открытыми заявками');
            throw new ConflictError('Нельзя удалить оборудование с открытыми заявками', 'HAS_OPEN_REQUESTS');
        }
        await equipmentRepository.remove(id);
        getLog().info({ event: 'equipment_removed', id }, 'Оборудование удалено');
    },

    async listRequests(equipmentId) {
        await this.getById(equipmentId);
        return requestsRepository.findByEquipmentId(equipmentId);
    },
};