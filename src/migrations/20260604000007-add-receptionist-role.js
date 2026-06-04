'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_role_check');
    await queryInterface.addConstraint('users', {
      type: 'check',
      fields: ['role'],
      name: 'users_role_check',
      where: { role: ['super_admin', 'admin', 'sub_admin', 'employee', 'client', 'receptionist'] },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_role_check');
    await queryInterface.addConstraint('users', {
      type: 'check',
      fields: ['role'],
      name: 'users_role_check',
      where: { role: ['super_admin', 'admin', 'sub_admin', 'employee', 'client'] },
    });
  },
};
