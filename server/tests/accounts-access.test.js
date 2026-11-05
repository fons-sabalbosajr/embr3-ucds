import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// Signing in by username, and the modules an account enters.
//
// An account's username must work however it is typed, and must only ever sign
// in that account. The modules are the one part of an account's access the
// server enforced with no way to set them.
// ---------------------------------------------------------------------------

const PASSWORD = 'AccountsTest!x9';
const DEVELOPER = '__test_acc_dev';
const PLANNER = '__test_acc_Planner';
const USERNAMES = [DEVELOPER, PLANNER];
const emailOf = (u) => `${u}@test.local`;
const accounts = {};

const base = (username, extra) => ({
  username,
  name: username,
  email: emailOf(username),
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'readWrite',
  ...extra,
});

async function signIn(username, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password });
  return { agent, res };
}

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $regex: /^__test_acc_/i } });
  await collections.users.insertMany([base(DEVELOPER, { password, permission: 'developer' }), base(PLANNER, { password, permission: 'planning' })]);
  for (const u of USERNAMES) accounts[u] = await collections.users.findOne({ username: u });
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $regex: /^__test_acc_/i } });
  await collections.loginStatus.deleteMany({ userId: { $in: Object.values(accounts).map((a) => a._id) } });
}, 60000);

describe('signing in by username', () => {
  it('finds the account as typed, in any capitals, with stray spaces, or by its email', async () => {
    for (const typed of [PLANNER, PLANNER.toUpperCase(), PLANNER.toLowerCase(), `  ${PLANNER} `, emailOf(PLANNER), emailOf(PLANNER).toUpperCase()]) {
      const { res } = await signIn(typed);
      expect(res.status, typed).toBe(200);
    }
  });

  it('signs in that account and no other', async () => {
    const { agent } = await signIn(PLANNER.toUpperCase());
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.username).toBe(PLANNER);
  });

  it('refuses a wrong password, and an unknown name, in the same words', async () => {
    const wrong = await signIn(PLANNER, 'not the password');
    const unknown = await signIn('__test_acc_nobody');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.body.error).toBe(unknown.res.body.error);
  });

  it('will not make an account whose username differs from another only in capitals', async () => {
    const { agent } = await signIn(DEVELOPER);
    const res = await agent.post('/api/newusers').send({ name: 'x', email: emailOf('__test_acc_other'), division: 'TEST', status: 'offline', password: PASSWORD, username: PLANNER.toUpperCase() });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Username already exists/);
  });
});

describe('the modules an account enters', () => {
  const url = (u) => `/api/users/${accounts[u]._id}/domains`;

  it('are the Developer’s to set', async () => {
    const { agent } = await signIn(PLANNER);
    expect((await agent.put(url(PLANNER)).send({ domains: ['ucds', 'erms'] })).status).toBe(403);
    expect((await collections.users.findOne({ username: PLANNER })).domains).toBeUndefined();
  });

  it('let a Planning Admin into ERMS as well, once the app next asks who they are', async () => {
    const { agent: planner } = await signIn(PLANNER);
    expect((await planner.get('/api/erms/filter-options')).status).toBe(403);

    const { agent: dev } = await signIn(DEVELOPER);
    expect((await dev.put(url(PLANNER)).send({ domains: ['ucds', 'erms'] })).status).toBe(200);
    expect((await collections.users.findOne({ username: PLANNER })).domains).toEqual(['ucds', 'erms']);

    // What the app asks on load brings the session up to date.
    expect((await planner.get('/api/auth/me')).status).toBe(200);
    expect((await planner.get('/api/erms/filter-options')).status).toBe(200);
  });

  it('follow the type again when set back to what the type gives', async () => {
    const { agent: dev } = await signIn(DEVELOPER);
    expect((await dev.put(url(PLANNER)).send({ domains: ['ucds'] })).status).toBe(200);
    expect((await collections.users.findOne({ username: PLANNER })).domains).toBeUndefined();
  });

  it('never include Administration, nothing at all, or an account that holds every module', async () => {
    const { agent: dev } = await signIn(DEVELOPER);
    expect((await dev.put(url(PLANNER)).send({ domains: ['ucds', 'admin'] })).status).toBe(400);
    expect((await dev.put(url(PLANNER)).send({ domains: [] })).status).toBe(400);
    expect((await dev.put(url(PLANNER)).send({ domains: ['nonsense'] })).status).toBe(400);
    expect((await dev.put(url(DEVELOPER)).send({ domains: ['ucds'] })).status).toBe(400);
    expect((await dev.put(`/api/users/${'0'.repeat(24)}/domains`).send({ domains: ['ucds'] })).status).toBe(404);
  });
});
