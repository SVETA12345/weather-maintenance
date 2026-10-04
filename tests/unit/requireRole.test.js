// Модульные тесты проверки прав по ролям на уровне middleware: без БД и HTTP-запросов.
import { requireRole } from '../../src/middlewares/auth.js';

const run = (roles, user) =>
    new Promise((resolve) => {
        const req = { user };
        requireRole(...roles)(req, {}, (error) => resolve({ error, req }));
    });

describe('requireRole', () => {
    test('пропускает пользователя с разрешённой ролью и не вызывает next с ошибкой', async () => {
        const { error, req } = await run(['admin'], { role: 'admin' });
        expect(error).toBeUndefined();
        expect(req.user.role).toBe('admin');
    });

    test('админу разрешено всё, что требует admin', async () => {
        const { error } = await run(['admin'], { role: 'admin' });
        expect(error).toBeUndefined();
    });

    test('роль не из списка не проходит проверку', async () => {
        const { error } = await run(['admin'], { role: 'technician' });
        expect(error).toBeDefined();
        expect(error.status).toBe(403);
    });

    test('сообщение 403 перечисляет требуемые роли', async () => {
        const { error } = await run(['admin', 'technician'], { role: 'viewer' });
        expect(error).toBeDefined();
        expect(error.status).toBe(403);
        expect(error.code).toBe('ROLE_REQUIRED');
        expect(error.message).toContain('admin или technician');
    });

    test('technician удовлетворяет требованию admin или technician', async () => {
        const { error } = await run(['admin', 'technician'], { role: 'technician' });
        expect(error).toBeUndefined();
    });

    test('без пользователя возвращается 401, а не 403', async () => {
        const { error } = await run(['admin'], undefined);
        expect(error).toBeDefined();
        expect(error.status).toBe(401);
    });
});