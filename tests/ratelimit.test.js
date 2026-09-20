// Для этого файла снижаем лимит rate-limit до 3 запросов до импорта приложения,
// чтобы проверить лимит частоты без 100+ запросов.
import request from 'supertest';

// Для этого файла снижаем лимит rate-limit до 3 запросов до импорта приложения,
// чтобы проверить лимит частоты без 100+ запросов.
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX = '3';

const { createApp } = await import('../src/app.js');

const app = createApp();

describe('Rate limit', () => {
    test('превышение лимита — 429 RATE_LIMIT_EXCEEDED', async () => {
        for (let i = 0; i < 3; i += 1) {
            await request(app).get('/api/health').expect(200);
        }

        const res = await request(app).get('/api/health').expect(429);
        expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(res.body.error).toHaveProperty('requestId');
    });
});