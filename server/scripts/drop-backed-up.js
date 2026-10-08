#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// ---------------------------------------------------------------------------
// Drop collections that backup-collections.js has backed up and verified.
//
//   node scripts/drop-backed-up.js --manifest=../backups/mongo/<dir>/manifest.json           dry run
//   node scripts/drop-backed-up.js --manifest=../backups/mongo/<dir>/manifest.json --apply   drop
//
// The list comes from the manifest, never from a pattern over the live
// database, so only what was backed up can go. Before anything is dropped,
// every collection is counted again: if one has changed since the backup —
// a write the backup does not hold — nothing is dropped at all.
//
// Restore one with mongoimport --jsonArray, or EJSON.parse() the file and
// insertMany(); the files are canonical Extended JSON.
// ---------------------------------------------------------------------------

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const MANIFEST = arg('manifest');
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!MANIFEST) throw new Error('Usage: --manifest=<path to manifest.json> [--apply]');
  const manifestPath = path.resolve(process.cwd(), MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dir = path.dirname(manifestPath);

  const unverified = manifest.collections.filter((c) => !c.ok);
  if (unverified.length) throw new Error(`The backup did not verify: ${unverified.map((c) => c.name).join(', ')}`);
  for (const c of manifest.collections) {
    if (!fs.existsSync(path.join(dir, `${c.name}.json`))) throw new Error(`Backup file missing: ${c.name}.json`);
  }

  const client = new MongoClient(process.env.MONGO_URI, { socketTimeoutMS: 120000, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  try {
    const db = client.db(manifest.database);
    const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

    // Every collection first; drop nothing until all of them agree.
    const changed = [];
    for (const c of manifest.collections) {
      if (!present.has(c.name)) continue;
      const now = await db.collection(c.name).countDocuments();
      if (now !== c.count) changed.push(`${c.name} (${c.count} backed up, ${now} now)`);
    }
    if (changed.length) throw new Error(`Changed since the backup, nothing dropped: ${changed.join('; ')}`);

    const toDrop = manifest.collections.filter((c) => present.has(c.name));
    console.log(`${toDrop.length} collections in ${manifest.database} match the backup taken ${manifest.takenAt}.`);
    if (!APPLY) {
      for (const c of toDrop) console.log(`  would drop ${c.name} (${c.count} docs)`);
      console.log('\nDry run. Add --apply to drop.');
      return;
    }
    for (const c of toDrop) {
      await db.collection(c.name).drop();
      console.log(`  dropped ${c.name} (${c.count} docs)`);
    }
    console.log(`\nDropped ${toDrop.length}. Backup: ${dir}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
