import request from 'supertest';
import { createApp } from '../src/app.js';
import { models } from '../src/models/sequelize.js';
import { registry } from '../src/metrics/index.js';
import { closeTestDb, resetTestDb } from './helpers/db.js';
import { authHeader, authed } from './helpers/auth.js';
import { resetAppliedCache } from '../src/metrics/applied.js';
import { config } from '../src/config/index.js';

const app = createApp();
let admin;

// Прикладные метрики читают агрегаты из PostgreSQL, поэтому набор создаёт данные:
// на пустой таблице метрики с метками не экспортируются вовсе.
beforeAll(async () => {
    await resetTestDb();
    admin = authed(app, await authHeader(app, { role: 'admin' }));

    const equipment = (await admin.post('/api/equipment').send({
        name: 'Турбина Т-1',
        type: 'turbine',
        serialNumber: 'SN-METRIC-1',
        location: { lat: 55.75, lon: 37.61 },
        installedAt: '2025-03-01T00:00:00.000Z',
    }).expect(201)).body.data;

    const newRequest = (await admin.post('/api/requests').send({
        equipmentId: equipment.id,
        title: 'Заявка для метрик',
        priority: 'high',
    }).expect(201)).body.data;

    await admin.post('/api/requests').send({
        equipmentId: equipment.id,
        title: 'Просроченная плановая работа',
        priority: 'low',
        plannedAt: '2026-01-01T00:00:00.000Z',
    }).expect(201);

    const done = (await admin.post('/api/requests').send({
        equipmentId: equipment.id,
        title: 'Закрытая заявка для метрик',
        priority: 'critical',
    }).expect(201)).body.data;

    const technician = await models.Technician.create({
        full_name: 'Метрики Метриков',
        specialization: 'Наладка',
        personnel_number: 'TEST-METRIC-1',
    });

    // Переход в in_progress без бригады запрещён, а закрытая заявка нужна
    // для среднего времени закрытия в прикладных метриках.
    for (const id of [newRequest.id, done.id]) {
        await admin.post(`/api/requests/${id}/assignees`).send([{ technicianId: technician.id, role: 'lead' }]).expect(201);
    }
    await admin.patch(`/api/requests/${done.id}/status`).send({ status: 'in_progress' }).expect(200);
    await admin.patch(`/api/requests/${done.id}/status`).send({ status: 'done' }).expect(200);

    // Кэш прикладных агрегатов общий для процесса: после подготовки данных он сбрасывается.
    resetAppliedCache();
});

afterAll(closeTestDb);

const scrape = async () => {
    const res = await request(app).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    return res.text;
};

const seriesFor = (text, metric) =>
    text
        .split('\n')
        .filter((line) => line.startsWith(metric) && !line.startsWith('#'));

describe('GET /metrics', () => {
    test('отдаёт метрики в формате Prometheus без access-токена', async () => {
        const text = await scrape();
        // Технические метрики процесса собираются prom-client по умолчанию.
        expect(text).toMatch(/process_cpu_seconds_total/);
        expect(text).toMatch(/nodejs_eventloop_lag_seconds/);
    });

    test('считает запросы по маршрутам и кодам ответа', async () => {
        await admin.get('/api/equipment').expect(200);
        await admin.get('/api/equipment').expect(200);
        const missing = await admin.get('/api/equipment/00000000-0000-4000-8000-000000000000').expect(404);

        const text = await scrape();
        const ok = seriesFor(text, 'http_requests_total');
        expect(ok.some((line) => line.includes('route="/api/equipment"') && line.includes('status="200"'))).toBe(true);
        expect(
            ok.some(
                (line) =>
                    line.includes('method="GET"') &&
                    line.includes('route="/api/equipment/:id"') &&
                    line.includes(`status="${missing.statusCode}"`),
            ),
        ).toBe(true);
    });

    test('метка route содержит шаблон, а не фактический id', async () => {
        await admin.get('/api/equipment/00000000-0000-4000-8000-000000000001').expect(404);

        const text = await scrape();
        // Без шаблона каждый id создал бы отдельную серию и раздул память Prometheus.
        expect(text).not.toContain('00000000-0000-4000-8000-000000000001');
        expect(seriesFor(text, 'http_requests_total').some((line) => line.includes('route="/api/equipment/:id"'))).toBe(true);
    });

    test('считает ошибки по классу кода', async () => {
        await request(app).get('/api/nope').expect(404);

        const text = await scrape();
        const errors = seriesFor(text, 'http_errors_total{');
        expect(errors.some((line) => line.includes('status_class="4xx"'))).toBe(true);
        expect(errors.some((line) => line.includes('status_class="5xx"'))).toBe(false);
    });

    test('измеряет длительность обработки', async () => {
        await request(app).get('/api/health/live').expect(200);
        const text = await scrape();
        expect(text).toMatch(/http_request_duration_seconds_bucket\{/);
        expect(text).toMatch(/http_request_duration_seconds_count\{/);
        expect(text).toMatch(/http_request_duration_seconds_sum\{/);
    });

    test('сам скрейп /metrics не попадает в метрики', async () => {
        const before = seriesFor(await scrape(), 'http_requests_total').filter((l) => l.includes('route="/metrics"'));
        expect(before).toEqual([]);

        await scrape();
        const after = seriesFor(await scrape(), 'http_requests_total').filter((l) => l.includes('route="/metrics"'));
        expect(after).toEqual([]);
    });

    test('отдаёт прикладные метрики, посчитанные в PostgreSQL', async () => {
        const text = await scrape();
        expect(text).toMatch(/maintenance_requests_by_status\{/);
        expect(text).toMatch(/maintenance_requests_by_priority\{/);
        expect(seriesFor(text, 'maintenance_average_closure_hours').length).toBeGreaterThan(0);
        expect(seriesFor(text, 'maintenance_overdue_planned_works').length).toBeGreaterThan(0);
        expect(text).toMatch(/maintenance_equipment_open_requests\{/);
        expect(text).toMatch(/maintenance_requests_by_site\{/);
        expect(seriesFor(text, 'maintenance_db_pool_max').length).toBeGreaterThan(0);
    });

    test('метрики пула отражают реальные настройки Sequelize, а не нули', async () => {
        const text = await scrape();
        // Раньше обе метрики были нулевыми: код брал несуществующее sequelize.pool.
        // Теперь максимум равен DB_POOL_MAX, а занятые соединения видны при нагрузке.
        const max = Number(seriesFor(text, 'maintenance_db_pool_max')[0].split(' ').pop());
        expect(max).toBe(config.db.poolMax);
        expect(max).toBeGreaterThan(0);
        const inUse = Number(seriesFor(text, 'maintenance_db_pool_in_use')[0].split(' ').pop());
        expect(inUse).toBeGreaterThanOrEqual(0);
        expect(inUse).toBeLessThanOrEqual(max);
        // Очередь за соединениями — признак исчерпания пула, о котором стоит знать.
        const waiting = Number(seriesFor(text, 'maintenance_db_pool_waiting')[0].split(' ').pop());
        expect(waiting).toBeGreaterThanOrEqual(0);
    });

    test('service_up отражает результат проверки готовности', async () => {
        await request(app).get('/api/health/ready').expect(200);
        const text = await scrape();
        const up = seriesFor(text, 'service_up')[0];
        expect(up).toBeDefined();
        expect(Number(up.split(' ').pop())).toBe(1);
    });

    test('прикладные метрики содержат значения, посчитанные по данным', async () => {
        const text = await scrape();
        const byStatus = new Map(
            seriesFor(text, 'maintenance_requests_by_status').map((line) => [
                line.match(/status="([^"]+)"/)[1],
                Number(line.split(' ').pop()),
            ]),
        );
        expect(byStatus.get('new')).toBe(2);
        expect(byStatus.get('done')).toBe(1);

        const byPriority = new Map(
            seriesFor(text, 'maintenance_requests_by_priority').map((line) => [
                line.match(/priority="([^"]+)"/)[1],
                Number(line.split(' ').pop()),
            ]),
        );
        expect(byPriority.get('critical')).toBe(1);
        expect(byPriority.get('high')).toBe(1);

        // Просроченная плановая работа: planned_at в прошлом, заявка открыта.
        expect(Number(seriesFor(text, 'maintenance_overdue_planned_works')[0].split(' ').pop())).toBeGreaterThanOrEqual(1);
        expect(Number(seriesFor(text, 'maintenance_average_closure_hours')[0].split(' ').pop())).toBeGreaterThanOrEqual(0);
        expect(seriesFor(text, 'maintenance_equipment_open_requests').some((l) => l.includes('SN') === false && l.includes('Турбина'))).toBe(true);
    });

    test('метрики не обходят лимит запросов /api', async () => {
        // /metrics вне префикса /api: скрейп Prometheus не должен расходовать квоту клиента.
        expect((await request(app).post('/metrics').send({})).status).toBe(404);
    });

    test('реестр метрик доступен приложению напрямую', async () => {
        const metrics = await registry.getMetricsAsJSON();
        expect(metrics.map((m) => m.name)).toEqual(
            expect.arrayContaining(['http_requests_total', 'http_errors_total', 'http_request_duration_seconds', 'service_up']),
        );
    });
});