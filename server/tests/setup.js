// Loaded before any test file. config/db.js throws at module load without
// MONGO_URI, so the environment has to exist before the first import.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

// ---------------------------------------------------------------------------
// Protect live configuration from the test suite.
//
// This suite is deliberately an integration suite: it runs against the real
// database, because that is the only way to test province scoping, the domain
// boundary and the year containers honestly. The cost is that a test which
// writes application configuration changes the running deployment.
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
  } catch {
    // No database in this environment; nothing to protect.
    snapshot = null;
  }
}, 60000);

afterAll(async () => {
  if (!snapshot) return;
  try {
    const db = (await import('../config/db.js')).default;
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
