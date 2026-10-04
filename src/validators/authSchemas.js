import { z } from 'zod';
import { USER_ROLES } from '../models/userModel.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../utils/password.js';

// Email приводится к нижнему регистру: иначе User@Example.com и user@example.com
// стали бы двумя разными учётными записями.
const email = z.string().trim().toLowerCase().email().max(255);
const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerSchema = z.object({
    email,
    password,
    // Роль по умолчанию — viewer; без явного поля новая учётная запись только читает.
    role: z.enum(USER_ROLES).optional(),
    // Привязка учётной записи к специалисту нужна роли technician: назначение заявки
    // хранится в request_assignees.technician_id, и сопоставить его можно только через
    // эту связь. Для viewer и admin поле не требуется.
    technicianId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(255),
    // Длина не уточняется: ответ о неверном пароле одинаков для всех причин.
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});