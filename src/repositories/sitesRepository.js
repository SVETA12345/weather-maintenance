import { models, sequelize } from '../models/sequelize.js';

const { Site } = models;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// Счётчики приводятся к int, потому что COUNT в PostgreSQL возвращает bigint,
// а node-postgres отдаёт такие значения строкой.
const SUMMARY_SQL = `
    SELECT
        s.id AS "siteId",
        COUNT(r.id)::int AS total,
        (COUNT(r.id) FILTER (WHERE r.status = 'new'))::int AS "statusNew",
        (COUNT(r.id) FILTER (WHERE r.status = 'in_progress'))::int AS "statusInProgress",
        (COUNT(r.id) FILTER (WHERE r.status = 'done'))::int AS "statusDone",
        (COUNT(r.id) FILTER (WHERE r.status = 'rejected'))::int AS "statusRejected",
        (COUNT(r.id) FILTER (WHERE r.priority = 'low'))::int AS "priorityLow",
        (COUNT(r.id) FILTER (WHERE r.priority = 'medium'))::int AS "priorityMedium",
        (COUNT(r.id) FILTER (WHERE r.priority = 'high'))::int AS "priorityHigh",
        (COUNT(r.id) FILTER (WHERE r.priority = 'critical'))::int AS "priorityCritical",
        ROUND(
            (AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) / 3600)
                FILTER (WHERE r.status = 'done'))::numeric,
            1
        ) AS "averageClosureHours"
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id
    LEFT JOIN maintenance_requests r ON r.equipment_id = e.id
    WHERE s.id = :siteId
    GROUP BY s.id
`;

async function getSummary(siteId) {
    if (!UUID_RE.test(String(siteId))) return null;

    const [rows] = await sequelize.query(SUMMARY_SQL, { replacements: { siteId } });
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
        siteId: row.siteId,
        total: row.total,
        byStatus: {
            new: row.statusNew,
            in_progress: row.statusInProgress,
            done: row.statusDone,
            rejected: row.statusRejected,
        },
        byPriority: {
            low: row.priorityLow,
            medium: row.priorityMedium,
            high: row.priorityHigh,
            critical: row.priorityCritical,
        },
        averageClosureHours: row.averageClosureHours === null ? null : Number(row.averageClosureHours),
    };
}

export const sitesRepository = { getSummary };
