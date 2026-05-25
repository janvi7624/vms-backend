'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('visits', 'robot_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'temi_robots', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('visits', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'robot_id');
    await queryInterface.removeColumn('visits', 'completed_at');
  },
};
