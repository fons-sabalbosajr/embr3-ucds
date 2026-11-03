import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import erms from '../modules/erms/index.js';
import signInHistory from '../services/signInHistory.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// What the desktop ERMS did that the application had not: docket numbers,
// the upload tally and its check, attachments, the units' own menus, the
// sign-in history, the Action Center, the monthly figures, the permit types
// the desktop menu offered, and the mailing address.
//
// Everything here is written under test names, dates no real document has
// (1999, 2001) or test serials, and removed afterwards. Nothing here needs
// the share: the uploads that write files are in erms-upload.test.js.
// ---------------------------------------------------------------------------

const PASSWORD = 'ParityTestPw!x9';
const LEGAL = '__test_parity_legal';
const LAB = '__test_parity_lab';
const RECORDS = '__test_parity_records';
const RECORDS2 = '__test_parity_records2';
const DEVELOPER = '__test_parity_dev';
const PLANNING = '__test_parity_planning';
const USERNAMES = [LEGAL, LAB, RECORDS, RECORDS2, DEVELOPER, PLANNING];

const base = (username, extra) => ({
  username, name: `${username} name`, email: `${username}@test.local`, division: 'TEST', status: 'offline',
  assignedYears: [], aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

const agents = {};
async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const created = { records: [], documents: [], lookups: [] };
const TALLY_DAY = '2001-02-03';
const DOCKET_YEAR = 1999;

beforeAll(async () => {
  await connectToMongo();
  await erms.ensureIndexes();
  await signInHistory.ensureIndexes();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal' }),
    base(LAB, { password, permission: 'records', ermsUnit: 'laboratory' }),
    base(RECORDS, { password, permission: 'records', bataan: 'readWrite' }),
    base(RECORDS2, { password, permission: 'records', bataan: 'readWrite' }),
    base(DEVELOPER, { password, permission: 'developer' }),
    base(PLANNING, { password, permission: 'planning', domains: ['ucds'] }),
  ]);
  for (const u of USERNAMES) agents[u] = await signIn(u);
}, 120000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection(signInHistory.COLLECTION).deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('app-logs').deleteMany({ username: { $in: USERNAMES } });
  if (created.records.length) await collections.ermsRecords.deleteMany({ serialNo: { $in: created.records } });
  await collections.ermsRecords.deleteMany({ serialNo: /^__TEST-PARITY-/ });
  await getDb().collection('erms-documents').deleteMany({ serialNo: /^__TEST-PARITY-/ });
  await getDb().collection('erms-dockets').deleteMany({ year: DOCKET_YEAR });
  await getDb().collection('erms-sequences').deleteMany({ _id: { $in: [`docket:bataan:${DOCKET_YEAR}`] } });
  await getDb().collection('erms-upload-checks').deleteMany({ date: { $in: [TALLY_DAY, '2001-02-04'] } });
  await getDb().collection('erms-messages').deleteMany({ $or: [{ 'from.username': { $in: USERNAMES } }, { 'to.username': { $in: USERNAMES } }] });
  await getDb().collection('erms-lookups').deleteMany({ _id: { $in: created.lookups } });
}, 60000);

// --- docket numbers ------------------------------------------------------------------

describe('docket numbers (Legal)', () => {
  beforeAll(async () => {
    // A case filed by hand under an unpadded number, as the NOV forms wrote them.
    await getDb().collection('erms-documents').insertOne({
      unit: 'legal', docType: 'nov', serialNo: '__TEST-PARITY-DOCKET-1', province: 'bataan',
      fields: { docketNo: `EMBR3-${DOCKET_YEAR}-BA-41` }, document: {}, createdAt: new Date(),
    });
  });

  it('offers the next number after the highest already used, in the desktop format', async () => {
    const res = await agents[LEGAL].get('/api/erms/units/legal/dockets/next').query({ province: 'bataan', year: DOCKET_YEAR });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.docketNo).toBe(`EMBR3-${DOCKET_YEAR}-BA-042`);
  });

  it('claims numbers one after another and writes them to the register', async () => {
    const first = await agents[LEGAL].post('/api/erms/units/legal/dockets').send({ province: 'bataan', year: DOCKET_YEAR });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.docket.docketNo).toBe(`EMBR3-${DOCKET_YEAR}-BA-042`);
    const second = await agents[LEGAL].post('/api/erms/units/legal/dockets').send({ province: 'bataan', year: DOCKET_YEAR });
    expect(second.body.docket.docketNo).toBe(`EMBR3-${DOCKET_YEAR}-BA-043`);

    const register = await agents[LEGAL].get('/api/erms/units/legal/dockets').query({ province: 'bataan', year: DOCKET_YEAR });
    expect(register.status).toBe(200);
    expect(register.body.dockets.map((d) => d.docketNo)).toEqual(expect.arrayContaining([`EMBR3-${DOCKET_YEAR}-BA-042`, `EMBR3-${DOCKET_YEAR}-BA-043`]));
    expect(register.body.dockets.every((d) => d.claimedBy === LEGAL)).toBe(true);
  });

  it('skips a number someone typed onto a document in the meantime', async () => {
    await getDb().collection('erms-documents').insertOne({
      unit: 'legal', docType: 'tc', serialNo: '__TEST-PARITY-DOCKET-2', province: 'bataan',
      fields: { docketNo: `EMBR3-${DOCKET_YEAR}-BA-044` }, document: {}, createdAt: new Date(),
    });
    const next = await agents[LEGAL].post('/api/erms/units/legal/dockets').send({ province: 'bataan', year: DOCKET_YEAR });
    expect(next.body.docket.docketNo).toBe(`EMBR3-${DOCKET_YEAR}-BA-045`);
  });

  it('is issued only by the Legal unit, and only for Legal', async () => {
    const lab = await agents[LAB].post('/api/erms/units/legal/dockets').send({ province: 'bataan', year: DOCKET_YEAR });
    expect(lab.status).toBe(403);
    const records = await agents[RECORDS].get('/api/erms/units/records/dockets/next').query({ province: 'bataan' });
    expect(records.status).toBe(404);
    expect(records.body.code).toBe('NO_DOCKETS');
    const bad = await agents[LEGAL].get('/api/erms/units/legal/dockets/next').query({ province: 'manila' });
    expect(bad.status).toBe(400);
  });

  it('is part of the Legal configuration, issued on a Notice of Violation', async () => {
    const res = await agents[DEVELOPER].get('/api/erms/config');
    expect(res.body.units.legal.docket).toEqual({ prefix: 'EMBR3', pad: 3, issueOn: ['nov'] });
  });
});

// --- the upload tally ---------------------------------------------------------------------

describe('the upload tally and its check', () => {
  const at = (iso) => new Date(iso);
  const tallyRecord = (n, uploadedAt, uploadedBy, type) => ({
    serialNo: `__TEST-PARITY-T${n}`,
    proponentName: 'Tally', projectTitle: 'Tally',
    permit: { type, number: null },
    location: { province: 'bataan' },
    document: { uploadedAt, uploadedBy },
  });

  beforeAll(async () => {
    await collections.ermsRecords.insertMany([
      tallyRecord(1, at(`${TALLY_DAY}T01:00:00+08:00`), RECORDS, 'cnc'),
      tallyRecord(2, at(`${TALLY_DAY}T09:00:00+08:00`), RECORDS, 'cnc'),
      tallyRecord(3, at(`${TALLY_DAY}T10:00:00+08:00`), RECORDS, 'ecc-original'),
      tallyRecord(4, at(`${TALLY_DAY}T11:00:00+08:00`), RECORDS2, 'hw-generator'),
      // 01:30 in the Philippines on the 4th, though still the 3rd in UTC.
      tallyRecord(5, at('2001-02-03T17:30:00Z'), RECORDS, 'cnc'),
    ]);
  });

  it('counts each person’s uploads per Philippine day and kind', async () => {
    const res = await agents[RECORDS2].get('/api/erms/units/records/upload-tally').query({ from: TALLY_DAY, to: '2001-02-04' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mine = res.body.rows.filter((r) => [RECORDS, RECORDS2].includes(r.uploader));
    const day3 = mine.find((r) => r.date === TALLY_DAY && r.uploader === RECORDS);
    expect(day3.counts).toEqual({ cnc: 2, 'ecc-original': 1 });
    expect(day3.total).toBe(3);
    expect(day3.uploaderName).toBe(`${RECORDS} name`);
    expect(mine.find((r) => r.date === '2001-02-04' && r.uploader === RECORDS).total).toBe(1);
    // A column for every kind the unit files, as the desktop counter had.
    expect(res.body.kinds.map((k) => k.code)).toEqual(expect.arrayContaining(['ecc-original', 'ecc-amended', 'cnc', 'hw-generator', 'pto', 'dp', 'luc', 'coa']));
    expect(res.body.canCheck).toBe(true);
  });

  it('is checked by someone else, never by the person who uploaded', async () => {
    const own = await agents[RECORDS].post('/api/erms/units/records/upload-tally/checks').send({ entries: [{ date: TALLY_DAY, uploader: RECORDS }] });
    expect(own.status).toBe(200);
    expect(own.body.checked).toHaveLength(0);
    expect(own.body.skipped[0].reason).toBe('own-uploads');

    const res = await agents[RECORDS2].post('/api/erms/units/records/upload-tally/checks').send({ entries: [{ date: TALLY_DAY, uploader: RECORDS }], remarks: 'Counted against the logbook' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.checked).toHaveLength(1);
    expect(res.body.checked[0].total).toBe(3);

    const tally = await agents[RECORDS2].get('/api/erms/units/records/upload-tally').query({ from: TALLY_DAY, to: TALLY_DAY });
    const row = tally.body.rows.find((r) => r.uploader === RECORDS);
    expect(row.check.checkedBy).toBe(RECORDS2);
    expect(row.check.remarks).toBe('Counted against the logbook');
    expect(row.check.changed).toBe(false);
  });

  it('says when a checked day changed afterwards', async () => {
    await collections.ermsRecords.insertOne(tallyRecord(6, at(`${TALLY_DAY}T15:00:00+08:00`), RECORDS, 'cnc'));
    const tally = await agents[RECORDS2].get('/api/erms/units/records/upload-tally').query({ from: TALLY_DAY, to: TALLY_DAY });
    const row = tally.body.rows.find((r) => r.uploader === RECORDS);
    expect(row.total).toBe(4);
    expect(row.check.changed).toBe(true);
  });

  it('downloads as CSV', async () => {
    const res = await agents[RECORDS2].get('/api/erms/units/records/upload-tally').query({ from: TALLY_DAY, to: TALLY_DAY, format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toMatch(/^"Date","Uploaded by","ECC \(Original\)"/);
  });

  it('can be withdrawn, though not by the person checked', async () => {
    const own = await agents[RECORDS].delete('/api/erms/units/records/upload-tally/checks').send({ date: TALLY_DAY, uploader: RECORDS });
    expect(own.status).toBe(403);
    const res = await agents[RECORDS2].delete('/api/erms/units/records/upload-tally/checks').send({ date: TALLY_DAY, uploader: RECORDS });
    expect(res.status).toBe(200);
  });

  it('belongs to the unit: another unit’s staff cannot read it, nor check it', async () => {
    const read = await agents[LAB].get('/api/erms/units/records/upload-tally');
    expect(read.status).toBe(403);
    const range = await agents[RECORDS].get('/api/erms/units/records/upload-tally').query({ from: '2001-01-01', to: '2003-01-01' });
    expect(range.status).toBe(400);
  });
});

// --- attachments -----------------------------------------------------------------------

describe('attachments to a record', () => {
  let parent;
  const permit = `__TEST-PARITY-PERMIT-${process.pid}`;

  it('files an attachment under the record’s serial, carrying its permit number and place', async () => {
    const p = await agents[RECORDS].post('/api/erms/records').send({
      proponentName: 'Parity Proponent', projectTitle: 'Parity Project',
      permit: { type: 'ecc-original', number: permit },
      location: { province: 'bataan', city: 'Balanga' },
    });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    parent = p.body.record;
    created.records.push(parent.serialNo);

    const res = await agents[RECORDS].post('/api/erms/records').send({
      parentSerialNo: parent.serialNo,
      proponentName: 'Parity Proponent', projectTitle: 'Parity Project — amendment',
      permit: { type: 'ecc-amended', number: permit },
      // The form may not move an attachment away from its record.
      location: { province: 'bataan', city: 'Somewhere else' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const att = res.body.record;
    created.records.push(att.serialNo);
    expect(att.serialNo).toMatch(new RegExp(`^${parent.serialNo} Att-\\d{5}$`));
    expect(att.attachmentNo).toMatch(/^Att-\d{5}$/);
    // Above the desktop register's last number, Att-00098: 61 of its
    // attachments were never linked to a record but keep their numbers.
    expect(Number(att.attachmentNo.slice(4))).toBeGreaterThan(98);
    expect(att.isAttachment).toBe(true);
    expect(att.location.city).toBe('Balanga');

    const shown = await agents[RECORDS].get(`/api/erms/records/${encodeURIComponent(parent.serialNo)}`);
    expect(shown.body.attachments.map((a) => a.serialNo)).toContain(att.serialNo);

    // Numbered from one sequence, as the desktop system did.
    const again = await agents[RECORDS].post('/api/erms/records').send({
      parentSerialNo: parent.serialNo, proponentName: 'P', projectTitle: 'Second attachment',
      permit: { type: 'other' }, location: { province: 'bataan' },
    });
    created.records.push(again.body.record.serialNo);
    const n = (s) => Number(/Att-(\d+)$/.exec(s)[1]);
    expect(n(again.body.record.serialNo)).toBe(n(att.serialNo) + 1);
  });

  it('lists an attachment that needs review as a row of its own, its record being fine', async () => {
    const att = created.records.find((s) => / Att-/.test(s));
    await collections.ermsRecords.updateOne({ serialNo: att }, { $set: { 'dataQuality.clean': false, 'dataQuality.issues': [{ field: 'File_Path', problem: 'test' }] } });
    const res = await agents[RECORDS].get('/api/erms/records').query({ flagged: true, province: 'bataan', pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.items.map((r) => r.serialNo)).toContain(att);
    expect(res.body.items.map((r) => r.serialNo)).not.toContain(parent.serialNo);
  });

  it('is refused against an attachment, or a record that does not exist', async () => {
    const att = created.records.find((s) => / Att-/.test(s));
    const res = await agents[RECORDS].post('/api/erms/records').send({
      parentSerialNo: att, proponentName: 'P', projectTitle: 'T', permit: { type: 'other' }, location: { province: 'bataan' },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PARENT_IS_ATTACHMENT');

    const none = await agents[RECORDS].post('/api/erms/records').send({
      parentSerialNo: 'FSN-9999999', proponentName: 'P', projectTitle: 'T', permit: { type: 'other' }, location: { province: 'bataan' },
    });
    expect(none.status).toBe(404);
    expect(none.body.code).toBe('PARENT_NOT_FOUND');
  });

  it('still refuses the permit number on a record that is not the attachment’s own', async () => {
    const res = await agents[RECORDS].post('/api/erms/records').send({
      proponentName: 'Another', projectTitle: 'Another', permit: { type: 'cnc', number: permit }, location: { province: 'bataan' },
    });
    expect(res.status).toBe(409);
  });
});

// --- permit types and the mailing address ----------------------------------------------------

describe('the record form', () => {
  it('files the permit types the desktop menu offered, and keeps the mailing address and coordinates', async () => {
    for (const [type, label] of [['pto', 'Permit to Operate'], ['dp', 'Discharge Permit'], ['luc', 'Land Use Conversion'], ['coa', 'Certificate of Accreditation']]) {
      const res = await agents[RECORDS].post('/api/erms/records').send({
        proponentName: 'Types', projectTitle: `Type ${type}`, permit: { type },
        location: { province: 'bataan', mailingAddress: 'PO Box 12, Balanga', lat: 14.68, long: 120.54 },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      created.records.push(res.body.record.serialNo);
      expect(res.body.record.permit.label).toBe(label);
      expect(res.body.record.location.mailingAddress).toBe('PO Box 12, Balanga');
      expect(res.body.record.location.lat).toBe(14.68);
    }
    const options = await agents[RECORDS].get('/api/erms/filter-options');
    expect(options.body.permitTypes.map((t) => t.code)).toEqual(expect.arrayContaining(['pto', 'dp', 'luc', 'coa']));
  });
});

// --- the units' own menus ----------------------------------------------------------------------

describe('a unit keeps its own menus', () => {
  const KIND = 'zz-test-parity-legal';
  beforeAll(async () => {
    created.lookups.push(KIND);
    await getDb().collection('erms-lookups').replaceOne({ _id: KIND }, { _id: KIND, kind: KIND, unit: 'legal', description: 'test', items: [{ code: 'A1', label: 'Atty. One' }] }, { upsert: true });
  });

  it('lists the unit’s menus to its staff, with the right to edit', async () => {
    const res = await agents[LEGAL].get('/api/erms/units/legal/lookups');
    expect(res.status).toBe(200);
    expect(res.body.canEdit).toBe(true);
    const mine = res.body.lists.find((l) => l.kind === KIND);
    expect(mine.items[0].label).toBe('Atty. One');
    // Shared address tables and the docket registers are not the unit's to edit.
    expect(res.body.lists.some((l) => ['barangays', 'legal-dockets'].includes(l.kind))).toBe(false);
  });

  it('is saved by the unit’s staff, keeping each entry’s code', async () => {
    const res = await agents[LEGAL].put(`/api/erms/units/legal/lookups/${KIND}`).send({ items: [{ code: 'A1', label: 'Atty. One' }, { label: 'Atty. Two' }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const stored = await getDb().collection('erms-lookups').findOne({ _id: KIND });
    expect(stored.items.map((i) => i.label)).toEqual(['Atty. One', 'Atty. Two']);
    expect(stored.items[0].code).toBe('A1');
    expect(stored.updatedBy).toBe(LEGAL);
  });

  it('is not another unit’s to change, nor a shared list', async () => {
    const lab = await agents[LAB].put(`/api/erms/units/legal/lookups/${KIND}`).send({ items: ['x'] });
    expect(lab.status).toBe(403);
    const asOwn = await agents[LAB].put(`/api/erms/units/laboratory/lookups/${KIND}`).send({ items: ['x'] });
    expect(asOwn.status).toBe(404);
    const shared = await agents[LEGAL].put('/api/erms/units/legal/lookups/barangays').send({ items: ['x'] });
    expect(shared.status).toBe(404);
  });
});

// --- sign-in history -----------------------------------------------------------------------------

describe('sign-in history', () => {
  it('records each sign-in with the address it came from', async () => {
    const rows = await signInHistory.list({ usernames: [LEGAL] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].event).toBe('sign-in');
    expect(rows[0].ip).toBeTruthy();
  });

  it('records a sign-out', async () => {
    const agent = await signIn(LAB);
    const out = await agent.post('/logout');
    expect(out.status).toBe(200);
    const rows = await signInHistory.list({ usernames: [LAB] });
    expect(rows[0].event).toBe('sign-out');
  });

  it('is read by account managers', async () => {
    const res = await agents[DEVELOPER].get('/api/sign-in-history').query({ username: LEGAL });
    expect(res.status).toBe(200);
    expect(res.body.events.every((e) => e.username === LEGAL)).toBe(true);
    const refused = await agents[LEGAL].get('/api/sign-in-history');
    expect(refused.status).toBe(403);
  });

  it('appears in the unit’s log history for its own staff', async () => {
    const res = await agents[LEGAL].get('/api/erms/units/legal/activity').query({ q: LEGAL });
    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => e.source === 'sign-in' && e.who === LEGAL && e.label === 'Signed in')).toBe(true);
    // Another unit's staff do not appear in it.
    const other = await agents[LEGAL].get('/api/erms/units/legal/activity').query({ q: RECORDS });
    expect(other.body.events.some((e) => e.source === 'sign-in')).toBe(false);
  });
});

// --- the Action Center ------------------------------------------------------------------------------

describe('the Action Center', () => {
  let sent;

  it('sends a message to another ERMS user, numbered as the desktop system did', async () => {
    const res = await agents[LEGAL].post('/api/erms/messages').send({ to: LAB, purpose: 'Clarification', subject: 'COC for case 41', details: 'Please send the chain of custody.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    sent = res.body.message;
    expect(sent.msgId).toMatch(/^ERMSAC-\d{10}$/);
    expect(sent.from.unit).toBe('legal');
    expect(sent.to.unitLabel).toBe('Laboratory Unit');
  });

  it('is unread in the recipient’s inbox until read', async () => {
    const before = await agents[LAB].get('/api/erms/messages/unread');
    expect(before.body.unread).toBeGreaterThan(0);
    const inbox = await agents[LAB].get('/api/erms/messages');
    expect(inbox.body.items.find((m) => m.id === sent.id).unread).toBe(true);

    const notMine = await agents[LEGAL].patch(`/api/erms/messages/${sent.id}`).send({ read: true });
    expect(notMine.status).toBe(403);
    const read = await agents[LAB].patch(`/api/erms/messages/${sent.id}`).send({ read: true });
    expect(read.status).toBe(200);
    const after = await agents[LAB].get('/api/erms/messages/unread');
    expect(after.body.unread).toBe(before.body.unread - 1);
  });

  it('is deleted from one side only', async () => {
    const del = await agents[LAB].delete(`/api/erms/messages/${sent.id}`);
    expect(del.status).toBe(200);
    const inbox = await agents[LAB].get('/api/erms/messages');
    expect(inbox.body.items.some((m) => m.id === sent.id)).toBe(false);
    const outbox = await agents[LEGAL].get('/api/erms/messages').query({ box: 'sent' });
    expect(outbox.body.items.some((m) => m.id === sent.id)).toBe(true);
  });

  it('goes only to people who work in ERMS, for a stated purpose', async () => {
    const people = await agents[LEGAL].get('/api/erms/messages/people').query({ q: '__test_parity' });
    const names = people.body.people.map((p) => p.username);
    expect(names).toContain(LAB);
    expect(names).not.toContain(PLANNING);
    expect(names).not.toContain(LEGAL);

    const outsider = await agents[LEGAL].post('/api/erms/messages').send({ to: PLANNING, purpose: 'Request', subject: 'x' });
    expect(outsider.status).toBe(404);
    const noPurpose = await agents[LEGAL].post('/api/erms/messages').send({ to: LAB, purpose: 'Gossip', subject: 'x' });
    expect(noPurpose.status).toBe(400);
  });
});

// --- the dashboards' monthly figures --------------------------------------------------------------------

describe('the dashboards', () => {
  it('show uploads per month by permit type, and the most filed project types', async () => {
    const res = await agents[DEVELOPER].get('/api/erms/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.byMonth).toHaveLength(12);
    expect(res.body.byMonth[11].month).toBe(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7));
    expect(res.body.byMonth.every((m) => typeof m.total === 'number' && typeof m.kinds === 'object')).toBe(true);
    expect(Array.isArray(res.body.byProjectType)).toBe(true);
  });

  it('show a unit’s uploads per month by document type', async () => {
    const res = await agents[LEGAL].get('/api/erms/units/legal/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.byMonth).toHaveLength(12);
    expect(res.body.kindLabels.nov).toBe('Notice of Violation');
  });
});
