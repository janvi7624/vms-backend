'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_role_check');
    await queryInterface.addConstraint('users', {
      type: 'check',
      fields: ['role'],
      name: 'users_role_check',
      where: { role: ['super_admin', 'admin', 'sub_admin', 'employee', 'client'] },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_role_check');
    await queryInterface.addConstraint('users', {
      type: 'check',
      fields: ['role'],
      name: 'users_role_check',
      where: { role: ['platform_super_admin', 'org_super_admin', 'org_admin', 'admin', 'employee', 'security'] },
    });
  },
};
