import { equipmentService } from '../services/equipmentService.js';
import { weatherService } from '../api/weatherService.js';
import { equipmentQuerySchema } from '../validators/querySchemas.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const equipmentController = {
    list: asyncHandler(async (req, res) => {
        const query = equipmentQuerySchema.parse(req.validatedQuery ?? req.query);
        const result = await equipmentService.list(query);
        res.json(result);
    }),

    getById: asyncHandler(async (req, res) => {
        const item = await equipmentService.getById(req.params.id);
        res.json({ data: item });
    }),

    create: asyncHandler(async (req, res) => {
        const created = await equipmentService.create(req.body);
        res.status(201).location(`/api/equipment/${created.id}`).json({ data: created });
    }),

    update: asyncHandler(async (req, res) => {
        const updated = await equipmentService.update(req.params.id, req.body);
        res.json({ data: updated });
    }),

    remove: asyncHandler(async (req, res) => {
        await equipmentService.remove(req.params.id);
        res.status(204).end();
    }),

    listRequests: asyncHandler(async (req, res) => {
        const items = await equipmentService.listRequests(req.params.id);
        res.json({ data: items });
    }),

    weather: asyncHandler(async (req, res, next) => {
        try {
            const equipment = await equipmentService.getById(req.params.id);
            const forecast = await weatherService.getForEquipment(equipment);
            res.json({ data: forecast });
        } catch (err) {
            // недоступность внешнего API не должна ронять сервис
            if (err.status >= 400 || err.name === 'AbortError') {
                return res.status(502).json({
                    error: {
                        code: 'WEATHER_API_UNAVAILABLE',
                        message: 'Внешний погодный сервис недоступен',
                        requestId: req.id,
                    },
                });
            }
            next(err);
        }
    }),
};