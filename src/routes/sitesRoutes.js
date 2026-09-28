import { Router } from 'express';
import { sitesController } from '../controllers/sitesController.js';

export const sitesRoutes = Router();

sitesRoutes.get('/:id/summary', sitesController.summary);
