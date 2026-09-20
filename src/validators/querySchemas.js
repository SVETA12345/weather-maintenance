import { z } from 'zod';

const pagination = {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
};

export const equipmentQuerySchema = z.object({
    ...pagination,
    status: z.enum(['operational', 'maintenance', 'fault', 'decommissioned']).optional(),
    type: z.enum(['turbine', 'inverter', 'sensor', 'substation']).optional(),
});

export const requestsQuerySchema = z.object({
    ...pagination,
    status: z.enum(['new', 'in_progress', 'done', 'rejected']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    equipmentId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
});