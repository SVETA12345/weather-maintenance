import request from 'supertest';
import { createApp } from '../src/app.js';
import { models } from '../src/models/sequelize.js';
import { closeTestDb, resetTestDb } from './helpers/db.js';
import { authHeader, authed } from './helpers/auth.js';

const app = createApp();

let admin;
let viewer;
let alpha;
let beta;
let gamma;

beforeAll(async () => {
    await resetTestDb();
    admin = authed(app, await authHeader(app, { role: 'admin' }));
    viewer = authed(app, await authHeader(app, { role: 'viewer' }));

    [alpha, beta, gamma] = await Promise.all([
        models.Technician.create({
            full_name: 'Иванов Иван Иванович',
            specialization: 'turbine',
            personnel_number: 'T-0001',
        }),
        models.Technician.create({
            full_name: 'Петров Пётр Петрович',
            specialization: 'electrical',
            personnel_number: 'T-0002',
        }),
        models.Technician.create({
            full_name: 'Сидоров Сидор',
            specialization: 'turbine',
            personnel_number: 'T-0003',
        }),
    ]);
});

afterAll(closeTestDb);

describe('Справочник специалистов — чтение', () => {
    test('GET /api/technicians — 200, список и meta', async () => {
        const res = await admin.get('/api/technicians').expect(200);
        expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 20 });
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data[0]).toEqual({
            id: expect.any(String),
            fullName: expect.any(String),
            specialization: expect.any(String),
            personnelNumber: expect.any(String),
            createdAt: expect.any(String),
        });
    });

    test('доступен любой аутентифицированной роли, включая viewer', async () => {
        const res = await viewer.get('/api/technicians').expect(200);
        expect(res.body.meta.total).toBe(3);
    });

    test('без токена — 401 AUTH_REQUIRED', async () => {
        const res = await request(app).get('/api/technicians').expect(401);
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('фильтр по specialization', async () => {
        const res = await admin.get('/api/technicians?specialization=turbine').expect(200);
        expect(res.body.meta.total).toBe(2);
        expect(res.body.data.every((t) => t.specialization === 'turbine')).toBe(true);
    });

    test('поиск search по ФИО и табельному номеру без учёта регистра', async () => {
        const byName = await admin.get('/api/technicians?search=петров').expect(200);
        expect(byName.body.data.map((t) => t.id)).toEqual([beta.id]);

        const byNumber = await admin.get('/api/technicians?search=t-0003').expect(200);
        expect(byNumber.body.data.map((t) => t.id)).toEqual([gamma.id]);
    });

    test('спецсимволы LIKE в search экранируются', async () => {
        const res = await admin.get('/api/technicians?search=%25').expect(200);
        expect(res.body.meta.total).toBe(0);
    });

    test('сортировка sortBy=personnelNumber&order=desc', async () => {
        const res = await admin.get('/api/technicians?sortBy=personnelNumber&order=desc').expect(200);
        expect(res.body.data.map((t) => t.personnelNumber)).toEqual(['T-0003', 'T-0002', 'T-0001']);
    });

    test('по умолчанию сортировка по ФИО', async () => {
        const res = await admin.get('/api/technicians').expect(200);
        expect(res.body.data[0].fullName).toBe('Иванов Иван Иванович');
    });

    test('пагинация page/limit и выход за пределы — пустой список', async () => {
        const page = await admin.get('/api/technicians?limit=2&page=2').expect(200);
        expect(page.body.data).toHaveLength(1);
        expect(page.body.meta).toMatchObject({ total: 3, page: 2, limit: 2 });

        const beyond = await admin.get('/api/technicians?limit=2&page=9').expect(200);
        expect(beyond.body.data).toEqual([]);
        expect(beyond.body.meta.total).toBe(3);
    });

    test('limit больше MAX_LIMIT — 400', async () => {
        const res = await admin.get('/api/technicians?limit=1000');
        expect(res.status).toBe(400);
    });

    test('GET /api/technicians/:id — 200 с полями специалиста', async () => {
        const res = await admin.get(`/api/technicians/${alpha.id}`).expect(200);
        expect(res.body.data).toMatchObject({
            id: alpha.id,
            fullName: 'Иванов Иван Иванович',
            specialization: 'turbine',
            personnelNumber: 'T-0001',
        });
    });

    test('GET /api/technicians/:id для неизвестного и невалидного id — 404', async () => {
        const missing = await admin.get('/api/technicians/00000000-0000-4000-8000-000000000000').expect(404);
        expect(missing.body.error.code).toBe('NOT_FOUND');

        const malformed = await admin.get('/api/technicians/not-a-uuid').expect(404);
        expect(malformed.body.error.code).toBe('NOT_FOUND');
    });

    test('справочник только для чтения: POST/PATCH/DELETE недоступны всем ролям', async () => {
        expect((await admin.post('/api/technicians').send({ fullName: 'X' })).status).toBe(404);
        expect((await admin.patch(`/api/technicians/${alpha.id}`).send({ fullName: 'X' })).status).toBe(404);
        expect((await admin.delete(`/api/technicians/${alpha.id}`)).status).toBe(404);
        expect((await viewer.post('/api/technicians').send({ fullName: 'X' })).status).toBe(404);
    });
});