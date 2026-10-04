import { metricsService } from '../services/metricsService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Скрейп Prometheus сам по себе не должен попадать в метрики: иначе счётчик
// http_requests_total растёт даже без трафика к приложению.
export const metricsHandler = asyncHandler(async (req, res) => {
    res.set('Content-Type', metricsService.contentType());
    res.send(await metricsService.scrape());
});

export const metricsRoutes = { handler: metricsHandler };