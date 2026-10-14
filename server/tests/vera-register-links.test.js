import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';

const require = createRequire(import.meta.url);
const links = require('../services/vera/registerLinks.js');
const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// VERA's register links. A check proposes an establishment for records not
// linked to the central register; applying links exactly those records, and
// undo unlinks them again. The Developer alone. No AI model is called here:
// the settings say off.
// ---------------------------------------------------------------------------

const PASSWORD = 'RegisterLinksPw!x9';
const DEV = '__test_links_dev';
const ADMIN = '__test_links_admin';
const USERNAMES = [DEV, ADMIN];
const SERIALS = ['__TEST-LINK-1', '__TEST-LINK-2', '__TEST-LINK-3', '__TEST-LINK-4'];
const KEYS = ['__ZQ-0001', '__ZQ-0002', '__ZQ-0003', '__ZQ-0004'];

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

const records = () => getDb().collection('erms-records');
const register = () => getDb().collection('ucds-data');

const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await records().deleteMany({ serialNo: { $in: SERIALS } });
  await register().deleteMany({ sort_key: { $in: KEYS } });
  await getDb().collection(links.COLLECTION).deleteMany({ by: DEV });
};

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  savedVera = await getDb().collection('app-config').findOne({ _id: 'vera-settings' });
  await getDb().collection('app-config').updateOne({ _id: 'vera-settings' }, { $set: { enabled: false } }, { upsert: true });
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(DEV, { password, permission: 'developer', domains: ['ucds', 'erms', 'admin'] }),
    base(ADMIN, { password, permission: 'admin', domains: ['ucds', 'erms', 'admin'] }),
  ]);
  await register().insertMany([
    { sort_key: KEYS[0], name: 'Zyxquor Holdings Inc.', title: 'Zyxquor Fuel Depot', ecc_cnc: 'R03-9911-0001', province: 'Bataan' },
    { sort_key: KEYS[1], name: 'Qwvelt Agri Ventures', title: 'Qwvelt Piggery Farm', ecc_cnc: 'ECC-OL-R03-2098-0002', province: 'Bataan' },
    { sort_key: KEYS[2], name: 'Plombix Poultry Corporation', title: 'Plombix Poultry Farm', ecc_cnc: 'ECC-OL-R03-2097-0003', province: 'Bataan' },
    { sort_key: KEYS[3], name: 'Unrelated Grvnt Realty', title: 'Grvnt Subdivision', ecc_cnc: 'R03-9913-0004', province: 'Bataan' },
  ]);
  const unlinked = { ucdsRef: null, location: { province: 'bataan', provinceLabel: 'Bataan' } };
  await records().insertMany([
    // The letter O for a zero.
    { serialNo: SERIALS[0], permit: { number: 'RO3-9911-0001' }, proponentName: 'Zyxquor Holdings, Inc.', projectTitle: 'Zyxquor Fuel Depot', ...unlinked },
    // Two numbers in one cell; the original is in the register.
    { serialNo: SERIALS[1], permit: { number: 'Amended: ECC-R03-9912-0002 Original: ECC-OL-R03-2098-0002' }, proponentName: 'Qwvelt Agri Ventures', projectTitle: 'Qwvelt Piggery Farm', ...unlinked },
    // A number the register does not have, but the same proponent and project.
    { serialNo: SERIALS[2], permit: { number: 'ECC-R03-9914-7777' }, proponentName: 'PLOMBIX POULTRY CORP.', projectTitle: 'Plombix Poultry Farm', ...unlinked },
    // A CNC sharing its digits with someone else's ECC: no link.
    { serialNo: SERIALS[3], permit: { number: 'CNC-R3-9913-0004' }, proponentName: 'Someone Kvorrel Else', projectTitle: 'Kvorrel Clinic', ...unlinked },
  ]);
  [dev, admin] = await Promise.all([signIn(DEV), signIn(ADMIN)]);
}, 90000);

afterAll(async () => {
  await cleanUp();
  if (savedVera) await getDb().collection('app-config').replaceOne({ _id: 'vera-settings' }, savedVera, { upsert: true });
  else await getDb().collection('app-config').deleteOne({ _id: 'vera-settings' });
}, 60000);

describe('VERA links records to the central register', () => {
  it('reads two spellings of one name as one', () => {
    expect(links.namesAgree('PLOMBIX POULTRY CORP.', 'Plombix Poultry Corporation')).toBe(true);
    expect(links.namesAgree('Dela Cruz, Juan', 'Mr. Juan Dela Cruz')).toBe(true);
    expect(links.namesAgree('Jafcor Development Inc.', 'Kerith Brooks Trading')).toBe(false);
  });

  it('proposes, applies and undoes — to the record', async () => {
    const scanned = await dev.post('/api/vera/register-links/scan').send({});
    expect(scanned.status, JSON.stringify(scanned.body).slice(0, 300)).toBe(200);
    const report = scanned.body.current;
    const bySerial = Object.fromEntries(report.proposals.filter((p) => SERIALS.includes(p.serialNo)).map((p) => [p.serialNo, p]));

    expect(bySerial[SERIALS[0]]).toMatchObject({ sortKey: KEYS[0], pass: 'number', confidence: 'certain' });
    expect(bySerial[SERIALS[1]]).toMatchObject({ sortKey: KEYS[1], pass: 'number', confidence: 'certain' });
    expect(bySerial[SERIALS[2]]).toMatchObject({ sortKey: KEYS[2], pass: 'proponent', confidence: 'likely' });
    expect(bySerial[SERIALS[3]]).toBeUndefined();

    const ids = [SERIALS[0], SERIALS[2]].map((s) => bySerial[s].id);
    const applied = await dev.post(`/api/vera/register-links/${report.id}/apply`).send({ ids });
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(2);
    const linked = await records().findOne({ serialNo: SERIALS[0] });
    expect(linked.ucdsRef).toMatchObject({ sortKey: KEYS[0], matchedOn: 'vera:number', unmatched: false });
    expect(linked.ucdsRef.linkedBy).toMatch(/^VERA \(approved by /);
    // Not applied, so not linked.
    expect((await records().findOne({ serialNo: SERIALS[1] })).ucdsRef).toBeNull();

    const undone = await dev.post(`/api/vera/register-links/${report.id}/undo`).send({ proposalId: bySerial[SERIALS[2]].id });
    expect(undone.status).toBe(200);
    expect(undone.body.restored).toBe(1);
    expect((await records().findOne({ serialNo: SERIALS[2] })).ucdsRef).toBeNull();
    expect((await records().findOne({ serialNo: SERIALS[0] })).ucdsRef.sortKey).toBe(KEYS[0]);
  });

  it('reports to the Developer alone', async () => {
    expect((await admin.get('/api/vera/register-links')).status).toBe(403);
    expect((await admin.post('/api/vera/register-links/scan').send({})).status).toBe(403);
    expect((await dev.get('/api/vera/register-links/pending')).status).toBe(200);
  });
});
