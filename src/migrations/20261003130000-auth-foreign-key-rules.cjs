'use strict';

// sequelize-cli не применяет onDelete/onUpdate из объекта references при createTable,
// поэтому правила для внешних ключей аутентификации выставляются отдельной миграцией
// (та же конвенция, что у maintenance_requests.equipment_id).

const RULES = {
  CASCADE: { sql: 'CASCADE', code: 'c' },
  'SET NULL': { sql: 'SET NULL', code: 'n' },
};

const CONSTRAINTS = [
  {
    name: 'refresh_tokens_user_id_fkey',
    table: 'refresh_tokens',
    column: 'user_id',
    refTable: 'users',
    rule: 'CASCADE',
  },
  {
    name: 'users_technician_id_fkey',
    table: 'users',
    column: 'technician_id',
    refTable: 'technicians',
    rule: 'SET NULL',
  },
];

async function currentDeltype(queryInterface, name) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT confdeltype FROM pg_constraint WHERE conname = :name`,
    { replacements: { name } },
  );
  return rows[0]?.confdeltype ?? null;
}

async function applyRule(queryInterface, constraint) {
  const rule = RULES[constraint.rule];
  const previous = await currentDeltype(queryInterface, constraint.name);
  if (previous === rule.code) return false;

  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM pg_constraint WHERE conname = :name`,
    { replacements: { name: constraint.name } },
  );
  if (rows.length > 0) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "${constraint.table}" DROP CONSTRAINT "${constraint.name}"`,
    );
  }

  await queryInterface.sequelize.query(
    `ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" ` +
      `FOREIGN KEY ("${constraint.column}") REFERENCES "${constraint.refTable}"("id") ` +
      `ON DELETE ${rule.sql} ON UPDATE CASCADE`,
  );
  return true;
}

module.exports = {
  async up(queryInterface) {
    for (const constraint of CONSTRAINTS) {
      const changed = await applyRule(queryInterface, constraint);
      console.log(
        changed
          ? `${constraint.table}.${constraint.column}: ON DELETE → ${constraint.rule}`
          : `${constraint.table}.${constraint.column}: ON DELETE ${constraint.rule} уже установлен`,
      );
    }
  },

  async down(queryInterface) {
    for (const constraint of CONSTRAINTS) {
      const rule = RULES[constraint.rule];
      await queryInterface.sequelize.query(
        `ALTER TABLE "${constraint.table}" DROP CONSTRAINT "${constraint.name}"`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" ` +
          `FOREIGN KEY ("${constraint.column}") REFERENCES "${constraint.refTable}"("id")`,
      );
      console.log(`${constraint.table}.${constraint.column}: ON DELETE ${rule.sql} → без правила`);
    }
  },
};