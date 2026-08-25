module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('visitors', 'job_title', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('visitors', 'business_card_photo_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('visitors', 'job_title');
    await queryInterface.removeColumn('visitors', 'business_card_photo_url');
  },
};
