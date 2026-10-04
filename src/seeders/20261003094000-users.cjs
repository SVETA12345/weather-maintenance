'use strict';

const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    const now = new Date();

    // Демонстрационные учётные записи. Пароль задаётся переменными окружения,
    // чтобы в сид нельзя было случайно задеплоить заранее известный пароль.
    const users = [
      {
        id: 'dddd1111-0000-0000-0000-000000000001',
        email: 'admin@example.com',
        role: 'admin',
        technician_id: null,
        password: process.env.SEED_ADMIN_PASSWORD || 'admin-demo-2026',
      },
      {
        id: 'dddd1111-0000-0000-0000-000000000002',
        email: 'tech@example.com',
        role: 'technician',
        technician_id: 'cccc1111-0000-0000-0000-000000000001',
        password: process.env.SEED_TECH_PASSWORD || 'tech-demo-2026',
      },
      {
        id: 'dddd1111-0000-0000-0000-000000000003',
        email: 'viewer@example.com',
        role: 'viewer',
        technician_id: null,
        password: process.env.SEED_VIEWER_PASSWORD || 'viewer-demo-2026',
      },
    ];

    await queryInterface.bulkInsert(
      'users',
      users.map(({ password, ...rest }) => ({
        ...rest,
        password_hash: bcrypt.hashSync(password, rounds),
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: ['admin@example.com', 'tech@example.com', 'viewer@example.com'],
    });
  },
};