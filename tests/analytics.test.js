import request from 'supertest';
import { createApp } from '../src/app.js';
import {
    resetTestDb,
    closeTestDb,
    createTechnician,
    getSiteIdOfEquipment,
    setRequestCreatedAt,
    setRequestDurationHours,
} from './helpers/db.js';

const app = createApp();

// Площадка определяется координатами, поэтому площадка = уникальная пара lat/lon.
const equipmentBody = (serialNumber, lat, lon) => ({
    name: `Оборудование ${serialNumber}`,
    type: 'inverter',
    serialNumber,
    location: { lat, lon },
    installedAt: '2025-03-01T00:00:00.000Z',
});

const createEquipment = async (serialNumber, lat, lon) => {
    const res = await request(app).post('/api/equipment').send(equipmentBody(serialNumber, lat, lon)).expect(201);
    return res.body.data;
};

const createRequest = (equipmentId, title = 'Заявка', extra = {}) =>
    request(app)
        .post('/api/requests')
        .send({ equipmentId, title, priority: 'medium', ...extra });

beforeEach(async () => {
    await resetTestDb();
});

afterAll(closeTestDb);

describe('GET /api/sites/:id/summary', () => {
    test('неизвестный id — 404, не-uuid — 404', async () => {
        const unknown = await request(app).get('/api/sites/00000000-0000-4000-8000-000000000000/summary').expect(404);
        expect(unknown.body.error.code).toBe('NOT_FOUND');
        await request(app).get('/api/sites/not-a-uuid/summary').expect(404);
    });

    test('площадка без заявок: нули и null в среднем', async () => {
        const equipment = await createEquipment('SN-EMPTY-1', 10.1, 20.2);
        const siteId = await getSiteIdOfEquipment(equipment.id);

        const res = await request(app).get(`/api/sites/${siteId}/summary`).expect(200);
        expect(res.body.data).toEqual({
            siteId,
            total: 0,
            byStatus: { new: 0, in_progress: 0, done: 0, rejected: 0 },
            byPriority: { low: 0, medium: 0, high: 0, critical: 0 },
            averageClosureHours: null,
        });
    });

    test('считает заявки по статусам и общий итог', async () => {
        const equipment = await createEquipment('SN-MIX-1', 11.1, 21.2);
        const siteId = await getSiteIdOfEquipment(equipment.id);
        const technician = await createTechnician();

        const newRequest = (await createRequest(equipment.id, 'Новая')).body.data;
        const forWork = (await createRequest(equipment.id, 'В работу')).body.data;
        const forDone = (await createRequest(equipment.id, 'В закрытую')).body.data;
        const forReject = (await createRequest(equipment.id, 'Отклонённая')).body.data;

        await request(app).post(`/api/requests/${forWork.id}/assignees`).send([{ technicianId: technician.id, role: 'lead' }]);
        await request(app).patch(`/api/requests/${forWork.id}/status`).send({ status: 'in_progress' });
        await request(app).patch(`/api/requests/${forWork.id}/status`).send({ status: 'done' });
        await request(app).patch(`/api/requests/${forReject.id}/status`).send({ status: 'rejected' });

        const res = await request(app).get(`/api/sites/${siteId}/summary`).expect(200);
        expect(res.body.data.total).toBe(4);
        expect(res.body.data.byStatus).toEqual({ new: 2, in_progress: 0, done: 1, rejected: 1 });
        expect(res.body.data.averageClosureHours).toEqual(expect.any(Number));
        expect(newRequest.id).toBeTruthy();
    });

    test('считает заявки по приоритетам', async () => {
        const equipment = await createEquipment('SN-PRIO-1', 11.3, 21.4);
        const siteId = await getSiteIdOfEquipment(equipment.id);

        for (const priority of ['low', 'medium', 'high', 'high', 'critical']) {
            await createRequest(equipment.id, `Заявка ${priority}`, { priority }).expect(201);
        }

        const res = await request(app).get(`/api/sites/${siteId}/summary`).expect(200);
        expect(res.body.data.total).toBe(5);
        expect(res.body.data.byPriority).toEqual({ low: 1, medium: 1, high: 2, critical: 1 });
    });

    test('среднее считается только по закрытым заявкам и округляется до одного знака', async () => {
        const equipment = await createEquipment('SN-AVG-1', 12.1, 22.2);
        const siteId = await getSiteIdOfEquipment(equipment.id);
        const technician = await createTechnician();

        const first = (await createRequest(equipment.id, 'Первая закрытая')).body.data;
        const second = (await createRequest(equipment.id, 'Вторая закрытая')).body.data;
        const open = (await createRequest(equipment.id, 'Открытая')).body.data;

        for (const id of [first.id, second.id]) {
            await request(app)
                .post(`/api/requests/${id}/assignees`)
                .send([{ technicianId: technician.id, role: 'lead' }])
                .expect(201);
            await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
            await request(app).patch(`/api/requests/${id}/status`).send({ status: 'done' }).expect(200);
        }
        await request(app)
            .post(`/api/requests/${open.id}/assignees`)
            .send([{ technicianId: technician.id, role: 'lead' }])
            .expect(201);
        await request(app).patch(`/api/requests/${open.id}/status`).send({ status: 'in_progress' }).expect(200);

        await setRequestDurationHours(first.id, 2);
        await setRequestDurationHours(second.id, 3);

        const res = await request(app).get(`/api/sites/${siteId}/summary`).expect(200);
        expect(res.body.data.byStatus.done).toBe(2);
        expect(res.body.data.averageClosureHours).toBe(2.5);
    });

    test('заявки соседней площадки не попадают в сводку', async () => {
        const mine = await createEquipment('SN-OWN-1', 13.1, 23.2);
        const neighbour = await createEquipment('SN-OWN-2', 14.1, 24.2);
        const mySiteId = await getSiteIdOfEquipment(mine.id);
        const neighbourSiteId = await getSiteIdOfEquipment(neighbour.id);
        expect(mySiteId).not.toBe(neighbourSiteId);

        await createRequest(mine.id, 'Моя заявка');
        await createRequest(neighbour.id, 'Чужая заявка');

        const res = await request(app).get(`/api/sites/${mySiteId}/summary`).expect(200);
        expect(res.body.data.total).toBe(1);
        expect(res.body.data.byStatus.new).toBe(1);
    });
});

describe('GET /api/reports/equipment-load', () => {
    test('оборудование без заявок попадает в отчёт с нулями', async () => {
        await createEquipment('SN-IDLE-1', 15.1, 25.2);

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({
            serialNumber: 'SN-IDLE-1',
            requestsTotal: 0,
            requestsOpen: 0,
            requestsDone: 0,
            requestsRejected: 0,
            lastRequestAt: null,
        });
        expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 20 });
    });

    test('оборудование без заявок не исключается из отчёта (LEFT JOIN)', async () => {
        await createEquipment('SN-IDLE-2', 16.1, 26.2);
        await createEquipment('SN-IDLE-3', 17.1, 27.2);
        const busy = await createEquipment('SN-BUSY-1', 18.1, 28.2);
        await createRequest(busy.id, 'Заявка');

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.meta.total).toBe(3);
        expect(res.body.data.map((row) => row.serialNumber)).toEqual(
            expect.arrayContaining(['SN-IDLE-2', 'SN-IDLE-3', 'SN-BUSY-1']),
        );
    });

    test('считает заявки по статусам и отдаёт дату последней заявки в ISO', async () => {
        const equipment = await createEquipment('SN-COUNT-1', 19.1, 29.2);
        const technician = await createTechnician();

        const inWork = (await createRequest(equipment.id, 'В работе')).body.data;
        const done = (await createRequest(equipment.id, 'Закрытая')).body.data;
        const rejected = (await createRequest(equipment.id, 'Отклонённая')).body.data;
        await createRequest(equipment.id, 'Новая');

        for (const id of [inWork.id, done.id]) {
            await request(app)
                .post(`/api/requests/${id}/assignees`)
                .send([{ technicianId: technician.id, role: 'lead' }])
                .expect(201);
            await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        }
        await request(app).patch(`/api/requests/${done.id}/status`).send({ status: 'done' }).expect(200);
        await request(app).patch(`/api/requests/${rejected.id}/status`).send({ status: 'rejected' }).expect(200);

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data[0]).toMatchObject({
            serialNumber: 'SN-COUNT-1',
            requestsTotal: 4,
            requestsOpen: 2,
            requestsDone: 1,
            requestsRejected: 1,
        });
        expect(typeof res.body.data[0].lastRequestAt).toBe('string');
        expect(new Date(res.body.data[0].lastRequestAt).toString()).not.toBe('Invalid Date');
    });

    test('суммирует плановые трудозатраты и отдаёт дату последнего обслуживания', async () => {
        const equipment = await createEquipment('SN-LABOR-1', 19.5, 29.6);
        const technician = await createTechnician();

        const withLabor = (await createRequest(equipment.id, 'С планом', { plannedLaborHours: 4.5 })).body.data;
        const withoutLabor = (await createRequest(equipment.id, 'Без плана')).body.data;
        expect(withoutLabor.plannedLaborHours).toBeNull();

        for (const id of [withLabor.id, withoutLabor.id]) {
            await request(app)
                .post(`/api/requests/${id}/assignees`)
                .send([{ technicianId: technician.id, role: 'lead' }])
                .expect(201);
            await request(app).patch(`/api/requests/${id}/status`).send({ status: 'in_progress' }).expect(200);
        }
        await request(app).patch(`/api/requests/${withLabor.id}/status`).send({ status: 'done' }).expect(200);

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data[0].plannedLaborHours).toBe(4.5);
        expect(typeof res.body.data[0].lastServiceAt).toBe('string');
        expect(new Date(res.body.data[0].lastServiceAt).toString()).not.toBe('Invalid Date');
    });

    test('дата последнего обслуживания — null, если закрытых заявок не было', async () => {
        const equipment = await createEquipment('SN-LABOR-2', 19.7, 29.8);
        await createRequest(equipment.id, 'Новая', { plannedLaborHours: 2 });

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data[0]).toMatchObject({ plannedLaborHours: 2, lastServiceAt: null });
        expect(res.body.data[0].lastRequestAt).toEqual(expect.any(String));
    });

    test('оборудование без заявок даёт нулевые трудозатраты', async () => {
        await createEquipment('SN-LABOR-3', 19.9, 30.0);

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data[0]).toMatchObject({ plannedLaborHours: 0, lastServiceAt: null });
    });

    test('период отсекает заявки вне интервала, оборудование остаётся в отчёте', async () => {
        const fresh = await createEquipment('SN-PERIOD-1', 23.1, 33.2);
        const old = await createEquipment('SN-PERIOD-2', 23.2, 33.3);
        const freshRequest = (await createRequest(fresh.id, 'Свежая', { plannedLaborHours: 3 })).body.data;
        const oldRequest = (await createRequest(old.id, 'Старая', { plannedLaborHours: 7 })).body.data;
        await setRequestCreatedAt(oldRequest.id, '2026-01-01T00:00:00.000Z');

        const from = '2026-02-01T00:00:00.000Z';
        const to = '2026-12-31T00:00:00.000Z';
        const res = await request(app)
            .get(`/api/reports/equipment-load?from=${from}&to=${to}`)
            .expect(200);

        const bySerial = Object.fromEntries(res.body.data.map((row) => [row.serialNumber, row]));
        expect(bySerial['SN-PERIOD-1']).toMatchObject({ requestsTotal: 1, plannedLaborHours: 3 });
        expect(bySerial['SN-PERIOD-2']).toMatchObject({ requestsTotal: 0, plannedLaborHours: 0 });
        expect(res.body.meta.total).toBe(2);
        expect(freshRequest.id).toBeTruthy();
    });

    test('minRequests отсекает группы с малым числом заявок и влияет на total', async () => {
        const busy = await createEquipment('SN-MIN-1', 24.1, 34.2);
        const idle = await createEquipment('SN-MIN-2', 24.2, 34.3);
        await createRequest(busy.id, 'Первая');
        await createRequest(busy.id, 'Вторая');

        const res = await request(app).get('/api/reports/equipment-load?minRequests=2').expect(200);
        expect(res.body.data.map((row) => row.serialNumber)).toEqual(['SN-MIN-1']);
        expect(res.body.meta.total).toBe(1);
        expect(idle.id).toBeTruthy();
    });

    test('некорректный minRequests — 422', async () => {
        const res = await request(app).get('/api/reports/equipment-load?minRequests=-1').expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('сортировка по sortBy выполняется в базе', async () => {
        const first = await createEquipment('SN-SORT-1', 25.1, 35.2);
        const second = await createEquipment('SN-SORT-2', 25.2, 35.3);
        await createRequest(first.id, 'Первая заявка');
        await createRequest(second.id, 'Вторая заявка');
        await createRequest(second.id, 'Третья заявка');

        const byTotal = await request(app)
            .get('/api/reports/equipment-load?sortBy=requestsTotal&order=desc')
            .expect(200);
        expect(byTotal.body.data.map((row) => row.serialNumber)).toEqual(['SN-SORT-2', 'SN-SORT-1']);

        const byName = await request(app).get('/api/reports/equipment-load?sortBy=name').expect(200);
        expect(byName.body.data.map((row) => row.name)).toEqual(['Оборудование SN-SORT-1', 'Оборудование SN-SORT-2']);
    });

    test('сортировка: сначала по убыванию открытых заявок, затем по имени', async () => {
        const low = await createEquipment('SN-ORD-LOW', 20.1, 30.2);
        const high = await createEquipment('SN-ORD-HIGH', 21.1, 31.2);
        const none = await createEquipment('SN-ORD-NONE', 22.1, 32.2);

        await createRequest(low.id, 'Одна открытая');
        await createRequest(high.id, 'Открытая 1');
        await createRequest(high.id, 'Открытая 2');
        expect(none.id).toBeTruthy();

        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data.map((row) => row.requestsOpen)).toEqual([2, 1, 0]);
        // У двух с нулём открытых заявок порядок определяется именем по возрастанию.
        const idle = res.body.data.filter((row) => row.requestsOpen === 0);
        expect(idle.map((row) => row.name)).toEqual([...idle.map((row) => row.name)].sort((a, b) => (a < b ? -1 : 1)));
    });

    test('пагинация режет строки, а total считает всё оборудование', async () => {
        for (let i = 1; i <= 5; i += 1) {
            await createEquipment(`SN-PAGE-${i}`, 30 + i / 10, 40 + i / 10);
        }

        const firstPage = await request(app).get('/api/reports/equipment-load?page=1&limit=2').expect(200);
        expect(firstPage.body.data).toHaveLength(2);
        expect(firstPage.body.meta).toEqual({ total: 5, page: 1, limit: 2 });

        const lastPage = await request(app).get('/api/reports/equipment-load?page=3&limit=2').expect(200);
        expect(lastPage.body.data).toHaveLength(1);

        const beyond = await request(app).get('/api/reports/equipment-load?page=9&limit=2').expect(200);
        expect(beyond.body.data).toHaveLength(0);
        expect(beyond.body.meta.total).toBe(5);
    });

    test('limit и offset вне диапазона — 400 INVALID_PAGINATION', async () => {
        const tooBigLimit = await request(app).get('/api/reports/equipment-load?limit=101').expect(400);
        expect(tooBigLimit.body.error.code).toBe('INVALID_PAGINATION');
        expect(tooBigLimit.body.error.details.map((d) => d.field)).toEqual(['limit']);

        const zeroLimit = await request(app).get('/api/reports/equipment-load?limit=0').expect(400);
        expect(zeroLimit.body.error.code).toBe('INVALID_PAGINATION');

        const tooBigOffset = await request(app).get('/api/reports/equipment-load?offset=10001').expect(400);
        expect(tooBigOffset.body.error.details.map((d) => d.field)).toEqual(['offset']);

        const negativeOffset = await request(app).get('/api/reports/equipment-load?offset=-1').expect(400);
        expect(negativeOffset.body.error.details.map((d) => d.field)).toEqual(['offset']);

        // offset, посчитанный через page, тоже ограничен
        const deepPage = await request(app).get('/api/reports/equipment-load?page=200&limit=100').expect(400);
        expect(deepPage.body.error.details.map((d) => d.field)).toEqual(['offset']);

        // прочие нарушения схемы остаются 422
        await request(app).get('/api/reports/equipment-load?minRequests=-1').expect(422);
    });

    test('явный offset режет выборку так же, как page', async () => {
        for (let i = 1; i <= 5; i += 1) {
            await createEquipment(`SN-OFF-${i}`, 50 + i / 10, 60 + i / 10);
        }

        const byPage = await request(app).get('/api/reports/equipment-load?page=3&limit=2').expect(200);
        const byOffset = await request(app).get('/api/reports/equipment-load?offset=4&limit=2').expect(200);
        expect(byOffset.body.data.map((row) => row.id)).toEqual(byPage.body.data.map((row) => row.id));
        expect(byOffset.body.meta.total).toBe(5);
    });

    test('пустой каталог оборудования — пустой массив и total 0', async () => {
        const res = await request(app).get('/api/reports/equipment-load').expect(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.meta.total).toBe(0);
    });
});
