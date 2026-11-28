#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('../../config/dns').configureDns();
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');
const { connectToMongo, getDb, client } = require('../../config/db');

// ---------------------------------------------------------------------------
// Put a year's register back exactly as a backup holds it: the undo for
// import-year-register.js.
//
//   node scripts/migrate-ucds/restore-register.js --year 2027 \
//     --backup ../backups/mongo/2026-11-28-before-2027-final/ucds-data-2027.json
//   … --write          restore it (without it, says what it would restore)
//
// The backup is the canonical Extended JSON that scripts/backup-collections.js
// writes, so _ids, dates and number types come back as they were. It is
// loaded beside the register and put in its place at once, like the import:
// the year's screens never see it empty or half restored.
//
// What happened in the register since the backup (VERA fixes replayed,
// edits) is replaced too. The container's register* fields are left as they
// are; the register name does not change.
// ---------------------------------------------------------------------------

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const YEAR = Number(arg('year'));
const BACKUP = arg('backup');
const WRITE = process.argv.includes('--write');
const TARGET = `ucds-data-${YEAR}`;

async function main() {
  if (!(YEAR >= 2027) || !BACKUP) {
    console.error('Give --year (2027 or later) and --backup <ucds-data-<year>.json>.');
    process.exit(1);
  }
  const docs = EJSON.parse(fs.readFileSync(path.resolve(BACKUP), 'utf8'), { relaxed: false });
  if (!Array.isArray(docs) || !docs.length) throw new Error(`${BACKUP} holds no records.`);
  const wrongYear = docs.filter((d) => d.year != null && Number(d.year) !== YEAR).length;
  if (wrongYear) throw new Error(`${wrongYear} records in the backup are not ${YEAR}; is it the right file?`);

  await connectToMongo();
  try {
    const db = getDb();
    const now = await db.collection(TARGET).countDocuments();
    console.log(`${TARGET}: ${now} records now; the backup holds ${docs.length}.`);
    if (!WRITE) {
      console.log('Dry run: nothing written. Add --write to restore.');
      return;
    }
    const staging = db.collection(`${TARGET}-restoring`);
    await staging.drop().catch(() => null);
    for (let i = 0; i < docs.length; i += 1000) await staging.insertMany(docs.slice(i, i + 1000), { ordered: true });
    const count = await staging.countDocuments();
    if (count !== docs.length) throw new Error(`Restored ${count} of ${docs.length}; the register was not replaced.`);
    for (const key of [{ sort_key: 1 }, { id_no: 1 }, { province: 1 }, { ecc_cnc: 1 }, { province: 1, sort_key: 1 }]) await staging.createIndex(key);
    await staging.rename(TARGET, { dropTarget: true });
    console.log(`Restored ${count} records into ${TARGET}.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
