import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// Account details and year assignment, over HTTP.
//
//   - a Developer assigns year containers to an account; unknown years are
//     refused
//   - PUT /api/users/:id is for account managers, and cannot smuggle access
//     fields (permission, containers, years, capabilities, provinces)
//   - an Encoder cannot touch another account's details at all
// ---------------------------------------------------------------------------

const PASSWORD = 'AccessTestPw!x9';
const DEV = '__test_acc_dev';
const ENC = '__test_acc_enc';
const YEAR = 2002;

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let encoder;

beforeAll(async () => {
  await connectToMongo();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $in: [DEV, ENC] } });
  await collections.users.insertMany([
    { username: DEV, name: DEV, email: `${DEV}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [], password: hash },
    { username: ENC, name: ENC, email: `${ENC}@test.local`, division: 'TEST', status: 'offline', permission: 'viewer', assignedYears: [], bataan: 'view', password: hash },
  ]);
  encoder = await collections.users.findOne({ username: ENC });
  await collections.yearContainers.deleteOne({ year: YEAR });
  await collections.yearContainers.insertOne({ year: YEAR, label: `${YEAR} Data (test)`, status: 'active', createdAt: new Date() });
});

afterAll(async () => {
  await collections.yearContainers.deleteOne({ year: YEAR });
  await collections.users.deleteMany({ username: { $in: [DEV, ENC] } });
  await collections.loginStatus.deleteMany({ username: { $in: [DEV, ENC] } });
});

describe('year assignment', () => {
  it('assigns known years, refuses unknown ones, and shows on the account', async () => {
    const dev = await signIn(DEV);
    const ok = await dev.put(`/api/users/${encoder._id}/years`).send({ years: [YEAR, YEAR] });
    expect(ok.status).toBe(200);
    expect(ok.body.assignedYears).toEqual([YEAR]);

    const bad = await dev.put(`/api/users/${encoder._id}/years`).send({ years: [1999] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('1999');

    const enc = await signIn(ENC);
    const years = await enc.get('/api/years');
    expect(years.body.years.map((y) => y.year)).toContain(YEAR);

    // An Encoder cannot assign years, to themselves or anyone.
    expect((await enc.put(`/api/users/${encoder._id}/years`).send({ years: [YEAR] })).status).toBe(403);
  });
});

describe('account details', () => {
  it('lets a Developer edit details but not access fields through them; refuses an Encoder', async () => {
    const dev = await signIn(DEV);
    const res = await dev.put(`/api/users/${encoder._id}`).send({ designation: 'Clerk', permission: 'developer', nasContainers: ['records'], assignedYears: [1999], bataan: 'readWrite', canManageData: true });
    expect(res.status).toBe(200);
    const after = await collections.users.findOne({ _id: encoder._id });
    expect(after.designation).toBe('Clerk');
    expect(after.permission).toBe('viewer');
    expect(after.nasContainers).toBeUndefined();
    expect(after.assignedYears).toEqual([YEAR]);
    expect(after.bataan).toBe('view');
    expect(after.canManageData).toBeUndefined();

    const enc = await signIn(ENC);
    expect((await enc.put(`/api/users/${encoder._id}`).send({ designation: 'Boss' })).status).toBe(403);
  });
});
