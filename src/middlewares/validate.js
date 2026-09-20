import { ValidationError } from '../errors/ValidationError.js';

const pickTarget = (req, source) => {
    if (source === 'body') return req.body;
    if (source === 'query') return req.query;
    if (source === 'params') return req.params;
    return undefined;
};

export const validate =
    (schema, source = 'body') =>
        (req, _res, next) => {
            const result = schema.safeParse(pickTarget(req, source));
            if (!result.success) {
                const details = result.error.issues.map((i) => ({
                    field: i.path.join('.') || source,
                    message: i.message,
                }));
                return next(new ValidationError(details));
            }
            // заменяем исходные данные распарсенными (с дефолтами и приведением типов)
            if (source === 'body') req.body = result.data;
            else if (source === 'query') req.validatedQuery = result.data;
            else if (source === 'params') req.params = result.data;
            next();
        };