#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient, BSON } = require('mongodb');

const { EJSON } = BSON;

// ---------------------------------------------------------------------------
// Back up collections to files that restore exactly, and prove they do.
//
//   node scripts/backup-collections.js --match=^legacy-erms- \
//     --except=legacy-erms-records-filelogs,legacy-erms-records-file-history \
//     --out=../backups/mongo/2026-10-06-legacy-erms
//
// One <collection>.json per collection: an array in canonical Extended JSON,
// so ObjectIds, dates and number types come back as they were — the earlier
// backups were plain JSON, which turns every _id and date into a string.
//
// Each file is read back after it is written, and every document is compared
// with what the database returned (SHA-256 over the canonical form, in _id
// order), and the count with a fresh countDocuments(). manifest.json records
// count, bytes and hash per collection. Exits non-zero if any check fails.
//
// Only reads the database. Dropping is a separate, deliberate step.
// ---------------------------------------------------------------------------

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const MATCH = arg('match');
const EXCEPT = (arg('except') || '').split(',').filter(Boolean);
const OUT = arg('out');
const DB_NAME = process.env.MONGO_DB_NAME || 'universe-db';

const canonical = (doc) => EJSON.stringify(doc, { relaxed: false });

async function backupOne(db, name, outDir) {
  const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  const sourceHash = crypto.createHash('sha256');
  for (const doc of docs) sourceHash.update(canonical(doc) + '\n');

  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, '[\n' + docs.map(canonical).join(',\n') + '\n]\n');

  // Read back what is on disk, not what is in memory.
  const restored = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
  const fileHash = crypto.createHash('sha256');
  for (const doc of restored) fileHash.update(canonical(doc) + '\n');

  const count = await db.collection(name).countDocuments();
  return {
    name,
    count: docs.length,
    countNow: count,
    restored: restored.length,
    bytes: fs.statSync(file).size,
    sha256: sourceHash.digest('hex'),
    fileSha256: fileHash.digest('hex'),
  };
}

async function main() {
  if (!MATCH || !OUT) throw new Error('Usage: --match=<regex> --out=<dir> [--except=a,b]');
  const outDir = path.resolve(process.cwd(), OUT);
  fs.mkdirSync(outDir, { recursive: true });

  // Without a socket timeout a connection that dies mid-read waits forever;
  // with one, it errors and the collection is tried again.
  const client = new MongoClient(process.env.MONGO_URI, { socketTimeoutMS: 120000, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const results = [];
  try {
    const db = client.db(DB_NAME);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => new RegExp(MATCH).test(n) && !EXCEPT.includes(n))
      .sort();
    console.log(`Backing up ${names.length} collections from ${DB_NAME} to ${outDir}`);

    for (const name of names) {
      // The link to Atlas drops long reads; try a collection again from the start.
      for (let attempt = 1; ; attempt += 1) {
        try {
          const r = await backupOne(db, name, outDir);
          const ok = r.count === r.countNow && r.count === r.restored && r.sha256 === r.fileSha256;
          results.push({ ...r, ok });
          console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(48)} ${String(r.count).padStart(6)} docs  ${(r.bytes / 1e6).toFixed(2)} MB`);
          break;
        } catch (err) {
          // Only a dropped connection is worth another try.
          const network = /Mongo(Network|ServerSelection)|ECONNRESET|ETIMEDOUT|timed out|closed/i.test(`${err.name} ${err.message}`);
          if (attempt === 3 || !network) {
            results.push({ name, ok: false, error: err.message });
            console.log(`  FAIL ${name.padEnd(48)} ${err.message}`);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 15000 * attempt));
        }
      }
    }
  } finally {
    await client.close();
  }

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ database: DB_NAME, takenAt: new Date().toISOString(), match: MATCH, except: EXCEPT, collections: results }, null, 2)
  );
  const failed = results.filter((r) => !r.ok);
  const total = results.reduce((n, r) => n + (r.count || 0), 0);
  console.log(`\n${results.length - failed.length}/${results.length} verified, ${total} documents.`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
