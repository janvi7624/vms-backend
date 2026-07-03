'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'pending_plan', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'pending_plan_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('organizations', 'pending_plan');
    await queryInterface.removeColumn('organizations', 'pending_plan_requested_at');
  },
};
