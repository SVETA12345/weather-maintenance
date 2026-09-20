import { NotFoundError } from '../errors/NotFoundError.js';

export function notFound(req, _res, next) {
    next(new NotFoundError(`Маршрут ${req.method} ${req.originalUrl}`));
}