import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetTestDb, closeTestDb, createTechnician } from './helpers/db.js';
import { TEST_PASSWORD, authHeader, authed, createUser, login } from './helpers/auth.js';
import { hashToken } from '../src/utils/tokens.js';
import { models, sequelize } from '../src/models/sequelize.js';

const app = createApp();

const equipmentBody = {
    name: 'Ветроустановка W-200',
    type: 'turbine',
    serialNumber: 'SN-AUTH-001',
    location: { lat: 55.75, lon: 37.61 },
    installedAt: '2025-03-01T00:00:00.000Z',
};

const requestBody = (equipmentId, overrides = {}) => ({
    equipmentId,
    title: 'Заявка на обслуживание',
    priority: 'medium',
    ...overrides,
});

const REFRESH_COOKIE = 'refresh_token';

let admin;
let equipmentId;

beforeEach(async () => {
    await resetTestDb();
    admin = authed(app, await authHeader(app, { role: 'admin' }));
    const res = await admin.post('/api/equipment').send(equipmentBody).expect(201);
    equipmentId = res.body.data.id;
});

afterAll(closeTestDb);

const createRequestAs = async (api, overrides = {}) => {
    const res = await api.post('/api/requests').send(requestBody(equipmentId, overrides)).expect(201);
    return res.body.data;
};

const cookieValue = (res) => {
    const raw = res.headers['set-cookie']?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    return raw?.split(';')[0];
};

describe('POST /api/auth/register', () => {
    test('регистрация — 201, роль viewer, пароль и хеш не в ответе', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'New.User@Example.com', password: 'password-2026' })
            .expect(201);

        expect(res.body.data).toMatchObject({ email: 'new.user@example.com', role: 'viewer', technicianId: null });
        expect(res.body.data.id).toEqual(expect.any(String));
        expect(JSON.stringify(res.body)).not.toContain('password');
        expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('в базе только хеш с солью, пароль в открытом виде не хранится', async () => {
        const password = 'super-secret-2026';
        await request(app).post('/api/auth/register').send({ email: 'hash@example.com', password }).expect(201);

        const row = await models.User.findOne({ where: { email: 'hash@example.com' } });
        expect(row.password_hash).not.toBe(password);
        expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
        // Ни одна запись в users не содержит пароля в открытом виде.
        const [rows] = await sequelize.query('SELECT password_hash FROM users');
        expect(rows.map((r) => r.password_hash)).not.toContain(password);
    });

    test('повторная регистрация email — 409 EMAIL_TAKEN', async () => {
        await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'password-2026' }).expect(201);
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'DUP@example.com', password: 'password-2026' })
            .expect(409);
        expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    test('короткий пароль и некорректный email — 422 VALIDATION_ERROR', async () => {
        const short = await request(app)
            .post('/api/auth/register')
            .send({ email: 'a@example.com', password: 'short' })
            .expect(422);
        expect(short.body.error.code).toBe('VALIDATION_ERROR');
        expect(short.body.error.details.some((d) => d.field === 'password')).toBe(true);

        const bad = await request(app)
            .post('/api/auth/register')
            .send({ email: 'not-an-email', password: 'password-2026' })
            .expect(422);
        expect(bad.body.error.details.some((d) => d.field === 'email')).toBe(true);
    });

    test('неизвестный technicianId — 404, пользователь не создан', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'tech-link@example.com', password: 'password-2026', technicianId: '00000000-0000-4000-8000-000000000000' })
            .expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(await models.User.count({ where: { email: 'tech-link@example.com' } })).toBe(0);
    });

    test('существующий technicianId сохраняется в профиле', async () => {
        const technician = await createTechnician();
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'linked@example.com', password: 'password-2026', technicianId: technician.id })
            .expect(201);
        expect(res.body.data.technicianId).toBe(technician.id);
    });

    test('роль из тела запроса сохраняется', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'admin-new@example.com', password: 'password-2026', role: 'admin' })
            .expect(201);
        expect(res.body.data.role).toBe('admin');

        const row = await models.User.findOne({ where: { email: 'admin-new@example.com' } });
        expect(row.role).toBe('admin');
    });

    test('роль technician без technicianId создаётся, но не может менять статус заявок', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'tech-no-link@example.com', password: 'password-2026', role: 'technician' })
            .expect(201);
        expect(res.body.data).toMatchObject({ role: 'technician', technicianId: null });

        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: 'tech-no-link@example.com', password: 'password-2026' })
            .expect(200);

        const created = await createRequestAs(admin);
        const status = await request(app)
            .patch(`/api/requests/${created.id}/status`)
            .set('Authorization', `Bearer ${login.body.data.accessToken}`)
            .send({ status: 'rejected' });
        expect(status.status).toBe(403);
        expect(status.body.error.code).toBe('NOT_ASSIGNED');
    });

    test('неизвестная роль — 422 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'wrong-role@example.com', password: 'password-2026', role: 'superuser' })
            .expect(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
    });
});

describe('POST /api/auth/login', () => {
    test('успешный вход — 200, access-токен и refresh-cookie', async () => {
        const user = await createUser({ role: 'admin' });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);

        expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
        expect(res.body.data.accessToken).toEqual(expect.any(String));
        expect(res.body.data.user).toMatchObject({ id: user.id, role: 'admin' });
        expect(JSON.stringify(res.body)).not.toContain(user.password_hash);

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
        expect(cookie).toBeDefined();
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/Path=\/api\/auth/i);
        // В тестах NODE_ENV=test, поэтому Secure выключен по умолчанию.
        expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    test('access-токен — JWT с ролью и сроком 15 минут', async () => {
        const user = await createUser({ role: 'technician' });
        const { token } = await login(app, user.email);

        const [, payload] = token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        expect(claims).toMatchObject({ sub: user.id, role: 'technician', typ: 'access' });
        expect(claims.exp - claims.iat).toBe(900);
    });

    test('refresh-токен хранится в БД только хешем', async () => {
        const user = await createUser();
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);

        const token = cookieValue(res).split('=')[1];
        const stored = await models.RefreshToken.findOne({ where: { user_id: user.id } });
        expect(stored.token_hash).toBe(hashToken(token));
        expect(stored.token_hash).not.toBe(token);
        expect(stored.revoked_at).toBeNull();
    });

    test('неверный пароль — 401 INVALID_CREDENTIALS', async () => {
        const user = await createUser();
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: 'wrong-password' })
            .expect(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('несуществующий пользователь даёт ответ, идентичный неверному паролю', async () => {
        const user = await createUser();

        const wrongPassword = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: 'wrong-password' })
            .expect(401);
        const unknownEmail = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'wrong-password' })
            .expect(401);

        expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code);
        expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
        expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    });

    test('неудачный вход не выдаёт refresh-cookie и не создаёт запись в БД', async () => {
        const before = await models.RefreshToken.count();
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'wrong-password' })
            .expect(401);

        expect(res.headers['set-cookie']).toBeUndefined();
        expect(await models.RefreshToken.count()).toBe(before);
    });
});

describe('POST /api/auth/refresh', () => {
    test('обновление по cookie — новый access-токен и новый refresh', async () => {
        const user = await createUser();
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);

        // Access-токены, выпущенные в одну секунду, совпадают побайтово (iat с точностью
        // до секунды), поэтому признак ротации проверяется по refresh-токену с новым jti.
        const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(loginRes)).expect(200);
        expect(res.body.data.user.id).toBe(user.id);
        expect(res.body.data.accessToken).toEqual(expect.any(String));

        const rotated = cookieValue(res);
        expect(rotated).toBeDefined();
        expect(rotated).not.toBe(cookieValue(loginRes));
    });

    test('прежний refresh-токен после ротации не работает', async () => {
        const user = await createUser();
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);

        const oldCookie = cookieValue(loginRes);
        await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(200);

        const res = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
        expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });

    test('без cookie — 401 REFRESH_TOKEN_MISSING', async () => {
        const res = await request(app).post('/api/auth/refresh').expect(401);
        expect(res.body.error.code).toBe('REFRESH_TOKEN_MISSING');
    });

    test('подделка cookie — 401 TOKEN_INVALID', async () => {
        const res = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', `${REFRESH_COOKIE}=not-a-token`)
            .expect(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
    });
});

describe('POST /api/auth/logout', () => {
    test('выход — 204, cookie очищается, refresh больше не работает', async () => {
        const user = await createUser();
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);
        const cookie = cookieValue(loginRes);

        const res = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
        const cleared = res.headers['set-cookie'].find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
        expect(cleared).toMatch(/refresh_token=;/);
        expect(cleared).toMatch(/HttpOnly/i);

        await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
        expect(await models.RefreshToken.count({ where: { user_id: user.id, revoked_at: null } })).toBe(0);
    });

    test('выход без cookie — тоже 204 (идемпотентно)', async () => {
        await request(app).post('/api/auth/logout').expect(204);
    });

    test('выход с чужим токеном не отзывает чужую сессию', async () => {
        const user = await createUser();
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: TEST_PASSWORD })
            .expect(200);

        await request(app).post('/api/auth/logout').set('Cookie', `${REFRESH_COOKIE}=garbage`).expect(204);
        await request(app).post('/api/auth/refresh').set('Cookie', cookieValue(loginRes)).expect(200);
    });
});

describe('GET /api/auth/me', () => {
    test('текущий пользователь и его роль — 200', async () => {
        const user = await createUser({ role: 'technician' });
        const { token } = await login(app, user.email);

        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
        expect(res.body.data).toMatchObject({ id: user.id, email: user.email, role: 'technician' });
        expect(JSON.stringify(res.body)).not.toContain('password');
    });

    test('без токена — 401 AUTH_REQUIRED', async () => {
        const res = await request(app).get('/api/auth/me').expect(401);
        expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
});

describe('Токены в защищённых запросах', () => {
    test('без токена — 401 на всех закрытых маршрутах', async () => {
        const created = await createRequestAs(admin);
        const anonymous = [
            ['get', '/api/equipment'],
            ['post', '/api/equipment'],
            ['get', `/api/requests/${created.id}`],
            ['patch', `/api/requests/${created.id}`],
            ['patch', `/api/requests/${created.id}/status`],
            ['delete', `/api/requests/${created.id}`],
            ['post', `/api/requests/${created.id}/assignees`],
            ['get', '/api/sites/00000000-0000-4000-8000-000000000000/summary'],
            ['get', '/api/reports/equipment-load'],
        ];

        for (const [method, url] of anonymous) {
            const res = await request(app)[method](url).send({});
            expect([401]).toContain(res.status);
            expect(res.body.error.code).toBe('AUTH_REQUIRED');
        }
    });

    test('мусорный и просроченный токен — 401 TOKEN_INVALID', async () => {
        await request(app).get('/api/equipment').set('Authorization', 'Bearer abc.def.ghi').expect(401);

        const user = await createUser();
        const expired = await expiredAccessToken(user.id, user.role);
        const res = await request(app).get('/api/equipment').set('Authorization', `Bearer ${expired}`).expect(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    test('неверная схема заголовка — 401', async () => {
        await request(app).get('/api/equipment').set('Authorization', 'Basic YWRtaW46YWRtaW4=').expect(401);
    });

    test('токен удалённого пользователя больше не принимается', async () => {
        const user = await createUser();
        const { token } = await login(app, user.email);
        await models.User.destroy({ where: { id: user.id } });

        const res = await request(app).get('/api/equipment').set('Authorization', `Bearer ${token}`).expect(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    test('смена роли действует сразу, без ожидания истечения токена', async () => {
        const user = await createUser({ role: 'viewer' });
        const { token } = await login(app, user.email);
        const header = { Authorization: `Bearer ${token}` };

        await request(app).post('/api/equipment').send(equipmentBody).set(header).expect(403);
        await models.User.update({ role: 'admin' }, { where: { id: user.id } });
        await request(app)
            .post('/api/equipment')
            .send({ ...equipmentBody, serialNumber: 'SN-AUTH-002' })
            .set(header)
            .expect(201);
    });
});

describe('Права ролей', () => {
    test('viewer читает всё, но не изменяет ничего', async () => {
        const viewer = authed(app, await authHeader(app, { role: 'viewer' }));
        const created = await createRequestAs(admin);

        await viewer.get('/api/equipment').expect(200);
        await viewer.get('/api/requests').expect(200);
        await viewer.get(`/api/requests/${created.id}`).expect(200);
        await viewer.get(`/api/requests/${created.id}/history`).expect(200);
        await viewer.get('/api/reports/equipment-load').expect(200);

        const createdRes = await viewer.post('/api/requests').send(requestBody(equipmentId));
        expect(createdRes.status).toBe(403);
        expect(createdRes.body.error.code).toBe('ROLE_REQUIRED');

        const equipmentRes = await viewer.post('/api/equipment').send(equipmentBody);
        expect(equipmentRes.status).toBe(403);

        await viewer.patch(`/api/requests/${created.id}`).send({ title: 'Новое название' }).expect(403);
        await viewer.patch(`/api/requests/${created.id}/status`).send({ status: 'rejected' }).expect(403);
        await viewer.delete(`/api/requests/${created.id}`).expect(403);
    });

    test('technician создаёт и редактирует заявки', async () => {
        const technician = authed(app, await authHeader(app, { role: 'technician' }));
        const created = await createRequestAs(technician, { title: 'Заявка от специалиста' });

        expect(created.title).toBe('Заявка от специалиста');
        const patched = await technician.patch(`/api/requests/${created.id}`).send({ title: 'Уточнённое название' });
        expect(patched.status).toBe(200);
        expect(patched.body.data.title).toBe('Уточнённое название');
    });

    test('technician не управляет оборудованием и бригадой', async () => {
        const technician = authed(app, await authHeader(app, { role: 'technician' }));
        const created = await createRequestAs(technician);
        const technicianRow = await createTechnician();

        await technician.post('/api/equipment').send(equipmentBody).expect(403);
        await technician.patch(`/api/equipment/${equipmentId}`).send({ status: 'decommissioned' }).expect(403);
        await technician.delete(`/api/equipment/${equipmentId}`).expect(403);
        await technician
            .post(`/api/requests/${created.id}/assignees`)
            .send([{ technicianId: technicianRow.id, role: 'lead' }])
            .expect(403);
        await technician.delete(`/api/requests/${created.id}/assignees/${technicianRow.id}`).expect(403);
        await technician.delete(`/api/requests/${created.id}`).expect(403);
    });

    test('technician меняет статус только заявок, на которых назначен', async () => {
        const assigned = await createTechnician();
        const stranger = await createTechnician();
        const user = await createUser({ role: 'technician', technicianId: assigned.id });
        const technician = authed(app, `Bearer ${(await login(app, user.email)).token}`);

        const ownRequest = await createRequestAs(admin, { title: 'Заявка для своего специалиста' });
        const foreignRequest = await createRequestAs(admin, { title: 'Заявка для чужого специалиста' });
        await admin
            .post(`/api/requests/${ownRequest.id}/assignees`)
            .send([
                { technicianId: assigned.id, role: 'lead' },
                { technicianId: stranger.id, role: 'member' },
            ])
            .expect(201);

        const allowed = await technician.patch(`/api/requests/${ownRequest.id}/status`).send({ status: 'in_progress' });
        expect(allowed.status).toBe(200);
        expect(allowed.body.data.status).toBe('in_progress');

        const forbidden = await technician
            .patch(`/api/requests/${foreignRequest.id}/status`)
            .send({ status: 'rejected' });
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.error.code).toBe('NOT_ASSIGNED');

        const unchanged = await admin.get(`/api/requests/${foreignRequest.id}`).expect(200);
        expect(unchanged.body.data.status).toBe('new');
    });

    test('technician без связи со специалистом не меняет статус ни одной заявки', async () => {
        const user = await createUser({ role: 'technician' });
        const technician = authed(app, `Bearer ${(await login(app, user.email)).token}`);
        const created = await createRequestAs(admin);

        const res = await technician.patch(`/api/requests/${created.id}/status`).send({ status: 'rejected' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_ASSIGNED');
    });

    test('назначенный technician получает 409, а не 403 на недопустимом переходе', async () => {
        const technicianRow = await createTechnician();
        const user = await createUser({ role: 'technician', technicianId: technicianRow.id });
        const technician = authed(app, `Bearer ${(await login(app, user.email)).token}`);

        const created = await createRequestAs(admin);
        await admin
            .post(`/api/requests/${created.id}/assignees`)
            .send([{ technicianId: technicianRow.id, role: 'lead' }])
            .expect(201);

        const res = await technician.patch(`/api/requests/${created.id}/status`).send({ status: 'done' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('admin меняет статус любой заявки и управляет оборудованием', async () => {
        const created = await createRequestAs(admin);
        const res = await admin.patch(`/api/requests/${created.id}/status`).send({ status: 'rejected' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('rejected');

        const technicianRow = await createTechnician();
        await admin
            .post(`/api/requests/${created.id}/assignees`)
            .send([{ technicianId: technicianRow.id, role: 'lead' }])
            .expect(201);
        await admin.delete(`/api/requests/${created.id}`).expect(204);
    });
});

// Токен с истёкшим сроком подписывается тем же секретом, что и сервис.
async function expiredAccessToken(userId, role) {
    const jwt = (await import('jsonwebtoken')).default;
    const { config } = await import('../src/config/index.js');
    return jwt.sign(
        { sub: userId, role, typ: 'access' },
        config.auth.accessSecret,
        { issuer: config.auth.issuer, audience: config.auth.audience, expiresIn: -10 },
    );
}

describe('Целостность данных', () => {
    test('удаление пользователя каскадно удаляет его refresh-токены', async () => {
        const user = await createUser();
        await login(app, user.email);
        expect(await models.RefreshToken.count({ where: { user_id: user.id } })).toBe(1);

        await models.User.destroy({ where: { id: user.id } });
        expect(await models.RefreshToken.count({ where: { user_id: user.id } })).toBe(0);
    });

    test('удаление специалиста не удаляет учётную запись, а обнуляет связь', async () => {
        const technicianRow = await createTechnician();
        const user = await createUser({ role: 'technician', technicianId: technicianRow.id });
        const { token } = await login(app, user.email);

        await sequelize.query('DELETE FROM technicians WHERE id = :id', { replacements: { id: technicianRow.id } });

        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
        expect(res.body.data.technicianId).toBeNull();
        expect(res.body.data.role).toBe('technician');
        expect(await models.User.count({ where: { id: user.id } })).toBe(1);
    });
});