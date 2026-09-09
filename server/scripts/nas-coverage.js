#!/usr/bin/env node
require('dotenv').config();

const { MongoClient } = require('mongodb');
const nas = require('../services/nasStorage');

// ---------------------------------------------------------------------------
// How many filed records actually resolve to a file on the records share.
//
// This exists because the answer is not obvious and the failure modes lie.
// A first attempt at measuring reported 0 of 400 resolvable, which looked like
// total data loss; the real cause was that 26.7% of the paths exceed Windows'
// 260-character limit, and the API reports those as "not found" rather than as
// an error. With the long-path prefix the same sample resolved 98.7%.
//
//   node scripts/nas-coverage.js [sampleSize|all]
//
// Run it after any change to path resolution, and before cutover, so the
// number is measured rather than assumed.
// ---------------------------------------------------------------------------

const arg = process.argv[2] || '300';
const ALL = arg === 'all';
const SIZE = ALL ? 0 : Number(arg);

const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) + '%' : '—');

async function main() {
  if (!nas.isConfigured()) {
    console.error('NAS is not configured. Set NAS_ROOT (or NAS_SHARE) in server/.env.');
    process.exit(1);
  }

  const probe = await nas.testConnection();
  if (!probe.ok) {
    console.error(`Cannot reach the share (${probe.reason}/${probe.code}). Nothing measured.`);
    process.exit(1);
  }
  console.log(`share reachable in ${probe.ms}ms — ${probe.entryCount} entries at the root\n`);

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const col = client.db().collection('erms-records');

  const match = { 'document.sharePath': { $nin: [null, ''] } };
  const pipeline = [{ $match: match }];
  if (!ALL) pipeline.push({ $sample: { size: SIZE } });
  pipeline.push({ $project: { serialNo: 1, 'document.sharePath': 1, 'document.fileName': 1 } });

  const docs = await col.aggregate(pipeline, { allowDiskUse: true }).toArray();

  const counts = { ok: 0, missing: 0, invalid: 0, other: 0, longPath: 0 };
  const examples = [];

  for (const d of docs) {
    const stored = d.document.sharePath;
    const resolved = nas.resolveSharePath(stored);
    if (resolved && resolved.length > 259) counts.longPath++;

    const stat = await nas.statFile(stored);
    if (stat.ok) {
      counts.ok++;
      continue;
    }
    if (stat.reason === 'missing' || stat.reason === 'not-a-file') counts.missing++;
    else if (stat.reason === 'invalid-path') counts.invalid++;
    else counts.other++;

    if (examples.length < 8) examples.push(`${d.serialNo}  [${stat.reason}]  ${stored.slice(0, 120)}`);
  }

  const total = docs.length;
  console.log(`records examined      : ${total}${ALL ? ' (all)' : ' (random sample)'}`);
  console.log(`over 260 characters   : ${counts.longPath} ${pct(counts.longPath, total)}`);
  console.log('');
  console.log(`RESOLVED to a file    : ${counts.ok} ${pct(counts.ok, total)}`);
  console.log(`not on the share      : ${counts.missing} ${pct(counts.missing, total)}`);
  console.log(`unusable stored path  : ${counts.invalid} ${pct(counts.invalid, total)}`);
  console.log(`other failure         : ${counts.other} ${pct(counts.other, total)}`);

  if (examples.length) {
    console.log('\nexamples that did not resolve:');
    examples.forEach((e) => console.log('  ' + e));
  }

  await client.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
