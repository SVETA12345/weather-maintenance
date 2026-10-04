import client from 'prom-client';
import { sequelize } from '../models/sequelize.js';
import { config } from '../config/index.js';
import { readApplied } from './applied.js';

const { Counter, Gauge, Histogram, collectDefaultMetrics, Registry } = client;

export const registry = new Registry();
registry.setDefaultLabels({ service: 'weather-maintenance-api' });

if (config.metrics.collectDefault) {
    // process_* и nodejs_* — стандартный набор prom-client: CPU, память, event-loop, GC.
    collectDefaultMetrics({ register: registry });
}

export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Число HTTP-запросов, обработанных сервисом',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
});

export const httpErrorsTotal = new Counter({
    name: 'http_errors_total',
    help: 'Число ответов с кодом 4xx и 5xx',
    labelNames: ['method', 'route', 'status_class'],
    registers: [registry],
});

export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Длительность обработки HTTP-запроса, секунды',
    labelNames: ['method', 'route'],
    // Низкие границы важнее высоких: типичный ответ API — десятки миллисекунд,
    // хвост нужен только для p95/p99.
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
});

export const serviceUp = new Gauge({
    name: 'service_up',
    help: 'Результат последней проверки готовности (1 — БД доступна, 0 — нет)',
    registers: [registry],
});

export const requestsCreatedTotal = new Counter({
    name: 'maintenance_requests_created_total',
    help: 'Число созданных заявок приложением',
    labelNames: ['priority'],
    registers: [registry],
});

export const appliedGauges = {
    byStatus: new Gauge({
        name: 'maintenance_requests_by_status',
        help: 'Заявки по статусам',
        labelNames: ['status'],
        registers: [registry],
    }),
    byPriority: new Gauge({
        name: 'maintenance_requests_by_priority',
        help: 'Заявки по приоритетам',
        labelNames: ['priority'],
        registers: [registry],
    }),
    bySite: new Gauge({
        name: 'maintenance_requests_by_site',
        help: 'Открытые заявки по площадкам',
        labelNames: ['site_id', 'site_name'],
        registers: [registry],
    }),
    equipmentOpen: new Gauge({
        name: 'maintenance_equipment_open_requests',
        help: 'Открытые заявки по оборудованию (top-N)',
        labelNames: ['equipment_id', 'equipment_name'],
        registers: [registry],
    }),
    averageClosureHours: new Gauge({
        name: 'maintenance_average_closure_hours',
        help: 'Среднее время закрытия заявки, часы',
        registers: [registry],
    }),
    overduePlanned: new Gauge({
        name: 'maintenance_overdue_planned_works',
        help: 'Просроченные плановые работы: planned_at в прошлом, заявка открыта',
        registers: [registry],
    }),
    poolInUse: new Gauge({
        name: 'maintenance_db_pool_in_use',
        help: 'Занятые соединения пула Sequelize',
        registers: [registry],
    }),
    poolMax: new Gauge({
        name: 'maintenance_db_pool_max',
        help: 'Максимум соединений пула Sequelize',
        registers: [registry],
    }),
    poolWaiting: new Gauge({
        name: 'maintenance_db_pool_waiting',
        help: 'Запросы, ожидающие соединения пула Sequelize: признак исчерпания пула',
        registers: [registry],
    }),
};

// Метрики с метками очищаются перед заполнением: иначе в реестре навсегда остались бы
// equipment_id и site_name, которых больше нет в базе.
const LABELLED = ['byStatus', 'byPriority', 'bySite', 'equipmentOpen'];

async function refreshApplied() {
    const data = await readApplied();
    if (!data) return;

    for (const key of LABELLED) appliedGauges[key].reset();

    for (const row of data.byStatus) appliedGauges.byStatus.set({ status: row.status }, row.value);
    for (const row of data.byPriority) appliedGauges.byPriority.set({ priority: row.priority }, row.value);
    for (const row of data.bySite) appliedGauges.bySite.set({ site_id: row.site_id, site_name: row.site_name }, row.value);
    for (const row of data.equipmentOpen) {
        appliedGauges.equipmentOpen.set({ equipment_id: row.equipment_id, equipment_name: row.equipment_name }, row.value);
    }
    // Пустая база закрытых заявок даёт NULL, а не ноль: среднего времени нет.
    appliedGauges.averageClosureHours.set(data.averageClosureHours ?? 0);
    appliedGauges.overduePlanned.set(data.overduePlanned);
}

// Один асинхронный collect на все прикладные метрики: так шесть gauge-ов
// не превращают один скрейп в шесть одинаковых наборов запросов.
const appliedRefresh = {
    collect: async () => {
        await refreshApplied();
    },
};
for (const key of [...LABELLED, 'averageClosureHours', 'overduePlanned']) {
    appliedGauges[key].collect = appliedRefresh.collect;
}

// Sequelize v6 не создаёт legacy-поле sequelize.pool, поэтому берём настройки
// пула из options (заданы в src/models/sequelize.js) и фактическое состояние —
// из connectionManager: без этого обе метрики всегда были бы нулевыми.
function readPoolStats() {
    const pool = sequelize.connectionManager?.pool ?? sequelize.pool ?? null;
    return {
        inUse: pool?.using ?? 0,
        waiting: pool?.waiting ?? 0,
        max: pool?.maxSize ?? sequelize.options?.pool?.max ?? 0,
    };
}

appliedGauges.poolInUse.collect = () => {
    const { inUse, waiting, max } = readPoolStats();
    appliedGauges.poolInUse.set(inUse);
    appliedGauges.poolMax.set(max);
    appliedGauges.poolWaiting.set(waiting);
};

serviceUp.set(0);

export function markServiceUp(isUp) {
    serviceUp.set(isUp ? 1 : 0);
}

export function countCreatedRequest(priority) {
    requestsCreatedTotal.inc({ priority });
}

export const metrics = {
    registry,
    markServiceUp,
    countCreatedRequest,
};

export default metrics;