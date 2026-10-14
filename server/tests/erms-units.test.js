import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import activation from '../services/nasActivation.js';
import db from '../config/db.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The three ERMS units.
//
// An ERMS User belongs to one unit (the System on the account), sees that
// unit's documents and nothing of the other two, files into it, and never
// meets the year container picker. The Developer sees all three and
// configures them from Admin Settings > ERMS Config.
// ---------------------------------------------------------------------------

const PASSWORD = 'UnitsTestPw!x9';
const LEGAL = '__test_units_legal';
const LAB = '__test_units_lab';
const RECORDS = '__test_units_records';
const DEVELOPER = '__test_units_dev';
const USERNAMES = [LEGAL, LAB, RECORDS, DEVELOPER];

const base = (username, extra) => ({
  username, name: username, email: `${username}@test.local`, division: 'TEST', status: 'offline',
  assignedYears: [], aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return { agent, body: res.body };
}

let legal;
let lab;
let records;
let developer;
let legalId;

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  const r = await collections.users.insertMany([
    base(LEGAL, { password, permission: 'records', ermsUnit: 'legal', bataan: 'readWrite' }),
    base(LAB, { password, permission: 'records', ermsUnit: 'laboratory' }),
    base(RECORDS, { password, permission: 'records', bataan: 'readWrite' }),
    base(DEVELOPER, { password, permission: 'developer' }),
  ]);
  legalId = String(r.insertedIds[0]);
  await getDb().collection(activation.COLLECTION).updateOne(
    { _id: activation.DOC_ID },
    { $set: { enabled: true, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } },
    { upsert: true }
  );
  await getDb().collection('app-config').deleteOne({ _id: 'erms-config' });
  [legal, lab, records, developer] = await Promise.all([signIn(LEGAL), signIn(LAB), signIn(RECORDS), signIn(DEVELOPER)]);
}, 90000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await getDb().collection('app-config').deleteOne({ _id: 'erms-config' });
  await getDb().collection('erms-lookups').deleteOne({ _id: 'zz-test-kind' });
}, 60000);

describe('an ERMS User signs in to their unit, not to a year', () => {
  it('has a year chosen for them at sign-in even with none assigned', async () => {
    expect(legal.body.activeYear).toBeTruthy();
  });

  it('is told which unit they work in and that there is no year to choose', async () => {
    const me = await legal.agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.ermsUnit).toBe('legal');
    expect(me.body.ermsUnits).toEqual(['legal']);
    expect(me.body.skipYearSelect).toBe(true);
    expect(me.body.roleLabel).toBe('ERMS User');
  });

  it('is a Records Unit user when the account predates the System field', async () => {
    const me = await records.agent.get('/api/auth/me');
    expect(me.body.ermsUnit).toBe('records');
    expect(me.body.ermsUnits).toEqual(['records']);
  });

  it('sees all three units as the Developer, with no year skipped', async () => {
    const me = await developer.agent.get('/api/auth/me');
    expect(me.body.ermsUnits).toEqual(['records', 'legal', 'laboratory']);
    expect(me.body.skipYearSelect).toBe(false);
    const units = await developer.agent.get('/api/erms/units');
    expect(units.body.units.map((u) => u.key)).toEqual(['records', 'legal', 'laboratory']);
    expect(units.body.units.every((u) => u.canFile)).toBe(true);
  });
});

describe('each unit has its own data', () => {
  it('offers the Legal unit, its document types and forms, to the Legal user only', async () => {
    const res = await legal.agent.get('/api/erms/units');
    expect(res.status).toBe(200);
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].key).toBe('legal');
    expect(res.body.units[0].canFile).toBe(true);
    expect(res.body.units[0].docTypes.map((t) => t.code)).toContain('nov');
    expect(res.body.home).toBe('legal');
  });

  it('lists the unit’s documents and refuses the other units', async () => {
    const mine = await legal.agent.get('/api/erms/units/legal/documents');
    expect(mine.status).toBe(200);
    expect(Array.isArray(mine.body.items)).toBe(true);
    expect(mine.body.items.every((d) => d.unit === 'legal')).toBe(true);

    const other = await legal.agent.get('/api/erms/units/laboratory/documents');
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('UNIT_FORBIDDEN');

    const fromRecords = await records.agent.get('/api/erms/units/legal/dashboard');
    expect(fromRecords.status).toBe(403);

    const labOwn = await lab.agent.get('/api/erms/units/laboratory/dashboard');
    expect(labOwn.status).toBe(200);
    expect(labOwn.body.unit).toBe('laboratory');
  });
});

describe('filing a document', () => {
  it('checks the form the document type defines before touching the share', async () => {
    const noType = await legal.agent.post('/api/erms/units/legal/documents').field('province', 'bataan');
    expect(noType.status).toBe(400);
    expect(noType.body.code).toBe('DOCTYPE_UNKNOWN');

    const noProvince = await legal.agent.post('/api/erms/units/legal/documents').field('docType', 'nov');
    expect(noProvince.status).toBe(400);
    expect(noProvince.body.code).toBe('PROVINCE_REQUIRED');

    const missing = await legal.agent
      .post('/api/erms/units/legal/documents')
      .field('docType', 'nov')
      .field('province', 'bataan')
      .field('fields', JSON.stringify({ docketNo: 'EMBR3-2026-BA-001' }));
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION');
    expect(missing.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['companyName', 'novDateIssued', 'status']));

    const noFile = await legal.agent
      .post('/api/erms/units/legal/documents')
      .field('docType', 'nov')
      .field('province', 'bataan')
      .field('fields', JSON.stringify({ docketNo: 'EMBR3-2026-BA-001', companyName: 'Test Co.', novDateIssued: '2026-09-01', status: 'FOR TECHNICAL CONFERENCE' }));
    expect(noFile.status).toBe(400);
    expect(noFile.body.code).toBe('NO_FILE');
  });

  it('is the unit’s own work: another unit’s user cannot file into it', async () => {
    const res = await lab.agent.post('/api/erms/units/legal/documents').field('docType', 'nov').field('province', 'bataan');
    expect(res.status).toBe(403);
  });
});

describe('a document’s history', () => {
  const SERIAL = '__TEST-UNITS-HIST-1';

  beforeAll(async () => {
    await getDb().collection('erms-documents').deleteOne({ serialNo: SERIAL });
    await getDb().collection('erms-documents').insertOne({
      unit: 'legal', docType: 'nov', docTypeLabel: 'Notice of Violation', serialNo: SERIAL, province: 'bataan',
      fields: { docketNo: 'EMBR3-1999-BA-001', companyName: 'History Co.', novDateIssued: new Date('1999-01-02'), status: 'FOR TECHNICAL CONFERENCE' },
      document: { fileName: 'NOV_History Co.pdf', uploadedAt: new Date('1999-01-05T02:00:00Z'), uploadedBy: 'Desktop Clerk' },
      legacy: { table: 'tb_records_NOV', systemId: 1 },
      createdAt: new Date('1999-01-05T02:00:00Z'), createdBy: 'Desktop Clerk',
    });
  });

  afterAll(async () => {
    await getDb().collection('erms-documents').deleteOne({ serialNo: SERIAL });
    await getDb().collection('app-logs').deleteMany({ documentId: SERIAL });
  });

  it('begins with the desktop filing and records each edit with what it changed', async () => {
    const edit = await legal.agent.patch(`/api/erms/units/legal/documents/${SERIAL}`).send({ fields: { status: 'RESOLUTION ISSUED' } });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);

    const res = await legal.agent.get(`/api/erms/units/legal/documents/${SERIAL}/history`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [latest, ...older] = res.body.events;
    expect(latest.action).toBe('document-update');
    expect(latest.who).toBe(LEGAL);
    expect(latest.changes).toEqual({ status: { from: 'FOR TECHNICAL CONFERENCE', to: 'RESOLUTION ISSUED' } });
    const filed = older.find((e) => e.action === 'legacy-filed');
    expect(filed.who).toBe('Desktop Clerk');
    expect(filed.detail).toBe('from tb_records_NOV');
  });

  it('is the unit’s own: another unit’s user cannot read it', async () => {
    const res = await lab.agent.get(`/api/erms/units/legal/documents/${SERIAL}/history`);
    expect(res.status).toBe(403);
  });

  describe('sharing through the Document Portal', () => {
    const { ObjectId } = db;
    const legalRequest = new ObjectId();
    const recordsRequest = new ObjectId();
    const at = (min) => new Date(Date.UTC(2001, 0, 1, 0, min));

    beforeAll(async () => {
      await getDb().collection('erms-records').deleteOne({ serialNo: SERIAL });
      await getDb().collection('erms-records').insertOne({
        serialNo: SERIAL, proponentName: 'History', projectTitle: 'History', permit: { type: 'cnc', number: null },
        location: { province: 'bataan' }, document: {},
      });
      // The same serial asked for twice: once from Legal, once from Records.
      await getDb().collection('portal-requests').insertMany([
        { _id: legalRequest, serialNo: SERIAL, source: 'legal', requesterName: 'Ana Reyes', designation: 'DENR-PENRO', status: 'approved', createdAt: at(1) },
        { _id: recordsRequest, serialNo: SERIAL, source: 'records', requesterName: 'Ben Cruz', designation: 'Student', status: 'declined', createdAt: at(1) },
      ]);
      const log = (id, actionType, username, changes, min) => ({
        domain: 'erms', actionType, actionLabel: actionType, targetCollection: 'portal-requests', documentId: String(id), username, changes, timestamp: at(min),
      });
      await getDb().collection('app-logs').insertMany([
        log(legalRequest, 'portal-request', null, { serialNo: SERIAL, requesterName: 'Ana Reyes', designation: 'DENR-PENRO', purpose: 'Case review' }, 2),
        log(legalRequest, 'portal-decision', LEGAL, { serialNo: SERIAL, for: 'Ana Reyes', status: 'approved', grantedMinutes: 30, pages: '1-3' }, 3),
        { domain: 'nas', operation: 'portal-view', actionType: 'NAS', serialNo: SERIAL, container: 'legal', detail: `request ${legalRequest} (Ana Reyes, DENR-PENRO); pages 1-3 of 9`, success: true, timestamp: at(4) },
        log(recordsRequest, 'portal-decision', RECORDS, { serialNo: SERIAL, for: 'Ben Cruz', status: 'declined' }, 5),
      ]);
    });

    afterAll(async () => {
      await getDb().collection('erms-records').deleteOne({ serialNo: SERIAL });
      await getDb().collection('portal-requests').deleteMany({ _id: { $in: [legalRequest, recordsRequest] } });
      await getDb().collection('app-logs').deleteMany({ $or: [{ documentId: { $in: [String(legalRequest), String(recordsRequest)] } }, { serialNo: SERIAL }] });
    });

    it('is on the document’s History: who asked, who approved it and for how long, each open', async () => {
      const res = await legal.agent.get(`/api/erms/units/legal/documents/${SERIAL}/history`);
      const shared = res.body.events.filter((e) => e.shared);
      expect(shared.map((e) => e.action)).toEqual(['portal-view', 'portal-decision', 'portal-request']);
      const decision = shared.find((e) => e.action === 'portal-decision');
      expect(decision.who).toBe(LEGAL);
      expect(decision.detail).toMatch(/for Ana Reyes \(DENR-PENRO\).*approved.*30 min.*pages 1-3/);
      expect(shared.find((e) => e.action === 'portal-request').who).toBe('Ana Reyes (Document Portal)');
      // The Records request for the same serial is the Records Unit's, not this document's.
      expect(res.body.events.some((e) => /Ben Cruz/.test(e.detail || ''))).toBe(false);
    });

    it('is on a record’s Tracking for the Records Unit', async () => {
      const res = await records.agent.get(`/api/erms/records/${SERIAL}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const shared = res.body.tracking.filter((t) => t.source === 'portal');
      expect(shared).toHaveLength(1);
      expect(shared[0]).toMatchObject({ action: 'portal-decision', actionLabel: 'Sharing decided', createdBy: RECORDS });
      expect(shared[0].purpose).toMatch(/for Ben Cruz.*declined/);
    });
  });
});

describe('a unit taken down for maintenance', () => {
  afterAll(async () => {
    await getDb().collection('app-config').deleteOne({ _id: 'erms-availability' });
  });

  it('is the Developer’s to switch', async () => {
    const refused = await legal.agent.put('/api/dev/erms-availability/legal').send({ down: true });
    expect(refused.status).toBe(403);
    const res = await developer.agent.put('/api/dev/erms-availability/legal').send({ down: true, reason: 'Moving the Legal share' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.units.legal).toMatchObject({ down: true, reason: 'Moving the Legal share', by: DEVELOPER });
    expect(res.body.units.records.down).toBe(false);
  });

  it('answers 503 to everyone but the Developer, and leaves the other units alone', async () => {
    const down = await legal.agent.get('/api/erms/units/legal/documents');
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ code: 'ERMS_UNIT_DOWN', unit: 'legal' });
    expect(down.body.message).toMatch(/Moving the Legal share/);
    // Everyone signed in can see that it is down.
    const seen = await records.agent.get('/api/erms-availability');
    expect(seen.body.units.legal.down).toBe(true);
    // The Developer can still look; the Laboratory is untouched.
    expect((await developer.agent.get('/api/erms/units/legal/documents')).status).toBe(200);
    expect((await lab.agent.get('/api/erms/units/laboratory/documents')).status).toBe(200);
  });

  it('comes back when switched on again', async () => {
    const res = await developer.agent.put('/api/dev/erms-availability/legal').send({ down: false });
    expect(res.body.units.legal.down).toBe(false);
    expect((await legal.agent.get('/api/erms/units/legal/documents')).status).toBe(200);
  });
});

describe('Admin Settings > User Accounts: the System on an account', () => {
  it('is set by the Developer and applies at once', async () => {
    const refused = await legal.agent.put(`/api/users/${legalId}/erms-unit`).send({ ermsUnit: 'laboratory' });
    expect(refused.status).toBe(403);

    const bad = await developer.agent.put(`/api/users/${legalId}/erms-unit`).send({ ermsUnit: 'finance' });
    expect(bad.status).toBe(400);

    const ok = await developer.agent.put(`/api/users/${legalId}/erms-unit`).send({ ermsUnit: 'laboratory' });
    expect(ok.status).toBe(200);
    expect(ok.body.ermsUnit).toBe('laboratory');

    const me = await legal.agent.get('/api/auth/me');
    expect(me.body.ermsUnit).toBe('laboratory');
    const moved = await legal.agent.get('/api/erms/units/laboratory/documents');
    expect(moved.status).toBe(200);

    await developer.agent.put(`/api/users/${legalId}/erms-unit`).send({ ermsUnit: 'legal' });
  });

  it('is offered with the account types', async () => {
    const res = await developer.agent.get('/api/users/types');
    expect(res.body.ermsUnits.map((u) => u.value)).toEqual(['records', 'legal', 'laboratory']);
  });
});

describe('Admin Settings > ERMS Config', () => {
  it('serves the legacy layout as the default, to the admin domain only', async () => {
    const refused = await legal.agent.get('/api/erms/config');
    expect(refused.status).toBe(403);

    const res = await developer.agent.get('/api/erms/config');
    expect(res.status).toBe(200);
    expect(res.body.units.records.folder.root).toBe('RECORDS\\Database\\Records Database');
    expect(res.body.units.legal.docTypes.find((t) => t.code === 'nov').serial).toEqual({ prefix: 'FSN-NOV', pad: 5 });
    expect(res.body.units.laboratory.docTypes.map((t) => t.code)).toContain('ltr');
    expect(res.body.fieldTypes).toContain('lookup');
    expect(res.body.updatedAt).toBeNull();
  });

  it('saves a change field by field and can go back to the legacy layout', async () => {
    const before = (await developer.agent.get('/api/erms/config')).body;
    const legalUnit = before.units.legal;
    const nov = legalUnit.docTypes.find((t) => t.code === 'nov');
    const changed = {
      units: {
        legal: {
          ...legalUnit,
          label: 'Legal (test)',
          docTypes: legalUnit.docTypes.map((t) => (t.code === 'nov' ? { ...t, fields: [...t.fields, { key: 'testField', label: 'Test', type: 'text', required: true }] } : t)),
        },
      },
      upload: { maxMb: 42 },
    };
    const saved = await developer.agent.put('/api/erms/config').send(changed);
    expect(saved.status).toBe(200);
    expect(saved.body.units.legal.label).toBe('Legal (test)');
    expect(saved.body.units.legal.docTypes.find((t) => t.code === 'nov').fields.length).toBe(nov.fields.length + 1);
    expect(saved.body.upload.maxMb).toBe(42);
    // The other units are untouched.
    expect(saved.body.units.laboratory).toEqual(before.units.laboratory);

    // The new required field is enforced on the next upload.
    const missing = await legal.agent
      .post('/api/erms/units/legal/documents')
      .field('docType', 'nov')
      .field('province', 'bataan')
      .field('fields', JSON.stringify({ docketNo: 'X', companyName: 'Y', novDateIssued: '2026-09-01', status: 'S' }));
    expect(missing.status).toBe(400);
    expect(missing.body.errors.map((e) => e.field)).toContain('testField');

    const reset = await developer.agent.post('/api/erms/config/reset');
    expect(reset.status).toBe(200);
    expect(reset.body.units.legal.label).toBe('Legal Services Unit');
    expect(reset.body.upload.maxMb).toBe(100);
  });

  it('edits a menu', async () => {
    const saved = await developer.agent.put('/api/erms/config/lookups/zz-test-kind').send({ items: [{ label: 'One' }, { label: 'Two', code: 'T2' }, 'Three'] });
    expect(saved.status).toBe(200);
    expect(saved.body.count).toBe(3);
    const read = await developer.agent.get('/api/erms/config/lookups/zz-test-kind');
    expect(read.body.items.map((i) => i.label)).toEqual(['One', 'Two', 'Three']);
  });
});
