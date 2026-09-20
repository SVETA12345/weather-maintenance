import { AppError } from '../errors/AppError.js';
import { getLog } from '../utils/context.js';

export function errorHandler(err, req, res, _next) {
    const isApp = err instanceof AppError;
    const status = isApp ? err.status : 500;
    const code = isApp ? err.code : 'INTERNAL_ERROR';
    const message = isApp ? err.message : 'Внутренняя ошибка сервера';

    const log = getLog();
    if (status >= 500) {
        log.error({ code, status, err: { message: err.message, stack: err.stack } }, 'request_failed');
    } else {
        log.warn({ code, status, message }, 'request_failed');
    }

    const body = {
        error: {
            code,
            message,
            ...(err.details ? { details: err.details } : {}),
            requestId: req.id,
        },
    };
    res.status(status).json(body);
}