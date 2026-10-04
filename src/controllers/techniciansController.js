import { techniciansService } from '../services/techniciansService.js';
import { techniciansQuerySchema } from '../validators/querySchemas.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const techniciansController = {
    list: asyncHandler(async (req, res) => {
        const query = techniciansQuerySchema.parse(req.validatedQuery ?? req.query);
        const result = await techniciansService.list(query);
        res.json(result);
    }),

    getById: asyncHandler(async (req, res) => {
        const item = await techniciansService.getById(req.params.id);
        res.json({ data: item });
    }),
};