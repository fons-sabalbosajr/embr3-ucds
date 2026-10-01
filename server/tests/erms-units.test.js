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
