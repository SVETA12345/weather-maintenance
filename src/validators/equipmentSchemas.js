import { z } from 'zod';

export const equipmentCreateSchema = z.object({
    name: z.string().min(3).max(100),
    type: z.enum(['turbine', 'inverter', 'sensor', 'substation']),
    serialNumber: z.string().min(1),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
    }),
    status: z.enum(['operational', 'maintenance', 'fault', 'decommissioned']).optional(),
    installedAt: z
        .string()
        .datetime({ offset: true })
        .refine((v) => new Date(v) <= new Date(), { message: 'installedAt не может быть в будущем' }),
});

export const equipmentPatchSchema = equipmentCreateSchema.partial();