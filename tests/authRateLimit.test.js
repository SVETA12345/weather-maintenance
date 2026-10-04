import request from 'supertest';

// Для этого файла снижаем лимит попыток входа до 3 до импорта приложения,
// чтобы проверить отдельное ограничение на /api/auth/login, не делая 100+ запросов.
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
process.env.AUTH_RATE_LIMIT_MAX = '3';

const { createApp } = await import('../src/app.js');
// Импорт хелпера только здесь: статический импорт поднялся бы выше и зафиксировал
// config до того, как выставлен AUTH_RATE_LIMIT_MAX.
const { closeTestDb, resetTestDb } = await import('./helpers/db.js');
const { createUser, TEST_PASSWORD } = await import('./helpers/auth.js');

const app = createApp();

beforeEach(resetTestDb);

afterAll(closeTestDb);

describe('Ограничение частоты попыток входа', () => {
    // Первым идёт успешный вход: лимит считает только неудачные попытки,
    // поэтому серия верных паролей не должна исчерпать счётчик.
    test('успешный вход не расходует лимит (skipSuccessfulRequests)', async () => {
        const user = await createUser();

        for (let i = 0; i < 5; i += 1) {
            await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
        }
    });

    test('после серии неудачных попыток вход — 429 RATE_LIMIT_EXCEEDED', async () => {
        const user = await createUser();

        for (let i = 0; i < 3; i += 1) {
            await request(app)
                .post('/api/auth/login')
                .send({ email: user.email, password: 'wrong-password' })
                .expect(401);
        }

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(429);
        expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(res.body.error).toHaveProperty('requestId');
    });
});