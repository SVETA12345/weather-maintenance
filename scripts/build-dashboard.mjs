import { writeFileSync } from 'node:fs';

// Дашборд собирается скриптом, чтобы панели не расходились по полям и меткам:
// итоговый JSON кладётся в репозиторий и подхватывается provisioning-ом Grafana.
const DS = { type: 'prometheus', uid: 'prometheus' };
const JOB = 'weather-maintenance-api';

const target = (expr, legendFormat, refId = 'A', instant = false) => ({
    datasource: DS,
    editorMode: 'code',
    expr,
    legendFormat,
    range: !instant,
    instant,
    refId,
});

const panels = [];
let y = 0;

const add = (panel) => {
    panels.push({ ...panel, id: panels.length + 1 });
    y += panel.gridPos.h;
    return panel;
};

const row = (title) => add({ type: 'row', title, gridPos: { h: 1, w: 24, x: 0, y }, collapsed: false, panels: [] });

const stat = (title, expr, unit, gridPos, extra = {}) =>
    add({
        type: 'stat',
        title,
        datasource: DS,
        gridPos,
        fieldConfig: {
            defaults: {
                unit,
                color: { mode: 'thresholds' },
                thresholds: extra.thresholds ?? { mode: 'absolute', steps: [{ color: 'text', value: null }] },
                mappings: extra.mappings ?? [],
            },
            overrides: [],
        },
        options: {
            colorMode: extra.colorMode ?? 'value',
            graphMode: 'area',
            justifyMode: 'auto',
            textMode: 'auto',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
        },
        targets: [target(expr, extra.legendFormat ?? title, 'A', true)],
        ...extra.panel,
    });

const timeseries = (title, targets, unit, gridPos, extra = {}) =>
    add({
        type: 'timeseries',
        title,
        datasource: DS,
        gridPos,
        fieldConfig: {
            defaults: {
                unit,
                min: extra.min,
                max: extra.max,
                custom: {
                    drawStyle: 'line',
                    lineWidth: 1,
                    fillOpacity: extra.fillOpacity ?? 10,
                    showPoints: 'never',
                    spanNulls: true,
                    axisPlacement: 'auto',
                },
                thresholds: extra.thresholds,
            },
            overrides: [],
        },
        options: {
            legend: { displayMode: 'list', placement: 'bottom', calcs: ['lastNotNull'] },
            tooltip: { mode: 'multi', sort: 'desc' },
        },
        targets,
        ...extra.panel,
    });

const barchart = (title, expr, legendFormat, gridPos, unit = 'short') =>
    add({
        type: 'barchart',
        title,
        datasource: DS,
        gridPos,
        fieldConfig: { defaults: { unit, color: { mode: 'palette-classic' } }, overrides: [] },
        options: {
            orientation: 'horizontal',
            showValue: 'always',
            stacking: 'none',
            xTickLabelRotation: 0,
            legend: { displayMode: 'list', placement: 'bottom', calcs: [] },
            tooltip: { mode: 'single', sort: 'none' },
        },
        targets: [target(expr, legendFormat, 'A', true)],
    });

const table = (title, targets, gridPos) =>
    add({
        type: 'table',
        title,
        datasource: DS,
        gridPos,
        fieldConfig: { defaults: {}, overrides: [] },
        options: { showHeader: true, cellHeight: 'sm' },
        targets,
        transformations: [
            {
                id: 'organize',
                options: {
                    excludeByName: { Time: true, __name__: true, Value: true, 'Alert state': true, job: true },
                    indexByName: {},
                    renameByName: {
                        'alertname': 'Алерт',
                        'alertstate': 'Состояние',
                        'severity': 'Важность',
                        'instance': 'Экземпляр',
                    },
                },
            },
        ],
    });

const rate = (window = '5m', status = null) =>
    status
        ? `sum(rate(http_requests_total{job="${JOB}", status=~"${status}"}[${window}]))`
        : `sum(rate(http_requests_total{job="${JOB}"}[${window}]))`;

const share = (window, status) =>
    `sum(rate(http_requests_total{job="${JOB}", status=~"${status}"}[${window}])) / clamp_min(sum(rate(http_requests_total{job="${JOB}"}[${window}])), 0.001)`;

const latency = (quantile) =>
    `histogram_quantile(${quantile}, sum(rate(http_request_duration_seconds_bucket{job="${JOB}"}[5m])) by (le))`;

row('Технические панели');

stat(
    'Доступность сервиса',
    `min(up{job="${JOB}"})`,
    'none',
    { h: 4, w: 4, x: 0, y },
    {
        colorMode: 'background',
        mappings: [{ type: 'value', options: { '0': { text: 'Недоступен', color: 'red', index: 0 }, '1': { text: 'Доступен', color: 'green', index: 1 } } }],
        thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] },
        legendFormat: 'up',
    },
);

stat(
    'Готовность (БД)',
    'min(service_up{job="weather-maintenance-api"})',
    'none',
    { h: 4, w: 4, x: 4, y },
    {
        colorMode: 'background',
        mappings: [{ type: 'value', options: { '0': { text: 'БД недоступна', color: 'red', index: 0 }, '1': { text: 'БД доступна', color: 'green', index: 1 } } }],
        thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] },
        legendFormat: 'ready',
    },
);

stat('Открытых заявок', 'sum(maintenance_requests_by_status{status=~"new|in_progress"})', 'short', { h: 4, w: 4, x: 8, y }, {
    thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'yellow', value: 20 }, { color: 'red', value: 50 }] },
    legendFormat: 'заявок',
});

stat('Просроченных плановых работ', 'maintenance_overdue_planned_works', 'short', { h: 4, w: 4, x: 12, y }, {
    thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] },
    colorMode: 'background',
    legendFormat: 'просрочено',
});

stat('Среднее время закрытия, ч', 'maintenance_average_closure_hours', 'h', { h: 4, w: 8, x: 16, y }, {
    thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'yellow', value: 48 }, { color: 'red', value: 168 }] },
    legendFormat: 'закрытие',
});

timeseries(
    'Интенсивность запросов, rps',
    [
        target(rate(), 'все запросы', 'A'),
        target(rate('5m', '2..'), '2xx', 'B'),
        target(rate('5m', '4..'), '4xx', 'C'),
        target(rate('5m', '5..'), '5xx', 'D'),
    ],
    'reqps',
    { h: 8, w: 12, x: 0, y },
);

timeseries(
    'Доля ответов 4xx и 5xx',
    [target(share('5m', '4..'), '4xx', 'A'), target(share('5m', '5..'), '5xx', 'B')],
    'percentunit',
    { h: 8, w: 12, x: 12, y },
    {
        min: 0,
        max: 1,
        fillOpacity: 0,
        thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.05 }] },
    },
);

timeseries(
    'Время ответа, p50 / p95 / p99',
    [target(latency(0.5), 'p50', 'A'), target(latency(0.95), 'p95', 'B'), target(latency(0.99), 'p99', 'C')],
    's',
    { h: 8, w: 12, x: 0, y },
);

timeseries(
    'Самые нагруженные маршруты, rps',
    [target(`topk(10, sum(rate(http_requests_total{job="${JOB}"}[5m])) by (route, method))`, '{{method}} {{route}}', 'A')],
    'reqps',
    { h: 8, w: 12, x: 12, y },
);

timeseries(
    'Соединения с БД (пул Sequelize)',
    [target('maintenance_db_pool_in_use', 'занято', 'A'), target('maintenance_db_pool_max', 'максимум', 'B')],
    'short',
    { h: 7, w: 12, x: 0, y },
);

row('Прикладные панели');

barchart('Заявки по статусам', 'maintenance_requests_by_status', '{{status}}', { h: 8, w: 8, x: 0, y });
barchart('Заявки по приоритетам', 'maintenance_requests_by_priority', '{{priority}}', { h: 8, w: 8, x: 8, y });
barchart(
    'Нагрузка на оборудование (открытые заявки, top-20)',
    'maintenance_equipment_open_requests',
    '{{equipment_name}}',
    { h: 8, w: 8, x: 16, y },
);

barchart('Открытые заявки по площадкам', 'maintenance_requests_by_site', '{{site_name}}', { h: 8, w: 12, x: 0, y });


const dashboard = {
    __inputs: [],
    __requires: [{ type: 'grafana', id: 'grafana', name: 'Grafana', version: '10.0.0' }],
    annotations: {
        list: [
            {
                builtIn: 1,
                datasource: { type: 'grafana', uid: '-- Grafana --' },
                enable: true,
                hide: true,
                iconColor: 'rgba(0, 211, 255, 1)',
                name: 'Annotations & Alerts',
                type: 'dashboard',
            },
        ],
    },
    editable: false,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    id: null,
    links: [],
    liveNow: false,
    panels,
    refresh: '30s',
    schemaVersion: 39,
    tags: ['weather-maintenance', 'api', 'maintenance'],
    templating: { list: [] },
    time: { from: 'now-6h', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title: 'Weather Maintenance — API и заявки',
    uid: 'weather-maintenance-overview',
    version: 1,
    weekStart: '',
};

const outputPath = new URL('../monitoring/grafana/dashboards/maintenance-overview.json', import.meta.url);
writeFileSync(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`, 'utf8');
console.log('panels:', panels.length, '->', outputPath.pathname);