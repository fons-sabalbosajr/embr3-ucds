#!/usr/bin/env node
/**
 * Apply pending db_euniverse migrations (server/sql/migrations), or report.
 *
 *   npm run sql:migrate            db_euniverse
 *   node scripts/sql/migrate.js --test  db_euniverse_test
 *   npm run sql:status             what is applied and pending, nothing changed
 *
 * Run on every deploy, after `git pull`: a migration is applied once, in a
 * transaction, and recorded with its checksum.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const euSql = require('../../services/euSql');

const STATUS_ONLY = process.argv.includes('--status');
if (process.argv.includes('--test')) process.env.EU_SQL_DATABASE = 'db_euniverse_test';

(async () => {
  const s = await euSql.status();
  if (!s.configured) throw new Error('db_euniverse is not set up. Run: npm run sql:setup');
  if (!s.ok) throw new Error(`${s.code}: ${s.message}`);
  console.log(`${s.database} as ${s.login}: schema version ${s.schemaVersion || 'none'}, ${s.tables} tables, ${s.sizeMb} MB (${s.ms} ms)`);
  if (s.changed.length) console.log(`CHANGED since applied (refused): ${s.changed.join(', ')}`);
  if (STATUS_ONLY) {
    console.log(s.pending.length ? `pending: ${s.pending.join(', ')}` : 'nothing pending');
    return;
  }
  const done = await euSql.migrate({ log: (m) => console.log(`  ${m}`) });
  console.log(done.length ? `applied ${done.length} migration(s)` : 'up to date');
})()
  .then(async () => {
    await euSql.close();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('FAILED:', e.message);
    await euSql.close().catch(() => {});
    process.exit(1);
  });
