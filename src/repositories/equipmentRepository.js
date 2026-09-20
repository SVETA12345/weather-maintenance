import { newId } from '../utils/id.js';

const store = new Map();

export const equipmentRepository = {
    async findAll() {
        return [...store.values()];
    },
    async findById(id) {
        return store.get(id) ?? null;
    },
    async findBySerial(serialNumber) {
        return [...store.values()].find((e) => e.serialNumber === serialNumber) ?? null;
    },
    async create(data) {
        const now = new Date().toISOString();
        const entity = {
            id: newId(),
            ...data,
            status: data.status ?? 'operational',
            createdAt: now,
            updatedAt: now,
        };
        store.set(entity.id, entity);
        return entity;
    },
    async update(id, patch) {
        const current = store.get(id);
        if (!current) return null;
        const updated = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
        store.set(id, updated);
        return updated;
    },
    async remove(id) {
        return store.delete(id);
    },
};