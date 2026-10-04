import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, _next) {
    const isApp = err instanceof AppError;
    const status = isApp ? err.status : 500;
    const code = isApp ? err.code : 'INTERNAL_ERROR';
    const message = isApp ? err.message : 'Внутренняя ошибка сервера';

    // pino принимает объект с полями только первым аргументом: logger.error('текст', {...})
    // молча теряет поля, и в лог попадает только текст без кода и стека.
    logger.error(
        {
            requestId: req.id,
            status,
            code,
            message: err.message,
            stack: config.isProduction ? undefined : err.stack,
        },
        'request_failed',
    );
    

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