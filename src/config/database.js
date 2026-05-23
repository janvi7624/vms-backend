require('dotenv').config();

const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL is not set — Sequelize cannot connect.');
}

// Supabase requires SSL. The pooler presents a cert that does not chain to a
// public root in some environments, so we disable strict verification.
// Override with DB_SSL=false for a local (non-SSL) Postgres.
const useSsl = process.env.DB_SSL !== 'false';

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false,
  dialectOptions: useSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  pool: { max: 20, min: 0, idle: 30000, acquire: 30000 },
  define: {
    underscored: true,
    freezeTableName: true,
  },
});

module.exports = { sequelize, Sequelize };
