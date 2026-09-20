import request from 'supertest';
import { createApp } from '../src/app.js';
import { equipmentRepository } from '../src/repositories/equipmentRepository.js';
import { requestsRepository } from '../src/repositories/requestsRepository.js';

const app = createApp();

const validEquipment = {
    name: 'Сетевой инвертор NS-12',
    type: 'inverter',
    serialNumber: 'SN-INV-001',
    location: { lat: 55.75, lon: 37.61 },
    installedAt: '2025-03-01T00:00:00.000Z',
};

const createEquipment = async (body = validEquipment) => {
    const res = await request(app).post('/api/equipment').send(body).expect(201);
    return res.body.data;
};

const openWeather = () => ({
    ok: true,
    status: 200,
    json: async () => ({
        daily: {
            time: ['2026-09-21', '2026-09-22', '2026-09-23'],
            temperature_2m_max: [18, 20, 17],
            temperature_2m_min: [10, 12, 9],
            precipitation_sum: [0, 2, 0],
            wind_speed_10m_max: [4, 9, 6],
        },
    }),
});

beforeEach(async () => {
    await equipmentRepository.reset();
    await requestsRepository.reset();
});

describe('Equipment API — основные сценарии', () => {
    test('POST /api/equipment создаёт оборудование (201, defaults, Location)', async () => {
        const res = await request(app).post('/api/equipment').send(validEquipment).expect(201);
        expect(res.body.data).toMatchObject({
            name: validEquipment.name,
            type: 'inverter',
            serialNumber: 'SN-INV-001',
            status: 'operational',
        });
        expect(res.body.data.id).toBeTruthy();
        expect(res.headers.location).toBe(`/api/equipment/${res.body.data.id}`);
    });

    test('GET /api/equipment возвращает список и мета-данные пагинации', async () => {
        await createEquipment();
        await createEquipment({ ...validEquipment, serialNumber: 'SN-INV-002' });

        const res = await request(app).get('/api/equipment?page=1&limit=20').expect(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
    });

    test('GET /api/equipment/:id возвращает оборудование', async () => {
        const created = await createEquipment();
        const res = await request(app).get(`/api/equipment/${created.id}`).expect(200);
        expect(res.body.data.id).toBe(created.id);
        expect(res.body.data.serialNumber).toBe(validEquipment.serialNumber);
    });

    test('GET /api/equipment/:id — 404 для неизвестного id', async () => {
        const res = await request(app).get('/api/equipment/00000000-0000-4000-8000-000000000000').expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('POST с занятым serialNumber — 409 SERIAL_CONFLICT', async () => {
        await createEquipment();
        const res = await request(app)
            .post('/api/equipment')
            .send({ ...validEquipment, name: 'Дубль' })
            .expect(409);
        expect(res.body.error.code).toBe('SERIAL_CONFLICT');
    });

    test('POST невалидное тело — 422 VALIDATION_ERROR с details', async () => {
        const res = await request(app)
            .post('/api/equipment')
            .send({ name: 'x', type: 'inverter' })
            .expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]));
        expect(res.body.error).toHaveProperty('requestId');
    });

    test('PATCH /api/equipment/:id обновляет поля', async () => {
        const created = await createEquipment();
        const res = await request(app)
            .patch(`/api/equipment/${created.id}`)
            .send({ name: 'Обновлённое название' })
            .expect(200);
        expect(res.body.data.name).toBe('Обновлённое название');
        expect(res.body.data.serialNumber).toBe(created.serialNumber);
    });

    test('PATCH несуществующего оборудования — 404', async () => {
        await request(app)
            .patch('/api/equipment/00000000-0000-4000-8000-000000000000')
            .send({ name: 'Новое имя' })
            .expect(404);
    });

    test('DELETE /api/equipment/:id — 204', async () => {
        const created = await createEquipment();
        await request(app).delete(`/api/equipment/${created.id}`).expect(204);
        await request(app).get(`/api/equipment/${created.id}`).expect(404);
    });

    test('DELETE несуществующего оборудования — 404', async () => {
        await request(app).delete('/api/equipment/00000000-0000-4000-8000-000000000000').expect(404);
    });

    test('DELETE с открытой заявкой — 409 HAS_OPEN_REQUESTS', async () => {
        const created = await createEquipment();
        await request(app)
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'Открытая заявка', priority: 'low' })
            .expect(201);

        const res = await request(app).delete(`/api/equipment/${created.id}`).expect(409);
        expect(res.body.error.code).toBe('HAS_OPEN_REQUESTS');
    });

    test('GET /api/equipment/:id/requests возвращает заявки оборудования', async () => {
        const created = await createEquipment();
        await request(app)
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'ТО по графику', priority: 'medium' })
            .expect(201);

        const res = await request(app).get(`/api/equipment/${created.id}/requests`).expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].equipmentId).toBe(created.id);
    });

    test('Фильтрация списка по type', async () => {
        await createEquipment({ ...validEquipment, type: 'turbine', serialNumber: 'SN-T-001' });
        await createEquipment({ ...validEquipment, type: 'inverter', serialNumber: 'SN-INV-002', name: 'Второй' });

        const res = await request(app).get('/api/equipment?type=inverter').expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].type).toBe('inverter');

        const all = await request(app).get('/api/equipment').expect(200);
        expect(all.body.data).toHaveLength(2);
    });

    test('GET /api/equipment/:id/weather отдаёт прогноз (внешний fetch замокан)', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => openWeather();
        try {
            const created = await createEquipment();
            const res = await request(app).get(`/api/equipment/${created.id}/weather`).expect(200);
            expect(res.body.data.equipmentId).toBe(created.id);
            expect(res.body.data.windThresholdMs).toEqual(expect.any(Number));
            expect(res.body.data.days).toHaveLength(3);
            expect(res.body.data.days[0]).toMatchObject({
                date: '2026-09-21',
                precipitationSum: 0,
                suitableForOutdoorWork: true,
            });
            expect(res.body.data.days[1].suitableForOutdoorWork).toBe(false);
        } finally {
            global.fetch = originalFetch;
        }
    });
});