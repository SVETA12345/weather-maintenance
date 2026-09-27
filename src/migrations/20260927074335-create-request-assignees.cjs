'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_assignee_role" AS ENUM ('lead', 'member')`
    );

    await queryInterface.createTable('request_assignees', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'maintenance_requests',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      technician_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'technicians',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      role: {
        type: Sequelize.ENUM('lead', 'member'),
        allowNull: false,
      },
      hours: {
        type: Sequelize.DECIMAL(6, 2),
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

    // Составной UNIQUE: один специалист не может быть назначен на одну заявку дважды
    await queryInterface.addConstraint('request_assignees', {
      fields: ['request_id', 'technician_id'],
      type: 'unique',
      name: 'uq_request_assignees_request_technician',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('request_assignees');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_assignee_role"');
  }
};
