#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
require('../../config/dns').configureDns();
const fs = require('fs');
const { BSON } = require('mongodb');
const { connectToMongo, getDb, client } = require('../../config/db');
const { REGION } = require('../../modules/ucds/services/registerCheck');

// ---------------------------------------------------------------------------
// After a year's register is reloaded from the RAW workbooks, put back the
// fixes a person already approved in VERA's register check.
//
// The workbooks still hold the old spellings, so a reload undoes them; and a
// reload renumbers serials and gives every row a new _id, so a fix cannot be
// replayed by serial. Each is replayed by value instead:
//   - a spelling (field, from, to): every record still holding the old value;
//   - coordinates: every record with them the wrong way round, by REGION;
//   - one record's own permit from ERMS: the record with the same firm and
//     project holding the shared number, as the backup taken before the reload
//     shows them. Never one that merely holds the same number.
//
//   node scripts/migrate-ucds/replay-vera-fixes.js --year 2027 --backup <ucds-data-2027.json>
//   … --write          apply them (without it, prints what it would change)
// ---------------------------------------------------------------------------

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const YEAR = Number(arg('year'));
const BACKUP = arg('backup');
const WRITE = process.argv.includes('--write');
const REGISTER = `ucds-data-${YEAR}`;

const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const firmOf = (d) => `${key(d.name)}|${key(d.title)}`;
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const inRange = (v, [a, b]) => v != null && v >= a && v <= b;

async function main() {
  if (!(YEAR >= 2027) || !BACKUP) {
    console.error('Give --year and --backup (the register as it was, from scripts/backup-collections.js).');
    process.exit(1);
  }
  await connectToMongo();
  const db = getDb();
  const col = db.collection(REGISTER);
  const before = new Map(BSON.EJSON.parse(fs.readFileSync(BACKUP, 'utf8')).map((d) => [String(d._id), d]));
  const stamp = { updated_at: new Date(), updated_by: 'VERA (replayed after the register was reloaded)' };

  const runs = await db.collection('vera-ucds-checks').find({ register: REGISTER }).sort({ startedAt: 1 }).toArray();
  const approved = runs.flatMap((r) => (r.proposals || []).filter((p) => p.applied && !p.superseded));
  const spellings = approved.filter((p) => p.method !== 'erms' && p.field !== 'coordinates');
  const permits = approved.filter((p) => p.method === 'erms');
  console.log(`${approved.length} approved fixes: ${spellings.length} spellings, ${permits.length} permits from ERMS, and the coordinates rule.`);

  // In the order they were approved: a later fix may build on an earlier one.
  // Held as the rows' values change, so the dry run counts what --write would.
  const rows = await col.find({}, { projection: { name: 1, title: 1, lat: 1, long: 1, ecc_cnc: 1, ...Object.fromEntries(spellings.map((p) => [p.field, 1])) } }).toArray();
  const ops = [];
  const changedRows = new Set();
  let spelled = 0;
  for (const p of spellings) {
    const hits = rows.filter((d) => d[p.field] === p.from);
    if (!hits.length) continue;
    for (const d of hits) {
      d[p.field] = p.to;
      changedRows.add(String(d._id));
    }
    spelled += hits.length;
    ops.push({ updateMany: { filter: { _id: { $in: hits.map((d) => d._id) }, [p.field]: p.from }, update: { $set: { [p.field]: p.to, ...stamp } } } });
  }
  console.log(`Spellings: ${spelled} values on ${changedRows.size} records.`);

  let swapped = 0;
  for (const d of rows) {
    if (inRange(num(d.long), REGION.lat) && inRange(num(d.lat), REGION.long)) {
      swapped += 1;
      changedRows.add(String(d._id));
      ops.push({ updateOne: { filter: { _id: d._id, lat: d.lat, long: d.long }, update: { $set: { lat: d.long, long: d.lat, ...stamp } } } });
    }
  }
  console.log(`Coordinates swapped back: ${swapped}.`);

  let matched = 0;
  const unmatched = [];
  for (const p of permits) {
    const was = before.get(String(p.recordId));
    const hits = was ? rows.filter((d) => d.ecc_cnc === p.oldValue && firmOf(d) === firmOf(was)) : [];
    if (hits.length !== 1) {
      // Already corrected in the workbook, or no longer one clear record.
      if (!(was && rows.some((d) => d.ecc_cnc === p.newValue && firmOf(d) === firmOf(was)))) unmatched.push(`${p.oldValue} → ${p.newValue} (${was?.title || was?.name || p.recordId}): ${hits.length} records`);
      continue;
    }
    matched += 1;
    changedRows.add(String(hits[0]._id));
    ops.push({ updateOne: { filter: { _id: hits[0]._id, ecc_cnc: p.oldValue }, update: { $set: { ecc_cnc: p.newValue, ...stamp } } } });
  }
  console.log(`Permits from ERMS: ${matched} replayed${unmatched.length ? `; ${unmatched.length} left for the next check:\n  ${unmatched.join('\n  ')}` : ''}.`);
  console.log(`${changedRows.size} records in all.`);

  if (!WRITE) {
    console.log('\nDry run: nothing written. Add --write to apply them.');
  } else if (ops.length) {
    const res = await col.bulkWrite(ops, { ordered: true });
    console.log(`\nApplied: ${res.modifiedCount} updates.`);
  }
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
