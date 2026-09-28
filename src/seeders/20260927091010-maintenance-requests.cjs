'use strict';

const EQUIPMENT_IDS = [
  'aaaa1111-0000-0000-0000-000000000001',
  'aaaa1111-0000-0000-0000-000000000002',
  'aaaa1111-0000-0000-0000-000000000003',
  'aaaa2222-0000-0000-0000-000000000004',
  'aaaa2222-0000-0000-0000-000000000005',
  'aaaa2222-0000-0000-0000-000000000006',
];

const STATUSES = ['new', 'in_progress', 'done', 'rejected'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = [];

    for (let i = 1; i <= 20; i++) {
      const created = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // i дней назад
      const updated = new Date(created.getTime() + 60 * 60 * 1000);      // +1 час

      rows.push({
        id: `dddd1111-0000-0000-0000-0000000000${pad(i)}`,
        equipment_id: EQUIPMENT_IDS[i % EQUIPMENT_IDS.length],
        title: `Плановая заявка №${i}`,
        description: `Описание работ по заявке №${i}. Требуется диагностика и обслуживание.`,
        priority: PRIORITIES[i % PRIORITIES.length],
        status: STATUSES[i % STATUSES.length],
        planned_at: new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000),
        planned_labor_hours: 2 + (i % 5) * 1.5,
        created_at: created,
        updated_at: updated,
      });
    }

    await queryInterface.bulkInsert('maintenance_requests', rows);
  },

  async down(queryInterface, Sequelize) {
    const ids = Array.from({ length: 20 }, (_, i) =>
      `dddd1111-0000-0000-0000-0000000000${pad(i + 1)}`
    );
    await queryInterface.bulkDelete('maintenance_requests', { id: ids });
  }
};
