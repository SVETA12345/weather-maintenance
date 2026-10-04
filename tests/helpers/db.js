import { randomUUID } from 'node:crypto';
import { sequelize, models } from '../../src/models/sequelize.js';

const TABLES = [
    'request_status_history',
    'request_assignees',
    'maintenance_requests',
    'equipment_passports',
    'equipment',
    'sites',
    'technicians',
    'refresh_tokens',
    'users',
];

export async function resetTestDb() {
    const database = sequelize.getDatabaseName();
    if (!/test/i.test(database)) {
        throw new Error(`resetTestDb() отключён для базы "${database}"`);
    }
    await sequelize.query(`TRUNCATE TABLE ${TABLES.join(', ')} CASCADE`);
}

export async function closeTestDb() {
    await sequelize.close();
}

let personnelCounter = 0;

export async function createTechnician(overrides = {}) {
    personnelCounter += 1;
    return models.Technician.create({
        id: overrides.id ?? randomUUID(),
        full_name: overrides.full_name ?? `Тестовый Тест ${personnelCounter}`,
        specialization: overrides.specialization ?? 'Наладка',
        personnel_number: overrides.personnel_number ?? `TEST-${personnelCounter}`,
    });
}

export async function createPassport(equipmentId, overrides = {}) {
    return models.EquipmentPassport.create({
        equipment_id: equipmentId,
        manufacturer: overrides.manufacturer ?? 'Завод-изготовитель',
        model: overrides.model ?? 'Модель-1',
        rated_power: overrides.rated_power ?? '250.00',
        last_calibration_at: overrides.last_calibration_at ?? '2026-01-15T00:00:00.000Z',
    });
}

// Площадка в ответе оборудования не отдаётся, поэтому для сводки берём её из БД.
export async function getSiteIdOfEquipment(equipmentId) {
    const [rows] = await sequelize.query('SELECT site_id FROM equipment WHERE id = :id', {
        replacements: { id: equipmentId },
    });
    return rows[0]?.site_id ?? null;
}

// Заявки без смены статуса не меняют updated_at, поэтому длительность закрытия
// задаём напрямую — так среднее в сводке проверяется детерминированно.
export async function setRequestDurationHours(requestId, hours) {
    const [rows] = await sequelize.query(
        `UPDATE maintenance_requests
            SET created_at = TIMESTAMPTZ '2026-01-01 00:00:00+00',
                updated_at = TIMESTAMPTZ '2026-01-01 00:00:00+00' + (:hours || ' hours')::interval
          WHERE id = :id
          RETURNING id`,
        { replacements: { id: requestId, hours } },
    );
    return rows[0];
}

// Заявки создаются с текущим временем, поэтому для проверки периодов отчёта
// created_at задаётся напрямую.
export async function setRequestCreatedAt(requestId, isoDate) {
    const [rows] = await sequelize.query(
        `UPDATE maintenance_requests SET created_at = :createdAt WHERE id = :id RETURNING id`,
        { replacements: { id: requestId, createdAt: isoDate } },
    );
    return rows[0];
}

export async function countRows(table, where = {}) {
    const conditions = Object.keys(where).map((key) => `${key} = :${key}`);
    const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS total FROM ${table} ${clause}`, {
        replacements: where,
    });
    return rows[0].total;
}
