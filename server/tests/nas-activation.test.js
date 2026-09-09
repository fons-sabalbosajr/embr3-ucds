import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import activation from '../services/nasActivation.js';
import nas from '../services/nasStorage.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Application-wide NAS activation, and the file explorer's path containment.
//
// The activation window exists because the records share is unavailable at
// weekends. The point of these tests is that the *server* decides — a client
// cannot extend a window, and an expired one closes on its own without anyone
// remembering to switch it off.
// ---------------------------------------------------------------------------

const PASSWORD = 'ActivationTest!x9';
const DEV = '__test_act_dev';
const PLANNER = '__test_act_planner';
const USERNAMES = [DEV, PLANNER];

const minutes = (n) => n * 60 * 1000;

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let saved;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    {
      username: DEV, name: DEV, email: `${DEV}@test.local`, division: 'TEST',
      status: 'offline', assignedYears: [2025], password, permission: 'developer',
    },
    {
      username: PLANNER, name: PLANNER, email: `${PLANNER}@test.local`, division: 'TEST',
      status: 'offline', assignedYears: [2025], password, permission: 'planning',
      domains: ['ucds'],
    },
  ]);
  // Keep whatever the deployment actually has, and put it back afterwards.
  saved = await getDb().collection(activation.COLLECTION).findOne({ _id: activation.DOC_ID });
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections['loginStatus'].deleteMany({ username: { $in: USERNAMES } });
  const col = getDb().collection(activation.COLLECTION);
  if (saved) await col.replaceOne({ _id: activation.DOC_ID }, saved, { upsert: true });
  else await col.deleteOne({ _id: activation.DOC_ID });
}, 60000);

const write = (doc) =>
  getDb()
    .collection(activation.COLLECTION)
    .updateOne({ _id: activation.DOC_ID }, { $set: doc }, { upsert: true });

describe('the activation window is evaluated on the server', () => {
  it('is inactive when switched off', async () => {
    await write({ enabled: false, startsAt: null, endsAt: null });
    const state = await activation.evaluate();
    expect(state.active).toBe(false);
    expect(state.reason).toBe('disabled');
  });

  it('is active inside its window', async () => {
    const now = new Date();
    await write({
      enabled: true,
      startsAt: new Date(now.getTime() - minutes(5)),
      endsAt: new Date(now.getTime() + minutes(60)),
    });
    const state = await activation.evaluate();
    expect(state.active).toBe(true);
    expect(state.remainingMs).toBeGreaterThan(0);
  });

  it('closes on its own once the window has passed', async () => {
    // The case this exists for: nobody has to remember to switch it off.
    const now = new Date();
    await write({
      enabled: true,
      startsAt: new Date(now.getTime() - minutes(120)),
      endsAt: new Date(now.getTime() - minutes(1)),
    });
    const state = await activation.evaluate();
    expect(state.active).toBe(false);
    expect(state.reason).toBe('expired');
  });

  it('is not yet active before its window opens', async () => {
    const now = new Date();
    await write({
      enabled: true,
      startsAt: new Date(now.getTime() + minutes(30)),
      endsAt: new Date(now.getTime() + minutes(90)),
    });
    const state = await activation.evaluate();
    expect(state.active).toBe(false);
    expect(state.reason).toBe('not-yet');
  });

  it('distinguishes "inactive" from "unreachable"', async () => {
    // Different problems with different fixes: one is a setting, the other is
    // the network. Collapsing them sends people to the wrong place.
    const now = new Date();
    await write({ enabled: true, startsAt: now, endsAt: new Date(now.getTime() + minutes(30)) });
    const state = await activation.evaluate();
    expect(state.active).toBe(true);

    const probe = await nas.testConnection();
    expect(typeof probe.ok).toBe('boolean');
    // Being active says nothing about whether the share answers, and vice versa.
    expect(state.reason).toBeNull();
  });

  it('refuses a window that ends before it starts', async () => {
    const now = new Date();
    const result = await activation.setActivation(
      { enabled: true, startsAt: now, endsAt: new Date(now.getTime() - minutes(10)) },
      { username: 'test' }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BAD_WINDOW');
  });

  it('computes the end from a duration, so the client cannot extend it', async () => {
    const result = await activation.setActivation(
      { enabled: true, durationMinutes: 90 },
      { username: 'test' }
    );
    expect(result.ok).toBe(true);
    const span = new Date(result.state.endsAt) - new Date(result.state.startsAt);
    expect(Math.round(span / 60000)).toBe(90);
  });
});

describe('document access follows the activation window', () => {
  it('refuses a document read when the window has expired', async () => {
    const now = new Date();
    await write({
      enabled: true,
      startsAt: new Date(now.getTime() - minutes(120)),
      endsAt: new Date(now.getTime() - minutes(1)),
    });
    const agent = await signIn(DEV);
    const res = await agent.get('/api/erms/records/FSN-0000001/file');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NAS_INACTIVE');
    expect(res.body.reason).toBe('expired');
  });
});

describe('the file explorer is developer-only and stays inside the share', () => {
  beforeEach(async () => {
    const now = new Date();
    await write({ enabled: true, startsAt: now, endsAt: new Date(now.getTime() + minutes(60)) });
  });

  it('refuses an unauthenticated caller', async () => {
    for (const path of ['/api/nas/browse', '/api/nas/file?path=a.pdf', '/api/nas/activation']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('refuses a signed-in non-developer', async () => {
    const agent = await signIn(PLANNER);
    expect((await agent.get('/api/nas/browse')).status).toBe(403);
    expect((await agent.get('/api/nas/file?path=a.pdf')).status).toBe(403);
    expect((await agent.put('/api/nas/activation').send({ enabled: true })).status).toBe(403);
  });

  it('refuses a developer who has not verified by email', async () => {
    const agent = await signIn(DEV);
    const res = await agent.get('/api/nas/browse');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ELEVATION_REQUIRED');
  });

  it('cannot be walked out of the share root', async () => {
    // Asserted at the service, because the route is behind an emailed code and
    // the containment rule is what actually matters here.
    for (const attempt of [
      '../..',
      '..\\..\\Windows',
      'RECORDS/../../../etc',
      '/etc',
      '\\\\evil-host\\share',
    ]) {
      const result = await nas.listDirectory(attempt);
      if (result.ok) {
        // If it resolved at all, it must still be inside the configured root.
        expect(result.path.includes('..')).toBe(false);
      } else {
        expect(['invalid-path', 'missing', 'not-configured', 'unreachable', 'denied']).toContain(
          result.reason
        );
      }
    }
  });

  it('never returns an absolute path to the client', async () => {
    const result = await nas.listDirectory('');
    if (!result.ok) return; // share unreachable in this environment
    expect(result.path).not.toMatch(/^[A-Za-z]:|^\\\\/);
    for (const entry of result.entries) {
      expect(entry.path).not.toMatch(/^[A-Za-z]:|^\\\\/);
      expect(entry).not.toHaveProperty('resolved');
    }
  });
});
