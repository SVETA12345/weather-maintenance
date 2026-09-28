import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { requestsRepository } from '../repositories/requestsRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { getLog } from '../utils/context.js';
import { resolveOffset } from '../utils/paging.js';

export const equipmentService = {
    async list({ page, limit, offset, ...filters }) {
        const { rows, total } = await equipmentRepository.findPage(filters, {
            limit,
            offset: resolveOffset({ page, limit, offset }),
        });
        return { data: rows, meta: { total, page, limit } };
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

    async listRequests(equipmentId, { page, limit, offset } = {}) {
        await this.getById(equipmentId);
        const { rows, total } = await requestsRepository.findByEquipmentPage(equipmentId, {
            limit,
            offset: resolveOffset({ page, limit, offset }),
        });
        return { data: rows, meta: { total, page, limit } };
    },
};