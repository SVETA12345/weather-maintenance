import { reportsRepository } from '../repositories/reportsRepository.js';
import { resolveOffset } from '../utils/paging.js';

export const reportsService = {
    async equipmentLoad({ page, limit, offset, from, to, minRequests, sortBy, order } = {}) {
        const filters = { from, to, minRequests, sortBy, order };
        const [data, total] = await Promise.all([
            reportsRepository.equipmentLoad({ ...filters, limit, offset: resolveOffset({ page, limit, offset }) }),
            reportsRepository.countEquipment(filters),
        ]);

        return { data, meta: { total, page, limit } };
    },
};
