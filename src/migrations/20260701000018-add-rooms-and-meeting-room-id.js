'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create rooms table
    await queryInterface.createTable('rooms', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      organization_id: { type: Sequelize.UUID, allowNull: false },
      name:            { type: Sequelize.STRING(255), allowNull: false },
      floor:           { type: Sequelize.STRING(100) },
      building:        { type: Sequelize.STRING(100) },
      capacity:        { type: Sequelize.INTEGER },
      is_active:       { type: Sequelize.BOOLEAN, defaultValue: true, allowNull: false },
      created_at:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('rooms', ['organization_id'], { name: 'rooms_organization_id_idx' });

    // 2. Add meeting_room_id FK column to visits
    await queryInterface.addColumn('visits', 'meeting_room_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'rooms', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'meeting_room_id');
    await queryInterface.dropTable('rooms');
  },
};
