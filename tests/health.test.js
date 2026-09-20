import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('Health', () => {
    test('GET /api/health — 200 и структура ответа', async () => {
        const res = await request(app).get('/api/health').expect(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('timestamp');
        expect(typeof res.body.timestamp).toBe('string');
        expect(res.body).toHaveProperty('uptime');
        expect(typeof res.body.uptime).toBe('number');
    });
});

describe('Неизвестный маршрут', () => {
    test('GET /api/nope — 404 NOT_FOUND с единым форматом ошибки', async () => {
        const res = await request(app).get('/api/nope').expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error).toHaveProperty('message');
        expect(res.body.error).toHaveProperty('requestId');
    });

    test('Ответ содержит header X-Request-Id', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-request-id']).toBeTruthy();
    });

    test('Входящий X-Request-Id сохраняется в ответе', async () => {
        const res = await request(app).get('/api/health').set('X-Request-Id', 'trace-42');
        expect(res.headers['x-request-id']).toBe('trace-42');
    });
});

describe('CORS', () => {
    test('Origin null (страница открыта через file://) разрешён', async () => {
        const res = await request(app).get('/api/equipment').set('Origin', 'null').expect(200);
        expect(res.headers['access-control-allow-origin']).toBe('null');
    });

    test('preflight OPTIONS с Origin null проходит (file:// POST/PATCH)', async () => {
        const res = await request(app)
            .options('/api/requests')
            .set('Origin', 'null')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type')
            .expect(204);
        expect(res.headers['access-control-allow-origin']).toBe('null');
        expect(res.headers['access-control-allow-methods']).toContain('POST');
        expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    });

    test('не перечисленный Origin отклоняется', async () => {
        const res = await request(app).get('/api/equipment').set('Origin', 'https://evil.example');
        expect(res.status).toBe(500);
    });

    test('same-origin Origin (свой адрес сервера) разрешён даже если его нет в CORS_ORIGINS', async () => {
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        try {
            const res = await fetch(`${base}/api/requests`, {
                // Браузер отправляет Origin, равный адресу страницы, даже на same-origin POST
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: base, Connection: 'close' },
                body: JSON.stringify({
                    equipmentId: '00000000-0000-4000-8000-000000000000',
                    title: 'Проверка same-origin POST',
                    priority: 'low',
                }),
            });
            expect(res.status).toBe(404); // доходит до API — CORS не блокирует
            expect(res.headers.get('access-control-allow-origin')).toBe(base);
            expect((await res.json()).error.code).toBe('NOT_FOUND');
        } finally {
            server.close();
            server.closeAllConnections?.();
        }
    });
});