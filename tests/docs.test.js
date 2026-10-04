import request from 'supertest';
import { createApp } from '../src/app.js';
import { closeTestDb, resetTestDb } from './helpers/db.js';

const app = createApp();

beforeAll(resetTestDb);
afterAll(closeTestDb);

describe('GET /api/docs', () => {
    test('отдаёт HTML Swagger UI', async () => {
        const res = await request(app).get('/api/docs').expect(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('swagger-ui');
    });

    test('Swagger UI подгружает спецификацию приложения', async () => {
        const res = await request(app).get('/api/docs/swagger-ui-init.js').expect(200);
        expect(res.text).toContain('/api/docs/openapi.json');
    });

    test('спецификация доступна как JSON без токена', async () => {
        const res = await request(app).get('/api/docs/openapi.json').expect(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.body.openapi).toBe('3.0.3');
        expect(res.body.info.title).toBeTruthy();
    });

    test('спецификация описывает схему авторизации и роли', async () => {
        const { body } = await request(app).get('/api/docs/openapi.json').expect(200);
        expect(body.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
        expect(body.components.schemas.User.properties.role.enum).toEqual(['viewer', 'technician', 'admin']);
        expect(body.info.description).toContain('viewer');
        expect(body.info.description).toContain('technician');
        expect(body.info.description).toContain('admin');
    });

    test('в спецификации есть все точки API, включая эксплуатационные', async () => {
        const { body } = await request(app).get('/api/docs/openapi.json').expect(200);
        const paths = Object.keys(body.paths);
        expect(paths).toEqual(
            expect.arrayContaining([
                '/api/auth/register',
                '/api/auth/login',
                '/api/auth/refresh',
                '/api/auth/logout',
                '/api/auth/me',
                '/api/equipment',
                '/api/equipment/{id}',
                '/api/requests',
                '/api/requests/{id}',
                '/api/requests/{id}/status',
                '/api/requests/{id}/assignees',
                '/api/requests/{id}/history',
                '/api/technicians',
                '/api/health/live',
                '/api/health/ready',
                '/metrics',
                '/api/docs',
            ]),
        );
    });

    test('авторизация обязательна по умолчанию и снята для публичных операций', async () => {
        const { body } = await request(app).get('/api/docs/openapi.json').expect(200);
        // Общее правило спецификации: bearerAuth, пока операция не переопределит его.
        expect(body.security).toEqual([{ bearerAuth: [] }]);
        expect(body.paths['/api/equipment'].get.security).toBeUndefined();
        expect(body.paths['/api/requests'].post.security).toBeUndefined();
        expect(body.paths['/api/health/ready'].get.security).toEqual([]);
        expect(body.paths['/metrics'].get.security).toEqual([]);
        expect(body.paths['/api/auth/login'].post.security).toEqual([]);
    });

    test('все $ref спецификации разрешаются', async () => {
        const { body } = await request(app).get('/api/docs/openapi.json').expect(200);
        const refs = [];
        const walk = (node) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (!node || typeof node !== 'object') return;
            for (const [key, value] of Object.entries(node)) {
                if (key === '$ref' && typeof value === 'string') refs.push(value);
                else walk(value);
            }
        };
        walk(body);
        expect(refs.length).toBeGreaterThan(10);
        for (const ref of refs) {
            const name = ref.replace('#/components/schemas/', '');
            expect(body.components.schemas[name] ?? ref).toBeDefined();
            expect(ref).not.toContain(' ');
        }
    });
});