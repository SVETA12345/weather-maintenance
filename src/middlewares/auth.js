import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';
import { ForbiddenError } from '../errors/ForbiddenError.js';
import { usersRepository } from '../repositories/usersRepository.js';
import { verifyAccessToken } from '../utils/tokens.js';

const BEARER_RE = /^Bearer\s+(.+)$/i;

// Роль и связь со специалистом читаются из БД на каждом запросе, поэтому
// понижение роли или удаление учётной записи действует немедленно,
// а не после истечения выданного access-токена.
export async function requireAuth(req, _res, next) {
    try {
        const header = req.headers.authorization ?? '';
        const match = BEARER_RE.exec(header.trim());
        if (!match) {
            throw new UnauthorizedError('Требуется access-токен в заголовке Authorization: Bearer <token>', 'AUTH_REQUIRED');
        }

        const payload = verifyAccessToken(match[1]);
        const actor = usersRepository.toActor(await usersRepository.findById(payload.sub));
        if (!actor) {
            throw new UnauthorizedError('Пользователь не найден или отключён', 'TOKEN_INVALID');
        }

        req.user = actor;
        next();
    } catch (error) {
        next(error);
    }
}

export const requireRole =
    (...roles) =>
    (req, _res, next) => {
        if (!req.user) return next(new UnauthorizedError());
        if (!roles.includes(req.user.role)) {
            return next(
                new ForbiddenError(
                    `Роль ${req.user.role} не позволяет выполнять эту операцию, требуется: ${roles.join(' или ')}`,
                    'ROLE_REQUIRED',
                ),
            );
        }
        next();
    };

// Отдельный лимит на вход: он считает только неудачные попытки (skipSuccessfulRequests),
// поэтому легитимный пользователь не блокируется после нескольких опечаток,
// а перебор пароля с одного IP быстро упирается в 429.
export const loginRateLimiter = rateLimit({
    windowMs: config.auth.loginRateLimit.windowMs,
    max: config.auth.loginRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        req.log.warn({ event: 'login_rate_limit_exceeded', ip: req.ip }, 'Превышен лимит попыток входа');
        res.status(429).json({
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Слишком много попыток входа, попробуйте позже',
                requestId: req.id,
            },
        });
    },
});