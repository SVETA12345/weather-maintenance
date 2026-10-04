import { z } from 'zod';

export const requestCreateSchema = z.object({
    equipmentId: z.string().uuid(),
    title: z.string().min(5).max(120),
    description: z.string().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    plannedAt: z.string().datetime({ offset: true }).optional(),
    plannedLaborHours: z.number().nonnegative().max(10000).optional(),
});

export const requestPatchSchema = requestCreateSchema.partial().omit({ equipmentId: true }).extend({
    // Статус меняется только через PATCH /api/requests/:id/status, где проверяются
    // допустимость перехода и назначение specialist'а. Если бы status просто попадал
    // в «неизвестные поля», клиент получил бы 200 и решил, что статус изменился.
    status: z.undefined({ invalid_type_error: 'Статус меняется отдельным запросом PATCH /api/requests/:id/status' }),
});

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