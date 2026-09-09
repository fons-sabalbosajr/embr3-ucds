import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import secrets from '../services/secrets.js';
import credentials from '../services/nasCredentials.js';
import nas from '../services/nasStorage.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Rotating the NAS credentials from Admin Settings.
//
// Two things have to hold and neither is obvious:
//
//   1. The password never comes back out. It is encrypted at rest and no
//      endpoint returns it, so a screen can say "a password is set" and
//      nothing more.
//   2. A change is in force on the next request. nasConfig() is synchronous
//      and cached, so saving has to refresh that cache — otherwise the new
//      share is stored but the old one is still being read.
// ---------------------------------------------------------------------------

const PASSWORD = 'CredTest!x9';
const DEV = '__test_cred_dev';
const PLANNER = '__test_cred_planner';
const USERNAMES = [DEV, PLANNER];

const SECRET = 'not-a-real-password-just-a-test-value';

let savedDoc;
let savedEnvRoot;

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await connectToMongo();
  const hash = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    {
      username: DEV, name: DEV, email: `${DEV}@test.local`, division: 'TEST',
      status: 'offline', assignedYears: [2025], password: hash, permission: 'developer',
    },
    {
      username: PLANNER, name: PLANNER, email: `${PLANNER}@test.local`, division: 'TEST',
      status: 'offline', assignedYears: [2025], password: hash, permission: 'planning',
      domains: ['ucds'],
    },
  ]);
  savedDoc = await getDb().collection(credentials.COLLECTION).findOne({ _id: credentials.DOC_ID });
  savedEnvRoot = process.env.NAS_ROOT;
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections['loginStatus'].deleteMany({ username: { $in: USERNAMES } });
  const col = getDb().collection(credentials.COLLECTION);
  if (savedDoc) await col.replaceOne({ _id: credentials.DOC_ID }, savedDoc, { upsert: true });
  else await col.deleteOne({ _id: credentials.DOC_ID });
  process.env.NAS_ROOT = savedEnvRoot;
  await nas.refreshConfig();
}, 60000);

beforeEach(async () => {
  await getDb().collection(credentials.COLLECTION).deleteOne({ _id: credentials.DOC_ID });
  await nas.refreshConfig();
});

describe('encryption at rest', () => {
  it('is available, so credentials can be stored at all', () => {
    expect(secrets.isConfigured()).toBe(true);
  });

  it('round-trips a value', () => {
    const box = secrets.encrypt(SECRET);
    expect(box).toBeTruthy();
    expect(JSON.stringify(box)).not.toContain(SECRET);
    expect(secrets.decrypt(box)).toBe(SECRET);
  });

  it('refuses a tampered ciphertext rather than returning something else', () => {
    const box = secrets.encrypt(SECRET);
    const flipped = Buffer.from(box.data, 'base64');
    flipped[0] ^= 0xff;
    expect(secrets.decrypt({ ...box, data: flipped.toString('base64') })).toBeNull();
  });

  it('cannot be read with a different key', () => {
    const box = secrets.encrypt(SECRET);
    const original = process.env.CONFIG_ENCRYPTION_KEY;
    process.env.CONFIG_ENCRYPTION_KEY = 'a-completely-different-key-value';
    const out = secrets.decrypt(box);
    process.env.CONFIG_ENCRYPTION_KEY = original;
    expect(out).toBeNull();
  });
});

describe('storing credentials', () => {
  it('never stores the password in readable form', async () => {
    await credentials.save(
      { root: '\\\\10.0.0.5\\SHARE', username: 'svc', password: SECRET },
      { username: DEV }
    );
    const doc = await getDb().collection(credentials.COLLECTION).findOne({ _id: credentials.DOC_ID });
    expect(JSON.stringify(doc)).not.toContain(SECRET);
    expect(doc.password.data).toBeTruthy();
  });

  it('never returns the password from describe()', async () => {
    await credentials.save(
      { root: '\\\\10.0.0.5\\SHARE', username: 'svc', password: SECRET },
      { username: DEV }
    );
    const shown = await credentials.describe();
    expect(JSON.stringify(shown)).not.toContain(SECRET);
    expect(shown.password).toBeUndefined();
    // What a screen actually needs: that one exists.
    expect(shown.passwordSet).toBe(true);
  });

  it('keeps the stored password when a save omits it', async () => {
    await credentials.save(
      { root: '\\\\10.0.0.5\\SHARE', username: 'svc', password: SECRET },
      { username: DEV }
    );
    // Correcting the share name must not blank the secret, or every edit would
    // silently break authentication.
    await credentials.save({ root: '\\\\10.0.0.5\\OTHER', username: 'svc' }, { username: DEV });
    const resolved = await credentials.resolve();
    expect(resolved.password).toBe(SECRET);
    expect(resolved.root).toBe('\\\\10.0.0.5\\OTHER');
  });

  it('rejects a share path that is not UNC', async () => {
    const res = await credentials.save({ root: 'Z:\\RECORDS' }, { username: DEV });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('BAD_ROOT');
  });

  it('rejects a base directory that is a drive or UNC path', async () => {
    const res = await credentials.save(
      { root: '\\\\10.0.0.5\\SHARE', baseDir: 'Z:\\RECORDS' },
      { username: DEV }
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('BAD_BASE_DIR');
  });
});

describe('the environment remains the fallback', () => {
  it('is used when nothing is stored', async () => {
    const shown = await credentials.describe();
    expect(shown.source).toBe('environment');
  });

  it('is superseded once something is stored', async () => {
    await credentials.save({ root: '\\\\10.0.0.5\\SHARE', username: 'svc' }, { username: DEV });
    const shown = await credentials.describe();
    expect(shown.source).toBe('database');
    expect(shown.host).toBe('10.0.0.5');
  });

  it('comes back after a reset', async () => {
    await credentials.save({ root: '\\\\10.0.0.5\\SHARE' }, { username: DEV });
    await credentials.reset();
    expect((await credentials.describe()).source).toBe('environment');
  });
});

describe('a change is in force immediately', () => {
  it('the resolved share follows a save without a restart', async () => {
    // nasConfig() is synchronous and cached, so this is the assertion that
    // matters: storing a new share is not the same as using it.
    await credentials.save({ root: '\\\\10.0.0.9\\NEWSHARE' }, { username: DEV });
    await nas.refreshConfig();
    expect(nas.nasConfig().root).toBe('\\\\10.0.0.9\\NEWSHARE');

    await credentials.save({ root: '\\\\10.0.0.9\\CHANGEDAGAIN' }, { username: DEV });
    await nas.refreshConfig();
    expect(nas.nasConfig().root).toBe('\\\\10.0.0.9\\CHANGEDAGAIN');
  });

  it('resolves document paths against the new share', async () => {
    await credentials.save({ root: '\\\\10.0.0.9\\NEWSHARE' }, { username: DEV });
    await nas.refreshConfig();
    expect(nas.resolveSharePath('RECORDS\\a.pdf')).toBe('\\\\10.0.0.9\\NEWSHARE\\RECORDS\\a.pdf');
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    expect((await request(app).get('/api/nas/config')).status).toBe(401);
    expect((await request(app).put('/api/nas/config').send({})).status).toBe(401);
    expect((await request(app).delete('/api/nas/config')).status).toBe(401);
  });

  it('refuses a signed-in non-developer', async () => {
    const agent = await signIn(PLANNER);
    expect((await agent.get('/api/nas/config')).status).toBe(403);
    expect((await agent.put('/api/nas/config').send({ root: '\\\\x\\y' })).status).toBe(403);
    expect((await agent.delete('/api/nas/config')).status).toBe(403);
  });

  it('refuses a developer who has not verified', async () => {
    const agent = await signIn(DEV);
    const res = await agent.put('/api/nas/config').send({ root: '\\\\x\\y' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ELEVATION_REQUIRED');
  });
});
