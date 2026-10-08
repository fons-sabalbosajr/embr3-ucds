#!/usr/bin/env node
require('dotenv').config();

const { MongoClient } = require('mongodb');

// ---------------------------------------------------------------------------
// Make the test suite's database: a copy of production's working collections.
//
// The suite is an integration suite — province scoping, the domain boundary
// and the year containers are only tested honestly against real data — but it
// writes, so it runs against this copy rather than production (tests/setup.js).
//
//   npm run test:db:refresh               copy production into universe-db-test
//   npm run test:db:refresh -- --resume   keep collections already copied in full
//   npm run test:db:refresh -- --to=x     copy into another name
//
// The copy goes to TEST_MONGO_URI (a local MongoDB by default), never to the
// production cluster: that is a free tier shared with six other applications
// and close to its 512 MB cap, and a copy there blocks writes for all of them.
//
// Production is only ever read. Every collection in the target is dropped and
// re-made, indexes included, so a refresh also clears whatever a failed run
// left behind. Run it when the suite starts failing on data it expects to
// find, or before a release. The office link to Atlas drops connections on
// long reads; --resume picks up after one without fetching everything again.
//
// Not copied: sessions, and the legacy-erms-* archive of the desktop system's
// tables — except the two the Tracking panel reads (trackingService.js).
// ---------------------------------------------------------------------------

const SOURCE = 'universe-db';
const SOURCE_URI = process.env.MONGO_URI;
const TARGET_URI = String(process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017').trim();
const toFlag = process.argv.find((a) => a.startsWith('--to='));
const TARGET = toFlag ? toFlag.slice('--to='.length) : process.env.TEST_MONGO_DB_NAME || 'universe-db-test';
const RESUME = process.argv.includes('--resume');

/** The hosts a URI names, so "the same cluster" is caught however it is spelled. */
const hostsOf = (uri) => {
  const m = String(uri || '').match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  return m ? m[1].toLowerCase().split(',').sort().join(',') : '';
};

const SKIP = [/^legacy-erms-(?!records-filelogs$|records-file-history$)/, /^sessions$/, /^system\./];
const BATCH = 1000;

async function copyCollection(source, target, name) {
  const from = source.collection(name);
  const to = target.collection(name);

  let copied = 0;
  let batch = [];
  for await (const doc of from.find({})) {
    batch.push(doc);
    if (batch.length === BATCH) {
      await to.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await to.insertMany(batch, { ordered: false });
    copied += batch.length;
  }
  // An empty collection still has to exist: some tests count it.
  if (!copied) await target.createCollection(name).catch(() => {});

  const indexes = (await from.indexes()).filter((ix) => ix.name !== '_id_');
  for (const { key, name: ixName, v, ns, ...options } of indexes) {
    await to.createIndex(key, { name: ixName, ...options });
  }
  return { copied, indexes: indexes.length };
}

async function main() {
  if (!TARGET) throw new Error('No target database name.');
  if (hostsOf(TARGET_URI) === hostsOf(SOURCE_URI)) {
    throw new Error('TEST_MONGO_URI is the production cluster. The copy needs its own server (a local MongoDB).');
  }

  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 5000 });
  await targetClient.connect().catch((err) => {
    throw new Error(`Cannot reach the test server at ${hostsOf(TARGET_URI)} (${err.message}). Is MongoDB running?`);
  });
  await sourceClient.connect();
  try {
    const source = sourceClient.db(SOURCE);
    const target = targetClient.db(TARGET);

    const names = (await source.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((name) => !SKIP.some((re) => re.test(name)))
      .sort();

    console.log(`Copying ${names.length} collections: ${SOURCE} -> ${TARGET}${RESUME ? ' (resuming)' : ''}`);
    if (!RESUME) await target.dropDatabase();

    for (const name of names) {
      if (RESUME) {
        const [have, want] = await Promise.all([
          target.collection(name).countDocuments(),
          source.collection(name).countDocuments(),
        ]);
        if (have === want && (have > 0 || (await target.listCollections({ name }).hasNext()))) {
          console.log(`  ${name.padEnd(36)} ${String(have).padStart(6)} docs  already copied`);
          continue;
        }
        await target.collection(name).drop().catch(() => {});
      }
      // A collection that fails partway is dropped and copied again from the
      // start, after a pause for the connection to come back.
      for (let attempt = 1; ; attempt += 1) {
        const t0 = Date.now();
        try {
          const { copied, indexes } = await copyCollection(source, target, name);
          console.log(`  ${name.padEnd(36)} ${String(copied).padStart(6)} docs  ${indexes} indexes  ${Date.now() - t0} ms`);
          break;
        } catch (err) {
          await target.collection(name).drop().catch(() => {});
          if (attempt === 3) throw new Error(`${name}: ${err.message} — run again with --resume`);
          console.log(`  ${name.padEnd(36)} interrupted (${err.message.slice(0, 60)}), retrying`);
          await new Promise((resolve) => setTimeout(resolve, 15000 * attempt));
        }
      }
    }
    console.log('Done.');
  } finally {
    await Promise.all([sourceClient.close(), targetClient.close()]);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
