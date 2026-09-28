import { sequelize } from '../models/sequelize.js';

// Отчёт строится raw SQL: агрегаты по заявкам нельзя выразить через
// findAll + include без потери группировки, а пагинация применяется в базе,
// а не после загрузки всех строк в память.
const SORT_COLUMNS = {
    name: 'e.name',
    serialNumber: 'e.serial_number',
    type: 'e.type',
    status: 'e.status',
    requestsTotal: '"requestsTotal"',
    requestsOpen: '"requestsOpen"',
    requestsDone: '"requestsDone"',
    requestsRejected: '"requestsRejected"',
    plannedLaborHours: '"plannedLaborHours"',
    lastServiceAt: '"lastServiceAt"',
    lastRequestAt: '"lastRequestAt"',
};

// Период и минимальное число заявок одинаково применяются к выборке и к
// подсчёту total, иначе meta.total разошёлся бы с числом строк отчёта.
function periodConditions({ from, to }) {
    const conditions = [];
    if (from) conditions.push('r.created_at >= :from');
    if (to) conditions.push('r.created_at <= :to');
    return conditions;
}

function buildQuery({ from, to, minRequests, sortBy, order, limit, offset }) {
    const period = periodConditions({ from, to });
    const joinFilter = period.length ? ` AND ${period.join(' AND ')}` : '';
    const having = minRequests === undefined ? '' : ' HAVING COUNT(r.id) >= :minRequests';
    const column = SORT_COLUMNS[sortBy];
    const orderBy = column
        ? ` ORDER BY ${column} ${order === 'desc' ? 'DESC' : 'ASC'}, e.name ASC`
        : ' ORDER BY "requestsOpen" DESC, e.name ASC';

    const grouped = `
        SELECT e.id
        FROM equipment e
        LEFT JOIN maintenance_requests r
            ON r.equipment_id = e.id${joinFilter}
        GROUP BY e.id
        ${having}
    `;

    const load = `
        SELECT
            e.id,
            e.name,
            e.serial_number AS "serialNumber",
            e.type,
            e.status,
            COUNT(r.id)::int AS "requestsTotal",
            (COUNT(r.id) FILTER (WHERE r.status IN ('new', 'in_progress')))::int AS "requestsOpen",
            (COUNT(r.id) FILTER (WHERE r.status = 'done'))::int AS "requestsDone",
            (COUNT(r.id) FILTER (WHERE r.status = 'rejected'))::int AS "requestsRejected",
            COALESCE(SUM(r.planned_labor_hours), 0) AS "plannedLaborHours",
            MAX(r.updated_at) AS "lastRequestAt",
            MAX(r.updated_at) FILTER (WHERE r.status = 'done') AS "lastServiceAt"
        FROM equipment e
        LEFT JOIN maintenance_requests r
            ON r.equipment_id = e.id${joinFilter}
        GROUP BY e.id
        ${having}
        ${orderBy}
        LIMIT :limit OFFSET :offset
    `;

    const total = `SELECT COUNT(*)::int AS total FROM (${grouped}) grouped`;

    return { load, total };
}

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

// undefined в replacements недопустим, поэтому в объект попадают только заданные значения.
function replacementsOf(values) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function toApi(row) {
    return {
        id: row.id,
        name: row.name,
        serialNumber: row.serialNumber,
        type: row.type,
        status: row.status,
        requestsTotal: row.requestsTotal,
        requestsOpen: row.requestsOpen,
        requestsDone: row.requestsDone,
        requestsRejected: row.requestsRejected,
        plannedLaborHours: Number(row.plannedLaborHours),
        lastRequestAt: toIso(row.lastRequestAt) ?? null,
        lastServiceAt: toIso(row.lastServiceAt) ?? null,
    };
}

async function equipmentLoad({ from, to, minRequests, sortBy, order, limit, offset }) {
    const { load, total } = buildQuery({ from, to, minRequests, sortBy, order, limit, offset });
    const replacements = replacementsOf({ from, to, minRequests, limit, offset });
    const [rows] = await sequelize.query(load, { replacements });
    return rows.map(toApi);
}

async function countEquipment({ from, to, minRequests }) {
    const { total } = buildQuery({ from, to, minRequests });
    const [rows] = await sequelize.query(total, { replacements: replacementsOf({ from, to, minRequests }) });
    return rows[0].total;
}

export const reportsRepository = { equipmentLoad, countEquipment };
