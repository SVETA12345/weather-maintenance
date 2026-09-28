import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { models, sequelize } from '../models/sequelize.js';
import { ValidationError } from '../errors/ValidationError.js';

const { Equipment, Site, EquipmentPassport } = models;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGION_UNSPECIFIED = 'не указан в API-контракте';

const EQUIPMENT_INCLUDE = [
    { model: Site, as: 'site', attributes: ['lat', 'lon'] },
    { model: EquipmentPassport, as: 'passport', attributes: ['id', 'manufacturer', 'model', 'rated_power', 'last_calibration_at', 'created_at', 'updated_at'] },
];

function isUuid(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function siteCode(lat, lon) {
    const hash = createHash('sha1').update(`${lat},${lon}`).digest('hex').slice(0, 10);
    return `AUTO-${hash}`;
}

// Кейса 1 передаёт координаты оборудования
// в sites, поэтому  ищется по lat/lon и создаётся при первом обращении.
async function resolveSite({ lat, lon } = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new ValidationError({ location: 'ожидаются числовые location.lat и location.lon' });
    }

    const [site] = await Site.findOrCreate({
        where: { lat, lon },
        defaults: {
            code: siteCode(lat, lon),
            name: `Площадка ${lat}, ${lon}`,
            region: REGION_UNSPECIFIED,
        },
    });

    return site;
}

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

function toApi(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        serialNumber: row.serial_number,
        status: row.status,
        installedAt: toIso(row.installed_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        passport: row.passport,
        location: {
            lat: row.site?.lat ?? null,
            lon: row.site?.lon ?? null,
        },
    };
}

const SORT_COLUMNS = {
    name: 'name',
    type: 'type',
    status: 'status',
    serialNumber: 'serial_number',
    installedAt: 'installed_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

const SEARCH_COLUMNS = ['name', 'serial_number'];

// Спецсимволы LIKE экранируются, иначе пользовательский ввод вида `%` или `_`
// превращался бы в шаблон, совпадающий с любой строкой.
function escapeLike(value) {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere({ status, type, search } = {}) {
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
        const pattern = `%${escapeLike(search)}%`;
        // ILIKE, а не LOWER(...) LIKE: так GIN-индекс pg_trgm по исходной колонке
        // действительно используется планировщиком.
        where[Op.or] = SEARCH_COLUMNS.map((column) => ({ [column]: { [Op.iLike]: pattern } }));
    }
    return where;
}

// Фильтрация, сортировка и пагинация выполняются в базе: в память попадает
// только страница строк, а total считается тем же where отдельным COUNT.
async function findPage(filters, { limit, offset }) {
    const where = buildWhere(filters);
    const column = SORT_COLUMNS[filters.sortBy];
    const order = column ? [[column, filters.order === 'desc' ? 'DESC' : 'ASC']] : [['created_at', 'ASC']];

    const [rows, total] = await Promise.all([
        Equipment.findAll({ where, include: EQUIPMENT_INCLUDE, order, limit, offset }),
        Equipment.count({ where }),
    ]);
    return { rows: rows.map(toApi), total };
}

async function findById(id) {
    if (!isUuid(id)) return null;
    return toApi(await Equipment.findByPk(id, { include: EQUIPMENT_INCLUDE }));
}

async function findBySerial(serialNumber) {
    return toApi(
        await Equipment.findOne({ where: { serial_number: serialNumber }, include: EQUIPMENT_INCLUDE }),
    );
}

async function create(data) {
    const site = await resolveSite(data.location);
    const created = await Equipment.create({
        site_id: site.id,
        name: data.name,
        type: data.type,
        serial_number: data.serialNumber,
        status: data.status ?? 'operational',
        installed_at: data.installedAt,
    });

    return findById(created.id);
}

async function update(id, patch) {
    if (!isUuid(id)) return null;

    const values = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.type !== undefined) values.type = patch.type;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.serialNumber !== undefined) values.serial_number = patch.serialNumber;
    if (patch.installedAt !== undefined) values.installed_at = patch.installedAt;
    if (patch.location !== undefined) values.site_id = (await resolveSite(patch.location)).id;

    const [affected] = await Equipment.update(values, { where: { id } });
    if (affected === 0) return null;

    return findById(id);
}

async function remove(id) {
    if (!isUuid(id)) return false;
    return (await Equipment.destroy({ where: { id } })) > 0;
}

async function reset() {
    const database = sequelize.getDatabaseName();
    if (!/test/i.test(database)) {
        throw new Error(
            `equipmentRepository.reset() отключён для базы "${database}": удаление всех строк разрешено только в тестовой БД`,
        );
    }

    await sequelize.query('TRUNCATE TABLE equipment CASCADE');
}

export const equipmentRepository = { findPage, findById, findBySerial, create, update, remove, reset };
