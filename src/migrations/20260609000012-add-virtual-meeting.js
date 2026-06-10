'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('visits', 'meeting_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'in_person',
    });
    await queryInterface.addColumn('visits', 'virtual_meeting_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('visits', 'meeting_type');
    await queryInterface.removeColumn('visits', 'virtual_meeting_url');
  },
};
