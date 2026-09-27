import { z } from 'zod';
import { MAX_LIMIT, MAX_OFFSET, DEFAULT_LIMIT, DEFAULT_PAGE } from '../utils/paging.js';

// Верхние границы проверяет zod, но код ответа для них — 400 (см. middlewares/validate.js),
// поэтому границы вынесены в отдельный модуль, общий для схем и сервисов.
const limitSchema = z.coerce
    .number({ invalid_type_error: 'limit должен быть числом' })
    .int('limit должен быть целым числом')
    .min(1, 'limit должен быть не меньше 1')
    .max(MAX_LIMIT, `limit не может превышать ${MAX_LIMIT}`)
    .default(DEFAULT_LIMIT);

const offsetSchema = z.coerce
    .number({ invalid_type_error: 'offset должен быть числом' })
    .int('offset должен быть целым числом')
    .min(0, 'offset не может быть отрицательным')
    .max(MAX_OFFSET, `offset не может превышать ${MAX_OFFSET}`)
    .optional();

const pageSchema = z.coerce
    .number({ invalid_type_error: 'page должен быть числом' })
    .int('page должен быть целым числом')
    .min(1, 'page должен быть не меньше 1')
    .default(DEFAULT_PAGE);

// Явный offset уже ограничен самой схемой, а смещение, посчитанное через page,
// ничем не ограничено: без этой проверки page=1000000&limit=100 прошёл бы валидацию
// и ушёл бы в БД с гигантским OFFSET.
const withOffsetCeiling = (schema) =>
    schema.superRefine((value, ctx) => {
        if (value.offset !== undefined) return;
        if ((value.page - 1) * value.limit > MAX_OFFSET) {
            ctx.addIssue({
                code: z.ZodIssueCode.too_big,
                path: ['offset'],
                maximum: MAX_OFFSET,
                type: 'number',
                inclusive: true,
                message: `page и limit дают offset больше ${MAX_OFFSET}`,
            });
        }
    });

const pagination = {
    page: pageSchema,
    limit: limitSchema,
    offset: offsetSchema,
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
};

const pageOnly = {
    page: pageSchema,
    limit: limitSchema,
    offset: offsetSchema,
};

export const equipmentQuerySchema = withOffsetCeiling(
    z.object({
        ...pagination,
        status: z.enum(['operational', 'maintenance', 'fault', 'decommissioned']).optional(),
        type: z.enum(['turbine', 'inverter', 'sensor', 'substation']).optional(),
    }),
);

export const equipmentRequestsQuerySchema = withOffsetCeiling(z.object(pageOnly));

export const requestsQuerySchema = withOffsetCeiling(
    z.object({
        ...pagination,
        status: z.enum(['new', 'in_progress', 'done', 'rejected']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        equipmentId: z.string().uuid().optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
    }),
);

export const reportQuerySchema = withOffsetCeiling(
    z.object({
        ...pagination,
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        minRequests: z.coerce.number().int().nonnegative().default(0),
    }),
);

export const historyQuerySchema = withOffsetCeiling(z.object(pageOnly));

// Поля, для которых выход за диапазон — это 400, а не 422.
export const PAGINATION_FIELDS = new Set(['page', 'limit', 'offset']);
