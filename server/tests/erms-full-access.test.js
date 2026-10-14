import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import settings from '../modules/erms/services/unitSettingsService.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The page limit, and asking for the whole document.
//
// With a limit set, the viewer shows the unit's own staff the first pages
// too — only the Developer and administrators see every page. The old
// "Request full access" button is gone: more pages are asked for in the
// Document Portal.
// ---------------------------------------------------------------------------

const PASSWORD = 'FullAccessPw!x9';
const ASKER = '__test_full_asker';
const ADMIN = '__test_full_admin';
const OUTSIDER = '__test_full_lab';
const RECORDS = '__test_full_records';
const USERNAMES = [ASKER, ADMIN, OUTSIDER, RECORDS];
const SERIAL = '__TEST-FULL-1';
const RECORD = '__TEST-FULL-REC';

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let savedSettings;
const cleanUp = async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('erms-documents').deleteMany({ serialNo: SERIAL });
  await getDb().collection('erms-records').deleteMany({ serialNo: RECORD });
  await getDb().collection('erms-messages').deleteMany({ 'from.username': { $in: USERNAMES } });
};

let asker;
let recordsClerk;

beforeAll(async () => {
  await connectToMongo();
  await cleanUp();
  savedSettings = await getDb().collection(settings.COLLECTION).findOne({ _id: settings.DOC_ID });
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.insertMany([
    base(ASKER, { password, permission: 'records', ermsUnit: 'legal' }),
    base(ADMIN, { password, permission: 'admin', domains: ['ucds', 'erms', 'admin'] }),
    base(OUTSIDER, { password, permission: 'records', ermsUnit: 'laboratory' }),
    base(RECORDS, { password, permission: 'records', ermsUnit: 'records' }),
  ]);
  await getDb().collection('erms-documents').insertOne({ unit: 'legal', serialNo: SERIAL, docType: 'nov', title: 'Test firm', fields: {}, province: 'bataan', document: { fileName: 'test.pdf' }, createdAt: new Date() });
  await getDb().collection('erms-records').insertOne({ serialNo: RECORD, proponentName: 'Test', projectTitle: 'Test project', permit: { type: 'cnc' }, location: { province: 'bataan' }, document: { fileName: 'rec.pdf' } });
  [asker, recordsClerk] = await Promise.all([signIn(ASKER), signIn(RECORDS)]);
}, 90000);

afterAll(async () => {
  await cleanUp();
  const col = getDb().collection(settings.COLLECTION);
  if (savedSettings) await col.replaceOne({ _id: settings.DOC_ID }, savedSettings, { upsert: true });
  else await col.deleteOne({ _id: settings.DOC_ID });
  settings.invalidate();
}, 60000);

describe('the page limit reaches the unit\'s own staff', () => {
  it('keeps the new switch, off by default', async () => {
    const saved = await settings.save('legal', { pdfViewing: { previewPageLimit: 3 } }, { username: 'test' });
    expect(saved.pdfViewing.previewPageLimit).toBe(3);
    expect(saved.pdfViewing.exemptUnit).toBe(false);
  });
});

describe('asking for the whole document is gone', () => {
  // Anyone who needs more pages asks in the Document Portal now; the in-app
  // "Request full access" message to the administrators was removed.
  it('no longer sends a request from the unit viewer or the record', async () => {
    expect((await asker.post(`/api/erms/units/legal/documents/${encodeURIComponent(SERIAL)}/full-access-request`).send({})).status).toBe(404);
    expect((await recordsClerk.post(`/api/erms/records/${encodeURIComponent(RECORD)}/full-access-request`).send({})).status).toBe(404);
    expect(await getDb().collection('erms-messages').countDocuments({ 'from.username': { $in: USERNAMES } })).toBe(0);
  });
});
