'use strict';
const TECH_IDS = [
  'cccc1111-0000-0000-0000-000000000001',
  'cccc1111-0000-0000-0000-000000000002',
  'cccc1111-0000-0000-0000-000000000003',
  'cccc1111-0000-0000-0000-000000000004',
  'cccc1111-0000-0000-0000-000000000005',
];
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = [];

    // Назначаем бригады на заявки 1..10 (в статусах in_progress и done)
    for (let r = 1; r <= 10; r++) {
      const requestId = `dddd1111-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`;

      // Ровно один lead
      rows.push({
        id: `eeee1111-0000-0000-0000-0000000000${String(r * 3 - 2).padStart(2, '0')}`,
        request_id: requestId,
        technician_id: TECH_IDS[(r - 1) % TECH_IDS.length],
        role: 'lead',
        hours: 8,
        created_at: now,
        updated_at: now,
      });

      // 1–2 member
      rows.push({
        id: `eeee1111-0000-0000-0000-0000000000${String(r * 3 - 1).padStart(2, '0')}`,
        request_id: requestId,
        technician_id: TECH_IDS[r % TECH_IDS.length],
        role: 'member',
        hours: 6,
        created_at: now,
        updated_at: now,
      });
    }

    await queryInterface.bulkInsert('request_assignees', rows);
  },

  async down(queryInterface, Sequelize) {
    const ids = [];
    for (let r = 1; r <= 10; r++) {
      ids.push(`eeee1111-0000-0000-0000-0000000000${String(r * 3 - 2).padStart(2, '0')}`);
      ids.push(`eeee1111-0000-0000-0000-0000000000${String(r * 3 - 1).padStart(2, '0')}`);
    }
    await queryInterface.bulkDelete('request_assignees', { id: ids });
  }
};
