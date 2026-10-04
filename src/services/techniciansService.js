import { techniciansRepository } from '../repositories/techniciansRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { resolveOffset } from '../utils/paging.js';

export const techniciansService = {
    async list({ page, limit, offset, ...filters }) {
        const { rows, total } = await techniciansRepository.findPage(filters, {
            limit,
            offset: resolveOffset({ page, limit, offset }),
        });
        return { data: rows, meta: { total, page, limit } };
    },

    async getById(id) {
        const item = await techniciansRepository.findById(id);
        if (!item) throw new NotFoundError('Специалист');
        return item;
    },
};