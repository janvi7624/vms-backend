module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('email_suppressions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      email: { type: Sequelize.STRING(200), allowNull: false, unique: true },
      reason: { type: Sequelize.ENUM('bounce', 'complaint'), allowNull: false },
      detail: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('email_suppressions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_email_suppressions_reason";');
  },
};
