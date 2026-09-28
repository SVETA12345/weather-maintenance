'use strict';

/**
 * Отчёт по нагрузке возвращает суммарные плановые трудозатраты по каждой единице
 * оборудования, поэтому планируемые часы хранятся в самой заявке.
 * Значение опциональное: NULL означает, что трудозатраты не планировались,
 * и в отчёте такая заявка даёт ноль.
 */
const COLUMN = 'planned_labor_hours';

async function columnExists(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'maintenance_requests' AND column_name = :column`,
    { replacements: { column: COLUMN } }
  );
  return rows.length > 0;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (await columnExists(queryInterface)) return;

    await queryInterface.sequelize.query(
      `ALTER TABLE "maintenance_requests"
         ADD COLUMN "${COLUMN}" NUMERIC(8, 2) NULL
         CHECK ("${COLUMN}" IS NULL OR "${COLUMN}" >= 0)`
    );
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface))) return;

    await queryInterface.sequelize.query(
      `ALTER TABLE "maintenance_requests" DROP COLUMN "${COLUMN}"`
    );
  },
};
