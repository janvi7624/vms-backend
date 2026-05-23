/**
 * DEPRECATED — the schema is now managed by Sequelize.
 *
 * The multi-tenant org structure, OTP sessions, and platform admin that this
 * script used to add are part of the baseline migration + seeder.
 *
 * Use instead:
 *   npm run db:migrate    # create/upgrade the schema
 *   npm run db:seed       # default org, location, platform + admin users
 *   npm run db:check      # introspect the live schema
 */
console.log([
  'migrate-enterprise.js is deprecated. The schema is managed by Sequelize now.',
  '',
  'Run instead:',
  '  npm run db:migrate    # create/upgrade the schema',
  '  npm run db:seed       # default org, location, platform + admin users',
  '  npm run db:check      # introspect the live schema',
].join('\n'));

process.exit(0);
