'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_equipment_type" AS ENUM ('turbine', 'inverter', 'sensor', 'substation')`
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_equipment_status" AS ENUM ('operational', 'maintenance', 'fault', 'decommissioned')`
    );


    await queryInterface.createTable('equipment', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      site_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'sites',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('turbine', 'inverter', 'sensor', 'substation'),
        allowNull: false,
      },
      serial_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: Sequelize.ENUM('operational', 'maintenance', 'fault', 'decommissioned'),
        allowNull: false,
        defaultValue: 'operational',
      },
      installed_at: {
        type: Sequelize.DATE,
        allowNull: false,
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
    await queryInterface.dropTable('equipment');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_equipment_type"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_equipment_status"');
  }
};
