import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetTestDb, closeTestDb, createTechnician, setRequestCreatedAt } from './helpers/db.js';

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

beforeEach(async () => {
    await resetTestDb();
    const res = await request(app).post('/api/equipment').send(equipmentBody).expect(201);
    equipmentId = res.body.data.id;
});

afterAll(closeTestDb);

const assignCrew = async (requestId) => {
    const technician = await createTechnician();
    await request(app)
        .post(`/api/requests/${requestId}/assignees`)
        .send([{ technicianId: technician.id, role: 'lead' }])
        .expect(201);
    return technician;
};

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

    test('фильтры status, priority и equipmentId применяются в базе', async () => {
        const other = await request(app)
            .post('/api/equipment')
            .send({ ...equipmentBody, serialNumber: 'SN-W-100' })
            .expect(201);

        const critical = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Критичная заявка', priority: 'critical' }))
            .expect(201)).body.data;
        const low = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Низкий приоритет', priority: 'low' }))
            .expect(201)).body.data;
        await request(app)
            .post('/api/requests')
            .send(requestBody(other.body.data.id, { title: 'Чужая заявка' }))
            .expect(201);

        const byPriority = await request(app).get('/api/requests?priority=low').expect(200);
        expect(byPriority.body.data.map((r) => r.id)).toEqual([low.id]);
        expect(byPriority.body.meta.total).toBe(1);

        const byEquipment = await request(app).get(`/api/requests?equipmentId=${equipmentId}`).expect(200);
        expect(byEquipment.body.data.map((r) => r.id).sort()).toEqual([critical.id, low.id].sort());
        expect(byEquipment.body.meta.total).toBe(2);

        const byStatus = await request(app).get('/api/requests?status=in_progress').expect(200);
        expect(byStatus.body.data).toEqual([]);
        expect(byStatus.body.meta.total).toBe(0);
    });

    test('фильтр по периоду from/to отсекает заявки по created_at', async () => {
        const old = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Старая заявка' }))
            .expect(201)).body.data;
        const fresh = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Свежая заявка' }))
            .expect(201)).body.data;
        await setRequestCreatedAt(old.id, '2026-01-01T00:00:00.000Z');

        const res = await request(app)
            .get('/api/requests?from=2026-06-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z')
            .expect(200);
        expect(res.body.data.map((r) => r.id)).toEqual([fresh.id]);
        expect(res.body.meta.total).toBe(1);
    });

    test('сортировка по sortBy и order выполняется в базе', async () => {
        const critical = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Заявка critical', priority: 'critical' }))
            .expect(201)).body.data;
        const low = (await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { title: 'Заявка low', priority: 'low' }))
            .expect(201)).body.data;

        const desc = await request(app).get('/api/requests?sortBy=priority&order=desc').expect(200);
        expect(desc.body.data.map((r) => r.id)).toEqual([critical.id, low.id]);

        const asc = await request(app).get('/api/requests?sortBy=priority').expect(200);
        expect(asc.body.data.map((r) => r.id)).toEqual([low.id, critical.id]);
    });

    test('пагинация режет страницу в базе, total считает все подходящие заявки', async () => {
        const ids = [];
        for (let i = 1; i <= 5; i += 1) {
            ids.push(
                (await request(app)
                    .post('/api/requests')
                    .send(requestBody(equipmentId, { title: `Заявка номер ${i}` }))
                    .expect(201)).body.data.id,
            );
        }

        const firstPage = await request(app).get('/api/requests?page=1&limit=2').expect(200);
        expect(firstPage.body.data).toHaveLength(2);
        expect(firstPage.body.meta).toEqual({ total: 5, page: 1, limit: 2 });

        const lastPage = await request(app).get('/api/requests?page=3&limit=2').expect(200);
        expect(lastPage.body.data).toHaveLength(1);

        const beyond = await request(app).get('/api/requests?page=9&limit=2').expect(200);
        expect(beyond.body.data).toEqual([]);
        expect(beyond.body.meta.total).toBe(5);
        expect(ids).toHaveLength(5);
    });

    test('limit и offset ограничены сверху, выход за диапазон — 400 INVALID_PAGINATION', async () => {
        const tooBigLimit = await request(app).get('/api/requests?limit=101').expect(400);
        expect(tooBigLimit.body.error.code).toBe('INVALID_PAGINATION');
        expect(tooBigLimit.body.error.details.map((d) => d.field)).toEqual(['limit']);

        const tooBigOffset = await request(app).get('/api/requests?offset=10001').expect(400);
        expect(tooBigOffset.body.error.details.map((d) => d.field)).toEqual(['offset']);

        const zeroOffset = await request(app).get('/api/requests?offset=0').expect(200);
        expect(zeroOffset.body.meta).toEqual({ total: 0, page: 1, limit: 20 });

        // остальные нарушения схемы остаются 422
        await request(app).get('/api/requests?priority=urgent').expect(422);
    });

    test('plannedLaborHours принимается в теле и возвращается в заявке', async () => {
        const created = await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { plannedLaborHours: 6.5 }))
            .expect(201);
        expect(created.body.data.plannedLaborHours).toBe(6.5);

        const patched = await request(app)
            .patch(`/api/requests/${created.body.data.id}`)
            .send({ plannedLaborHours: 2 })
            .expect(200);
        expect(patched.body.data.plannedLaborHours).toBe(2);

        await request(app)
            .post('/api/requests')
            .send(requestBody(equipmentId, { plannedLaborHours: -1 }))
            .expect(422);
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
        await assignCrew(id);

        const inProgress = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        expect(inProgress.body.data.status).toBe('in_progress');

        const done = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'done' }).expect(200);
        expect(done.body.data.status).toBe('done');
    });

    test('PATCH /:id/status возвращает в ответе новый статус, а не предыдущий', async () => {
        const created = await request(app).post('/api/requests').send(requestBody(equipmentId)).expect(201);
        const id = created.body.data.id;
        await assignCrew(id);

        const first = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        expect(first.body.data.status).toBe('in_progress');

        const second = await request(app).patch(`/api/requests/${id}/status`).send({ status: 'done' }).expect(200);
        expect(second.body.data.status).toBe('done');

        const stored = await request(app).get(`/api/requests/${id}`).expect(200);
        expect(stored.body.data.status).toBe('done');
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
        await assignCrew(id);

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