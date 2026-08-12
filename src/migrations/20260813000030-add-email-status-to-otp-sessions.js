module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('otp_sessions', 'email_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('otp_sessions', 'email_status');
  },
};
