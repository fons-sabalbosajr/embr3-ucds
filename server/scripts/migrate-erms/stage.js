/**
 * Phase 6, step 2: transform the extract and load it into STAGING.
 *
 *   node scripts/migrate-erms/stage.js            # transform + report, no write
 *   node scripts/migrate-erms/stage.js --apply    # write to universe-db-staging
 *   node scripts/migrate-erms/stage.js --apply --db=universe-db   # production
 *
 * Writes to `universe-db-staging` unless --db says otherwise. Production is
 * never the default: the whole point of this step is to be able to inspect and
 * re-run the result without touching the live database.
 *
 * Re-runnable. Documents are upserted on serialNo, and an id-map row is written
 * per record, so a second run corrects rather than duplicates.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { readRows, sourcePath } = require('./lib/source');
const { transformRow } = require('./lib/transform');

const APPLY = process.argv.includes('--apply');
const dbFlag = process.argv.find((a) => a.startsWith('--db='));
const DB_NAME = dbFlag ? dbFlag.slice('--db='.length) : 'universe-db-staging';
const BATCH = 1000;

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s).padEnd(n);

async function main() {
  const { file, rows } = readRows(sourcePath());
  log(`\n${APPLY ? 'LOADING' : 'DRY RUN'} — target database: ${DB_NAME}`);
  log(`source: ${file}`);
  log(`records: ${rows.length}\n`);

  if (APPLY && DB_NAME === 'universe-db') {
    log('*** TARGET IS PRODUCTION ***');
    log('This is intended only after staging has been reconciled and signed off.\n');
  }

  // --- transform -----------------------------------------------------------
  const docs = rows.map(transformRow);

  const flagged = docs.filter((d) => !d.dataQuality.clean);
  const attachments = docs.filter((d) => d.isAttachment);
  const byIssue = new Map();
  for (const d of flagged) {
    for (const i of d.dataQuality.issues) {
      const key = `${i.field}: ${i.problem}`;
      byIssue.set(key, (byIssue.get(key) || 0) + 1);
    }
  }

  log('-'.repeat(72));
  log('TRANSFORM');
  log('-'.repeat(72));
  log(`clean records      : ${docs.length - flagged.length}`);
  log(`flagged records    : ${flagged.length}`);
  log(`attachment records : ${attachments.length} (filed against an existing FSN)`);
  log('');
  if (byIssue.size) {
    log('issues by kind:');
    for (const [k, n] of [...byIssue.entries()].sort((a, b) => b[1] - a[1])) {
      log(`  ${pad(n, 8)}${k}`);
    }
  }

  const permitCounts = new Map();
  for (const d of docs) permitCounts.set(d.permit.type, (permitCounts.get(d.permit.type) || 0) + 1);
  log('\npermit types after canonicalisation:');
  for (const [k, n] of [...permitCounts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${pad(n, 8)}${k}`);
  }

  const provinceCounts = new Map();
  for (const d of docs) {
    provinceCounts.set(d.location.province, (provinceCounts.get(d.location.province) || 0) + 1);
  }
  log('\nprovinces after mapping:');
  for (const [k, n] of [...provinceCounts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${pad(n, 8)}${k === null ? '*** UNMAPPED ***' : k}`);
  }

  if (!APPLY) {
    log('\nDry run — nothing written. Re-run with --apply.');
    return;
  }

  // --- load ----------------------------------------------------------------
  const client = new MongoClient(process.env.MONGO_URI, { ssl: true, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db(DB_NAME);

  const records = db.collection('erms-records');
  const idMap = db.collection('erms-id-map');

  await records.createIndex({ serialNo: 1 }, { unique: true });
  await records.createIndex({ 'permit.number': 1 });
  await records.createIndex({ 'permit.type': 1 });
  await records.createIndex({ 'location.province': 1 });
  await records.createIndex({ 'document.uploadedAt': -1 });
  await records.createIndex({ parentSerialNo: 1 }, { sparse: true });
  await records.createIndex({ 'dataQuality.clean': 1 });
  await records.createIndex({ projectTitle: 'text', proponentName: 'text' });
  await idMap.createIndex({ collection: 1, legacyId: 1 }, { unique: true });

  log(`\nloading into ${DB_NAME}.erms-records …`);

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    await records.bulkWrite(
      slice.map((doc) => ({
        updateOne: {
          filter: { serialNo: doc.serialNo },
          update: { $set: doc },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    written += slice.length;
    process.stdout.write(`\r  ${written}/${docs.length}`);
  }
  process.stdout.write('\n');

  // Crosswalk, so the import is re-runnable and legacy ids stay resolvable.
  const stored = await records.find({}, { projection: { _id: 1, serialNo: 1 } }).toArray();
  for (let i = 0; i < stored.length; i += BATCH) {
    const slice = stored.slice(i, i + BATCH);
    await idMap.bulkWrite(
      slice.map((d) => ({
        updateOne: {
          filter: { collection: 'erms-records', legacyId: d.serialNo },
          update: { $set: { collection: 'erms-records', legacyId: d.serialNo, newId: d._id } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  log(`\nerms-records   : ${await records.countDocuments({})}`);
  log(`erms-id-map    : ${await idMap.countDocuments({})}`);
  await client.close();
  log('\nStaged. Next: reconcile.js');
}

main().catch((e) => {
  console.error(e.code === 'SOURCE_MISSING' ? e.message : e);
  process.exit(1);
});
