// Loaded before any test file. config/db.js throws at module load without
// MONGO_URI, so the environment has to exist before the first import.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

// ---------------------------------------------------------------------------
// Never the production database.
//
// The suite writes: throwaway accounts, records, settings. It used to do that
// to `universe-db` itself, so every run touched what staff were working with
// and a run interrupted halfway could leave it changed. It now runs against
// its own copy on its own server — TEST_MONGO_URI, a local MongoDB by default
// — and `npm run test:db:refresh` makes that copy from production.
//
// Its own server, not just its own database name: the production cluster is a
// free tier shared with six other applications and already near its 512 MB
// cap. A copy there filled it on 6 October 2026 and Atlas blocked writes for
// every application on the cluster until the copy was dropped.
//
// Set here, after .env is read and before config/db.js is first imported, so
// nothing in .env can carry the suite back to production.
// ---------------------------------------------------------------------------

// VERA never calls a model from the suite: .env turns the master switch on and
// holds real keys, so without this a test could spend money. VERA_ENABLED is
// read before AUTOMATION_AGENT_ENABLED (services/vera/provider.js).
process.env.VERA_ENABLED = 'false';

// HRPMS (services/hrpmsDirectory.js) is another system's production data:
// the suite never reaches it, and the portal falls back to the test
// database and then its built-in list.
process.env.MONGO_URI_HRPMS = '';

const productionUri = process.env.MONGO_URI;
process.env.MONGO_URI = String(process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017').trim();
process.env.MONGO_DB_NAME = String(process.env.TEST_MONGO_DB_NAME || 'universe-db-test').trim();
if (productionUri && process.env.MONGO_URI === productionUri) {
  throw new Error('TEST_MONGO_URI is the production cluster. The test suite needs its own server.');
}

// ---------------------------------------------------------------------------
// Protect configuration from the test suite.
//
// This suite is deliberately an integration suite: it runs against a copy of
// the real data, because that is the only way to test province scoping, the
// domain boundary and the year containers honestly. A test which writes
// application configuration still changes the copy for the files after it.
//
// That is not hypothetical. A test set the NAS activation window to one hour
// so it could assert document access, and did not put it back — so every full
// test run silently reset a 30-day window the developer had configured, and it
// looked like the application resetting itself.
//
// Snapshotting here rather than in each file is the point: a file that forgets
// to restore, or a file added later, is covered anyway. Individual tests may
// still snapshot their own documents; this is the backstop.
//
// `app-config` holds NAS activation, NAS credentials and the verification
// PINs — everything the application treats as durable settings.
// ---------------------------------------------------------------------------

const PROTECTED_COLLECTION = 'app-config';
let snapshot = null;

beforeAll(async () => {
  try {
    const db = (await import('../config/db.js')).default;
    await db.connectToMongo();
    snapshot = await db.getDb().collection(PROTECTED_COLLECTION).find({}).toArray();
    // The units' working rules (Settings › ERMS) are enforced by the API —
    // required fields, refused duplicates — so a rule a clerk switched on
    // would fail tests that file minimal records. Every run starts from the
    // defaults; the snapshot above puts the real settings back afterwards.
    await db.getDb().collection(PROTECTED_COLLECTION).deleteOne({ _id: 'erms-unit-settings' });
    // What server.js does at startup and app.js (which the suite loads) does
    // not: register the baseline year container when there is none. A copy of
    // production already has its years and this changes nothing; an empty
    // test database would otherwise have no year to sign in to.
    await (await import('../services/yearService.js')).default.ensureSeeded();
  } catch {
    // No database in this environment; nothing to protect.
    snapshot = null;
  }
}, 60000);

afterAll(async () => {
  if (!snapshot) return;
  try {
    const db = (await import('../config/db.js')).default;
    // Every test file signs in throwaway "__test_*" accounts and removes them
    // afterwards, but not the sign-in history each sign-in writes
    // (services/signInHistory.js). Cleared here once, for all of them.
    await db.getDb().collection('sign-in-history').deleteMany({ username: /^__test_/ });
    const col = db.getDb().collection(PROTECTED_COLLECTION);

    // Put back exactly what was there: restore every captured document and
    // remove anything a test introduced.
    const keptIds = snapshot.map((doc) => doc._id);
    await col.deleteMany(keptIds.length ? { _id: { $nin: keptIds } } : {});
    for (const doc of snapshot) {
      await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  } catch (err) {
    // Loud, because a failure here leaves the deployment misconfigured.
    console.error('Could not restore app-config after tests:', err.message);
  }
}, 60000);
