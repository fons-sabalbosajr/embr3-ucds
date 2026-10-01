import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// Request access, approval, sign-in landing, and the per-account theme.
//
//   - /register validates, records one pending request per address, and
//     answers the same whether or not the address is already known
//   - sign-up requests and account creation are for account managers
//   - a Developer signs in with a year already chosen; an Encoder does not
//   - a person's theme is saved on the account and comes back from /api/auth/me
//   - a person can edit only their own profile, and only profile fields
// ---------------------------------------------------------------------------

const PASSWORD = 'AuthFlowPw!x9';
const DEV = '__test_flow_dev';
const ENC = '__test_flow_enc';
const REQ_EMAIL = '__test_flow_request@test.local';

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return { agent, body: res.body };
}

let encoder;

beforeAll(async () => {
  await connectToMongo();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $in: [DEV, ENC] } });
  await collections.signUp.deleteMany({ email: { $in: [REQ_EMAIL, `${ENC}@test.local`] } });
  await collections.users.insertMany([
    { username: DEV, name: DEV, email: `${DEV}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [], password: hash },
    { username: ENC, name: ENC, email: `${ENC}@test.local`, division: 'TEST', status: 'offline', permission: 'viewer', assignedYears: [2025], bataan: 'view', password: hash },
  ]);
  encoder = await collections.users.findOne({ username: ENC });
});

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: [DEV, ENC] } });
  await collections.loginStatus.deleteMany({ username: { $in: [DEV, ENC] } });
  await collections.signUp.deleteMany({ email: { $in: [REQ_EMAIL, `${ENC}@test.local`] } });
});

describe('request access', () => {
  it('validates, records once, and never reveals whether an address is known', async () => {
    expect((await request(app).post('/register').send({ name: 'A', division: 'B', position: 'C', email: 'not-an-email' })).status).toBe(400);
    expect((await request(app).post('/register').send({ name: '', division: 'B', position: 'C', email: REQ_EMAIL })).status).toBe(400);

    const first = await request(app).post('/register').send({ name: '<b>Test</b> Person ', division: 'ORD-PISMU', position: 'Clerk', email: REQ_EMAIL.toUpperCase() });
    expect(first.status).toBe(201);
    const stored = await collections.signUp.find({ email: REQ_EMAIL }).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Test Person');
    expect(stored[0].status).toBe('pending');

    // Same address again: same answer, still one request.
    const again = await request(app).post('/register').send({ name: 'Test Person', division: 'ORD-PISMU', position: 'Clerk', email: REQ_EMAIL });
    expect(again.status).toBe(201);
    expect(await collections.signUp.countDocuments({ email: REQ_EMAIL })).toBe(1);

    // An address that already has an account: same answer, nothing recorded.
    const known = await request(app).post('/register').send({ name: 'X', division: 'Y', position: 'Z', email: `${ENC}@test.local` });
    expect(known.status).toBe(201);
    expect(await collections.signUp.countDocuments({ email: `${ENC}@test.local` })).toBe(0);
  });

  it('keeps the request queue and account creation to account managers', async () => {
    const { agent: enc } = await signIn(ENC);
    expect((await enc.get('/api/sign-up')).status).toBe(403);
    expect((await enc.post('/api/newusers').send({ name: 'n', email: 'x@test.local', division: 'd', status: 'offline', password: 'p', username: 'u' })).status).toBe(403);
    expect((await enc.get('/api/generate-password')).status).toBe(403);

    const { agent: dev } = await signIn(DEV);
    const list = await dev.get('/api/sign-up');
    expect(list.status).toBe(200);
    expect(list.body.some((r) => r.email === REQ_EMAIL)).toBe(true);
  });
});

describe('sign-in landing', () => {
  it('gives a Developer a year at sign-in and sends an Encoder to the picker', async () => {
    const { body: devBody, agent: dev } = await signIn(DEV);
    expect(devBody.activeYear).toBeTruthy();
    const active = await dev.get('/api/years/active');
    expect(active.body.activeYear).toBe(devBody.activeYear);

    const { body: encBody } = await signIn(ENC);
    expect(encBody.activeYear).toBeNull();
  });
});

describe('own profile and theme', () => {
  it('saves the theme on the account and returns it from /api/auth/me', async () => {
    const { agent } = await signIn(ENC);
    const bad = await agent.put('/api/profile/theme').send({ theme: { mode: 'purple' } });
    expect(bad.status).toBe(400);
    const ok = await agent.put('/api/profile/theme').send({ theme: { mode: 'light', accent: 'teal', density: 'compact', tintedSider: false } });
    expect(ok.status).toBe(200);
    expect(ok.body.theme).toMatchObject({ mode: 'light', accent: 'teal', density: 'compact', tintedSider: false });
    const me = await agent.get('/api/auth/me');
    expect(me.body.theme).toMatchObject({ mode: 'light', accent: 'teal' });
    // Signing in again reports it as well.
    const { body } = await signIn(ENC);
    expect(body.theme).toMatchObject({ mode: 'light' });
  });

  it('lets a person edit only their own profile, and only profile fields', async () => {
    const { agent: enc } = await signIn(ENC);
    const dev = await collections.users.findOne({ username: DEV });
    expect((await enc.put(`/api/profile/update/${dev._id}`).send({ name: 'Hijack' })).status).toBe(403);
    const res = await enc.put(`/api/profile/update/${encoder._id}`).send({ designation: 'Encoder II', permission: 'developer', assignedYears: [2099] });
    expect(res.status).toBe(200);
    const after = await collections.users.findOne({ _id: encoder._id });
    expect(after.designation).toBe('Encoder II');
    expect(after.permission).toBe('viewer');
    expect(after.assignedYears).toEqual([2025]);
  });
});
