import { reportsService } from '../services/reportsService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const reportsController = {
    equipmentLoad: asyncHandler(async (req, res) => {
        const result = await reportsService.equipmentLoad(req.validatedQuery ?? req.query);
        res.json(result);
    }),
};
