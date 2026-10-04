import { Op } from 'sequelize';
import { models } from '../models/sequelize.js';

const { Technician } = models;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SORT_COLUMNS = {
    fullName: 'full_name',
    specialization: 'specialization',
    personnelNumber: 'personnel_number',
    createdAt: 'created_at',
};

const SEARCH_COLUMNS = ['full_name', 'personnel_number'];

// Спецсимволы LIKE экранируются, иначе ввод `%` или `_` превращался бы
// в шаблон, совпадающий с любой строкой.
function escapeLike(value) {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toApi(row) {
    if (!row) return null;
    return {
        id: row.id,
        fullName: row.full_name,
        specialization: row.specialization,
        personnelNumber: row.personnel_number,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
}

function buildWhere({ specialization, search } = {}) {
    const where = {};
    if (specialization) where.specialization = specialization;
    if (search) {
        const pattern = `%${escapeLike(search)}%`;
        where[Op.or] = SEARCH_COLUMNS.map((column) => ({ [column]: { [Op.iLike]: pattern } }));
    }
    return where;
}

// Специалисты возвращаются только для чтения: создаются и меняются они сидами
// и администратором напрямую в БД (в ТЗ «управление специалистами» — операция админа).
export const techniciansRepository = {
    async findPage(filters, { limit, offset }) {
        const where = buildWhere(filters);
        const column = SORT_COLUMNS[filters.sortBy];
        const order = column ? [[column, filters.order === 'desc' ? 'DESC' : 'ASC']] : [['full_name', 'ASC']];

        const [rows, total] = await Promise.all([
            Technician.findAll({ where, order, limit, offset }),
            Technician.count({ where }),
        ]);
        return { rows: rows.map(toApi), total };
    },

    async findById(id) {
        if (!UUID_PATTERN.test(String(id))) return null;
        return toApi(await Technician.findByPk(id));
    },
};

export { toApi };