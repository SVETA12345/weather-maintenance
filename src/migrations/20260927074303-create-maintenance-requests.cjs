'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_request_priority" AS ENUM ('low', 'medium', 'high', 'critical')`
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_request_status" AS ENUM ('new', 'in_progress', 'done', 'rejected')`
    );

    await queryInterface.createTable('maintenance_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      equipment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'equipment',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING(2000),
        allowNull: true,
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('new', 'in_progress', 'done', 'rejected'),
        allowNull: false,
        defaultValue: 'new',
      },
      planned_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('maintenance_requests');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_request_priority"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_request_status"');
  }
};
