module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'designation', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'designation');
  },
};
