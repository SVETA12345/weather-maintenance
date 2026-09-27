import { z } from 'zod';

export const requestCreateSchema = z.object({
    equipmentId: z.string().uuid(),
    title: z.string().min(5).max(120),
    description: z.string().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    plannedAt: z.string().datetime({ offset: true }).optional(),
    plannedLaborHours: z.number().nonnegative().max(10000).optional(),
});

export const requestPatchSchema = requestCreateSchema.partial().omit({ equipmentId: true });

export const statusChangeSchema = z.object({
    status: z.enum(['new', 'in_progress', 'done', 'rejected']),
});

export const assigneesCreateSchema = z
    .array(
        z.object({
            technicianId: z.string().uuid(),
            role: z.enum(['lead', 'member']),
        }),
    )
    .min(1)
    .max(20)
    .refine((list) => new Set(list.map((a) => a.technicianId)).size === list.length, {
        message: 'один специалист нельзя назначить дважды в одном запросе',
    });