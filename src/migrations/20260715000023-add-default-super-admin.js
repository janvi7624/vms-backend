'use strict';

const bcrypt = require('bcryptjs');

const SUPER_ADMIN_ID = '00000000-0000-0000-0003-000000000010';
const SUPER_ADMIN_EMAIL = 'janvithummar764@gmail.com';

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: SUPER_ADMIN_EMAIL }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existing.length > 0) return;

    const password_hash = await bcrypt.hash('Janvi@123456', 12);
    const now = new Date();

    await queryInterface.bulkInsert('users', [{
      id:            SUPER_ADMIN_ID,
      email:         SUPER_ADMIN_EMAIL,
      password_hash,
      name:          'Janvi Thummar',
      role:          'super_admin',
      is_active:     true,
      is_dnd:        false,
      created_at:    now,
      updated_at:    now,
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: SUPER_ADMIN_EMAIL });
  },
};
