import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const require = createRequire(import.meta.url);
const { isRecordsUnit, viewPermission } = require('../modules/erms/services/accessRequestService.js');
const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The Records Unit is the Records Unit's own staff.
//
// Legal Services and Laboratory staff hold the same ERMS User role for their
// own units. They used to pass the Records Unit check as well — opening any
// Records scan. They do not: a Records scan is the Records Unit's, and
// anyone else asks in the Document Portal. On the portal's desk each unit
// decides the requests for its own documents, and no other unit's.
// ---------------------------------------------------------------------------

const PASSWORD = 'RecordsUnitPw!x9';
const RECORDS = '__test_ru_records';
const LEGACY = '__test_ru_legacy'; // an ERMS User from before units existed
const LEGAL = '__test_ru_legal';
const LAB = '__test_ru_lab';
const ASKER = '__test_ru_asker';
const USERNAMES = [RECORDS, LEGACY, LEGAL, LAB, ASKER];
const SERIAL = '__TEST-RU-1';

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite', nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
  ...extra,
});

const agents = {};
async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  agents[username] = agent;
}

const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-records').deleteMany({ serialNo: SERIAL });
};

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(RECORDS, { password, permission: 'records', ermsUnit: 'records', domains: ['erms'] }),
    base(LEGACY, { password, permission: 'records', domains: ['erms'] }),
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal', domains: ['erms'] }),
    base(LAB, { password, permission: 'records', ermsUnit: 'laboratory', domains: ['erms'] }),
    base(ASKER, { password, permission: 'planning', domains: ['ucds', 'erms'] }),
  ]);
  await getDb().collection('erms-records').insertOne({ serialNo: SERIAL, proponentName: '__Test RU Firm', projectTitle: 'Test', permit: { type: 'cnc' }, location: { province: 'bataan' }, document: { fileName: 'ru.pdf' } });
  for (const u of USERNAMES) await signIn(u);
}, 60000);

afterAll(cleanUp, 60000);

describe('the Records Unit check', () => {
  it('holds the Records Unit’s staff, the Developer and an ERMS Administrator — not Legal or Laboratory', () => {
    expect(isRecordsUnit({ permission: 'records', ermsUnit: 'records' })).toBe(true);
    expect(isRecordsUnit({ permission: 'records' })).toBe(true);
    expect(isRecordsUnit({ permission: 'developer' })).toBe(true);
    expect(isRecordsUnit({ permission: 'admin', domains: ['erms'] })).toBe(true);
    expect(isRecordsUnit({ permission: 'records', ermsUnit: 'legal' })).toBe(false);
    expect(isRecordsUnit({ permission: 'records', ermsUnit: 'laboratory' })).toBe(false);
    expect(isRecordsUnit({ permission: 'admin', domains: ['ucds'] })).toBe(false);
    expect(isRecordsUnit({ permission: 'planning', domains: ['ucds', 'erms'] })).toBe(false);
  });

  it('sends Legal and Laboratory staff to the Document Portal for a Records scan', async () => {
    // The gate itself (the file routes also need the share switched on; see nas-access.test.js).
    expect(await viewPermission({ permission: 'records', ermsUnit: 'legal' })).toEqual({ allowed: false, reason: 'portal' });
    expect(await viewPermission({ permission: 'records', ermsUnit: 'laboratory' })).toEqual({ allowed: false, reason: 'portal' });
    expect(await viewPermission({ permission: 'planning', domains: ['ucds', 'erms'] })).toEqual({ allowed: false, reason: 'portal' });
    expect((await viewPermission({ permission: 'records', ermsUnit: 'records' })).allowed).toBe(true);
    expect((await viewPermission({ permission: 'records' })).allowed).toBe(true);
    // And there is nowhere left to ask inside ERMS.
    for (const u of [LEGAL, LAB]) {
      expect((await agents[u].post(`/api/erms/records/${SERIAL}/access-request`).send({})).status).toBe(404);
    }
  });

  it('lets each unit onto the Document Portal desk for its own documents only', async () => {
    const legal = await agents[LEGAL].get('/api/erms/portal/desk');
    expect(legal.status).toBe(200);
    expect(legal.body.sources).toEqual(['legal']);
    const lab = await agents[LAB].get('/api/erms/portal/desk');
    expect(lab.status).toBe(200);
    expect(lab.body.sources).toEqual(['laboratory']);
    const records = await agents[RECORDS].get('/api/erms/portal/desk');
    expect(records.status).toBe(200);
    expect(records.body.sources).toEqual(['records']);
    // Someone with no unit decides nothing.
    const asker = await agents[ASKER].get('/api/erms/portal/desk');
    expect(asker.status).toBe(403);
  });
});
