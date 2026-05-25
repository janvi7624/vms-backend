'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'subscription_start', {
      type: Sequelize.DATEONLY, allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'subscription_end', {
      type: Sequelize.DATEONLY, allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'billing_email', {
      type: Sequelize.STRING(200), allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'max_robots', {
      type: Sequelize.INTEGER, allowNull: true, defaultValue: 2,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('organizations', 'subscription_start');
    await queryInterface.removeColumn('organizations', 'subscription_end');
    await queryInterface.removeColumn('organizations', 'billing_email');
    await queryInterface.removeColumn('organizations', 'max_robots');
  },
};
