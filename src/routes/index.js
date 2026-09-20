import { Router } from 'express';
import { healthRoutes } from './healthRoutes.js';
import { equipmentRoutes } from './equipmentRoutes.js';
import { requestsRoutes } from './requestsRoutes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/equipment', equipmentRoutes);
apiRouter.use('/requests', requestsRoutes);