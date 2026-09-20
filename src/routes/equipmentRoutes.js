import { Router } from 'express';
import { equipmentController } from '../controllers/equipmentController.js';
import { validate } from '../middlewares/validate.js';
import { equipmentCreateSchema, equipmentPatchSchema } from '../validators/equipmentSchemas.js';
import { equipmentQuerySchema } from '../validators/querySchemas.js';

export const equipmentRoutes = Router();

equipmentRoutes.get('/', validate(equipmentQuerySchema, 'query'), equipmentController.list);
equipmentRoutes.post('/', validate(equipmentCreateSchema), equipmentController.create);
equipmentRoutes.get('/:id', equipmentController.getById);
equipmentRoutes.patch('/:id', validate(equipmentPatchSchema), equipmentController.update);
equipmentRoutes.delete('/:id', equipmentController.remove);
equipmentRoutes.get('/:id/requests', equipmentController.listRequests);
equipmentRoutes.get('/:id/weather', equipmentController.weather);