import { Router } from 'express';
import { techniciansController } from '../controllers/techniciansController.js';
import { validate } from '../middlewares/validate.js';
import { techniciansQuerySchema } from '../validators/querySchemas.js';

export const techniciansRoutes = Router();

// Справочник специалистов доступен на чтение любой аутентифицированной роли:
// он нужен всем, кто назначает бригады и заполняет заявки.
techniciansRoutes.get('/', validate(techniciansQuerySchema, 'query'), techniciansController.list);
techniciansRoutes.get('/:id', techniciansController.getById);