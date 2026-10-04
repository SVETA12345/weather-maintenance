import { createApp } from '../src/app.js';
import { resetTestDb, closeTestDb, createTechnician, createPassport, getSiteIdOfEquipment, countRows } from './helpers/db.js';
import { authed, authHeader } from './helpers/auth.js';

const app = createApp();

// Запросы набора выполняются от имени администратора: ровно этим набором проверяются
// права по ролям, а 401/403 проверяются в auth.test.js.
let api;

async function authAsAdmin() {
    api = authed(app, await authHeader(app, { role: 'admin' }));
}

const validEquipment = {
    name: 'Сетевой инвертор NS-12',
    type: 'inverter',
    serialNumber: 'SN-INV-001',
    location: { lat: 55.75, lon: 37.61 },
    installedAt: '2025-03-01T00:00:00.000Z',
};

const createEquipment = async (body = validEquipment) => {
    const res = await api.post('/api/equipment').send(body).expect(201);
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
    await resetTestDb();
    await authAsAdmin();
});

afterAll(closeTestDb);

describe('Equipment API — основные сценарии', () => {
    test('POST /api/equipment создаёт оборудование (201, defaults, Location)', async () => {
        const res = await api.post('/api/equipment').send(validEquipment).expect(201);
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

        const res = await api.get('/api/equipment?page=1&limit=20').expect(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
    });

    test('сортировка по sortBy выполняется в базе', async () => {
        await createEquipment({ ...validEquipment, serialNumber: 'SN-A-001', name: 'Янтарь' });
        await createEquipment({ ...validEquipment, serialNumber: 'SN-B-002', name: 'Буран' });

        const asc = await api.get('/api/equipment?sortBy=name').expect(200);
        expect(asc.body.data.map((e) => e.name)).toEqual(['Буран', 'Янтарь']);

        const desc = await api.get('/api/equipment?sortBy=name&order=desc').expect(200);
        expect(desc.body.data.map((e) => e.name)).toEqual(['Янтарь', 'Буран']);
    });

    test('фильтры status и type применяются в базе, total считает отфильтрованные строки', async () => {
        await createEquipment({ ...validEquipment, serialNumber: 'SN-F-000', type: 'turbine' });
        await createEquipment({ ...validEquipment, serialNumber: 'SN-F-001', type: 'sensor' });

        const byType = await api.get('/api/equipment?type=sensor').expect(200);
        expect(byType.body.data).toHaveLength(1);
        expect(byType.body.meta.total).toBe(1);

        const byStatus = await api.get('/api/equipment?status=operational').expect(200);
        expect(byStatus.body.data).toHaveLength(2);
        expect(byStatus.body.meta.total).toBe(2);

        const missing = await api.get('/api/equipment?type=turbine&status=fault').expect(200);
        expect(missing.body.data).toEqual([]);
        expect(missing.body.meta.total).toBe(0);
    });

    test('limit и offset ограничены сверху, выход за диапазон — 400 INVALID_PAGINATION', async () => {
        const tooBigLimit = await api.get('/api/equipment?limit=101').expect(400);
        expect(tooBigLimit.body.error.code).toBe('INVALID_PAGINATION');
        expect(tooBigLimit.body.error.details.map((d) => d.field)).toEqual(['limit']);

        const tooBigOffset = await api.get('/api/equipment?offset=10001').expect(400);
        expect(tooBigOffset.body.error.details.map((d) => d.field)).toEqual(['offset']);

        const notANumber = await api.get('/api/equipment?limit=abc').expect(400);
        expect(notANumber.body.error.details.map((d) => d.field)).toEqual(['limit']);

        // границы допустимы
        await api.get('/api/equipment?limit=100&offset=10000').expect(200);

        // остальные нарушения схемы остаются 422
        await api.get('/api/equipment?status=nope').expect(422);
    });

    test('явный offset пропускает строки так же, как page', async () => {
        const first = await createEquipment({ ...validEquipment, serialNumber: 'SN-O-1', name: 'Альфа' });
        const second = await createEquipment({ ...validEquipment, serialNumber: 'SN-O-2', name: 'Бета' });
        const third = await createEquipment({ ...validEquipment, serialNumber: 'SN-O-3', name: 'Веста' });

        const byPage = await api.get('/api/equipment?page=2&limit=1&sortBy=name').expect(200);
        const byOffset = await api.get('/api/equipment?offset=1&limit=1&sortBy=name').expect(200);
        expect(byPage.body.data.map((e) => e.id)).toEqual([second.id]);
        expect(byOffset.body.data.map((e) => e.id)).toEqual(byPage.body.data.map((e) => e.id));
        expect(byOffset.body.meta.total).toBe(3);
        expect([first.id, third.id]).toHaveLength(2);
    });

    test('search ищет по имени и серийному номеру без учёта регистра', async () => {
        const turbine = await createEquipment({
            ...validEquipment,
            serialNumber: 'SN-TRB-900',
            name: 'Ветроустановка Север',
        });
        const inverter = await createEquipment({
            ...validEquipment,
            serialNumber: 'sn-inv-777',
            name: 'Сетевой инвертор Юг',
        });
        await createEquipment({ ...validEquipment, serialNumber: 'SN-SEN-111', name: 'Датчик ветра' });

        const byName = await api.get('/api/equipment?search=север').expect(200);
        expect(byName.body.data.map((e) => e.id)).toEqual([turbine.id]);
        expect(byName.body.meta.total).toBe(1);

        // регистр не важен и для кириллицы, и для латиницы
        const upper = await api.get('/api/equipment?search=СЕТЕВОЙ').expect(200);
        expect(upper.body.data.map((e) => e.id)).toEqual([inverter.id]);

        // частичное совпадение в середине слова
        const partial = await api.get('/api/equipment?search=инвер').expect(200);
        expect(partial.body.data.map((e) => e.id)).toEqual([inverter.id]);

        // серийный номер ищется так же
        const bySerial = await api.get('/api/equipment?search=SN-TRB-900').expect(200);
        expect(bySerial.body.data.map((e) => e.id)).toEqual([turbine.id]);

        const none = await api.get('/api/equipment?search=несуществующее').expect(200);
        expect(none.body.data).toEqual([]);
        expect(none.body.meta.total).toBe(0);
    });

    test('search комбинируется с фильтрами, сортировкой и пагинацией', async () => {
        const first = await createEquipment({ ...validEquipment, serialNumber: 'SN-S-1', name: 'Турбина Альфа', type: 'turbine' });
        const second = await createEquipment({ ...validEquipment, serialNumber: 'SN-S-2', name: 'Турбина Бета', type: 'turbine' });
        await createEquipment({ ...validEquipment, serialNumber: 'SN-S-3', name: 'Инвертор Гамма', type: 'inverter' });

        const filtered = await api.get('/api/equipment?search=турбина&type=turbine&sortBy=name').expect(200);
        expect(filtered.body.data.map((e) => e.id)).toEqual([first.id, second.id]);
        expect(filtered.body.meta.total).toBe(2);

        const page = await api.get('/api/equipment?search=турбина&type=turbine&sortBy=name&limit=1&page=2').expect(200);
        expect(page.body.data.map((e) => e.id)).toEqual([second.id]);
        expect(page.body.meta).toEqual({ total: 2, page: 2, limit: 1 });

        // фильтр, отсекающий найденное, даёт пустой результат
        const empty = await api.get('/api/equipment?search=турбина&type=inverter').expect(200);
        expect(empty.body.data).toEqual([]);
        expect(empty.body.meta.total).toBe(0);
    });

    test('спецсимволы в search экранируются и не превращаются в шаблон', async () => {
        await createEquipment({ ...validEquipment, serialNumber: 'SN-P-1', name: 'Турбина сто процент' });

        const percent = await api.get('/api/equipment?search=%25').expect(200);
        expect(percent.body.data).toEqual([]);

        const underscore = await api.get('/api/equipment?search=_').expect(200);
        expect(underscore.body.data).toEqual([]);

        const wildcardInWord = await api.get('/api/equipment?search=процент').expect(200);
        expect(wildcardInWord.body.data).toHaveLength(1);

        await api.get('/api/equipment?search=').expect(422);
        await api.get(`/api/equipment?search=${'a'.repeat(101)}`).expect(422);
    });

    test('GET /api/equipment/:id возвращает оборудование', async () => {
        const created = await createEquipment();
        const res = await api.get(`/api/equipment/${created.id}`).expect(200);
        expect(res.body.data.id).toBe(created.id);
        expect(res.body.data.serialNumber).toBe(validEquipment.serialNumber);
    });

    test('GET /api/equipment/:id — 404 для неизвестного id', async () => {
        const res = await api.get('/api/equipment/00000000-0000-4000-8000-000000000000').expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('POST с занятым serialNumber — 409 SERIAL_CONFLICT', async () => {
        await createEquipment();
        const res = await api
            .post('/api/equipment')
            .send({ ...validEquipment, name: 'Дубль' })
            .expect(409);
        expect(res.body.error.code).toBe('SERIAL_CONFLICT');
    });

    test('POST невалидное тело — 422 VALIDATION_ERROR с details', async () => {
        const res = await api
            .post('/api/equipment')
            .send({ name: 'x', type: 'inverter' })
            .expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]));
        expect(res.body.error).toHaveProperty('requestId');
    });

    test('PATCH /api/equipment/:id обновляет поля', async () => {
        const created = await createEquipment();
        const res = await api
            .patch(`/api/equipment/${created.id}`)
            .send({ name: 'Обновлённое название' })
            .expect(200);
        expect(res.body.data.name).toBe('Обновлённое название');
        expect(res.body.data.serialNumber).toBe(created.serialNumber);
    });

    test('PATCH несуществующего оборудования — 404', async () => {
        await api
            .patch('/api/equipment/00000000-0000-4000-8000-000000000000')
            .send({ name: 'Новое имя' })
            .expect(404);
    });

    test('DELETE /api/equipment/:id — 204', async () => {
        const created = await createEquipment();
        await api.delete(`/api/equipment/${created.id}`).expect(204);
        await api.get(`/api/equipment/${created.id}`).expect(404);
    });

    test('DELETE несуществующего оборудования — 404', async () => {
        await api.delete('/api/equipment/00000000-0000-4000-8000-000000000000').expect(404);
    });

    test('DELETE с открытой заявкой — 409 HAS_OPEN_REQUESTS', async () => {
        const created = await createEquipment();
        await api
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'Открытая заявка', priority: 'low' })
            .expect(201);

        const res = await api.delete(`/api/equipment/${created.id}`).expect(409);
        expect(res.body.error.code).toBe('HAS_OPEN_REQUESTS');
    });

    test('отклонённая заявка не блокирует удаление: закрытым считается и done, и rejected', async () => {
        const created = await createEquipment();
        const rejected = await api
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'Отклонённая заявка', priority: 'low' })
            .expect(201);
        const requestId = rejected.body.data.id;
        await api.patch(`/api/requests/${requestId}/status`).send({ status: 'rejected' }).expect(200);

        await api.delete(`/api/equipment/${created.id}`).expect(204);

        expect(await countRows('maintenance_requests', { id: requestId })).toBe(0);
    });

    test('заявка в работе блокирует удаление оборудования', async () => {
        const created = await createEquipment();
        const technician = await createTechnician();
        const open = await api
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'Заявка в работе', priority: 'low' })
            .expect(201);
        const requestId = open.body.data.id;

        await api
            .post(`/api/requests/${requestId}/assignees`)
            .send([{ technicianId: technician.id, role: 'lead' }])
            .expect(201);
        await api.patch(`/api/requests/${requestId}/status`).send({ status: 'in_progress' }).expect(200);

        const res = await api.delete(`/api/equipment/${created.id}`).expect(409);
        expect(res.body.error.code).toBe('HAS_OPEN_REQUESTS');
    });

    test('DELETE с закрытой заявкой каскадно удаляет заявку, историю и паспорт', async () => {
        const created = await createEquipment();
        const technician = await createTechnician();
        await createPassport(created.id);

        const open = await api
            .post('/api/requests')
            .send({ equipmentId: created.id, title: 'Закрытая заявка', priority: 'low' })
            .expect(201);
        const requestId = open.body.data.id;

        await api
            .post(`/api/requests/${requestId}/assignees`)
            .send([{ technicianId: technician.id, role: 'lead' }])
            .expect(201);
        await api.patch(`/api/requests/${requestId}/status`).send({ status: 'in_progress' }).expect(200);
        await api.patch(`/api/requests/${requestId}/status`).send({ status: 'done' }).expect(200);

        await api.delete(`/api/equipment/${created.id}`).expect(204);

        await api.get(`/api/requests/${requestId}`).expect(404);
        expect(await countRows('maintenance_requests', { id: requestId })).toBe(0);
        expect(await countRows('request_status_history', { request_id: requestId })).toBe(0);
        expect(await countRows('request_assignees', { request_id: requestId })).toBe(0);
        expect(await countRows('equipment_passports', { equipment_id: created.id })).toBe(0);
    });

    test('специалисты и площадка переживают удаление оборудования', async () => {
        const created = await createEquipment();
        const siteId = await getSiteIdOfEquipment(created.id);
        const technician = await createTechnician();

        await api.delete(`/api/equipment/${created.id}`).expect(204);

        expect(await countRows('technicians', { id: technician.id })).toBe(1);
        expect(await countRows('sites', { id: siteId })).toBe(1);
    });

    test('GET /api/equipment/:id/requests возвращает заявки оборудования с пагинацией', async () => {
        const created = await createEquipment();
        for (let i = 1; i <= 3; i += 1) {
            await api
                .post('/api/requests')
                .send({ equipmentId: created.id, title: `ТО по графику ${i}`, priority: 'medium' })
                .expect(201);
        }

        const res = await api.get(`/api/equipment/${created.id}/requests?page=1&limit=2`).expect(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].equipmentId).toBe(created.id);
        expect(res.body.meta).toEqual({ total: 3, page: 1, limit: 2 });

        const unknown = await api
            .get('/api/equipment/00000000-0000-4000-8000-000000000000/requests')
            .expect(404);
        expect(unknown.body.error.code).toBe('NOT_FOUND');
    });

    test('Фильтрация списка по type', async () => {
        await createEquipment({ ...validEquipment, type: 'turbine', serialNumber: 'SN-T-001' });
        await createEquipment({ ...validEquipment, type: 'inverter', serialNumber: 'SN-INV-002', name: 'Второй' });

        const res = await api.get('/api/equipment?type=inverter').expect(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].type).toBe('inverter');

        const all = await api.get('/api/equipment').expect(200);
        expect(all.body.data).toHaveLength(2);
    });

    test('GET /api/equipment/:id/weather отдаёт прогноз (внешний fetch замокан)', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => openWeather();
        try {
            const created = await createEquipment();
            const res = await api.get(`/api/equipment/${created.id}/weather`).expect(200);
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