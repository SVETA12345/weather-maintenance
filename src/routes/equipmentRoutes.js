import { Router } from 'express';
import { equipmentController } from '../controllers/equipmentController.js';
import { validate } from '../middlewares/validate.js';
import { requireRole } from '../middlewares/auth.js';
import { equipmentCreateSchema, equipmentPatchSchema } from '../validators/equipmentSchemas.js';
import { equipmentQuerySchema, equipmentRequestsQuerySchema } from '../validators/querySchemas.js';

export const equipmentRoutes = Router();

// Чтение доступно любой аутентифицированной роли, управление оборудованием — только администратору.
equipmentRoutes.get('/', validate(equipmentQuerySchema, 'query'), equipmentController.list);
equipmentRoutes.post('/', requireRole('admin'), validate(equipmentCreateSchema), equipmentController.create);
equipmentRoutes.get('/:id', equipmentController.getById);
equipmentRoutes.patch('/:id', requireRole('admin'), validate(equipmentPatchSchema), equipmentController.update);
equipmentRoutes.delete('/:id', requireRole('admin'), equipmentController.remove);
equipmentRoutes.get('/:id/requests', validate(equipmentRequestsQuerySchema, 'query'), equipmentController.listRequests);
equipmentRoutes.get('/:id/weather', equipmentController.weather);