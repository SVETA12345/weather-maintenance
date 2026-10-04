import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';

const ACCESS_TYP = 'access';
const REFRESH_TYP = 'refresh';

const baseOptions = {
    issuer: config.auth.issuer,
    audience: config.auth.audience,
};

function sign(payload, secret, expiresIn) {
    return jwt.sign(payload, secret, { ...baseOptions, expiresIn });
}

export function signAccessToken(user) {
    return sign(
        { sub: user.id, role: user.role, typ: ACCESS_TYP },
        config.auth.accessSecret,
        config.auth.accessTokenTtl,
    );
}

export function signRefreshToken(user, jti = randomUUID()) {
    return sign({ sub: user.id, jti, typ: REFRESH_TYP }, config.auth.refreshSecret, Math.floor(config.auth.refreshTokenTtlMs / 1000));
}

// Токен хранится только в HttpOnly-cookie, а в БД — его SHA-256 хеш: утечка таблицы
// не даёт возможности войти под пользователем.
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function verify(token, secret, expectedType) {
    try {
        const payload = jwt.verify(token, secret, { ...baseOptions });
        if (payload.typ !== expectedType) throw new Error(`unexpected token type: ${payload.typ}`);
        return payload;
    } catch {
        throw new UnauthorizedError(
            'Токен недействителен или истёк срок его действия',
            'TOKEN_INVALID',
        );
    }
}

export function verifyAccessToken(token) {
    return verify(token, config.auth.accessSecret, ACCESS_TYP);
}

export function verifyRefreshToken(token) {
    return verify(token, config.auth.refreshSecret, REFRESH_TYP);
}