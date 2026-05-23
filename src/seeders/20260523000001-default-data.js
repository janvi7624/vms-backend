'use strict';

const bcrypt = require('bcryptjs');

// Fixed IDs reused by legacy scripts (add-employees.js, enterprise backfill).
const DEFAULT_LOCATION_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert('locations', [{
      id: DEFAULT_LOCATION_ID,
      name: 'Nanta Tech Limited HQ',
      address: 'Main Office, Ground Floor',
      temi_serial: '00126040079',
      created_at: now,
    }], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('organizations', [{
      id: DEFAULT_ORG_ID,
      name: 'Nanta Tech Limited',
      slug: 'nanta-tech',
      email: 'admin@nanta.tech',
      plan: 'enterprise',
      is_active: true,
      max_employees: 100,
      created_at: now,
      updated_at: now,
    }], { ignoreDuplicates: true });

    const platformHash = await bcrypt.hash('Platform@2024', 12);
    const adminHash = await bcrypt.hash('Admin@123', 12);

    await queryInterface.bulkInsert('users', [
      {
        email: 'platform@vms.com',
        password_hash: platformHash,
        name: 'Platform Admin',
        role: 'platform_super_admin',
        department: 'Platform',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        email: 'admin@vms.com',
        password_hash: adminHash,
        name: 'System Administrator',
        role: 'admin',
        department: 'IT',
        location_id: DEFAULT_LOCATION_ID,
        organization_id: DEFAULT_ORG_ID,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('temi_robots', [{
      serial_number: '00126040079',
      name: 'Temi Receptionist',
      location_id: DEFAULT_LOCATION_ID,
      organization_id: DEFAULT_ORG_ID,
      status: 'offline',
      saved_locations: JSON.stringify([]),
      created_at: now,
    }], { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    await queryInterface.bulkDelete('temi_robots', { serial_number: '00126040079' });
    await queryInterface.bulkDelete('users', { email: { [Op.in]: ['platform@vms.com', 'admin@vms.com'] } });
    await queryInterface.bulkDelete('organizations', { id: DEFAULT_ORG_ID });
    await queryInterface.bulkDelete('locations', { id: DEFAULT_LOCATION_ID });
  },
};
