module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('temi_robots', 'pending_org_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('temi_robots', 'link_status', {
      type: Sequelize.ENUM('unlinked', 'pending', 'linked'),
      allowNull: false,
      defaultValue: 'unlinked',
    });
    // Mark already-linked robots so the new column is consistent
    await queryInterface.sequelize.query(`
      UPDATE temi_robots
      SET link_status = CASE
        WHEN organization_id IS NOT NULL THEN 'linked'::"enum_temi_robots_link_status"
        ELSE 'unlinked'::"enum_temi_robots_link_status"
      END
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('temi_robots', 'pending_org_id');
    await queryInterface.removeColumn('temi_robots', 'link_status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temi_robots_link_status"');
  },
};
