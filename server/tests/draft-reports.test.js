import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// The ICIR Reports log: a draft is kept for the establishment it was made
// for, and the log lists that establishment's drafts only. Drafts from before
// they named their record are found by the establishment's title. No PDF is
// attached here, so nothing is written to the share.
// ---------------------------------------------------------------------------

const PASSWORD = 'DraftTestPw!x9';
const USER = '__test_drafts_planning';
const REC_A = '__test-draft-record-a';
const REC_B = '__test-draft-record-b';
const LEGACY_TITLE = '__Test Legacy Draft Firm';
let agent;

const draft = (reportInfo) =>
  agent
    .post('/save-draft-report')
    .field('reportInfo', JSON.stringify(reportInfo))
    .field('user', JSON.stringify({ name: 'Draft Tester' }))
    .field('date', new Date().toISOString())
    .field('fileName', 'ICIR_Draft-test.pdf');

beforeAll(async () => {
  await connectToMongo();
  await collections.users.deleteMany({ username: USER });
  await collections.users.insertOne({
    username: USER, name: 'Draft Tester', email: `${USER}@test.local`, division: 'TEST', status: 'offline', password: await bcrypt.hash(PASSWORD, 10),
    permission: 'planning', domains: ['ucds'], assignedYears: [], aurora: 'readWrite', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  });
  agent = request.agent(app);
  expect((await agent.post('/login').send({ username: USER, password: PASSWORD })).status).toBe(200);
  await collections.draftReports.insertOne({ user: { name: 'Old' }, date: new Date('2024-07-30'), reportInfo: { id_no: 6, title: LEGACY_TITLE }, fileName: 'old.pdf', pdfUrl: '' });
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: USER });
  await collections.loginStatus.deleteMany({ username: USER });
  await collections.draftReports.deleteMany({ $or: [{ 'reportInfo.recordId': { $in: [REC_A, REC_B] } }, { 'reportInfo.title': LEGACY_TITLE }] });
  await collections.activityLogs.deleteMany({ username: USER });
});

describe('the ICIR Reports log', () => {
  it('keeps a draft for its establishment, whatever fields were ticked', async () => {
    // Only the title ticked: it used to be refused for lacking the ECC and address.
    const res = await draft({ recordId: REC_A, sort_key: 'AU-90001', title: 'Draft Firm A', purpose: 'For Inspection' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.fileSaved).toBe(false);
    expect((await draft({ title: 'Nobody' })).status).toBe(400);
  });

  it('lists the open establishment’s drafts only, and an earlier draft by its title', async () => {
    await draft({ recordId: REC_B, sort_key: 'AU-90002', title: 'Draft Firm B' });
    const a = await agent.get('/api/draft-report').query({ recordId: REC_A, title: 'Draft Firm A' });
    expect(a.status).toBe(200);
    expect(a.body.map((d) => d.reportInfo.recordId)).toEqual([REC_A]);
    expect(a.body[0].reportInfo.purpose).toBe('For Inspection');

    const legacy = await agent.get('/api/draft-report').query({ recordId: '__test-draft-record-c', title: LEGACY_TITLE.toUpperCase() });
    expect(legacy.body.map((d) => d.fileName)).toEqual(['old.pdf']);
  });
});
