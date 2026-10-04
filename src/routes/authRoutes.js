import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { validate } from '../middlewares/validate.js';
import { loginRateLimiter, requireAuth } from '../middlewares/auth.js';
import { registerSchema, loginSchema } from '../validators/authSchemas.js';

export const authRoutes = Router();

// Регистрация, вход и обновление токена доступны без access-токена —
// иначе невозможно было бы войти.
authRoutes.post('/register', validate(registerSchema), authController.register);
authRoutes.post('/login', loginRateLimiter, validate(loginSchema), authController.login);
authRoutes.post('/refresh', authController.refresh);
// Выход не требует валидного access-токена: истёкший токен не должен мешать
// завершить сессию, refresh-cookie очищается в любом случае.
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', requireAuth, authController.me);