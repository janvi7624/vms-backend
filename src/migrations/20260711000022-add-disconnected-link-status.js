module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_temi_robots_link_status" ADD VALUE IF NOT EXISTS 'disconnected'`
    );
  },
  down: async () => {
    // Postgres can't drop a single enum value without recreating the type;
    // rows left with 'disconnected' after a rollback are a non-issue since
    // the app code stops writing that value once this migration is undone.
  },
};
