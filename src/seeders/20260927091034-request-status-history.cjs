'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = [];

    for (let r = 1; r <= 20; r++) {
      const requestId = `dddd1111-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`;

      // Первая запись: null → new (создание)
      rows.push({
        id: `ffff1111-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`,
        request_id: requestId,
        old_status: null,
        new_status: 'new',
        author: 'system',
        comment: 'Заявка создана',
        created_at: new Date(now.getTime() - r * 24 * 60 * 60 * 1000),
      });
    }

    // Для заявок 1..10 — переход new → in_progress
    for (let r = 1; r <= 10; r++) {
      const requestId = `dddd1111-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`;
      rows.push({
        id: `ffff2222-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`,
        request_id: requestId,
        old_status: 'new',
        new_status: 'in_progress',
        author: 'Иванов И.И.',
        comment: 'Взято в работу',
        created_at: new Date(now.getTime() - (r - 1) * 24 * 60 * 60 * 1000),
      });
    }

    // Для заявок 1..5 — переход in_progress → done
    for (let r = 1; r <= 5; r++) {
      const requestId = `dddd1111-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`;
      rows.push({
        id: `ffff3333-0000-0000-0000-0000000000${String(r).padStart(2, '0')}`,
        request_id: requestId,
        old_status: 'in_progress',
        new_status: 'done',
        author: 'Петров П.П.',
        comment: 'Работы завершены',
        created_at: new Date(now.getTime() - (r - 2) * 24 * 60 * 60 * 1000),
      });
    }

    await queryInterface.bulkInsert('request_status_history', rows);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('request_status_history', null, {});
  }
};
