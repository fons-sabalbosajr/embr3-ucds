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
const ADM = '__test_flow_adm';
const REQ_EMAIL = '__test_flow_request@test.local';
const ERMS_EMAIL = '__test_flow_erms@test.local';
const UCDS_EMAIL = '__test_flow_ucds@test.local';
// Made by approving requests, and removed afterwards.
const NEW_USER = 'tflow.new';
const UCDS_USER = 'tflow.ucds';
// An existing account whose username an approval may not reuse.
const TAKEN = 'tflow.taken';
const EMAILS = [REQ_EMAIL, ERMS_EMAIL, UCDS_EMAIL, 'sys1@test.local', `${ENC}@test.local`];
const USERS = [DEV, ENC, ADM, NEW_USER, UCDS_USER, TAKEN];

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
  await collections.users.deleteMany({ $or: [{ username: { $in: USERS } }, { email: { $in: EMAILS } }] });
  await collections.signUp.deleteMany({ email: { $in: EMAILS } });
  await collections.users.insertMany([
    { username: DEV, name: DEV, email: `${DEV}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [], password: hash },
    { username: ENC, name: ENC, email: `${ENC}@test.local`, division: 'TEST', status: 'offline', permission: 'viewer', assignedYears: [2025], bataan: 'view', password: hash },
    { username: ADM, name: ADM, email: `${ADM}@test.local`, division: 'TEST', status: 'offline', permission: 'admin', assignedYears: [], password: hash },
    { username: TAKEN, name: TAKEN, email: `${TAKEN}@test.local`, division: 'TEST', status: 'offline', permission: 'viewer', assignedYears: [], password: hash },
  ]);
  encoder = await collections.users.findOne({ username: ENC });
});

afterAll(async () => {
  await collections.users.deleteMany({ $or: [{ username: { $in: USERS } }, { email: { $in: [ERMS_EMAIL, UCDS_EMAIL] } }] });
  await collections.loginStatus.deleteMany({ username: { $in: USERS } });
  await collections.signUp.deleteMany({ email: { $in: EMAILS } });
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

  it('records the system asked for, and refuses an unknown one or an ERMS request without a unit', async () => {
    expect((await request(app).post('/register').send({ name: 'A', division: 'B', position: 'C', email: 'sys1@test.local', system: 'payroll' })).status).toBe(400);
    expect((await request(app).post('/register').send({ name: 'A', division: 'B', position: 'C', email: 'sys1@test.local', system: 'erms' })).status).toBe(400);
    const ok = await request(app).post('/register').send({ name: 'Lab Person', division: 'ORD-LAB', position: 'Analyst', email: ERMS_EMAIL, system: 'erms', ermsUnit: 'laboratory' });
    expect(ok.status).toBe(201);
    expect(await collections.signUp.findOne({ email: ERMS_EMAIL })).toMatchObject({ system: 'erms', ermsUnit: 'laboratory', status: 'pending' });
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

describe('a Developer decides each request', () => {
  it('lets only the Developer approve; the account is made with the access chosen and can sign in', async () => {
    const req = await collections.signUp.findOne({ email: ERMS_EMAIL });
    const body = { username: NEW_USER, permission: 'records', ermsUnit: 'laboratory', provinces: ['bataan', 'pampanga'] };

    // An Encoder cannot, and neither can a legacy Administrator.
    const { agent: enc } = await signIn(ENC);
    expect((await enc.post(`/api/sign-up/${req._id}/approve`).send(body)).status).toBe(403);
    const { agent: adm } = await signIn(ADM);
    expect((await adm.post(`/api/sign-up/${req._id}/approve`).send(body)).status).toBe(403);
    expect((await adm.get('/api/sign-up')).status).toBe(403);

    const { agent: dev } = await signIn(DEV);
    // The list suggests a free username for a waiting request.
    const waiting = await dev.get('/api/sign-up').query({ status: 'pending' });
    expect(waiting.body.find((r) => r.email === ERMS_EMAIL).suggestedUsername).toBe('lperson');
    expect(waiting.body.every((r) => r.status === 'pending')).toBe(true);

    // Missing the unit for an ERMS account: refused, nothing made.
    expect((await dev.post(`/api/sign-up/${req._id}/approve`).send({ ...body, ermsUnit: 'payroll' })).status).toBe(400);
    // A username already in use: refused with a free one to try.
    const clash = await dev.post(`/api/sign-up/${req._id}/approve`).send({ ...body, username: TAKEN.toUpperCase() });
    expect(clash.status).toBe(409);
    expect(await collections.signUp.findOne({ _id: req._id })).toMatchObject({ status: 'pending' });

    const res = await dev.post(`/api/sign-up/${req._id}/approve`).send(body);
    expect(res.status).toBe(201);
    // Mail is not configured in the tests, so the Developer is shown the password to pass on.
    expect(res.body.emailSent).toBe(false);
    expect(res.body.temporaryPassword).toMatch(/^.{14}$/);
    expect(res.body.user.password).toBeUndefined();

    const account = await collections.users.findOne({ username: NEW_USER });
    expect(account).toMatchObject({ permission: 'records', ermsUnit: 'laboratory', nasContainers: ['laboratory'], bataan: 'readWrite', pampanga: 'readWrite', aurora: 'none' });
    expect(await collections.signUp.findOne({ _id: req._id })).toMatchObject({ status: 'approved', decidedBy: DEV, username: NEW_USER });

    // A second approval of the same request is refused.
    expect((await dev.post(`/api/sign-up/${req._id}/approve`).send({ ...body, username: `${NEW_USER}2` })).status).toBe(409);

    // The new person signs in with the temporary password and lands in ERMS, their unit.
    const signin = await request.agent(app).post('/login').send({ username: ERMS_EMAIL, password: res.body.temporaryPassword });
    expect(signin.status).toBe(200);
    expect(signin.body).toMatchObject({ role: 'records', ermsUnit: 'laboratory', domains: ['erms'] });
  });

  it('declines a request with a reason, once', async () => {
    const req = await collections.signUp.findOne({ email: REQ_EMAIL });
    const { agent: dev } = await signIn(DEV);
    const res = await dev.post(`/api/sign-up/${req._id}/reject`).send({ reason: 'Not <b>EMB</b> personnel' });
    expect(res.status).toBe(200);
    expect(await collections.signUp.findOne({ _id: req._id })).toMatchObject({ status: 'rejected', reason: 'Not EMB personnel', decidedBy: DEV });
    expect((await dev.post(`/api/sign-up/${req._id}/reject`).send({})).status).toBe(409);
    expect((await dev.post(`/api/sign-up/${req._id}/approve`).send({ username: 'x123', permission: 'viewer', assignedYears: [], provinces: ['bataan'] })).status).toBe(409);
    expect(await collections.users.countDocuments({ email: REQ_EMAIL })).toBe(0);
  });

  it('asks a UCDS account for its year containers and provinces', async () => {
    await collections.signUp.deleteMany({ email: UCDS_EMAIL });
    const { insertedId } = await collections.signUp.insertOne({ name: 'Ucds Person', division: 'PISMU', position: 'Encoder', email: UCDS_EMAIL, system: 'ucds', status: 'pending', requestedAt: new Date() });
    const { agent: dev } = await signIn(DEV);
    const years = await dev.get('/api/years');
    const year = years.body.years[0].year;
    expect((await dev.post(`/api/sign-up/${insertedId}/approve`).send({ username: UCDS_USER, permission: 'viewer', provinces: ['bataan'] })).status).toBe(400);
    expect((await dev.post(`/api/sign-up/${insertedId}/approve`).send({ username: UCDS_USER, permission: 'viewer', assignedYears: [year] })).status).toBe(400);
    const ok = await dev.post(`/api/sign-up/${insertedId}/approve`).send({ username: UCDS_USER, permission: 'viewer', assignedYears: [year], provinces: ['bataan'] });
    expect(ok.status).toBe(201);
    expect(await collections.users.findOne({ username: UCDS_USER })).toMatchObject({ permission: 'viewer', assignedYears: [year], bataan: 'readWrite', canManageData: true, nasContainers: [] });
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
