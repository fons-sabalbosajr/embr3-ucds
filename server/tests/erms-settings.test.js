import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import settings from '../modules/erms/services/unitSettingsService.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Settings › ERMS: a unit's working rules and where the API enforces them.
//
//   - read by the unit, written by its staff, refused to everyone else
//   - duplicates: the form's check and the refusal of a second permit number
//   - data quality: a required field refused on a new record
//   - privacy: the default classification an upload gets
//   - the log history reads the trail
// ---------------------------------------------------------------------------

const PASSWORD = 'SettingsPw!x9';
const RECORDS = '__test_set_records';
const LEGAL = '__test_set_legal';
const PLANNING = '__test_set_planning';
const USERNAMES = [RECORDS, LEGAL, PLANNING];
const SERIALS = ['__TEST-SET-1', '__TEST-SET-2'];

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline', assignedYears: [2025],
  aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

let records;
let legal;
let planning;
let savedDoc;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(RECORDS, { password, permission: 'records', ermsUnit: 'records', bataan: 'readWrite' }),
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal' }),
    base(PLANNING, { password, permission: 'planning', domains: ['ucds', 'erms'], bataan: 'readWrite' }),
  ]);
  savedDoc = await getDb().collection(settings.COLLECTION).findOne({ _id: settings.DOC_ID });
  await getDb().collection(settings.COLLECTION).deleteOne({ _id: settings.DOC_ID });
  settings.invalidate();
  await getDb().collection('erms-records').deleteMany({ serialNo: { $in: SERIALS } });
  await getDb().collection('erms-records').deleteMany({ 'permit.number': '__TEST-SET-DUP' });
  [records, legal, planning] = await Promise.all([signIn(RECORDS), signIn(LEGAL), signIn(PLANNING)]);
}, 90000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  const col = getDb().collection(settings.COLLECTION);
  if (savedDoc) await col.replaceOne({ _id: settings.DOC_ID }, savedDoc, { upsert: true });
  else await col.deleteOne({ _id: settings.DOC_ID });
  settings.invalidate();
  await getDb().collection('erms-records').deleteMany({ 'permit.number': '__TEST-SET-DUP' });
  await getDb().collection('erms-records').deleteMany({ serialNo: { $in: SERIALS } });
}, 60000);

describe('who reads and who writes', () => {
  it('serves the defaults to the unit and says who may change them', async () => {
    const res = await records.get('/api/erms/units/records/settings');
    expect(res.status).toBe(200);
    expect(res.body.canEdit).toBe(true);
    expect(res.body.settings.pdfViewing.previewPageLimit).toBe(0);
    expect(res.body.settings.privacy.defaultClassification).toBe('Public');
    // Another unit's staff do not see this unit's settings; a Planning Admin
    // with ERMS reads the register but is not unit staff.
    expect((await legal.get('/api/erms/units/records/settings')).status).toBe(403);
    const reader = await planning.get('/api/erms/units/records/settings');
    expect([200, 403]).toContain(reader.status);
    if (reader.status === 200) expect(reader.body.canEdit).toBe(false);
    expect((await planning.put('/api/erms/units/records/settings').send({})).status).toBe(403);
  });

  it('saves a change, normalised, and resets', async () => {
    const saved = await records.put('/api/erms/units/records/settings').send({
      pdfViewing: { previewPageLimit: 3, blurWithheldPages: true },
      privacy: { classifications: ['Public', 'Confidential'], defaultClassification: 'Confidential' },
      auditing: { logSearches: true },
      logHistory: { retentionDays: 99999 },
      nonsense: true,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.settings.pdfViewing.previewPageLimit).toBe(3);
    expect(saved.body.settings.privacy.defaultClassification).toBe('Confidential');
    expect(saved.body.settings.logHistory.retentionDays).toBe(3650);
    expect(saved.body.settings.nonsense).toBeUndefined();
    const reset = await records.post('/api/erms/units/records/settings/reset');
    expect(reset.status).toBe(200);
    expect(reset.body.settings.pdfViewing.previewPageLimit).toBe(0);
  });

  it('keeps every section a save does not name', async () => {
    // The settings page sends the tab on show; the other tabs must keep
    // their values, not fall back to the defaults.
    await records.put('/api/erms/units/records/settings').send({ pdfViewing: { previewPageLimit: 4 }, auditing: { logSearches: true } });
    const saved = await records.put('/api/erms/units/records/settings').send({ privacy: { watermarkViewer: true } });
    expect(saved.status).toBe(200);
    expect(saved.body.settings.privacy.watermarkViewer).toBe(true);
    expect(saved.body.settings.pdfViewing.previewPageLimit).toBe(4);
    expect(saved.body.settings.auditing.logSearches).toBe(true);
    await records.post('/api/erms/units/records/settings/reset');
  });
});

describe('what the rules do', () => {
  const payload = (serialHint, number) => ({
    proponentName: `Proponent ${serialHint}`,
    projectTitle: `Project ${serialHint}`,
    permit: { type: 'cnc', number },
    location: { province: 'bataan' },
  });

  it('gives an upload the default classification, and refuses a second permit number when told to', async () => {
    await records.put('/api/erms/units/records/settings').send({ privacy: { defaultClassification: 'Internal', classifications: ['Public', 'Internal'] } });
    const first = await records.post('/api/erms/records').send(payload('A', '__TEST-SET-DUP'));
    expect(first.status).toBe(201);
    SERIALS.push(first.body.record.serialNo);
    expect(first.body.record.document.fileClass).toBe('Internal');

    // Warned, not refused, by default.
    const check = await records.get('/api/erms/records/duplicates?permitNumber=__TEST-SET-DUP');
    expect(check.status).toBe(200);
    expect(check.body.duplicates.some((d) => d.serialNo === first.body.record.serialNo)).toBe(true);
    expect(check.body.blocks).toBe(false);

    await records.put('/api/erms/units/records/settings').send({ duplicates: { blockOnPermitNumber: true } });
    const second = await records.post('/api/erms/records').send(payload('B', '__TEST-SET-DUP'));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_PERMIT');
    // Editing the existing record keeps its own number without tripping the rule.
    const edit = await records.patch(`/api/erms/records/${first.body.record.serialNo}`).send({ permit: { number: '__TEST-SET-DUP' } });
    expect(edit.status).toBe(200);
    // The groups tool sees it once it is filed twice; here it is filed once.
    const groups = await records.get('/api/erms/records/duplicate-groups');
    expect(groups.status).toBe(200);
    expect(Array.isArray(groups.body.groups)).toBe(true);
  });

  it('refuses a new record missing a field the unit requires', async () => {
    await records.put('/api/erms/units/records/settings').send({ dataQuality: { requirePermitNumber: true } });
    const res = await records.post('/api/erms/records').send(payload('C', null));
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('permit.number');
    await records.post('/api/erms/units/records/settings/reset');
  });

  it('gives Legal and Laboratory the same rules, their own tools, and a dashboard with every count', async () => {
    const own = await legal.get('/api/erms/units/legal/settings');
    expect(own.status).toBe(200);
    expect(own.body.canEdit).toBe(true);
    const groups = await legal.get('/api/erms/units/legal/duplicate-groups');
    expect(groups.status).toBe(200);
    expect(Array.isArray(groups.body.groups)).toBe(true);
    const check = await legal.get('/api/erms/units/legal/duplicates?fileName=nothing-like-this.pdf');
    expect(check.status).toBe(200);
    expect(check.body.duplicates).toEqual([]);
    const missing = await legal.get('/api/erms/units/legal/documents?missingFile=true&pageSize=5');
    expect(missing.status).toBe(200);
    expect(missing.body.items.every((d) => !d.document?.fileName || !d.document?.sharePath)).toBe(true);
    const dash = await legal.get('/api/erms/units/legal/dashboard');
    expect(dash.status).toBe(200);
    for (const key of ['total', 'uploadedLast30Days', 'filedThisYear', 'withoutFile', 'fromDesktop', 'byType', 'byProvince', 'byYear', 'recent']) expect(dash.body).toHaveProperty(key);
    // Another unit's tools are not theirs.
    expect((await legal.get('/api/erms/units/laboratory/duplicate-groups')).status).toBe(403);
    // A unit document's file info carries the unit's viewing rules.
    const first = (await legal.get('/api/erms/units/legal/documents?pageSize=1')).body.items[0];
    if (first) {
      const info = await legal.get(`/api/erms/units/legal/documents/${encodeURIComponent(first.serialNo)}/file`);
      if (info.status === 200) expect(info.body.viewing).toHaveProperty('pageLimit');
    }
  });

  it('keeps a log history the unit can read and search', async () => {
    const res = await records.get('/api/erms/units/records/activity?q=settings');
    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => /settings/i.test(e.label || ''))).toBe(true);
    expect((await planning.get('/api/erms/units/legal/activity')).status).toBe(403);
  });
});
