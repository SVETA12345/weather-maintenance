'use strict';

// Полнотекстовый поиск по оборудованию через pg_trgm: GIN-индексы ускоряют
// ILIKE по name и serial_number, а сам поиск выполняется в базе.
const TRGM_GIST = 'gin_trgm_ops';
const INDEXES = [
    { name: 'equipment_name_trgm_idx', table: 'equipment', columns: ['name'] },
    { name: 'equipment_serial_number_trgm_idx', table: 'equipment', columns: ['serial_number'] },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Расширение нужно и при откате всех миграций: в down других нет,
    // поэтому CREATE EXTENSION IF NOT EXISTS делаем отсюда.
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    for (const index of INDEXES) {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" USING gin (${index.columns
          .map((column) => `"${column}" ${TRGM_GIST}`)
          .join(', ')})`
      );
    }
  },

  async down(queryInterface) {
    for (const index of [...INDEXES].reverse()) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${index.name}"`);
    }
    // Расширение удаляем только если его больше нигде не используют.
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS total
         FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexdef ~ 'gin_trgm_ops'`
    );
    if (rows[0].total === 0) {
      await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS pg_trgm');
    }
  },
};
