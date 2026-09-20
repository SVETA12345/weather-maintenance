import { AppError } from '../errors/AppError.js';
//import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, _next) {
    const isApp = err instanceof AppError;
    const status = isApp ? err.status : 500;
    const code = isApp ? err.code : 'INTERNAL_ERROR';
    const message = isApp ? err.message : 'Внутренняя ошибка сервера';

    /*logger.error('request_failed', {
        requestId: req.id,
        status,
        code,
        message: err.message,
        stack: config.isProd ? undefined : err.stack,
    });
    */

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