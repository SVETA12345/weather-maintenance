import request from 'supertest';
import { createApp } from '../src/app.js';
import { equipmentRepository } from '../src/repositories/equipmentRepository.js';
import { requestsRepository } from '../src/repositories/requestsRepository.js';

const app = createApp();

const equipmentBody = {
    name: 'Ветроустановка W-100',
    type: 'turbine',
    serialNumber: 'SN-W-001',
    location: { lat: 55.75, lon: 37.61 },
    installedAt: '2025-03-01T00:00:00.000Z',
};

const requestBody = (equipmentId, overrides = {}) => ({
    equipmentId,
    title: 'Плановое ТО ветроустановки',
    description: 'Проверить лопасти и масло',
    priority: 'high',
    plannedAt: '2026-10-05T09:00:00.000Z',
    ...overrides,
});

let equipmentId;

beforeAll(async () => {
    await equipmentRepository.reset();
    await requestsRepository.reset();
});

beforeEach(async () => {
    await equipmentRepository.reset();
    await requestsRepository.reset();
    const res = await request(app).post('/api/equipment').send(equipmentBody).expect(201);
    equipmentId = res.body.data.id;
});

describe('Requests API — основные сценарии', () => {
    test('POST /api/requests создаёт заявку (201, status=new)', async () => {
        const res = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        expect(res.body.data).toMatchObject({
            equipmentId,
            title: requestBody(equipmentId).title,
            priority: 'high',
            status: 'new',
        });
        expect(res.body.data.id).toBeTruthy();
        expect(res.headers.location).toBe(`/api/requests/${res.body.data.id}`);
    });

    test('POST заявки на несуществующее оборудование — 404', async () => {
        const res = await request(app)
            .post('/api/requests')
            .send(requestBody('00000000-0000-4000-8000-000000000000'))
            .expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('POST невалидное тело — 422 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post('/api/requests')
            .send({ equipmentId, title: 'x', priority: 'unknown' })
            .expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'title' })]));
    });

    test('GET /api/requests возвращает список и мета-данные', async () => {
        await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const res = await request(app).get('/api/requests').expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.meta.total).toBe(1);
    });

    test('GET /api/requests/:id возвращает заявку; неизвестный id — 404', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const res = await request(app).get(`/api/requests/${created.body.data.id}`).expect(200);
        expect(res.body.data.title).toBe(requestBody(equipmentId).title);

        await request(app).get('/api/requests/00000000-0000-4000-8000-000000000000').expect(404);
    });

    test('PATCH /api/requests/:id обновляет поля, equipmentId изменить нельзя', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const other = await request(app).post('/api/equipment').send({ ...equipmentBody, serialNumber: 'SN-W-002' }).expect(201);

        const res = await request(app)
            .patch(`/api/requests/${created.body.data.id}`)
            .send({ description: 'Новое описание', equipmentId: other.body.data.id })
            .expect(200);

        expect(res.body.data.description).toBe('Новое описание');
        expect(res.body.data.equipmentId).toBe(equipmentId);
    });

    test('PATCH несуществующей заявки — 404', async () => {
        await request(app)
            .patch('/api/requests/00000000-0000-4000-8000-000000000000')
            .send({ description: 'x' })
            .expect(404);
    });

    test('Переход статуса new → in_progress → done', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const id = created.body.data.id;

        const inProgress = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        expect(inProgress.body.data.status).toBe('in_progress');

        const done = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'done' }).expect(200);
        expect(done.body.data.status).toBe('done');
    });

    test('Переход new → rejected возможен', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const res = await request(app)
            .patch(`/api/requests/${created.body.data.id}/status`)
            .send({ status: 'rejected' })
            .expect(200);
        expect(res.body.data.status).toBe('rejected');
    });

    test('Недопустимый переход done → new — 409 INVALID_STATUS_TRANSITION', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const id = created.body.data.id;

        await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        await request(app).patch(`/api/requests/${id}/status`).send({ status: 'done' }).expect(200);

        const res = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'new' }).expect(409);
        expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('Недопустимый статус в теле — 422', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        await request(app)
            .patch(`/api/requests/${created.body.data.id}/status`)
            .send({ status: 'whatever' })
            .expect(422);
    });

    test('DELETE /api/requests/:id — 204', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        await request(app).delete(`/api/requests/${created.body.data.id}`).expect(204);
        await request(app).get(`/api/requests/${created.body.data.id}`).expect(404);
    });
});