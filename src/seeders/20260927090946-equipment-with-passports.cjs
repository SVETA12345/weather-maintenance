'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const equipment = [
      {
        id: 'aaaa1111-0000-0000-0000-000000000001',
        site_id: '11111111-1111-1111-1111-111111111111',
        name: 'Турбина Т-01',
        type: 'turbine',
        serial_number: 'TRB-0001',
        status: 'operational',
        installed_at: new Date('2021-05-10'),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'aaaa1111-0000-0000-0000-000000000002',
        site_id: '11111111-1111-1111-1111-111111111111',
        name: 'Инвертор И-01',
        type: 'inverter',
        serial_number: 'INV-0001',
        status: 'maintenance',
        installed_at: new Date('2022-03-15'),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'aaaa1111-0000-0000-0000-000000000003',
        site_id: '11111111-1111-1111-1111-111111111111',
        name: 'Датчик Д-01',
        type: 'sensor',
        serial_number: 'SNS-0001',
        status: 'fault',
        installed_at: new Date('2023-01-20'),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'aaaa2222-0000-0000-0000-000000000004',
        site_id: '22222222-2222-2222-2222-222222222222',
        name: 'Турбина Т-02',
        type: 'turbine',
        serial_number: 'TRB-0002',
        status: 'operational',
        installed_at: new Date('2020-11-05'),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'aaaa2222-0000-0000-0000-000000000005',
        site_id: '22222222-2222-2222-2222-222222222222',
        name: 'Подстанция П-01',
        type: 'substation',
        serial_number: 'SUB-0001',
        status: 'operational',
        installed_at: new Date('2019-06-01'),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'aaaa2222-0000-0000-0000-000000000006',
        site_id: '22222222-2222-2222-2222-222222222222',
        name: 'Датчик Д-02',
        type: 'sensor',
        serial_number: 'SNS-0002',
        status: 'decommissioned',
        installed_at: new Date('2018-02-14'),
        created_at: now,
        updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('equipment', equipment);

    // Паспорта — 1:1, по одному на каждое оборудование
    const passports = equipment.map((e, i) => ({
      id: `bbbb1111-0000-0000-0000-00000000000${i + 1}`,
      equipment_id: e.id,
      manufacturer: ['Vestas', 'Siemens', 'ABB', 'GE'][i % 4],
      model: `Model-${100 + i}`,
      rated_power: [2000.0, 1500.0, 50.0, 3000.0][i % 4],
      last_calibration_at: new Date('2024-01-15'),
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('equipment_passports', passports);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('equipment_passports', {
      equipment_id: [
        'aaaa1111-0000-0000-0000-000000000001',
        'aaaa1111-0000-0000-0000-000000000002',
        'aaaa1111-0000-0000-0000-000000000003',
        'aaaa2222-0000-0000-0000-000000000004',
        'aaaa2222-0000-0000-0000-000000000005',
        'aaaa2222-0000-0000-0000-000000000006',
      ],
    });
    await queryInterface.bulkDelete('equipment', {
      serial_number: ['TRB-0001', 'INV-0001', 'SNS-0001', 'TRB-0002', 'SUB-0001', 'SNS-0002'],
    });
  }
};
