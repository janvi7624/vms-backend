'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('temi_service_requests', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
      },
      serial: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      organization_id: {
        type:       Sequelize.UUID,
        allowNull:  true,
        references: { model: 'organizations', key: 'id' },
        onDelete:   'SET NULL',
      },
      item: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      status: {
        type:         Sequelize.STRING(50),
        defaultValue: 'pending',
        allowNull:    false,
      },
      fulfilled_by: {
        type:       Sequelize.UUID,
        allowNull:  true,
        references: { model: 'users', key: 'id' },
        onDelete:   'SET NULL',
      },
      fulfilled_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
        allowNull:    false,
      },
    });

    await queryInterface.addIndex('temi_service_requests', ['serial']);
    await queryInterface.addIndex('temi_service_requests', ['organization_id']);
    await queryInterface.addIndex('temi_service_requests', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('temi_service_requests');
  },
};
