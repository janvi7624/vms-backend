'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'website', {
      type: Sequelize.STRING(300),
      allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'industry', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'status', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'active',
    });
    await queryInterface.addColumn('organizations', 'rejection_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('organizations', 'verified_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('organizations', 'verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('organizations', 'website');
    await queryInterface.removeColumn('organizations', 'industry');
    await queryInterface.removeColumn('organizations', 'status');
    await queryInterface.removeColumn('organizations', 'rejection_reason');
    await queryInterface.removeColumn('organizations', 'verified_by');
    await queryInterface.removeColumn('organizations', 'verified_at');
  },
};
