import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
    req.id = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
}