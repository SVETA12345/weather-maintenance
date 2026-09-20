import { z } from 'zod';

export const requestCreateSchema = z.object({
    equipmentId: z.string().uuid(),
    title: z.string().min(5).max(120),
    description: z.string().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    plannedAt: z.string().datetime({ offset: true }).optional(),
});

export const requestPatchSchema = requestCreateSchema.partial().omit({ equipmentId: true });

export const statusChangeSchema = z.object({
    status: z.enum(['new', 'in_progress', 'done', 'rejected']),
});