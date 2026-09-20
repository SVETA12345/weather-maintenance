import { requestsService } from '../services/requestsService.js';
import { requestsQuerySchema } from '../validators/querySchemas.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const requestsController = {
    list: asyncHandler(async (req, res) => {
        const query = requestsQuerySchema.parse(req.validatedQuery ?? req.query);
        const result = await requestsService.list(query);
        res.json(result);
    }),

    getById: asyncHandler(async (req, res) => {
        const item = await requestsService.getById(req.params.id);
        res.json({ data: item });
    }),

    create: asyncHandler(async (req, res) => {
        const created = await requestsService.create(req.body);
        res.status(201).location(`/api/requests/${created.id}`).json({ data: created });
    }),

    update: asyncHandler(async (req, res) => {
        const updated = await requestsService.update(req.params.id, req.body);
        res.json({ data: updated });
    }),

    changeStatus: asyncHandler(async (req, res) => {
        const updated = await requestsService.changeStatus(req.params.id, req.body.status);
        res.json({ data: updated });
    }),

    remove: asyncHandler(async (req, res) => {
        await requestsService.remove(req.params.id);
        res.status(204).end();
    }),
};