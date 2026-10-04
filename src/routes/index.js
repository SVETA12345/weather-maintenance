import { Router } from 'express';
import { healthRoutes } from './healthRoutes.js';
import { authRoutes } from './authRoutes.js';
import { equipmentRoutes } from './equipmentRoutes.js';
import { requestsRoutes } from './requestsRoutes.js';
import { sitesRoutes } from './sitesRoutes.js';
import { techniciansRoutes } from './techniciansRoutes.js';
import { reportsRoutes } from './reportsRoutes.js';
import { docsRoutes } from './docsRoutes.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middlewares/auth.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
// Документация доступна всем ролям: без неё невозможно понять контракт,
// но сам включается флагом DOCS_ENABLED.
if (config.docs.enabled) apiRouter.use('/docs', docsRoutes);
apiRouter.use('/auth', authRoutes);

// requireAuth подключается к каждому защищённому роутеру отдельно: неизвестный путь
// внутри /api по-прежнему завершается 404, а не 401, и не раскрывает существование
// маршрутов анонимному клиенту.
apiRouter.use('/equipment', requireAuth, equipmentRoutes);
apiRouter.use('/requests', requireAuth, requestsRoutes);
apiRouter.use('/sites', requireAuth, sitesRoutes);
apiRouter.use('/technicians', requireAuth, techniciansRoutes);
apiRouter.use('/reports', requireAuth, reportsRoutes);