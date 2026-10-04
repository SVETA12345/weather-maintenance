import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { usersRepository } from '../repositories/usersRepository.js';
import { refreshTokensRepository } from '../repositories/refreshTokensRepository.js';
import { requestsRepository } from '../repositories/requestsRepository.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ConflictError } from '../errors/ConflictError.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';
import { getLog } from '../utils/context.js';
import {
    DUMMY_PASSWORD_HASH,
    verifyPassword,
    hashPassword,
} from '../utils/password.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

// Ответ на неверный логин и на несуществующего пользователя совпадает по тексту,
// коду и времени выполнения — иначе формулировка ответа превращается
// в способ перебора существующих учётных записей.
const INVALID_CREDENTIALS = () =>
    new UnauthorizedError('Неверный email или пароль', 'INVALID_CREDENTIALS');

async function issueTokens(user) {
    const accessToken = signAccessToken(user);
    const jti = randomUUID();
    const refreshToken = signRefreshToken(user, jti);
    const expiresAt = new Date(Date.now() + config.auth.refreshTokenTtlMs);

    await refreshTokensRepository.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
    });

    return {
        accessToken,
        refreshToken,
        expiresIn: Math.floor(config.auth.accessTokenTtlMs / 1000),
        refreshExpiresAt: expiresAt,
    };
}

export const authService = {
    // Роль по умолчанию — viewer; остальные роли выдаются явным полем role.
    async register({ email, password, role = 'viewer', technicianId }) {
        const existing = await usersRepository.findByEmail(email);
        if (existing) {
            throw new ConflictError(`Пользователь с email ${email} уже существует`, 'EMAIL_TAKEN');
        }

        if (technicianId) {
            const known = await requestsRepository.findExistingTechnicianIds([technicianId]);
            if (!known.includes(technicianId)) throw new NotFoundError('Специалист');
        }

        if (role === 'technician' && !technicianId) {
            // Связь со специалистом можно добавить позже, но до этого заявки
            // назначить такому пользователю нельзя (см. requestsService.assertCanChangeStatus).
            getLog().warn(
                { event: 'technician_without_link', email },
                'Учётная запись technician создана без связи со специалистом',
            );
        }

        const user = await usersRepository.create({
            email,
            passwordHash: await hashPassword(password),
            role,
            technicianId: technicianId ?? null,
        });

        getLog().info({ event: 'user_registered', userId: user.id, role: user.role }, 'Пользователь зарегистрирован');
        return user;
    },

    async login({ email, password }) {
        const row = await usersRepository.findByEmail(email);
        const matches = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
        if (!row || !matches) {
            getLog().warn({ event: 'login_failed', email }, 'Неудачная попытка входа');
            throw INVALID_CREDENTIALS();
        }

        const tokens = await issueTokens(row);
        getLog().info({ event: 'login_success', userId: row.id, role: row.role }, 'Вход выполнен');
        return { user: usersRepository.toApi(row), ...tokens };
    },

    // Обновление по refresh-cookie с ротацией: предыдущий токен отзывается,
    // поэтому повторное использование старого токена не проходит.
    async refresh(token) {
        if (!token) throw new UnauthorizedError('Refresh-токен отсутствует', 'REFRESH_TOKEN_MISSING');

        const payload = verifyRefreshToken(token);
        const stored = await refreshTokensRepository.findActiveByHash(hashToken(token));
        if (!stored || stored.user_id !== payload.sub) {
            getLog().warn({ event: 'refresh_rejected', userId: payload.sub }, 'Refresh-токен отозван или не найден');
            throw new UnauthorizedError('Сессия истекла, требуется повторный вход', 'REFRESH_TOKEN_INVALID');
        }

        const row = await usersRepository.findById(payload.sub);
        if (!row) throw new UnauthorizedError('Пользователь не найден', 'TOKEN_INVALID');

        await refreshTokensRepository.revokeByHash(stored.token_hash);
        const tokens = await issueTokens(row);
        getLog().info({ event: 'token_refreshed', userId: row.id }, 'Access-токен обновлён');
        return { user: usersRepository.toApi(row), ...tokens };
    },

    // Завершение сессии идемпотентно: неизвестный или уже отозванный токен — не ошибка.
    async logout(token) {
        if (!token) return { revoked: false };

        try {
            const payload = verifyRefreshToken(token);
            const revoked = await refreshTokensRepository.revokeByHash(hashToken(token));
            getLog().info({ event: 'logout', userId: payload.sub, revoked }, 'Сессия завершена');
            return { revoked: revoked > 0 };
        } catch {
            return { revoked: false };
        }
    },

    async me(userId) {
        const row = await usersRepository.findById(userId);
        if (!row) throw new UnauthorizedError('Пользователь не найден', 'TOKEN_INVALID');
        return usersRepository.toApi(row);
    },
};