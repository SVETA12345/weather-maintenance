import { createApp } from '../src/app.js';
import { resetTestDb, closeTestDb, createTechnician, countRows } from './helpers/db.js';
import { authed, authHeader } from './helpers/auth.js';
import { sequelize } from '../src/models/sequelize.js';

const app = createApp();

// Запросы набора выполняются от имени администратора: ровно этим набором проверяются
// права по ролям, а 401/403 проверяются в auth.test.js.
let api;

async function authAsAdmin() {
    api = authed(app, await authHeader(app, { role: 'admin' }));
}

const equipmentBody = {
    name: 'Инвертор NS-12',
    type: 'inverter',
    serialNumber: 'SN-CREW-001',
    location: { lat: 55.75, lon: 37.61 },
    installedAt: '2025-03-01T00:00:00.000Z',
};

const requestBody = (equipmentId) => ({
    equipmentId,
    title: 'Заявка на обслуживание',
    priority: 'medium',
});

let equipmentId;

const createRequest = async () => {
    const res = await api.post('/api/requests').send(requestBody(equipmentId)).expect(201);
    return res.body.data;
};

const assign = (requestId, entries) => api.post(`/api/requests/${requestId}/assignees`).send(entries);

const removeAssignee = (requestId, technicianId) =>
    api.delete(`/api/requests/${requestId}/assignees/${technicianId}`);

const changeStatus = (requestId, status) =>
    api.patch(`/api/requests/${requestId}/status`).send({ status });

beforeEach(async () => {
    await resetTestDb();
    await authAsAdmin();
    const res = await api.post('/api/equipment').send(equipmentBody).expect(201);
    equipmentId = res.body.data.id;
});

afterAll(closeTestDb);

describe('POST /api/requests/:id/assignees', () => {
    test('назначает бригаду (201) и возвращает её в карточке', async () => {
        const lead = await createTechnician({ full_name: 'Иванов Иван Иванович' });
        const member = await createTechnician({ full_name: 'Петров Пётр Петрович' });
        const created = await createRequest();

        const res = await assign(created.id, [
            { technicianId: lead.id, role: 'lead' },
            { technicianId: member.id, role: 'member' },
        ]).expect(201);

        expect(res.body.data.assignees).toHaveLength(2);
        expect(res.body.data.assignees).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    technicianId: lead.id,
                    fullName: 'Иванов Иван Иванович',
                    role: 'lead',
                }),
                expect.objectContaining({ technicianId: member.id, role: 'member' }),
            ]),
        );

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(2);
    });

    test('в ответе исполнителя только technicianId, fullName и role', async () => {
        const technician = await createTechnician();
        const created = await createRequest();

        const res = await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        expect(Object.keys(res.body.data.assignees[0]).sort()).toEqual(['fullName', 'role', 'technicianId']);
    });

    test('назначение заменяет прежнюю бригаду', async () => {
        const first = await createTechnician();
        const second = await createTechnician();
        const third = await createTechnician();
        const created = await createRequest();

        await assign(created.id, [{ technicianId: first.id, role: 'lead' }]).expect(201);
        const res = await assign(created.id, [
            { technicianId: second.id, role: 'lead' },
            { technicianId: third.id, role: 'member' },
        ]).expect(201);

        expect(res.body.data.assignees).toHaveLength(2);
        expect(res.body.data.assignees.map((a) => a.technicianId).sort()).toEqual([second.id, third.id].sort());

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees.map((a) => a.technicianId).sort()).toEqual([second.id, third.id].sort());
    });

    test('прежние назначения удаляются из БД, а не скрываются в ответе', async () => {
        const first = await createTechnician();
        const second = await createTechnician();
        const created = await createRequest();

        await assign(created.id, [{ technicianId: first.id, role: 'lead' }]).expect(201);
        await assign(created.id, [{ technicianId: second.id, role: 'lead' }]).expect(201);

        expect(await countRows('request_assignees', { request_id: created.id })).toBe(1);
    });

    test('повторное назначение того же специалиста в новом составе — 201', async () => {
        const technician = await createTechnician();
        const second = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);

        const res = await assign(created.id, [
            { technicianId: technician.id, role: 'member' },
            { technicianId: second.id, role: 'lead' },
        ]).expect(201);
        expect(res.body.data.assignees).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ technicianId: technician.id, role: 'member' }),
                expect.objectContaining({ technicianId: second.id, role: 'lead' }),
            ]),
        );
    });

    test('бригада без lead — 422 и прежний состав сохраняется', async () => {
        const lead = await createTechnician();
        const member = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: lead.id, role: 'lead' }]).expect(201);

        const res = await assign(created.id, [{ technicianId: member.id, role: 'member' }]).expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details[0]).toMatchObject({ field: 'role' });

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(1);
        expect(card.body.data.assignees[0].technicianId).toBe(lead.id);
    });

    test('два lead — 422 и прежний состав сохраняется', async () => {
        const first = await createTechnician();
        const second = await createTechnician();
        const third = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: first.id, role: 'lead' }]).expect(201);

        const res = await assign(created.id, [
            { technicianId: second.id, role: 'lead' },
            { technicianId: third.id, role: 'lead' },
        ]).expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');

        expect(await countRows('request_assignees', { request_id: created.id })).toBe(1);
        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(1);
        expect(card.body.data.assignees[0].technicianId).toBe(first.id);
    });

    test('несуществующий специалист — 404 NOT_FOUND и никого не назначает', async () => {
        const technician = await createTechnician();
        const created = await createRequest();

        const res = await assign(created.id, [
            { technicianId: technician.id, role: 'lead' },
            { technicianId: '00000000-0000-4000-8000-000000000000', role: 'member' },
        ]).expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(0);
    });

    test('неизвестная заявка — 404', async () => {
        const technician = await createTechnician();
        await assign('00000000-0000-4000-8000-000000000000', [{ technicianId: technician.id, role: 'lead' }]).expect(404);
    });

    test('пустой массив — 422', async () => {
        const created = await createRequest();
        const res = await assign(created.id, []).expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('не тело-массив (объект) — 422', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, { technicianId: technician.id, role: 'lead' }).expect(422);
    });

    test('неизвестная роль — 422', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'supervisor' }]).expect(422);
    });

    test('невалидный uuid специалиста — 422', async () => {
        const created = await createRequest();
        await assign(created.id, [{ technicianId: 'abc', role: 'lead' }]).expect(422);
    });

    test('один специалист дважды в одном запросе — 422', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        const res = await assign(created.id, [
            { technicianId: technician.id, role: 'lead' },
            { technicianId: technician.id, role: 'member' },
        ]).expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('больше 20 исполнителей — 422', async () => {
        const technicians = await Promise.all(Array.from({ length: 21 }, () => createTechnician()));
        const created = await createRequest();
        const res = await assign(
            created.id,
            technicians.map((t) => ({ technicianId: t.id, role: 'member' })),
        ).expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
});

describe('DELETE /api/requests/:id/assignees/:userId', () => {
    test('снимает назначение (204) и убирает исполнителя из карточки', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);

        await removeAssignee(created.id, technician.id).expect(204);

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(0);
    });

    test('не назначенный специалист — 404', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        const res = await removeAssignee(created.id, technician.id).expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('неизвестная заявка — 404', async () => {
        const technician = await createTechnician();
        await removeAssignee('00000000-0000-4000-8000-000000000000', technician.id).expect(404);
    });

    test('снятие последнего исполнителя у заявки в работе — 409 ASSIGNEE_REQUIRED, назначение остаётся', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await changeStatus(created.id, 'in_progress').expect(200);

        const res = await removeAssignee(created.id, technician.id).expect(409);
        expect(res.body.error.code).toBe('ASSIGNEE_REQUIRED');

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees).toHaveLength(1);
        expect(card.body.data.status).toBe('in_progress');
    });

    test('снятие не последнего исполнителя у заявки в работе разрешено', async () => {
        const first = await createTechnician();
        const second = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [
            { technicianId: first.id, role: 'lead' },
            { technicianId: second.id, role: 'member' },
        ]).expect(201);
        await changeStatus(created.id, 'in_progress').expect(200);

        await removeAssignee(created.id, first.id).expect(204);

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.assignees.map((a) => a.technicianId)).toEqual([second.id]);
    });

    test('снятие последнего исполнителя вне статуса in_progress разрешено', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);

        await removeAssignee(created.id, technician.id).expect(204);
    });
});

describe('Правило бригады для перехода в in_progress', () => {
    test('без исполнителей — 409 ASSIGNEE_REQUIRED, статус и история не меняются', async () => {
        const created = await createRequest();

        const res = await changeStatus(created.id, 'in_progress').expect(409);
        expect(res.body.error.code).toBe('ASSIGNEE_REQUIRED');

        const card = await api.get(`/api/requests/${created.id}`).expect(200);
        expect(card.body.data.status).toBe('new');

        const history = await api.get(`/api/requests/${created.id}/history`).expect(200);
        expect(history.body.data).toHaveLength(0);
    });

    test('после назначения переход проходит', async () => {
        const lead = await createTechnician();
        const member = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [
            { technicianId: lead.id, role: 'lead' },
            { technicianId: member.id, role: 'member' },
        ]).expect(201);

        const res = await changeStatus(created.id, 'in_progress').expect(200);
        expect(res.body.data.status).toBe('in_progress');
    });

    test('в rejected можно перейти без исполнителей', async () => {
        const created = await createRequest();
        const res = await changeStatus(created.id, 'rejected').expect(200);
        expect(res.body.data.status).toBe('rejected');
    });

    test('после снятия бригады заявку снова нельзя перевести в работу', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await removeAssignee(created.id, technician.id).expect(204);

        await changeStatus(created.id, 'in_progress').expect(409);
    });
});

describe('GET /api/requests/:id/history', () => {
    test('у новой заявки история пуста', async () => {
        const created = await createRequest();
        const res = await api.get(`/api/requests/${created.id}/history`).expect(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.meta).toEqual({ total: 0, page: 1, limit: 20 });
    });

    test('каждая смена статуса добавляет запись в хронологическом порядке', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await changeStatus(created.id, 'in_progress').expect(200);
        await changeStatus(created.id, 'done').expect(200);

        const res = await api.get(`/api/requests/${created.id}/history`).expect(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0]).toMatchObject({ oldStatus: 'new', newStatus: 'in_progress', comment: null });
        expect(res.body.data[1]).toMatchObject({ oldStatus: 'in_progress', newStatus: 'done' });
        expect(res.body.data[0].requestId).toBe(created.id);
        expect(res.body.data[0].author).toBe('api');
        expect(new Date(res.body.data[0].createdAt).toString()).not.toBe('Invalid Date');
        expect(new Date(res.body.data[1].createdAt) >= new Date(res.body.data[0].createdAt)).toBe(true);
    });

    test('повторная установка того же статуса — 409 и запись в историю не добавляется', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await changeStatus(created.id, 'in_progress').expect(200);

        const res = await changeStatus(created.id, 'in_progress').expect(409);
        expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

        const history = await api.get(`/api/requests/${created.id}/history`).expect(200);
        expect(history.body.data).toHaveLength(1);
    });

    test('история принадлежит только своей заявке', async () => {
        const technician = await createTechnician();
        const withHistory = await createRequest();
        const withoutHistory = await createRequest();
        await assign(withHistory.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await changeStatus(withHistory.id, 'in_progress').expect(200);

        const res = await api.get(`/api/requests/${withoutHistory.id}/history`).expect(200);
        expect(res.body.data).toHaveLength(0);
    });

    test('неизвестная заявка — 404', async () => {
        await api.get('/api/requests/00000000-0000-4000-8000-000000000000/history').expect(404);
    });

    test('limit и offset вне диапазона — 400 INVALID_PAGINATION', async () => {
        const created = await createRequest();

        const zero = await api.get(`/api/requests/${created.id}/history?limit=0`).expect(400);
        expect(zero.body.error.code).toBe('INVALID_PAGINATION');
        expect(zero.body.error.details.map((d) => d.field)).toEqual(['limit']);

        const tooBig = await api.get(`/api/requests/${created.id}/history?limit=101`).expect(400);
        expect(tooBig.body.error.details.map((d) => d.field)).toEqual(['limit']);

        const offset = await api.get(`/api/requests/${created.id}/history?offset=10001`).expect(400);
        expect(offset.body.error.details.map((d) => d.field)).toEqual(['offset']);
    });

    test('удаление заявки каскадно удаляет её историю', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);
        await changeStatus(created.id, 'in_progress').expect(200);

        await api.delete(`/api/requests/${created.id}`).expect(204);

        const [rows] = await sequelize.query(
            'SELECT COUNT(*)::int AS total FROM request_status_history WHERE request_id = :id',
            { replacements: { id: created.id } },
        );
        expect(rows[0].total).toBe(0);
    });

    test('удаление заявки каскадно удаляет её назначения', async () => {
        const technician = await createTechnician();
        const created = await createRequest();
        await assign(created.id, [{ technicianId: technician.id, role: 'lead' }]).expect(201);

        await api.delete(`/api/requests/${created.id}`).expect(204);

        const [rows] = await sequelize.query(
            'SELECT COUNT(*)::int AS total FROM request_assignees WHERE request_id = :id',
            { replacements: { id: created.id } },
        );
        expect(rows[0].total).toBe(0);
    });
});
