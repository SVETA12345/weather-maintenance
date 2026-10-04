import { UniqueConstraintError } from 'sequelize';
import { models } from '../models/sequelize.js';
import { ConflictError } from '../errors/ConflictError.js';

const { User } = models;

function toApi(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        technicianId: row.technician_id,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
}

// Объект пользователя, который кладётся в req.user и используется
// проверками прав: пароля и хеша пароля в нём нет.
export function toActor(row) {
    if (!row) return null;
    return { id: row.id, email: row.email, role: row.role, technicianId: row.technician_id };
}

export const usersRepository = {
    toApi,
    toActor,

    async findByEmail(email) {
        return User.findOne({ where: { email } });
    },

    async findById(id) {
        return User.findByPk(id);
    },

    async create({ email, passwordHash, role = 'viewer', technicianId = null }) {
        try {
            const row = await User.create({
                email,
                password_hash: passwordHash,
                role,
                technician_id: technicianId,
            });
            return toApi(row);
        } catch (error) {
            // Гонка двух регистраций одного email: ограничение БД — последний рубеж.
            if (error instanceof UniqueConstraintError) {
                throw new ConflictError(`Пользователь с email ${email} уже существует`, 'EMAIL_TAKEN');
            }
            throw error;
        }
    },
};