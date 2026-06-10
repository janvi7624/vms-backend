'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'temi_user_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Temi platform username — used to initiate built-in video calls to this employee',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'temi_user_id');
  },
};
