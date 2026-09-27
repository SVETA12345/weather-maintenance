'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('technicians', [
      {
        id: 'cccc1111-0000-0000-0000-000000000001',
        full_name: 'Иванов Иван Иванович',
        specialization: 'Электрик',
        personnel_number: 'EMP-001',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cccc1111-0000-0000-0000-000000000002',
        full_name: 'Петров Пётр Петрович',
        specialization: 'Механик',
        personnel_number: 'EMP-002',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cccc1111-0000-0000-0000-000000000003',
        full_name: 'Сидорова Анна Сергеевна',
        specialization: 'Инженер-электроник',
        personnel_number: 'EMP-003',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cccc1111-0000-0000-0000-000000000004',
        full_name: 'Кузнецов Дмитрий Олегович',
        specialization: 'Высотник',
        personnel_number: 'EMP-004',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cccc1111-0000-0000-0000-000000000005',
        full_name: 'Смирнов Алексей Викторович',
        specialization: 'Наладчик КИПиА',
        personnel_number: 'EMP-005',
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('technicians', {
      personnel_number: ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005'],
    });
  }
};
