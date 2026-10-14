#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { connectToMongo, getDb } = require('../../config/db');
const { provinceFolderOf } = require('./lib/source');
const { PROVINCES } = require('../../services/provinces');

// ---------------------------------------------------------------------------
// Give Legal and Laboratory documents migrated without a province the one
// their scan is filed under.
//
// legacy-sql/units.js read the province from the stored path with a pattern
// that stopped at the first "Database\" — "Laboratory Database", not a
// province — so every Laboratory document whose desktop index (tb_labdata)
// left the province blank came in Unfiled: 4,391 of them. Their paths do
// name it (…\Laboratory Database\Pampanga\1998\…). units.js is fixed, but
// cannot simply be re-run: the staging tables it reads were dropped from
// the cluster on 6 Oct 2026. This repairs the documents in place.
//
// Only documents with no province are touched, so one an ERMS User has
// since given a province keeps it. Re-runnable; `--dry` only reports.
// ---------------------------------------------------------------------------

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const PROVINCE_BY_LABEL = new Map(PROVINCES.map((p) => [key(p.label), p]));

(async () => {
  const dry = process.argv.includes('--dry');
  const { client } = await connectToMongo();
  const documents = getDb().collection('erms-documents');

  const cursor = documents.find(
    { unit: { $in: ['legal', 'laboratory'] }, $or: [{ province: null }, { province: { $exists: false } }] },
    { projection: { unit: 1, serialNo: 1, 'document.sharePath': 1, 'document.filePath': 1 } }
  );
  const fixed = {};
  const left = [];
  const ops = [];
  for await (const d of cursor) {
    const folder = provinceFolderOf(d.document?.sharePath || d.document?.filePath);
    const province = PROVINCE_BY_LABEL.get(key(folder));
    if (!province) {
      left.push(`${d.serialNo}  ${d.document?.sharePath || d.document?.filePath || '(no path)'}`);
      continue;
    }
    fixed[`${d.unit}/${province.key}`] = (fixed[`${d.unit}/${province.key}`] || 0) + 1;
    ops.push({ updateOne: { filter: { _id: d._id, province: null }, update: { $set: { province: province.key, provinceLabel: province.label } } } });
  }
  // In batches: one request per 500 documents rather than one each.
  if (!dry) for (let i = 0; i < ops.length; i += 500) await documents.bulkWrite(ops.slice(i, i + 500), { ordered: false });

  console.log(`${dry ? '[dry run] ' : ''}${ops.length} documents given the province their scan is filed under:`);
  for (const [k, n] of Object.entries(fixed).sort()) console.log(`  ${k.padEnd(24)} ${n}`);
  if (left.length) {
    console.log(`${left.length} left Unfiled — no province folder in the path (Edit details on each sets one):`);
    for (const l of left.slice(0, 50)) console.log(`  ${l}`);
  }
  await client.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
