import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import erms from '../modules/erms/index.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// The ERMS write path: create, update, tracking, archiving, reports.
//
// Everything it creates is namespaced and removed afterwards. It never touches
// a migrated record.
// ---------------------------------------------------------------------------

const enabled = erms.isEnabled();
const suite = enabled ? describe : describe.skip;
if (!enabled) console.warn('ERMS_MODULE_ENABLED is not true — skipping the ERMS write suite.');

const PASSWORD = 'Phase7WritePw!x9';
const WRITER = '__test_w_writer'; // readWrite on bataan, view on aurora
const READER = '__test_w_reader'; // erms domain, but no canManageData
const USERNAMES = [WRITER, READER];
const BOX = 'TESTBOX-A';

const created = { serials: [], boxes: [BOX] };

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  permission: 'records',
  domains: ['erms'],
  assignedYears: [2025],
  aurora: 'view',
  bataan: 'readWrite',
  bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

const caps = (canManageData) => ({
  canGenerateData: false,
  canManageData,
  canViewAdminPanel: false,
  canViewDataHistory: false,
  canAccessRangePicker: false,
});

// One session per user for the whole file. Signing in per test would be dozens
// of logins against a single in-process app for no added coverage.
const agents = new Map();
async function signIn(username) {
  if (agents.has(username)) return agents.get(username);
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  agents.set(username, agent);
  return agent;
}

const newRecord = (over = {}) => ({
  proponentName: 'Test Proponent',
  projectTitle: 'Test Project',
  permit: { type: 'cnc', number: `TEST-CNC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  location: { province: 'bataan', city: 'Balanga' },
  ...over,
});

beforeAll(async () => {
  await connectToMongo();
  await erms.ensureIndexes();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(WRITER, { password, capabilities: caps(true) }),
    // Holds the ERMS domain without being Records Unit staff: a Planning
    // Admin given ERMS. Records Unit staff (an ERMS User whose System is
    // Records) write their own unit's records without the capability, as in
    // the desktop system; everyone else needs canManageData.
    base(READER, { password, permission: 'planning', domains: ['erms', 'ucds'], capabilities: caps(false) }),
  ]);
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  if (created.serials.length) {
    await collections.ermsRecords.deleteMany({ serialNo: { $in: created.serials } });
    await getDb().collection('erms-tracking').deleteMany({ recordSerialNo: { $in: created.serials } });
  }
  await getDb().collection('erms-archive-boxes').deleteMany({ code: { $in: created.boxes } });
  await getDb().collection('app-logs').deleteMany({ username: { $in: USERNAMES } });
}, 60000);

suite('ERMS writes', () => {
  describe('authorization', () => {
    it('refuses a create without the canManageData capability', async () => {
      const agent = await signIn(READER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CAPABILITY_REQUIRED');
    });

    it('refuses a create in a province the user may only view', async () => {
      // The account holds aurora='view', which reads but does not write.
      const agent = await signIn(WRITER);
      const res = await agent
        .post('/api/erms/records')
        .send(newRecord({ location: { province: 'aurora', city: 'Baler' } }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROVINCE_FORBIDDEN');
    });

    it('refuses a create in a province the user does not hold at all', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .post('/api/erms/records')
        .send(newRecord({ location: { province: 'pampanga' } }));
      expect(res.status).toBe(403);
    });
  });

  describe('create', () => {
    it('allocates the next serial and records provenance', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      expect(res.status).toBe(201);

      const { record } = res.body;
      created.serials.push(record.serialNo);

      expect(record.serialNo).toMatch(/^FSN-\d{7}$/);
      expect(record.createdBy).toBe(WRITER);
      expect(record.legacySource).toBe('ucds-erms');
      expect(record.legacyId).toBeNull();
      expect(record.permit.label).toBe('Certificate of Non-Coverage');
      expect(record.dataQuality.clean).toBe(true);
    });

    it('never issues the same serial twice, even concurrently', async () => {
      const agent = await signIn(WRITER);
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => agent.post('/api/erms/records').send(newRecord()))
      );
      const serials = responses.map((r) => {
        expect(r.status).toBe(201);
        created.serials.push(r.body.record.serialNo);
        return r.body.record.serialNo;
      });
      expect(new Set(serials).size).toBe(5);
    });

    it('continues the desktop application’s numbering rather than restarting it', async () => {
      // The highest serial on file before this one — on a copy of production,
      // the migrated extract's (it ends at FSN-0018030) or later; on an empty
      // test database, the ones this file has just made.
      const [highest] = await collections.ermsRecords
        .find({ serialNo: /^FSN-\d+$/ }, { projection: { serialNo: 1 } })
        .sort({ serialNo: -1 })
        .limit(1)
        .toArray();
      const before = highest ? Number(highest.serialNo.replace(/\D/g, '')) : 0;

      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      created.serials.push(res.body.record.serialNo);
      const n = Number(res.body.record.serialNo.replace(/\D/g, ''));
      expect(n).toBeGreaterThan(before);
    });

    it('refuses a permit number already on another record', async () => {
      const agent = await signIn(WRITER);
      const payload = newRecord();
      const first = await agent.post('/api/erms/records').send(payload);
      created.serials.push(first.body.record.serialNo);

      const second = await agent.post('/api/erms/records').send(payload);
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('PERMIT_NUMBER_EXISTS');
    });

    it('rejects a malformed body with a per-field error', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .post('/api/erms/records')
        .send({ proponentName: '', permit: { type: 'not-a-type' }, location: { province: 'bataan' } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it('writes an audit entry naming the actor', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      created.serials.push(res.body.record.serialNo);

      const entry = await getDb()
        .collection('app-logs')
        .findOne({ documentId: res.body.record.serialNo, actionType: 'Create Record' });
      expect(entry).toBeTruthy();
      expect(entry.username).toBe(WRITER);
      expect(entry.domain).toBe('erms');
    });
  });

  describe('update', () => {
    let serialNo;

    beforeAll(async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      serialNo = res.body.record.serialNo;
      created.serials.push(serialNo);
    });

    it('applies a change and records who made it', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .patch(`/api/erms/records/${serialNo}`)
        .send({ proponentName: 'Corrected Proponent' });

      expect(res.status).toBe(200);
      expect(res.body.record.proponentName).toBe('Corrected Proponent');
      expect(res.body.record.updatedBy).toBe(WRITER);
    });

    it('merges nested objects instead of replacing them', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .patch(`/api/erms/records/${serialNo}`)
        .send({ location: { city: 'Dinalupihan' } });
      // The province was not sent and must survive.
      expect(res.body.record.location.province).toBe('bataan');
      expect(res.body.record.location.city).toBe('Dinalupihan');
    });

    it('refuses to move a record into a province the user cannot write', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .patch(`/api/erms/records/${serialNo}`)
        .send({ location: { province: 'aurora' } });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROVINCE_FORBIDDEN');
    });

    it('refuses an update without the capability', async () => {
      const agent = await signIn(READER);
      const res = await agent.patch(`/api/erms/records/${serialNo}`).send({ remarks: 'nope' });
      expect(res.status).toBe(403);
    });

    it('answers 404 for a record that does not exist', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.patch('/api/erms/records/FSN-9999999').send({ remarks: 'x' });
      expect(res.status).toBe(404);
    });

    it('clears the preserved raw value when a flagged date is corrected', async () => {
      // Reproduce a migrated record's flagged state, then fix it.
      await collections.ermsRecords.updateOne(
        { serialNo },
        {
          $set: {
            'permit.dateApprovedRaw': '16 December 20211',
            dataQuality: {
              clean: false,
              issues: [{ field: 'Date_Approved', problem: 'unparseable', value: '16 December 20211' }],
            },
          },
        }
      );

      const agent = await signIn(WRITER);
      const res = await agent
        .patch(`/api/erms/records/${serialNo}`)
        .send({ permit: { dateApproved: '2021-12-16' } });

      expect(res.status).toBe(200);
      expect(res.body.record.permit.dateApprovedRaw).toBeNull();
      expect(new Date(res.body.record.permit.dateApproved).getFullYear()).toBe(2021);
      expect(res.body.record.dataQuality.clean).toBe(true);
    });
  });

  describe('tracking', () => {
    let serialNo;

    beforeAll(async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      serialNo = res.body.record.serialNo;
      created.serials.push(serialNo);
    });

    it('appends an entry and reports current custody', async () => {
      const agent = await signIn(WRITER);
      const add = await agent
        .post(`/api/erms/records/${serialNo}/tracking`)
        .send({ action: 'received', toParty: 'Records Section', purpose: 'Filing' });
      expect(add.status).toBe(201);

      const { body } = await agent.get(`/api/erms/records/${serialNo}/tracking`);
      expect(body.tracking).toHaveLength(1);
      expect(body.custody.heldBy).toBe('Records Section');
    });

    it('follows the record as it moves', async () => {
      const agent = await signIn(WRITER);
      await agent
        .post(`/api/erms/records/${serialNo}/tracking`)
        .send({ action: 'released', toParty: 'Legal Unit', purpose: 'Review' });

      const { body } = await agent.get(`/api/erms/records/${serialNo}/tracking`);
      expect(body.tracking).toHaveLength(2);
      expect(body.custody.released).toBe(true);
    });

    it('offers no way to edit or delete a custody entry', async () => {
      const agent = await signIn(WRITER);
      const entry = (await agent.get(`/api/erms/records/${serialNo}/tracking`)).body.tracking[0];
      expect((await agent.patch(`/api/erms/tracking/${entry._id}`).send({ action: 'received' })).status).toBe(404);
      expect((await agent.delete(`/api/erms/records/${serialNo}/tracking`)).status).toBe(404);
    });

    it('refuses an unknown action', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .post(`/api/erms/records/${serialNo}/tracking`)
        .send({ action: 'incinerated' });
      expect(res.status).toBe(400);
    });

    it('refuses tracking without the capability', async () => {
      const agent = await signIn(READER);
      const res = await agent
        .post(`/api/erms/records/${serialNo}/tracking`)
        .send({ action: 'received' });
      expect(res.status).toBe(403);
    });

    it('lists an overdue loan, and stops once the record comes back', async () => {
      const agent = await signIn(WRITER);
      await agent.post(`/api/erms/records/${serialNo}/tracking`).send({
        action: 'borrowed',
        toParty: 'Engineering',
        dueDate: '2020-01-01',
      });

      let { body } = await agent.get('/api/erms/tracking/overdue');
      expect(body.overdue.some((o) => o.recordSerialNo === serialNo)).toBe(true);

      await agent.post(`/api/erms/records/${serialNo}/tracking`).send({ action: 'returned' });
      ({ body } = await agent.get('/api/erms/tracking/overdue'));
      expect(body.overdue.some((o) => o.recordSerialNo === serialNo)).toBe(false);
    });
  });

  describe('archiving', () => {
    let serialNo;

    beforeAll(async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/records').send(newRecord());
      serialNo = res.body.record.serialNo;
      created.serials.push(serialNo);
      await getDb().collection('erms-archive-boxes').deleteMany({ code: BOX });
    });

    it('creates a box', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .post('/api/erms/boxes')
        .send({ code: BOX, label: 'Test box', province: 'bataan', retentionYears: 5 });
      expect(res.status).toBe(201);
      expect(res.body.box.status).toBe('open');
    });

    it('refuses a duplicate box code', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.post('/api/erms/boxes').send({ code: BOX, province: 'bataan' });
      expect(res.status).toBe(409);
    });

    it('files a record into the box and counts it', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.put(`/api/erms/records/${serialNo}/box`).send({ boxCode: BOX });
      expect(res.status).toBe(200);
      expect(res.body.archive.boxCode).toBe(BOX);

      const { body } = await agent.get('/api/erms/boxes');
      expect(body.boxes.find((b) => b.code === BOX).recordCount).toBe(1);

      const contents = await agent.get(`/api/erms/boxes/${BOX}`);
      expect(contents.body.contents.some((r) => r.serialNo === serialNo)).toBe(true);
    });

    it('sets a disposal date when the box is sealed', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.patch(`/api/erms/boxes/${BOX}`).send({ status: 'sealed' });
      expect(res.status).toBe(200);
      expect(res.body.box.sealedAt).toBeTruthy();
      expect(new Date(res.body.box.disposeAfter).getFullYear()).toBe(
        new Date().getFullYear() + 5
      );
    });

    it('refuses new records once the box is sealed', async () => {
      const agent = await signIn(WRITER);
      const other = await agent.post('/api/erms/records').send(newRecord());
      created.serials.push(other.body.record.serialNo);

      const res = await agent
        .put(`/api/erms/records/${other.body.record.serialNo}/box`)
        .send({ boxCode: BOX });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BOX_NOT_OPEN');
    });

    it('will not record a disposal without naming the authority for it', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.patch(`/api/erms/boxes/${BOX}`).send({ status: 'disposed' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DISPOSAL_AUTHORITY_REQUIRED');
    });

    it('records a disposal, and keeps the records in the database', async () => {
      const agent = await signIn(WRITER);
      const res = await agent
        .patch(`/api/erms/boxes/${BOX}`)
        .send({ status: 'disposed', disposalAuthority: 'NAP Disposal Authority 2026-001' });

      expect(res.status).toBe(200);
      expect(res.body.box.disposedBy).toBe(WRITER);
      expect(res.body.box.disposalAuthority).toBe('NAP Disposal Authority 2026-001');

      // The paper is gone; the trail is not.
      const still = await collections.ermsRecords.findOne({ serialNo });
      expect(still).toBeTruthy();
      expect(still.archive.boxCode).toBe(BOX);
    });

    it('refuses further changes to a disposed box', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.patch(`/api/erms/boxes/${BOX}`).send({ label: 'changed' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BOX_DISPOSED');
    });
  });

  describe('reports', () => {
    it('runs a report within the caller’s province scope', async () => {
      const agent = await signIn(WRITER);
      const { status, body } = await agent.get('/api/erms/reports/inventory?limit=50');
      expect(status).toBe(200);
      expect(body.columns.length).toBeGreaterThan(0);
      expect(body.rows.length).toBeGreaterThan(0);

      const scoped = await collections.ermsRecords.countDocuments({
        'location.province': { $in: ['aurora', 'bataan'] },
      });
      expect(body.total).toBe(scoped);
    });

    it('exports CSV with a filename', async () => {
      const agent = await signIn(WRITER);
      const res = await agent.get('/api/erms/reports/unlinked?format=csv&limit=5');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="erms-unlinked-/);
      expect(res.text.split('\n')[0]).toContain('Serial');
    });

    it('refuses an unknown report', async () => {
      const agent = await signIn(WRITER);
      expect((await agent.get('/api/erms/reports/everything')).status).toBe(400);
    });

    it('requires the erms domain', async () => {
      expect((await request(app).get('/api/erms/reports/inventory')).status).toBe(401);
    });
  });
});
