module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('otp_sessions', 'otp_code', {
      type: Sequelize.STRING(6),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('otp_sessions', 'otp_code');
  },
};
