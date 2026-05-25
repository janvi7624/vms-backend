'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('temi_robots', 'battery_level', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '0–100 percent, updated on each heartbeat',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('temi_robots', 'battery_level');
  },
};
