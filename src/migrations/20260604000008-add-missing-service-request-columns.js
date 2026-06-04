'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'temi_service_requests';
    const cols  = await queryInterface.describeTable(table);

    if (!cols.visit_id) {
      await queryInterface.addColumn(table, 'visit_id', {
        type:      Sequelize.UUID,
        allowNull: true,
      });
    }
    if (!cols.visitor_name) {
      await queryInterface.addColumn(table, 'visitor_name', {
        type:      Sequelize.STRING(200),
        allowNull: true,
      });
    }
    if (!cols.location) {
      await queryInterface.addColumn(table, 'location', {
        type:      Sequelize.STRING(200),
        allowNull: true,
      });
    }
    if (!cols.follow_up_items) {
      await queryInterface.addColumn(table, 'follow_up_items', {
        type:         Sequelize.JSONB,
        allowNull:    false,
        defaultValue: [],
      });
    }
  },

  async down(queryInterface) {
    const table = 'temi_service_requests';
    for (const col of ['visit_id', 'visitor_name', 'location', 'follow_up_items']) {
      await queryInterface.removeColumn(table, col).catch(() => {});
    }
  },
};
