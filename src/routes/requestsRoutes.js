import { Router } from 'express';
import { requestsController } from '../controllers/requestsController.js';
import { validate } from '../middlewares/validate.js';
import { requireRole } from '../middlewares/auth.js';
import {
    requestCreateSchema,
    requestPatchSchema,
    statusChangeSchema,
    assigneesCreateSchema,
} from '../validators/requestsSchemas.js';
import { requestsQuerySchema, historyQuerySchema } from '../validators/querySchemas.js';

export const requestsRoutes = Router();

const canEdit = requireRole('technician', 'admin');

requestsRoutes.get('/', validate(requestsQuerySchema, 'query'), requestsController.list);
requestsRoutes.post('/', canEdit, validate(requestCreateSchema), requestsController.create);
requestsRoutes.get('/:id', requestsController.getById);
requestsRoutes.patch('/:id', canEdit, validate(requestPatchSchema), requestsController.update);
// Смена статуса доступна technician и admin, но technician — только для заявок,
// на которых он назначен; проверка назначения выполняется в сервисе.
requestsRoutes.patch('/:id/status', canEdit, validate(statusChangeSchema), requestsController.changeStatus);
requestsRoutes.delete('/:id', requireRole('admin'), requestsController.remove);
requestsRoutes.get('/:id/history', validate(historyQuerySchema, 'query'), requestsController.history);
// Назначение и снятие бригады — операции администратора.
requestsRoutes.post('/:id/assignees', requireRole('admin'), validate(assigneesCreateSchema), requestsController.assignCrew);
requestsRoutes.delete('/:id/assignees/:userId', requireRole('admin'), requestsController.removeAssignee);