import { config } from '../config/index.js';
import { authService } from '../services/authService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Refresh-токен никогда не попадает в тело ответа: только в cookie с флагами
// HttpOnly (недоступен из JavaScript), Secure (только HTTPS) и SameSite.
const cookieOptions = (maxAgeMs) => ({
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: config.auth.cookiePath,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

const setRefreshCookie = (res, token, maxAgeMs) => {
    res.cookie(config.auth.refreshCookieName, token, cookieOptions(maxAgeMs));
};

const clearRefreshCookie = (res) => {
    // Атрибуты очистки должны совпадать с атрибутами установки, иначе браузер
    // не найдёт cookie и не удалит её.
    res.clearCookie(config.auth.refreshCookieName, cookieOptions());
};

const readRefreshCookie = (req) => req.cookies?.[config.auth.refreshCookieName];

const toAuthResponse = ({ user, accessToken, expiresIn }) => ({
    data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user,
    },
});

export const authController = {
    register: asyncHandler(async (req, res) => {
        const user = await authService.register(req.body);
        res.status(201).json({ data: user });
    }),

    login: asyncHandler(async (req, res) => {
        const result = await authService.login(req.body);
        setRefreshCookie(res, result.refreshToken, config.auth.refreshTokenTtlMs);
        res.json(toAuthResponse(result));
    }),

    refresh: asyncHandler(async (req, res) => {
        const result = await authService.refresh(readRefreshCookie(req));
        setRefreshCookie(res, result.refreshToken, config.auth.refreshTokenTtlMs);
        res.json(toAuthResponse(result));
    }),

    logout: asyncHandler(async (req, res) => {
        await authService.logout(readRefreshCookie(req));
        clearRefreshCookie(res);
        res.status(204).end();
    }),

    me: asyncHandler(async (req, res) => {
        res.json({ data: await authService.me(req.user.id) });
    }),
};
