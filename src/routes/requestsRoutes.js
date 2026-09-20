import { Router } from 'express';
import { requestsController } from '../controllers/requestsController.js';
import { validate } from '../middlewares/validate.js';
import {
    requestCreateSchema,
    requestPatchSchema,
    statusChangeSchema,
} from '../validators/requestsSchemas.js';
import { requestsQuerySchema } from '../validators/querySchemas.js';

export const requestsRoutes = Router();

requestsRoutes.get('/', validate(requestsQuerySchema, 'query'), requestsController.list);
requestsRoutes.post('/', validate(requestCreateSchema), requestsController.create);
requestsRoutes.get('/:id', requestsController.getById);
requestsRoutes.patch('/:id', validate(requestPatchSchema), requestsController.update);
requestsRoutes.patch('/:id/status', validate(statusChangeSchema), requestsController.changeStatus);
requestsRoutes.delete('/:id', requestsController.remove);