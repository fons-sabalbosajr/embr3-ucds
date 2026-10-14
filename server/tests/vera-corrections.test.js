import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const require = createRequire(import.meta.url);
const corrections = require('../services/vera/dataCorrections.js');
const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// VERA's data corrections. A scan proposes one spelling for values that
// differ only in capitals, spacing or punctuation; applying a proposal
// changes exactly the records that held the old value; undo puts them back.
// The Developer alone. No AI model is called here: the settings say off.
// ---------------------------------------------------------------------------

const PASSWORD = 'CorrectionsPw!x9';
const DEV = '__test_corr_dev';
const ADMIN = '__test_corr_admin';
const USERNAMES = [DEV, ADMIN];
const SERIALS = ['__TEST-CORR-1', '__TEST-CORR-2', '__TEST-CORR-3'];
const RIGHT = '__Zz Test Poultry Farm';
const WRONG = '__zz test  poultry farm';

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite', nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let dev;
let admin;
let savedVera;

const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-records').deleteMany({ serialNo: { $in: SERIALS } });
  await getDb().collection(corrections.COLLECTION).deleteMany({ by: DEV });
};

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  // No model: the spelling pass falls back to rules, and nothing is paid for.
  savedVera = await getDb().collection('app-config').findOne({ _id: 'vera-settings' });
  await getDb().collection('app-config').updateOne({ _id: 'vera-settings' }, { $set: { enabled: false } }, { upsert: true });
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(DEV, { password, permission: 'developer', domains: ['ucds', 'erms', 'admin'] }),
    base(ADMIN, { password, permission: 'admin', domains: ['ucds', 'erms', 'admin'] }),
  ]);
  await getDb().collection('erms-records').insertMany([
    { serialNo: SERIALS[0], project: { type: 'Poultry Industries', otherType: RIGHT }, location: { province: 'bataan' } },
    { serialNo: SERIALS[1], project: { type: 'Poultry Industries', otherType: RIGHT }, location: { province: 'bataan' } },
    { serialNo: SERIALS[2], project: { type: 'Poultry Industries', otherType: WRONG }, location: { province: 'bataan' } },
  ]);
  [dev, admin] = await Promise.all([signIn(DEV), signIn(ADMIN)]);
}, 90000);

afterAll(async () => {
  await cleanUp();
  if (savedVera) await getDb().collection('app-config').replaceOne({ _id: 'vera-settings' }, savedVera, { upsert: true });
  else await getDb().collection('app-config').deleteOne({ _id: 'vera-settings' });
}, 60000);

describe('VERA corrects the project types', () => {
  it('tells capitals and spacing apart from real differences', () => {
    const { proposals } = corrections.sameWording('project.otherType', [
      { value: 'Gasoline Filling Station', count: 200 },
      { value: 'Gasoline filling  station', count: 3 },
      { value: 'Sand & Gravel Quarry', count: 20 },
      { value: 'Sand and Gravel Quarry', count: 5 },
      { value: 'Gasoline Station', count: 100 },
    ]);
    const map = Object.fromEntries(proposals.map((p) => [p.from, p.to]));
    expect(map['Gasoline filling  station']).toBe('Gasoline Filling Station');
    expect(map['Sand and Gravel Quarry']).toBe('Sand & Gravel Quarry');
    expect(map['Gasoline Station']).toBeUndefined(); // a different wording is left alone
  });

  it('proposes, applies and undoes — to the record', async () => {
    const scanned = await dev.post('/api/vera/corrections/scan').send({});
    expect(scanned.status, JSON.stringify(scanned.body)).toBe(200);
    const report = scanned.body.current;
    const ours = report.proposals.find((p) => p.from === WRONG);
    expect(ours).toMatchObject({ field: 'project.otherType', to: RIGHT, count: 1, confidence: 'certain' });

    const applied = await dev.post(`/api/vera/corrections/${report.id}/apply`).send({ ids: [ours.id] });
    expect(applied.status).toBe(200);
    expect(applied.body.changed).toBe(1);
    const fixed = await getDb().collection('erms-records').findOne({ serialNo: SERIALS[2] });
    expect(fixed.project.otherType).toBe(RIGHT);
    expect(fixed.updatedBy).toMatch(/^VERA \(approved by /);

    const undone = await dev.post(`/api/vera/corrections/${report.id}/undo`).send({ proposalId: ours.id });
    expect(undone.status).toBe(200);
    expect(undone.body.restored).toBe(1);
    expect((await getDb().collection('erms-records').findOne({ serialNo: SERIALS[2] })).project.otherType).toBe(WRONG);
    // The two that were right all along were never touched.
    expect((await getDb().collection('erms-records').countDocuments({ serialNo: { $in: SERIALS.slice(0, 2) }, updatedBy: { $exists: true } }))).toBe(0);
  });

  it('reports to the Developer alone', async () => {
    expect((await admin.get('/api/vera/corrections')).status).toBe(403);
    expect((await admin.post('/api/vera/corrections/scan').send({})).status).toBe(403);
    expect((await dev.get('/api/vera/corrections')).status).toBe(200);
  });
});
