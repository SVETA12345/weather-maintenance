'use strict';

const CONSTRAINT = 'maintenance_requests_equipment_id_fkey';
const RULES = {
  CASCADE: { sql: 'CASCADE', code: 'c' },
  RESTRICT: { sql: 'RESTRICT', code: 'r' },
};

async function currentRule(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT confdeltype FROM pg_constraint WHERE conname = :name`,
    { replacements: { name: CONSTRAINT } }
  );
  return rows[0]?.confdeltype ?? null;
}

async function setRule(queryInterface, ruleName) {
  const rule = RULES[ruleName];
  const previous = await currentRule(queryInterface);
  if (previous === rule.code) return false;

  if (previous !== null) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "maintenance_requests" DROP CONSTRAINT "${CONSTRAINT}"`
    );
  }
  await queryInterface.sequelize.query(
    `ALTER TABLE "maintenance_requests" ADD CONSTRAINT "${CONSTRAINT}" ` +
    `FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ` +
    `ON DELETE ${rule.sql} ON UPDATE CASCADE`
  );
  return true;
}


module.exports = {
  async up(queryInterface) {
    const changed = await setRule(queryInterface, 'CASCADE');
    console.log(
      changed
        ? 'maintenance_requests.equipment_id: ON DELETE RESTRICT -> CASCADE'
        : 'maintenance_requests.equipment_id: ON DELETE CASCADE уже установлен'
    );
  },

  async down(queryInterface) {
    const changed = await setRule(queryInterface, 'RESTRICT');
    console.log(
      changed
        ? 'maintenance_requests.equipment_id: ON DELETE CASCADE -> RESTRICT'
        : 'maintenance_requests.equipment_id: ON DELETE RESTRICT уже установлен'
    );
  },
};
