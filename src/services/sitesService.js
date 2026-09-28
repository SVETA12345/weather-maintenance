import { sitesRepository } from '../repositories/sitesRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';

export const sitesService = {
    async getSummary(id) {
        const summary = await sitesRepository.getSummary(id);
        if (!summary) throw new NotFoundError('Площадка');
        return summary;
    },
};
