'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const COLLECTION_RELPATH = path.join('docs', 'postman', 'collection.json');
const SITE_CODE_PREFIX = 'SRC-JSON-';
const SITE_CODE_MAX_LENGTH = 20;
const MISSING_VALUE = 'не указано в collection.json';
const HISTORY_AUTHOR = 'migrate-from-json';
const HISTORY_STEP_MINUTES = 60;
const NEGATIVE_SCENARIO = /(некоррект|дубл|несуществ|недопустим|не найден|rate limit)/i;
const PLACEHOLDER = /^\{\{[^}]+\}\}$/;
const EQUIPMENT_TYPES = ['turbine', 'inverter', 'sensor', 'substation'];
const EQUIPMENT_STATUSES = ['operational', 'maintenance', 'fault', 'decommissioned'];
const REQUEST_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const REQUEST_STATUSES = ['new', 'in_progress', 'done', 'rejected'];
const PATCHABLE_EQUIPMENT_COLUMNS = ['name', 'status'];
const PATCHABLE_REQUEST_COLUMNS = ['title', 'description', 'priority', 'planned_at'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dataset = buildDataset(readCollection());

    if (!dataset.sites.length && !dataset.equipment.length && !dataset.requests.length) {
      console.log('migrate-from-json: в collection.json нет данных для переноса, миграция пропущена');
      return;
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const site of dataset.sites) {
        await insertSite(queryInterface, transaction, site);
      }

      for (const equipment of dataset.equipment) {
        await insertEquipment(queryInterface, transaction, equipment);
      }

      for (const request of dataset.requests) {
        await insertRequest(queryInterface, transaction, request);
      }

      for (const step of dataset.history) {
        await insertStatusHistory(queryInterface, transaction, step);
      }
    });

    console.log(
      `migrate-from-json: перенесено площадок=${dataset.sites.length}, ` +
      `оборудования=${dataset.equipment.length}, заявок=${dataset.requests.length}, ` +
      `событий истории=${dataset.history.length}`
    );
    for (const notice of dataset.notices) {
      console.log(`migrate-from-json: ${notice}`);
    }
  },

  async down(queryInterface) {
    const removed = await queryInterface.sequelize.transaction(async (transaction) => {
      const requests = await queryInterface.sequelize.query(
        `WITH imported AS (
           SELECT r.id
           FROM maintenance_requests r
           JOIN equipment e ON e.id = r.equipment_id
           JOIN sites s ON s.id = e.site_id
           WHERE s.code LIKE '${SITE_CODE_PREFIX}%'
         )
         DELETE FROM maintenance_requests r USING imported WHERE r.id = imported.id
         RETURNING r.id`,
        { transaction }
      );

      const equipment = await queryInterface.sequelize.query(
        `WITH imported AS (
           SELECT e.id
           FROM equipment e
           JOIN sites s ON s.id = e.site_id
           WHERE s.code LIKE '${SITE_CODE_PREFIX}%'
         )
         DELETE FROM equipment e USING imported WHERE e.id = imported.id
         RETURNING e.id`,
        { transaction }
      );

      const sites = await queryInterface.sequelize.query(
        `DELETE FROM sites WHERE code LIKE '${SITE_CODE_PREFIX}%' RETURNING id`,
        { transaction }
      );

      return { requests: requests[0].length, equipment: equipment[0].length, sites: sites[0].length };
    });

    console.log(
      `migrate-from-json: откат удалил площадок=${removed.sites}, ` +
      `оборудования=${removed.equipment}, заявок=${removed.requests}`
    );
  },
};

function readCollection() {
  const candidates = [
    path.resolve(__dirname, '..', '..', COLLECTION_RELPATH),
    path.resolve(process.cwd(), COLLECTION_RELPATH),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));

  if (!file) {
    throw new Error(`migrate-from-json: файл ${COLLECTION_RELPATH} не найден (искали: ${candidates.join('; ')})`);
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function flattenRequests(items, acc = []) {
  for (const item of items ?? []) {
    if (item.item) flattenRequests(item.item, acc);
    else acc.push(item);
  }

  return acc;
}

function urlPath(entry) {
  const url = entry?.request?.url;
  if (!url) return '';
  return typeof url === 'string' ? url : url.raw ?? '';
}

function parseBody(entry) {
  const raw = entry?.request?.body?.raw;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isNegativeScenario(entry) {
  return NEGATIVE_SCENARIO.test(entry.name ?? '');
}

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER.test(value.trim());
}

function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`migrate-from-json: ${field} = ${JSON.stringify(value)} не входит в ${allowed.join('|')}`);
  }

  return value;
}

function applyPatch(target, patch, allowedColumns) {
  for (const column of allowedColumns) {
    if (patch?.[column] !== undefined && patch[column] !== null) target[column] = patch[column];
  }
}

function buildSiteCode(serialNumber) {
  return `${SITE_CODE_PREFIX}${serialNumber}`.slice(0, SITE_CODE_MAX_LENGTH);
}

function buildDataset(collection) {
  const entries = flattenRequests(collection.item);
  const notices = [];

  const equipmentCreates = entries
    .filter((e) => e.request?.method === 'POST' && /\/api\/equipment\/?$/.test(urlPath(e)) && !isNegativeScenario(e))
    .map((e) => ({ title: e.name, body: parseBody(e) }))
    .filter((e) => e.body?.serialNumber && e.body?.name && e.body?.type);

  const equipmentPatch = parseBody(
    entries.find((e) => e.request?.method === 'PATCH' && /\/api\/equipment\/\{\{[^}]+\}\}$/.test(urlPath(e)) && !isNegativeScenario(e))
  );

  const requestCreates = entries
    .filter((e) => e.request?.method === 'POST' && /\/api\/requests\/?$/.test(urlPath(e)) && !isNegativeScenario(e))
    .map((e) => ({ title: e.name, body: parseBody(e) }))
    .filter((r) => r.body?.title && r.body?.priority);

  const requestPatch = parseBody(
    entries.find((e) => e.request?.method === 'PATCH' && /\/api\/requests\/\{\{[^}]+\}\}$/.test(urlPath(e)) && !isNegativeScenario(e))
  );

  // PATCH /api/requests/{{requestId}}/status идёт по порядку в коллекции и задаёт
  // цепочку переходов new → ... для перенесённых заявок.
  const transitions = entries
    .filter((e) => e.request?.method === 'PATCH' && /\/api\/requests\/\{\{[^}]+\}\}\/status$/.test(urlPath(e)) && !isNegativeScenario(e))
    .map((e) => ({ name: e.name, status: assertOneOf(parseBody(e)?.status, REQUEST_STATUSES, 'maintenance_requests.status') }));

  const siteByLocation = new Map();
  const sites = [];

  for (const create of equipmentCreates) {
    const { lat, lon } = create.body.location ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`migrate-from-json: у оборудования "${create.title}" нет location.lat/lon, а sites.lat/lon — NOT NULL`);
    }

    const key = `${lat},${lon}`;
    if (siteByLocation.has(key)) continue;

    const site = {
      id: randomUUID(),
      code: buildSiteCode(create.body.serialNumber),
      name: `Площадка (импорт из Postman) ${create.body.serialNumber}`,
      region: MISSING_VALUE,
      lat,
      lon,
    };
    siteByLocation.set(key, site);
    sites.push(site);
  }

  const equipment = equipmentCreates.map((create) => {
    const record = {
      id: randomUUID(),
      site_id: siteByLocation.get(`${create.body.location.lat},${create.body.location.lon}`).id,
      name: create.body.name,
      type: assertOneOf(create.body.type, EQUIPMENT_TYPES, 'equipment.type'),
      serial_number: create.body.serialNumber,
      status: 'operational',
      installed_at: create.body.installedAt ?? null,
    };

    applyPatch(record, equipmentPatch, PATCHABLE_EQUIPMENT_COLUMNS);
    record.status = assertOneOf(record.status, EQUIPMENT_STATUSES, 'equipment.status');

    if (!record.installed_at) {
      throw new Error(`migrate-from-json: у оборудования "${create.title}" нет installedAt, а equipment.installed_at — NOT NULL`);
    }

    return record;
  });

  const bySerial = new Map(equipment.map((e) => [e.serial_number, e]));
  const requests = [];
  const history = [];

  for (const create of requestCreates) {
    const { equipmentId } = create.body;
    let target = isPlaceholder(equipmentId) ? equipment[0] : bySerial.get(equipmentId);

    if (!target) {
      notices.push(`заявка "${create.title}" пропущена: equipmentId=${equipmentId} не найден в equipment`);
      continue;
    }

    if (isPlaceholder(equipmentId) && equipment.length > 1) {
      notices.push(`заявка "${create.title}": equipmentId=${equipmentId} — плейсхолдер, взят первый объект (${target.serial_number})`);
    }

    const record = {
      id: randomUUID(),
      equipment_id: target.id,
      title: create.title,
      description: null,
      priority: assertOneOf(create.body.priority, REQUEST_PRIORITIES, 'maintenance_requests.priority'),
      status: 'new',
      planned_at: create.body.plannedAt ?? null,
    };
    applyPatch(record, requestPatch, PATCHABLE_REQUEST_COLUMNS);
    record.priority = assertOneOf(record.priority, REQUEST_PRIORITIES, 'maintenance_requests.priority');
    requests.push(record);

    const chain = [{ old: null, next: 'new', name: create.title }];
    let current = 'new';
    for (const transition of transitions) {
      chain.push({ old: current, next: transition.status, name: transition.name });
      current = transition.status;
    }
    record.status = assertOneOf(current, REQUEST_STATUSES, 'maintenance_requests.status');

    chain.forEach((step, index) => {
      history.push({
        id: randomUUID(),
        request_id: record.id,
        old_status: step.old,
        new_status: step.next,
        comment: step.name.slice(0, 500),
        step_back: chain.length - 1 - index,
      });
    });
  }
  if (!equipment.length) notices.push('оборудование не найдено: в collection.json нет позитивного POST /api/equipment');
  if (!requests.length) notices.push('заявки не найдены: в collection.json нет позитивного POST /api/requests');
  notices.push('equipment_passports, technicians, request_assignees: в collection.json таких данных нет — таблицы не наполняются');

  return { sites, equipment, requests, history, notices };
}

async function insertSite(queryInterface, transaction, site) {
  await queryInterface.sequelize.query(
    `INSERT INTO sites (id, name, code, region, lat, lon, created_at, updated_at)
     VALUES (CAST(:id AS uuid), :name, :code, :region, :lat, :lon, NOW(), NOW())`,
    { replacements: site, transaction }
  );
}

async function insertEquipment(queryInterface, transaction, equipment) {
  await queryInterface.sequelize.query(
    `INSERT INTO equipment (id, site_id, name, type, serial_number, status, installed_at, created_at, updated_at)
     VALUES (CAST(:id AS uuid), CAST(:site_id AS uuid), :name, :type, :serial_number, :status,
             CAST(:installed_at AS timestamptz), NOW(), NOW())`,
    { replacements: equipment, transaction }
  );
}

async function insertRequest(queryInterface, transaction, request) {
  await queryInterface.sequelize.query(
    `INSERT INTO maintenance_requests (id, equipment_id, title, description, priority, status, planned_at, created_at, updated_at)
     VALUES (CAST(:id AS uuid), CAST(:equipment_id AS uuid), :title, :description, :priority, :status,
             CAST(:planned_at AS timestamptz), NOW(), NOW())`,
    { replacements: request, transaction }
  );
}

async function insertStatusHistory(queryInterface, transaction, step) {
  const createdAt = `NOW() - (INTERVAL '${HISTORY_STEP_MINUTES} minute' * :step_back)`;

  await queryInterface.sequelize.query(
    `INSERT INTO request_status_history (id, request_id, old_status, new_status, author, comment, created_at)
     VALUES (CAST(:id AS uuid), CAST(:request_id AS uuid), :old_status, :new_status, :author, :comment, ${createdAt})`,
    { replacements: { ...step, author: HISTORY_AUTHOR }, transaction }
  );
}
