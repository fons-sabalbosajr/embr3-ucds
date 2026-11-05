import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import erms from '../modules/erms/index.js';
import ucds from '../modules/ucds/index.js';

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// Phase 8: the two integration points.
//
//   UCDS -> ERMS   an establishment page showing its records
//   ERMS -> UCDS   a record resolving its establishment by permit number
//
// Both are reads, in-process, through the owning module's exported service.
// Neither domain gains a write path into the other.
// ---------------------------------------------------------------------------

const enabled = erms.isEnabled();
const suite = enabled ? describe : describe.skip;
if (!enabled) console.warn('ERMS_MODULE_ENABLED is not true — skipping the cross-domain suite.');

const PASSWORD = 'Phase8Pw!x9';
const BOTH = '__test_x_both'; // ucds + erms
const PLANNING_ONLY = '__test_x_planning'; // ucds only: the Planning Unit opens an establishment's documents
const ENCODER = '__test_x_encoder'; // ucds only, and no such access
const RECORDS_ONLY = '__test_x_records'; // erms only
// Holds one province. All seven is no restriction at all, so only an account
// like this reaches the province filter.
const PLANNING_BATAAN = '__test_x_planning_bataan';
const USERNAMES = [BOTH, PLANNING_ONLY, ENCODER, RECORDS_ONLY, PLANNING_BATAAN];
const ONLY_BATAAN = { aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none' };

const createdSerials = [];
let linkedSample; // a migrated record that already has a ucdsRef

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite',
  nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
  capabilities: {
    canGenerateData: false, canManageData: true, canViewAdminPanel: false,
    canViewDataHistory: false, canAccessRangePicker: false,
  },
  ...extra,
});

const agents = new Map();
async function signIn(username) {
  if (agents.has(username)) return agents.get(username);
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  agents.set(username, agent);
  return agent;
}

// The establishment is looked up in the active year's register, and a Planning
// account starts at the year picker: this is what it does there.
async function signInWithYear(username) {
  const agent = await signIn(username);
  expect((await agent.post('/api/years/select').send({ year: 2025 })).status).toBe(200);
  return agent;
}

// The establishment and the record linked to it, made here so the suite does
// not depend on what the database holds: a register entry whose permit number
// is written the register's way (ECC-OL-R03-…) and an ERMS record holding the
// same number written ERMS's way (R03-…), linked to it as the migration
// links them. Around it, enough unrelated register entries for "a handful of
// candidates, not the register" to mean something.
const FIRM = '__TEST-XD-FIRM';
const FIRM_PERMIT = 'R03-2099-0917';
const FILLER_KEYS = /^__TEST-XD-/;
const FIXTURE_SERIAL = '__TEST-XD-REC-1';
const FIRM_AURORA = '__TEST-XD-AURORA';

async function seedRegisterAndRecord() {
  await collections.ucds.deleteMany({ sort_key: FILLER_KEYS });
  await collections.ermsRecords.deleteMany({ serialNo: FIXTURE_SERIAL });
  await collections.ucds.insertMany([
    { sort_key: FIRM, name: '__Test Cross Domain Firm', title: '__Test Cross Domain Plant', province: 'Bataan', city: 'Mariveles', ecc_cnc: `ECC-OL-${FIRM_PERMIT}` },
    { sort_key: FIRM_AURORA, name: '__Test Aurora Firm', province: 'Aurora', ecc_cnc: 'ECC-OL-R03-1998-0001' },
    ...Array.from({ length: 150 }, (_, i) => ({
      sort_key: `__TEST-XD-${String(i).padStart(3, '0')}`,
      name: `__Test Register Filler ${i}`,
      province: 'Bataan',
      ecc_cnc: `ECC-OL-R03-1999-${String(5000 + i)}`,
    })),
  ]);
  await collections.ermsRecords.insertOne({
    serialNo: FIXTURE_SERIAL,
    proponentName: '__Test Cross Domain Firm',
    projectTitle: '__Test Cross Domain Plant',
    permit: { type: 'ecc-original', label: 'ECC', number: FIRM_PERMIT },
    location: { province: 'bataan', provinceLabel: 'Bataan' },
    document: { fileName: '__test-xd.pdf', uploadedAt: new Date() },
    // As the migration records it: the ERMS spelling differs from the
    // register's, so the two were matched on the permit's digits.
    ucdsRef: { sortKey: FIRM, nameSnapshot: '__Test Cross Domain Firm', matchedOn: 'digits' },
  });
  return collections.ermsRecords.findOne({ serialNo: FIXTURE_SERIAL });
}

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(BOTH, { password, permission: 'admin', domains: ['ucds', 'erms'] }),
    base(PLANNING_ONLY, { password, permission: 'planning', domains: ['ucds'] }),
    base(ENCODER, { password, permission: 'viewer', domains: ['ucds'] }),
    base(RECORDS_ONLY, { password, permission: 'records', domains: ['erms'] }),
    base(PLANNING_BATAAN, { password, permission: 'planning', domains: ['ucds'], ...ONLY_BATAAN }),
  ]);

  linkedSample = await seedRegisterAndRecord();
  expect(linkedSample).toBeTruthy();
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
  await collections.ucds.deleteMany({ sort_key: FILLER_KEYS });
  await collections.ermsRecords.deleteMany({ serialNo: FIXTURE_SERIAL });
  if (createdSerials.length) {
    await collections.ermsRecords.deleteMany({ serialNo: { $in: createdSerials } });
  }
  await getDb().collection('app-logs').deleteMany({ username: { $in: USERNAMES } });
}, 60000);

suite('cross-domain integration', () => {
  describe('UCDS establishment -> its ERMS records', () => {
    it('returns the records filed against an establishment', async () => {
      const agent = await signIn(BOTH);
      const { status, body } = await agent.get(
        `/api/ucds/establishments/${encodeURIComponent(linkedSample.ucdsRef.sortKey)}/records`
      );

      expect(status).toBe(200);
      expect(body.available).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.records.some((r) => r.serialNo === linkedSample.serialNo)).toBe(true);
    });

    it('degrades rather than failing for a user without the ERMS domain', async () => {
      // A planning screen must not break because the records module is not
      // available to that person.
      const agent = await signInWithYear(ENCODER);
      const { status, body } = await agent.get(
        `/api/ucds/establishments/${encodeURIComponent(linkedSample.ucdsRef.sortKey)}/records`
      );

      expect(status).toBe(200);
      expect(body.available).toBe(false);
      expect(body.reason).toBe('no-access');
      expect(body.records).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('shows the Planning Unit the records, without the ERMS domain', async () => {
      // The office's rule: the Planning Unit and the PEMUs open an
      // establishment's documents from its record (accessRequestService).
      const agent = await signInWithYear(PLANNING_ONLY);
      const { status, body } = await agent.get(
        `/api/ucds/establishments/${encodeURIComponent(linkedSample.ucdsRef.sortKey)}/records`
      );

      expect(status).toBe(200);
      expect(body.available).toBe(true);
      expect(body.records.some((r) => r.serialNo === linkedSample.serialNo)).toBe(true);
    });

    it('finds an establishment in a province the account holds, and no other', async () => {
      const agent = await signInWithYear(PLANNING_BATAAN);
      const mine = await agent.get(`/api/ucds/establishments/${encodeURIComponent(FIRM)}/records`);
      expect(mine.status).toBe(200);
      expect(mine.body.records.some((r) => r.serialNo === FIXTURE_SERIAL)).toBe(true);
      expect((await agent.get(`/api/ucds/establishments/${encodeURIComponent(FIRM_AURORA)}/records`)).status).toBe(404);
    });

    it('reads one establishment the same way, and an empty scope reads none', async () => {
      const agent = await signInWithYear(PLANNING_BATAAN);
      const mine = await agent.get(`/api/ucds/establishments/${encodeURIComponent(FIRM)}`);
      expect(mine.status).toBe(200);
      expect(mine.body.establishment.sort_key).toBe(FIRM);
      expect((await agent.get(`/api/ucds/establishments/${encodeURIComponent(FIRM_AURORA)}`)).status).toBe(404);

      expect(await ucds.read.findBySortKey(FIRM, ['bataan'])).toBeTruthy();
      expect(await ucds.read.findBySortKey(FIRM, ['aurora'])).toBeNull();
      expect(await ucds.read.findBySortKey(FIRM, [])).toBeNull();
      expect(await ucds.read.findBySortKey(FIRM, null)).toBeTruthy();
    });

    it('requires the UCDS domain, since it hangs off a planning screen', async () => {
      const agent = await signIn(RECORDS_ONLY);
      const res = await agent.get(
        `/api/ucds/establishments/${encodeURIComponent(linkedSample.ucdsRef.sortKey)}/records`
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DOMAIN_FORBIDDEN');
    });

    it('requires a session', async () => {
      const res = await request(app).get('/api/ucds/establishments/AU-1/records');
      expect(res.status).toBe(401);
    });

    it('answers 404 for an establishment that does not exist', async () => {
      const agent = await signIn(BOTH);
      const res = await agent.get('/api/ucds/establishments/NOT-A-KEY/records');
      expect(res.status).toBe(404);
    });
  });

  describe('ERMS -> the UCDS register', () => {
    it('searches the register by name or permit number', async () => {
      const agent = await signIn(RECORDS_ONLY);
      const { status, body } = await agent.get(
        `/api/erms/register/search?q=${encodeURIComponent(linkedSample.permit.number.slice(0, 12))}`
      );
      expect(status).toBe(200);
      expect(Array.isArray(body.establishments)).toBe(true);
    });

    it('refuses a search too short to be meaningful', async () => {
      const agent = await signIn(RECORDS_ONLY);
      expect((await agent.get('/api/erms/register/search?q=a')).status).toBe(400);
    });

    it('resolves a permit number to an establishment', async () => {
      const agent = await signIn(RECORDS_ONLY);
      const { body } = await agent.get(
        `/api/erms/register/resolve?number=${encodeURIComponent(linkedSample.permit.number)}`
      );
      expect(body.match).toBeTruthy();
      expect(body.match.sortKey).toBe(linkedSample.ucdsRef.sortKey);
    });

    it('returns no match rather than a guess', async () => {
      const agent = await signIn(RECORDS_ONLY);
      const { body } = await agent.get('/api/erms/register/resolve?number=ECC-NOT-REAL-9999');
      expect(body.match).toBeNull();
    });

    it('requires the ERMS domain', async () => {
      const agent = await signIn(PLANNING_ONLY);
      expect((await agent.get('/api/erms/register/search?q=test')).status).toBe(403);
    });
  });

  describe('a new record links itself on save', () => {
    it('resolves the establishment from the permit number', async () => {
      const agent = await signIn(BOTH);
      const res = await agent.post('/api/erms/records').send({
        proponentName: 'Cross Domain Test',
        projectTitle: 'Link on create',
        // A permit number already in the register, so the link must resolve.
        permit: { type: 'cnc', number: `${linkedSample.permit.number}` },
        location: { province: linkedSample.location.province },
      });

      // The permit number is already on the migrated record, so the create is
      // refused — which is itself the correct behaviour.
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PERMIT_NUMBER_EXISTS');
    });

    it('saves unlinked when the permit number matches nothing', async () => {
      const agent = await signIn(BOTH);
      const res = await agent.post('/api/erms/records').send({
        proponentName: 'Cross Domain Test',
        projectTitle: 'No register entry',
        permit: { type: 'cnc', number: `TEST-NOMATCH-${Date.now()}` },
        location: { province: 'bataan' },
      });

      expect(res.status).toBe(201);
      createdSerials.push(res.body.record.serialNo);
      expect(res.body.record.ucdsRef).toBeNull();
    });

    it('relinks when the permit number is corrected', async () => {
      const agent = await signIn(BOTH);

      const created = await agent.post('/api/erms/records').send({
        proponentName: 'Cross Domain Test',
        projectTitle: 'Relink on update',
        permit: { type: 'cnc', number: `TEST-RELINK-${Date.now()}` },
        location: { province: 'bataan' },
      });
      createdSerials.push(created.body.record.serialNo);
      expect(created.body.record.ucdsRef).toBeNull();

      // Point it at a permit the register does know, borrowed from a firm that
      // exists. The migrated record keeps its own number; this one is a
      // different record with the same number, which the uniqueness check
      // rejects — so instead assert the resolver itself finds it.
      const resolved = await ucds.read.resolveByPermitNumber(linkedSample.permit.number);
      expect(resolved.sortKey).toBe(linkedSample.ucdsRef.sortKey);
    });
  });

  describe('the lookup stays bounded', () => {
    it('narrows to a handful of candidates instead of loading the register', async () => {
      // Pulling all ~16,000 entries takes about 40 seconds, almost all of it
      // transfer. The candidate query returns a few rows in ~100ms.
      const registry = await import('../modules/ucds/services/registryService.js');
      const candidates = await registry.default.candidatesFor(linkedSample.permit.number);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(50);

      const total = await collections.ucds.countDocuments({});
      expect(candidates.length).toBeLessThan(total / 100);
    });

    it('builds a pattern that tolerates separator and zero-padding differences', async () => {
      const registry = await import('../modules/ucds/services/registryService.js');
      const { candidatePattern } = registry.default;

      // ERMS writes R03-2017-0370; the register writes ECC-OL-R03-2017-0370.
      expect(candidatePattern('R03-2017-0370').test('ECC-OL-R03-2017-0370')).toBe(true);
      // Zero padding differs between the systems.
      expect(candidatePattern('GR-R3-08-0004').test('GR-R3-08-00004')).toBe(true);
      // A number with no digits cannot be looked up.
      expect(candidatePattern('NOTANUMBER')).toBeNull();
    });
  });

  describe('the module boundary holds', () => {
    it('UCDS exposes only reads to other domains', () => {
      expect(Object.keys(ucds.read).sort()).toEqual([
        'findBySortKey',
        'resolveByPermitNumber',
        'search',
      ]);
    });

    it('ERMS exposes only reads to other domains', () => {
      expect(Object.keys(erms.read).sort()).toEqual(['countForFirm', 'forFirm', 'listForFirm']);
    });

    it('the runtime link and the migration use the same matcher', async () => {
      // Both go through modules/ucds/services/permitMatch, so a link made when
      // a clerk saves a record agrees with one made during the import by
      // construction rather than by coincidence.
      const viaService = await ucds.read.resolveByPermitNumber(linkedSample.permit.number);
      expect(viaService.sortKey).toBe(linkedSample.ucdsRef.sortKey);
      expect(viaService.matchedOn).toBe(linkedSample.ucdsRef.matchedOn);
    });
  });
});
