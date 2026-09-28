import { ValidationError } from '../errors/ValidationError.js';
import { BadRequestError } from '../errors/BadRequestError.js';
import { PAGINATION_FIELDS } from '../validators/querySchemas.js';

const pickTarget = (req, source) => {
    if (source === 'body') return req.body;
    if (source === 'query') return req.query;
    if (source === 'params') return req.params;
    return undefined;
};

const toDetails = (error, source) =>
    error.issues.map((i) => ({
        field: i.path.join('.') || source,
        message: i.message,
    }));

// Выход page/limit/offset за диапазон — некорректный параметр запроса (400),
// остальные нарушения схемы остаются 422. При смешанной ошибке приоритет у пагинации:
// остальные проблемы проявятся повторно, когда параметры приведут в диапазон.
const buildError = (error, source) => {
    const paginationIssues = error.issues.filter((i) => PAGINATION_FIELDS.has(i.path[0]));
    if (paginationIssues.length === 0) return new ValidationError(toDetails(error, source));
    return new BadRequestError(
        'Параметры пагинации вне допустимого диапазона',
        'INVALID_PAGINATION',
        paginationIssues.map((i) => ({ field: i.path.join('.') || source, message: i.message })),
    );
};

export const validate =
    (schema, source = 'body') =>
        (req, _res, next) => {
            const result = schema.safeParse(pickTarget(req, source));
            if (!result.success) {
                return next(buildError(result.error, source));
            }
            // заменяем исходные данные распарсенными (с дефолтами и приведением типов)
            if (source === 'body') req.body = result.data;
            else if (source === 'query') req.validatedQuery = result.data;
            else if (source === 'params') req.params = result.data;
            next();
        };
