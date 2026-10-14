import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import erms from '../modules/erms/index.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// The ERMS records module over HTTP.
//
// The module only registers its routes when ERMS_MODULE_ENABLED is true, so the
// suite says so plainly rather than reporting misleading 404s if it is off.
// ---------------------------------------------------------------------------

const enabled = erms.isEnabled();
const suite = enabled ? describe : describe.skip;
if (!enabled) {
  console.warn('ERMS_MODULE_ENABLED is not true — skipping the ERMS module suite.');
}

const PASSWORD = 'Phase7TestPw!x9';
const RECORDS_SCOPED = '__test_erms_scoped';
const RECORDS_NONE = '__test_erms_noscope';
const PLANNING = '__test_erms_planning';
const USERNAMES = [RECORDS_SCOPED, RECORDS_NONE, PLANNING];

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none',
  pampanga: 'none', tarlac: 'none', zambales: 'none',
  capabilities: {
    canGenerateData: false, canManageData: false, canViewAdminPanel: false,
    canViewDataHistory: false, canAccessRangePicker: false,
  },
  ...extra,
});

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

// The records these tests read, so they do not depend on what the database
// happens to hold: enough in Bataan for a second page of five, one outside
// the grant (Pampanga), one migrated from the desktop system (legacyId), and
// one linked to a register establishment. On a copy of production they sit
// alongside the real records and are removed afterwards.
const FIXTURE = /^__TEST-EM-/;
const fixtureRecords = () => {
  const at = Date.now();
  const record = (n, province, extra = {}) => ({
    serialNo: `__TEST-EM-${String(n).padStart(3, '0')}`,
    legacyId: `__legacy-em-${n}`,
    proponentName: `__Test ERMS Module Proponent ${n}`,
    projectTitle: `__Test ERMS Module Project ${n}`,
    permit: { type: 'ecc-original', label: 'ECC', number: `__TEST-EM-ECC-${n}` },
    location: { province, provinceLabel: province },
    document: { fileName: `__test-em-${n}.pdf`, uploadedAt: new Date(at - n * 1000) },
    dataQuality: { clean: true },
    ucdsRef: null,
    ...extra,
  });
  return [
    ...Array.from({ length: 11 }, (_, i) =>
      record(i + 1, 'bataan', i === 0 ? { ucdsRef: { sortKey: '__TEST-EM-FIRM', nameSnapshot: '__Test ERMS Module Firm' } } : {})
    ),
    record(99, 'pampanga'),
  ];
};

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(RECORDS_SCOPED, { password, permission: 'records', domains: ['erms'], bataan: 'readWrite' }),
    base(RECORDS_NONE, { password, permission: 'records', domains: ['erms'] }),
    base(PLANNING, { password, permission: 'planning', domains: ['ucds'], bataan: 'readWrite' }),
  ]);
  await collections.ermsRecords.deleteMany({ serialNo: FIXTURE });
  await collections.ermsRecords.insertMany(fixtureRecords());
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await collections.ermsRecords.deleteMany({ serialNo: FIXTURE });
}, 60000);

suite('ERMS module', () => {
  describe('access', () => {
    it.each(['/api/erms/dashboard', '/api/erms/records', '/api/erms/filter-options'])(
      '%s requires a session',
      async (path) => {
        expect((await request(app).get(path)).status).toBe(401);
      }
    );

    it.each(['/api/erms/dashboard', '/api/erms/records'])(
      '%s refuses a user without the erms domain',
      async (path) => {
        const agent = await signIn(PLANNING);
        const res = await agent.get(path);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('DOMAIN_FORBIDDEN');
      }
    );

    it('does not require a year container, unlike UCDS routes', async () => {
      // Records have their own lifecycle; they are not year-scoped.
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get('/api/erms/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.code).not.toBe('NO_ACTIVE_YEAR');
    });
  });

  describe('province scope', () => {
    it('returns only the provinces the account is granted', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const { body } = await agent.get('/api/erms/dashboard');

      expect(body.total).toBeGreaterThan(0);
      expect(body.byProvince.every((p) => p._id === 'bataan')).toBe(true);

      const all = await collections.ermsRecords.countDocuments({});
      expect(body.total).toBeLessThan(all);
    });

    it('denies rather than permits when no province is granted', async () => {
      // The same fail-closed rule as the UCDS register: an empty grant means
      // "never configured", not "everything".
      const agent = await signIn(RECORDS_NONE);
      const { body } = await agent.get('/api/erms/dashboard');
      expect(body.total).toBe(0);
    });

    it('will not let a filter widen the scope', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get('/api/erms/records?province=pampanga&pageSize=5');
      expect(res.status).toBe(200);
      // Asking for a province outside the grant falls back to the grant.
      expect(res.body.items.every((r) => r.location.province === 'bataan')).toBe(true);
    });

    it('hides an out-of-scope record behind 404 rather than 403', async () => {
      const outside = await collections.ermsRecords.findOne({ 'location.province': 'pampanga' });
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get(`/api/erms/records/${encodeURIComponent(outside.serialNo)}`);
      expect(res.status).toBe(404);
    });
  });

  describe('listing', () => {
    it('paginates', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const { body } = await agent.get('/api/erms/records?pageSize=5&page=2');
      expect(body.items).toHaveLength(5);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(5);
    });

    it('rejects an out-of-range page size with a per-field error', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get('/api/erms/records?pageSize=9999');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors[0].field).toBe('pageSize');
    });

    it('rejects a sort field that is not allowed', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get('/api/erms/records?sortBy=password');
      expect(res.status).toBe(400);
    });

    it('searches across serial, permit number, proponent and title', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const seed = (await agent.get('/api/erms/records?pageSize=1')).body.items[0];
      const res = await agent.get(`/api/erms/records?search=${encodeURIComponent(seed.serialNo)}`);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items.some((r) => r.serialNo === seed.serialNo)).toBe(true);
    });

    it('filters to records linked to the register', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const { body } = await agent.get('/api/erms/records?linked=linked&pageSize=10');
      expect(body.items.every((r) => r.ucdsRef?.sortKey)).toBe(true);
    });

    it('filters to records with no register entry', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const { body } = await agent.get('/api/erms/records?linked=unlinked&pageSize=10');
      expect(body.items.every((r) => !r.ucdsRef)).toBe(true);
    });
  });

  describe('detail', () => {
    it('returns the record and its attachments', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const seed = (await agent.get('/api/erms/records?pageSize=1')).body.items[0];
      const { status, body } = await agent.get(
        `/api/erms/records/${encodeURIComponent(seed.serialNo)}`
      );

      expect(status).toBe(200);
      expect(body.record.serialNo).toBe(seed.serialNo);
      expect(body.record.legacyId).toBeTruthy();
      expect(Array.isArray(body.attachments)).toBe(true);
    });

    it('answers 404 for a serial that does not exist', async () => {
      const agent = await signIn(RECORDS_SCOPED);
      const res = await agent.get('/api/erms/records/FSN-9999999');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('RECORD_NOT_FOUND');
    });
  });

  describe('cross-domain read API', () => {
    it('reports how many records reference an establishment', async () => {
      const linked = await collections.ermsRecords.findOne({ 'ucdsRef.sortKey': { $ne: null } });
      const count = await erms.read.countForFirm(linked.ucdsRef.sortKey);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('lists those records', async () => {
      const linked = await collections.ermsRecords.findOne({ 'ucdsRef.sortKey': { $ne: null } });
      const rows = await erms.read.listForFirm(linked.ucdsRef.sortKey, 5);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((r) => r.serialNo)).toBe(true);
    });

    it('returns nothing rather than throwing for an unknown key', async () => {
      expect(await erms.read.countForFirm('NOT-A-KEY')).toBe(0);
      expect(await erms.read.countForFirm(null)).toBe(0);
      expect(await erms.read.listForFirm(null)).toEqual([]);
    });

    it('exposes no write API to other domains', () => {
      expect(Object.keys(erms.read).sort()).toEqual(['countForFirm', 'listForFirm']);
    });
  });
});
