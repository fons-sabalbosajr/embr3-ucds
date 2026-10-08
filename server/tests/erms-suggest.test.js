import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Autocomplete on the upload forms, and the dashboards' short cache.
//
// Suggestions are values already on file, within what the caller may see:
// their own unit's documents, their own provinces' records. A docket number
// brings the company filed with it.
// ---------------------------------------------------------------------------

const PASSWORD = 'SuggestTestPw!x9';
const LEGAL = '__test_suggest_legal';
const LAB = '__test_suggest_lab';
const RECORDS_BATAAN = '__test_suggest_records';
const USERNAMES = [LEGAL, LAB, RECORDS_BATAAN];
const DOCKET = '__EMBR3-TEST-SUGGEST-001';

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline',
  assignedYears: [], aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let legal;
let lab;
let records;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal' }),
    base(LAB, { password, permission: 'records', ermsUnit: 'laboratory' }),
    base(RECORDS_BATAAN, { password, permission: 'records', bataan: 'readWrite' }),
  ]);
  const now = new Date();
  await getDb().collection('erms-documents').insertMany([
    { unit: 'legal', serialNo: '__TEST-SUG-1', docType: 'nov', province: 'bataan', createdAt: new Date(now - 2000), fields: { docketNo: DOCKET, companyName: '__Old Name Co.', companyAddress: 'Old address' } },
    { unit: 'legal', serialNo: '__TEST-SUG-2', docType: 'tc', province: 'bataan', createdAt: now, fields: { docketNo: DOCKET, companyName: '__Suggest Test Co.', companyAddress: 'Balanga, Bataan' } },
  ]);
  await collections.ermsRecords.insertMany([
    { serialNo: '__TEST-SUG-R1', proponentName: '__Suggest Proponent Bataan', projectTitle: '__Suggest Project B', location: { province: 'bataan' }, document: { uploadedAt: now } },
    { serialNo: '__TEST-SUG-R2', proponentName: '__Suggest Proponent Zambales', projectTitle: '__Suggest Project Z', location: { province: 'zambales' }, document: { uploadedAt: now } },
  ]);
  [legal, lab, records] = await Promise.all([signIn(LEGAL), signIn(LAB), signIn(RECORDS_BATAAN)]);
}, 90000);

afterAll(async () => {
  await getDb().collection('erms-documents').deleteMany({ serialNo: /^__TEST-SUG-/ });
  await collections.ermsRecords.deleteMany({ serialNo: /^__TEST-SUG-/ });
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
}, 60000);

describe('upload form suggestions', () => {
  it('offers a docket on file, with the company from its latest document', async () => {
    const res = await legal.get('/api/erms/units/legal/suggest').query({ field: 'docketNo', q: 'TEST-SUGGEST' });
    expect(res.status).toBe(200);
    const hit = res.body.items.find((i) => i.value === DOCKET);
    expect(hit).toBeTruthy();
    expect(hit.count).toBe(2);
    expect(hit.fill).toMatchObject({ companyName: '__Suggest Test Co.', companyAddress: 'Balanga, Bataan' });
  });

  it('keeps a unit’s values to that unit', async () => {
    const other = await lab.get('/api/erms/units/legal/suggest').query({ field: 'docketNo', q: 'TEST-SUGGEST' });
    expect(other.status).toBe(403);
  });

  it('refuses a field that is not offered', async () => {
    const res = await legal.get('/api/erms/units/legal/suggest').query({ field: 'password', q: 'a' });
    expect(res.status).toBe(400);
  });

  it('offers Records proponents only from the caller’s provinces', async () => {
    const res = await records.get('/api/erms/records/suggest').query({ field: 'proponentName', q: '__Suggest Proponent' });
    expect(res.status).toBe(200);
    const values = res.body.items.map((i) => i.value);
    expect(values).toContain('__Suggest Proponent Bataan');
    expect(values).not.toContain('__Suggest Proponent Zambales');
    expect(res.body.items.find((i) => i.value === '__Suggest Proponent Bataan').fill).toEqual({ projectTitle: '__Suggest Project B' });
  });

  it('treats what is typed as text, not a pattern', async () => {
    const res = await legal.get('/api/erms/units/legal/suggest').query({ field: 'docketNo', q: '.*' });
    expect(res.status).toBe(200);
    expect(res.body.items.find((i) => i.value === DOCKET)).toBeUndefined();
  });
});

describe('dashboard cache', () => {
  it('answers repeat requests from the cache and counts a new filing at once', async () => {
    const first = await legal.get('/api/erms/units/legal/dashboard');
    expect(first.status).toBe(200);
    const second = await legal.get('/api/erms/units/legal/dashboard');
    expect(second.body.total).toBe(first.body.total);

    // The instance the app holds (an `import` here would be a second copy).
    const shortCache = createRequire(import.meta.url)('../shared/services/shortCache.js');
    await getDb().collection('erms-documents').insertOne({ unit: 'legal', serialNo: '__TEST-SUG-3', docType: 'nov', province: 'bataan', createdAt: new Date(), fields: {} });
    // Without invalidation the cached total would still be served:
    const stale = await legal.get('/api/erms/units/legal/dashboard');
    expect(stale.body.total).toBe(first.body.total);
    shortCache.invalidate('erms:units:dashboard:legal');
    const fresh = await legal.get('/api/erms/units/legal/dashboard');
    expect(fresh.body.total).toBe(first.body.total + 1);
  });
});
