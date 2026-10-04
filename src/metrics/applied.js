import { sequelize } from '../models/sequelize.js';
import { config } from '../config/index.js';
import { getLog } from '../utils/context.js';

// Прикладные агрегаты считаются прямо в PostgreSQL: данные всегда актуальны,
// а нагрузка ложится на индексы, уже созданные для отчётов.
const APPLIED_QUERIES = {
    byStatus: `
        SELECT status, COUNT(*)::int AS value
        FROM maintenance_requests
        WHERE status IN ('new', 'in_progress', 'done', 'rejected')
        GROUP BY status`,
    byPriority: `
        SELECT priority, COUNT(*)::int AS value
        FROM maintenance_requests
        GROUP BY priority`,
    bySite: `
        SELECT s.id::text AS site_id, s.name AS site_name, COUNT(r.id)::int AS value
        FROM sites s
        JOIN equipment e ON e.site_id = s.id
        JOIN maintenance_requests r ON r.equipment_id = e.id AND r.status IN ('new', 'in_progress')
        GROUP BY s.id, s.name
        ORDER BY value DESC
        LIMIT :top`,
    equipmentOpen: `
        SELECT e.id::text AS equipment_id, e.name AS equipment_name, COUNT(r.id)::int AS value
        FROM equipment e
        JOIN maintenance_requests r ON r.equipment_id = e.id AND r.status IN ('new', 'in_progress')
        GROUP BY e.id, e.name
        ORDER BY value DESC
        LIMIT :top`,
    averageClosureHours: `
        SELECT ROUND((AVG(EXTRACT(EPOCH FROM (h.created_at - r.created_at)) / 3600)
            FILTER (WHERE r.status = 'done'))::numeric, 2) AS value
        FROM maintenance_requests r
        JOIN request_status_history h
          ON h.request_id = r.id AND h.new_status = 'done' AND h.old_status <> 'done'`,
    overduePlanned: `
        SELECT COUNT(*)::int AS value
        FROM maintenance_requests
        WHERE status IN ('new', 'in_progress')
          AND planned_at IS NOT NULL
          AND planned_at < NOW()`,
};

const EMPTY = {
    byStatus: [],
    byPriority: [],
    bySite: [],
    equipmentOpen: [],
    averageClosureHours: null,
    overduePlanned: 0,
};

// Один скрейп идёт через все метки, поэтому запросы выполняются один раз и
// результат переиспользуется в течение короткого окна: иначе каждый из
// шести gauge-ов выполнил бы свой набор запросов к PostgreSQL.
let cache = { at: 0, promise: null };

async function readAppliedUncached() {
    const replacements = { top: config.metrics.appliedTopN };
    const entries = await Promise.all(
        Object.entries(APPLIED_QUERIES).map(async ([key, sql]) => {
            const [rows] = await sequelize.query(sql, { replacements });
            return [key, rows];
        }),
    );

    const result = { ...EMPTY };
    for (const [key, rows] of entries) {
        if (key === 'averageClosureHours') result[key] = rows[0]?.value === null || rows[0] === undefined ? null : Number(rows[0].value);
        else if (key === 'overduePlanned') result[key] = Number(rows[0]?.value ?? 0);
        else result[key] = rows.map((row) => ({ ...row, value: Number(row.value) }));
    }
    return result;
}

export function readApplied() {
    const now = Date.now();
    if (cache.promise && now - cache.at < config.metrics.cacheMs) return cache.promise;

    const promise = readAppliedUncached().catch((error) => {
        getLog().warn({ event: 'metrics_collect_failed', error: error.message }, 'Не удалось собрать прикладные метрики');
        return null;
    });
    cache = { at: now, promise };
    return promise;
}

export function resetAppliedCache() {
    cache = { at: 0, promise: null };
}

export { APPLIED_QUERIES };