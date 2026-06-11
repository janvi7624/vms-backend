'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('visits', 'sub_admin_approved_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('visits', 'sub_admin_approved_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('visits', 'booking_source', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'internal',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'sub_admin_approved_by');
    await queryInterface.removeColumn('visits', 'sub_admin_approved_at');
    await queryInterface.removeColumn('visits', 'booking_source');
  },
};
