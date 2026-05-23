/**
 * Introspect the live database schema so Sequelize models can be mapped
 * to the EXACT existing column types (no destructive recreate).
 *
 * Usage: npm run db:check
 * Requires a working DATABASE_URL (Supabase session pooler recommended).
 *
 * Prints, per table: column name, data type, nullable, default — plus a
 * summary of every `*.id` / `*_id` key type (the bit that drives the models).
 */
require('dotenv').config();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TABLES = [
  'locations', 'organizations', 'branches', 'users', 'visitors',
  'visits', 'qr_codes', 'audit_logs', 'notifications', 'temi_robots',
  'otp_sessions',
];

const q = (sql, replacements) =>
  sequelize.query(sql, { type: QueryTypes.SELECT, replacements });

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected.\n');
  } catch (err) {
    console.error('❌ Could not connect:', err.message);
    console.error('   Fix DATABASE_URL (use the Supabase Session pooler URL) and retry.');
    process.exit(1);
  }

  // ── Where are we? ──────────────────────────────────────────────────────────
  const [info] = await q(
    `SELECT current_database() AS db, current_user AS usr,
            current_schemas(true) AS schemas`
  );
  console.log(`Database : ${info.db}`);
  console.log(`User     : ${info.usr}`);
  console.log(`Schemas  : ${info.schemas}\n`);

  // ── Every table across non-system schemas ──────────────────────────────────
  const allTables = await q(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
      ORDER BY table_schema, table_name`
  );
  console.log('=== ALL BASE TABLES ===');
  allTables.forEach((t) => console.log(`  ${t.table_schema}.${t.table_name}`));

  // ── Find our app tables in WHATEVER schema they live ───────────────────────
  const located = await q(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name = ANY(ARRAY[:tables])
        AND table_schema NOT IN ('auth','storage','realtime','vault','pg_catalog','information_schema')
      ORDER BY (table_schema <> 'public'), table_schema, table_name`,
    { tables: TABLES }
  );

  if (!located.length) {
    console.log('\n⚠️  None of the expected VMS tables were found in any schema.');
    console.log('    (They may be in a different database — the original URL used /tami-vms.)');
    await sequelize.close();
    return;
  }

  const schema = located[0].table_schema;
  console.log(`\nVMS tables found in schema: "${schema}"`);

  // ── Columns for each table ──────────────────────────────────────────────────
  const cols = await q(
    `SELECT table_name, column_name, data_type, udt_name,
            is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = :schema AND table_name = ANY(ARRAY[:tables])
      ORDER BY table_name, ordinal_position`,
    { schema, tables: TABLES }
  );

  const byTable = {};
  cols.forEach((c) => { (byTable[c.table_name] ||= []).push(c); });

  for (const table of TABLES) {
    const rows = byTable[table];
    if (!rows) { console.log(`\n### ${table}  — ❌ NOT FOUND`); continue; }
    console.log(`\n### ${table}`);
    rows.forEach((c) => {
      const type = c.character_maximum_length
        ? `${c.data_type}(${c.character_maximum_length})`
        : c.data_type;
      const flags = [
        c.is_nullable === 'NO' ? 'NOT NULL' : null,
        c.column_default ? `default ${c.column_default}` : null,
      ].filter(Boolean).join(', ');
      console.log(`  ${c.column_name.padEnd(20)} ${type.padEnd(30)} ${flags}`);
    });
  }

  // ── The decisive summary: every key column's type ──────────────────────────
  console.log('\n\n=== KEY (id / *_id) COLUMN TYPES ===');
  cols
    .filter((c) => c.column_name === 'id' || c.column_name.endsWith('_id'))
    .forEach((c) => {
      console.log(`  ${(c.table_name + '.' + c.column_name).padEnd(34)} ${c.udt_name} (${c.data_type})`);
    });

  await sequelize.close();
  console.log('\n✅ Introspection complete.');
}

run().catch((e) => { console.error(e); process.exit(1); });
