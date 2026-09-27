import { Router } from 'express';
import { reportsController } from '../controllers/reportsController.js';
import { validate } from '../middlewares/validate.js';
import { reportQuerySchema } from '../validators/querySchemas.js';

export const reportsRoutes = Router();

reportsRoutes.get('/equipment-load', validate(reportQuerySchema, 'query'), reportsController.equipmentLoad);
