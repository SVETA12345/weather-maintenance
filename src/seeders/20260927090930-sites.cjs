'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('sites', [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Ветропарк Северный',
        code: 'WP-NORTH',
        region: 'Мурманская область',
        lat: 68.9585,
        lon: 33.0827,
        created_at: now,
        updated_at: now,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Ветропарк Южный',
        code: 'WP-SOUTH',
        region: 'Ростовская область',
        lat: 47.2225,
        lon: 39.7188,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('sites', {
      code: ['WP-NORTH', 'WP-SOUTH'],
    });
  }
};
