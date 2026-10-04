import request from 'supertest';
import { models } from '../../src/models/sequelize.js';
import { hashPassword } from '../../src/utils/password.js';

// Общий пароль тестовых пользователей: в тестах фиксируется только хеш,
// сам пароль нигде не сохраняется.
export const TEST_PASSWORD = 'test-password-2026';

let counter = 0;

export async function createUser({ role = 'viewer', technicianId = null, email } = {}) {
    counter += 1;
    return models.User.create({
        email: email ?? `user-${role}-${counter}@test.local`,
        password_hash: await hashPassword(TEST_PASSWORD),
        role,
        technician_id: technicianId,
    });
}

export async function login(app, email, password = TEST_PASSWORD) {
    const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    return { token: res.body.data.accessToken, user: res.body.data.user, headers: res.headers };
}

// Готовое значение заголовка Authorization для пользователя с нужной ролью.
export async function authHeader(app, options = {}) {
    const user = await createUser(options);
    const { token } = await login(app, user.email);
    return `Bearer ${token}`;
}

// Обёртка supertest: подставляет Authorization в каждый запрос набора,
// поэтому тесты проверяют бизнес-логику, а не различие 401 и 403.
export function authed(app, header) {
    const call = (method) => (url) => request(app)[method](url).set('Authorization', header);
    return { get: call('get'), post: call('post'), patch: call('patch'), put: call('put'), delete: call('delete') };
}