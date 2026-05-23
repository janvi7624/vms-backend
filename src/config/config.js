// Configuration consumed by sequelize-cli (db:migrate, db:seed).
// The runtime app uses src/config/database.js — keep these options in sync.
require('dotenv').config();

const useSsl = process.env.DB_SSL !== 'false';

const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  dialectOptions: useSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  define: {
    underscored: true,
    freezeTableName: true,
  },
};

module.exports = {
  development: { ...common },
  test: { ...common },
  production: { ...common },
};
