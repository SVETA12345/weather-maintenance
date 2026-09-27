import { sitesService } from '../services/sitesService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const sitesController = {
    summary: asyncHandler(async (req, res) => {
        const data = await sitesService.getSummary(req.params.id);
        res.json({ data });
    }),
};
