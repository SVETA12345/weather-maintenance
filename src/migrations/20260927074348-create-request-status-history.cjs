'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('request_status_history', {
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
      old_status: {
        type: Sequelize.STRING(20),
        allowNull: true, // null при первом создании
      },
      new_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      author: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      comment: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Append-only: нет updated_at, нет удаления через приложение
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('request_status_history');
  }
};
