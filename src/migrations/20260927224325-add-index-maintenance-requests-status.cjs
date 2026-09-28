'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex('maintenance_requests', ['status'], {
      name: 'idx_maintenance_requests_status',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('maintenance_requests', 'idx_maintenance_requests_status');
  }
};
