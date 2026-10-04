import { httpErrorsTotal, httpRequestDuration, httpRequestsTotal } from '../metrics/index.js';

const SKIP_PATHS = new Set(['/metrics']);

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Идентификаторы в путях заменяются на :id, иначе каждый id заявки создал бы
// отдельную серию метрик и раздувал память Prometheus.
function normalizeSegments(pathname) {
    const normalized = pathname
        .split('/')
        .map((segment) => (UUID_SEGMENT.test(segment) || /^\d+$/.test(segment) ? ':id' : segment))
        .join('/');
    return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

// Шаблон маршрута собирается из originalUrl и совпавшего пути, а не из req.baseUrl:
// при ошибке Express уже восстанавливает baseUrl, и одна и та же точка API
// попала бы в метрики то как /api/equipment/:id, то как /:id.
function resolveRoute(req) {
    const routePath = req.route?.path;
    if (!routePath) return 'unmatched';

    const [pathname] = req.originalUrl.split('?');
    const segments = pathname.split('/');
    const tailLength = routePath.split('/').filter(Boolean).length;
    const prefix = segments.slice(0, Math.max(segments.length - tailLength, 1)).join('/');
    const tail = routePath === '/' ? '' : routePath;
    return normalizeSegments(`${prefix}${tail}`) || 'unmatched';
}

export function metricsMiddleware(req, res, next) {
    // Скрейп Prometheus сам по себе не должен попадать в метрики: иначе счётчик
    // http_requests_total рос бы даже без трафика к приложению.
    if (SKIP_PATHS.has(req.path)) return next();

    const stopTimer = httpRequestDuration.startTimer();
    let recorded = false;

    const record = () => {
        if (recorded) return;
        recorded = true;

        const route = resolveRoute(req);
        httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) });
        if (res.statusCode >= 400) {
            httpErrorsTotal.inc({
                method: req.method,
                route,
                status_class: `${Math.floor(res.statusCode / 100)}xx`,
            });
        }
        stopTimer({ method: req.method, route });
    };

    // req.baseUrl и req.route восстанавливаются, когда роутер выходит из стека,
    // а событие finish приходит уже после этого. Поэтому шаблон маршрута
    // снимается в момент res.end, пока контекст маршрута ещё актуален.
    const originalEnd = res.end.bind(res);
    res.end = (...args) => {
        record();
        return originalEnd(...args);
    };
    res.on('finish', record);

    return next();
}

export default metricsMiddleware;