import { Router } from 'express';
import { healthService } from '../services/healthService.js';
import { metricsService } from '../services/metricsService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const healthRoutes = Router();

// GET /api/health/live — процесс отвечает (не проверяет БД)
healthRoutes.get('/live', (_req, res) => {
    res.json({ data: healthService.live() });
});

// GET /api/health/ready — готовность к приёму трафика, включая доступность БД
healthRoutes.get('/ready', asyncHandler(async (_req, res) => {
    const result = await healthService.ready();
    res.status(result.ready ? 200 : 503).json({ data: result });
}));

// GET /api/health/metrics — прикладные показатели из PostgreSQL.
// Prometheus их тоже читает, но в Grafana это готовый ответ без запросов к БД.
healthRoutes.get('/metrics', asyncHandler(async (_req, res) => {
    res.json({ data: await metricsService.applied() });
}));

// GET /api/health — обратная совместимость с прежним Health-check и compose healthcheck
healthRoutes.get('/', asyncHandler(async (_req, res) => {
    const result = await healthService.ready();
    res.status(result.ready ? 200 : 503).json({
        status: result.status === 'ready' ? 'ok' : 'degraded',
        uptime: result.uptime,
        timestamp: result.timestamp,
    });
}));