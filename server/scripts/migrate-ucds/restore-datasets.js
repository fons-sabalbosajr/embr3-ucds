#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');
const { connectToMongo, getDb } = require('../../config/db');

// ---------------------------------------------------------------------------
// Put a retired UCDS dataset back, exactly as it was, from the .json that
// retire-datasets.js wrote: its registry entry and every row.
//
//   node scripts/migrate-ucds/restore-datasets.js backups/ucd/2026/ecp.json [--write]
//
// Without --write it only says what it would restore. To show it in the menu
// again, also widen UCDS_DATASETS (services/datasetService.js).
// ---------------------------------------------------------------------------

(async () => {
  const file = process.argv[2];
  const write = process.argv.includes('--write');
  if (!file) throw new Error('Name the backup .json to restore.');
  // Plain JSON: dates and ids came out as strings; EJSON reads them back
  // where they were written as EJSON, and plain strings stay strings.
  const backup = EJSON.parse(fs.readFileSync(path.resolve(file), 'utf8'), { relaxed: true });
  const { ObjectId } = require('mongodb');
  const reId = (d) => ({ ...d, _id: d._id && ObjectId.isValid(d._id) ? new ObjectId(String(d._id)) : d._id, createdAt: d.createdAt ? new Date(d.createdAt) : d.createdAt, updatedAt: d.updatedAt ? new Date(d.updatedAt) : d.updatedAt });
  const { registry, rows } = backup;
  console.log(`${registry.year} ${registry.key}: ${rows.length} rows`);
  if (!write) return console.log('[dry run] nothing written; add --write.');
  const { client } = await connectToMongo();
  const db = getDb();
  if (await db.collection('ucds-dataset-registry').findOne({ year: registry.year, key: registry.key })) throw new Error('That dataset is already there.');
  await db.collection('ucds-dataset-registry').insertOne({ ...reId(registry), importedAt: registry.importedAt ? new Date(registry.importedAt) : null });
  for (let i = 0; i < rows.length; i += 1000) await db.collection('ucds-dataset-rows').insertMany(rows.slice(i, i + 1000).map(reId), { ordered: false });
  console.log('restored');
  await client.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
