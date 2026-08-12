const { PgBoss } = require('pg-boss');

// Uses your existing Postgres (Supabase) instead of a separate Redis
// instance. pg-boss does its own locking/polling per job, which works fine
// through Supabase's transaction pooler for normal use — but if you see
// connection errors under load, point PGBOSS_DATABASE_URL at Supabase's
// *direct* connection string (Project Settings → Database → Connection
// string → "URI", not the "Transaction pooler" one) instead of reusing
// DATABASE_URL.
const connectionString = process.env.PGBOSS_DATABASE_URL || process.env.DATABASE_URL;
const useSsl = process.env.DB_SSL !== 'false';

const boss = new PgBoss({
  connectionString,
  schema: 'pgboss', // separate schema from the app's own Sequelize-managed tables
  ssl: useSsl ? { require: true, rejectUnauthorized: false } : false,
});

boss.on('error', (err) => console.error('[Queue] pg-boss error:', err.message));

let starting;
// Safe to call from multiple places (emailQueue.js and emailWorker.js) —
// only starts once, everyone else awaits the same in-flight start.
const ensureStarted = async () => {
  if (!starting) starting = boss.start();
  await starting;
  return boss;
};

module.exports = { boss, ensureStarted };
