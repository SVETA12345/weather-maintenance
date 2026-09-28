import { Op } from 'sequelize';
import { models, sequelize } from '../models/sequelize.js';

const { MaintenanceRequest, RequestAssignee, RequestStatusHistory, Technician } = models;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOSED_STATUSES = ['done', 'rejected'];
const SYSTEM_ACTOR = 'api';

const ASSIGNEE_INCLUDE = [
    {
        model: RequestAssignee,
        as: 'assignees',
        include: [{ model: Technician, as: 'technician', attributes: ['id', 'full_name'] }],
        order: [['created_at', 'ASC']],
    },
];

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

function toAssigneeApi(row) {
    return {
        technicianId: row.technician_id,
        fullName: row.technician?.full_name ?? null,
        role: row.role,
    };
}

function toHistoryApi(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        oldStatus: row.old_status,
        newStatus: row.new_status,
        author: row.author,
        comment: row.comment,
        createdAt: toIso(row.created_at),
    };
}

function toApi(row) {
    return {
        id: row.id,
        equipmentId: row.equipment_id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        plannedAt: toIso(row.planned_at),
        plannedLaborHours: row.planned_labor_hours === null ? null : Number(row.planned_labor_hours),
        status: row.status,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        assignees: (row.assignees ?? []).map(toAssigneeApi),
    };
}

function toColumns({ title, description, priority, plannedAt, plannedLaborHours, status }) {
    const columns = {};
    if (title !== undefined) columns.title = title;
    if (description !== undefined) columns.description = description;
    if (priority !== undefined) columns.priority = priority;
    if (plannedAt !== undefined) columns.planned_at = plannedAt;
    if (plannedLaborHours !== undefined) columns.planned_labor_hours = plannedLaborHours;
    if (status !== undefined) columns.status = status;
    return columns;
}

const SORT_COLUMNS = {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    plannedAt: 'planned_at',
    title: 'title',
    priority: 'priority',
    status: 'status',
};

function buildWhere({ status, priority, equipmentId, from, to } = {}) {
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (equipmentId) where.equipment_id = equipmentId;

    const createdAt = {};
    if (from) createdAt[Op.gte] = new Date(from);
    if (to) createdAt[Op.lte] = new Date(to);
    // Object.keys не видит символьные ключи Op.gte/Op.lte, поэтому наличие условия
    // проверяется по самому факту заданной границы.
    if (from || to) where.created_at = createdAt;

    return where;
}

// Фильтрация, сортировка и пагинация выполняются в базе: в память попадает
// только страница строк, а total считается тем же where отдельным COUNT.
async function findPage(filters, { limit, offset }) {
    const where = buildWhere(filters);
    const column = SORT_COLUMNS[filters.sortBy];
    const order = column ? [[column, filters.order === 'desc' ? 'DESC' : 'ASC']] : [['created_at', 'ASC']];

    const [rows, counted] = await Promise.all([
        MaintenanceRequest.findAll({ where, include: ASSIGNEE_INCLUDE, order, limit, offset }),
        MaintenanceRequest.count({ where }),
    ]);
    return { rows: rows.map(toApi), total: counted };
}

async function findById(id, options = {}) {
    if (!UUID_RE.test(String(id))) return null;
    const row = await MaintenanceRequest.findByPk(id, { include: ASSIGNEE_INCLUDE, ...options });
    return row ? toApi(row) : null;
}

async function findByEquipmentPage(equipmentId, { limit, offset }) {
    if (!UUID_RE.test(String(equipmentId))) return { rows: [], total: 0 };

    const where = { equipment_id: equipmentId };
    const [rows, total] = await Promise.all([
        MaintenanceRequest.findAll({
            where,
            include: ASSIGNEE_INCLUDE,
            order: [['created_at', 'ASC']],
            limit,
            offset,
        }),
        MaintenanceRequest.count({ where }),
    ]);
    return { rows: rows.map(toApi), total };
}

async function findOpenByEquipmentId(equipmentId) {
    if (!UUID_RE.test(String(equipmentId))) return [];
    const rows = await MaintenanceRequest.findAll({
        where: { equipment_id: equipmentId, status: { [Op.notIn]: CLOSED_STATUSES } },
        include: ASSIGNEE_INCLUDE,
        order: [['created_at', 'ASC']],
    });
    return rows.map(toApi);
}

async function create(data) {
    const row = await MaintenanceRequest.create({
        equipment_id: data.equipmentId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        status: data.status ?? 'new',
        planned_at: data.plannedAt ?? null,
        planned_labor_hours: data.plannedLaborHours ?? null,
    });
    return findById(row.id);
}

async function update(id, patch) {
    if (!UUID_RE.test(String(id))) return null;

    const values = toColumns(patch ?? {});
    if (Object.keys(values).length === 0) return findById(id);

    const [affected] = await MaintenanceRequest.update(values, {
        where: { id },
        returning: true,
    });
    if (affected === 0) return null;
    return findById(id);
}

async function findExistingTechnicianIds(ids) {
    if (ids.length === 0) return [];

    const rows = await Technician.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id'],
    });
    return rows.map((row) => row.id);
}

async function setStatus(id, newStatus, { author, comment = null } = {}) {
    if (!UUID_RE.test(String(id))) return null;

    return sequelize.transaction(async (transaction) => {
        const [row] = await MaintenanceRequest.findAll({
            where: { id },
            attributes: ['id', 'status'],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!row) return null;

        if (row.status !== newStatus) {
            await MaintenanceRequest.update({ status: newStatus }, { where: { id }, transaction });
            await RequestStatusHistory.create(
                {
                    request_id: id,
                    old_status: row.status,
                    new_status: newStatus,
                    author: author ?? SYSTEM_ACTOR,
                    comment,
                },
                { transaction },
            );
        }


        return findById(id, { transaction });
    });
}

async function findStatusHistory(requestId, { limit, offset }) {
    if (!UUID_RE.test(String(requestId))) return { rows: [], total: 0 };

    const where = { request_id: requestId };
    const [rows, total] = await Promise.all([
        RequestStatusHistory.findAll({ where, order: [['created_at', 'ASC']], limit, offset }),
        RequestStatusHistory.count({ where }),
    ]);
    return { rows: rows.map(toHistoryApi), total };
}

// Замена бригады целиком: прежние назначения снимаются, новые добавляются.
// Проверка правила бригады выполняется внутри транзакции, поэтому нарушение
// (не ровно один lead) откатывает и удаление, и вставку.
async function replaceAssignees(requestId, assignees, { validateCrew }) {
    if (!UUID_RE.test(String(requestId))) return [];

    return sequelize.transaction(async (transaction) => {
        await MaintenanceRequest.findAll({
            where: { id: requestId },
            attributes: ['id'],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        await RequestAssignee.destroy({ where: { request_id: requestId }, transaction });

        await RequestAssignee.bulkCreate(
            assignees.map(({ technicianId, role }) => ({
                request_id: requestId,
                technician_id: technicianId,
                role,
            })),
            { transaction, validate: true },
        );

        validateCrew(assignees);

        const rows = await RequestAssignee.findAll({
            where: { request_id: requestId },
            include: [{ model: Technician, as: 'technician', attributes: ['id', 'full_name'] }],
            order: [['created_at', 'ASC']],
            transaction,
        });
        return rows.map(toAssigneeApi);
    });
}

async function removeAssignee(requestId, technicianId) {
    if (!UUID_RE.test(String(requestId)) || !UUID_RE.test(String(technicianId))) return false;

    const removed = await RequestAssignee.destroy({
        where: { request_id: requestId, technician_id: technicianId },
    });
    return removed > 0;
}

async function remove(id) {
    if (!UUID_RE.test(String(id))) return false;
    return (await MaintenanceRequest.destroy({ where: { id } })) > 0;
}

async function reset() {
    const database = sequelize.getDatabaseName();
    if (!/test/i.test(database)) {
        throw new Error(
            `requestsRepository.reset() отключён для базы "${database}": удаление всех строк разрешено только в тестовой БД`,
        );
    }

    await sequelize.query('TRUNCATE TABLE maintenance_requests CASCADE');
}

export const requestsRepository = {
    findPage,
    findById,
    findByEquipmentPage,
    findOpenByEquipmentId,
    create,
    reset,
    update,
    remove,
    setStatus,
    findStatusHistory,
    replaceAssignees,
    removeAssignee,
    findExistingTechnicianIds,
};
