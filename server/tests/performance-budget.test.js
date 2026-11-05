import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Collection } from 'mongodb';
import { createRequire } from 'node:module';

import app from '../app.js';
import db from '../config/db.js';
import registerCheck from '../modules/ucds/services/registerCheck.js';

// By require, as the app has it: imported, this would be a second copy of the
// cache, and clearing it would not touch the one the app reads.
const require = createRequire(import.meta.url);
const shortCache = require('../shared/services/shortCache.js');

const { connectToMongo, collections, getDb } = db;

// ---------------------------------------------------------------------------
// What keeps the app from slowing down again, from the audit of 4 Nov 2026.
//
// Counted, not timed: a test machine's speed says nothing, but the number of
// reads a screen makes, and whether it sends a province twice, do not change
// with the machine. A failure here means a screen or a VERA check has gone back
// to repeating work for each person or each record.
// ---------------------------------------------------------------------------

const PASSWORD = 'PerfBudgetTest!x9';
const DEVELOPER = '__test_perf_dev';
const PLANNER = '__test_perf_planner';
const OTHER_YEAR = 2003;
const REGISTER = '__test_perf_register';
const ROW = 'BA-__TEST-PERF';

async function signIn(username, year = 2025) {
  const agent = request.agent(app);
  expect((await agent.post('/login').send({ username, password: PASSWORD })).status).toBe(200);
  expect((await agent.post('/api/years/select').send({ year })).status).toBe(200);
  return agent;
}

/** How many reads of the shared register `fn` makes. */
async function registerReads(fn) {
  let reads = 0;
  const spies = ['find', 'findOne', 'aggregate', 'countDocuments'].map((m) => {
    const original = Collection.prototype[m];
    return vi.spyOn(Collection.prototype, m).mockImplementation(function (...args) {
      if (this.collectionName === 'ucds-data') reads += 1;
      return original.apply(this, args);
    });
  });
  try {
    await fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return reads;
}

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 4);
  await collections.users.deleteMany({ username: { $in: [DEVELOPER, PLANNER] } });
  await collections.users.insertMany([
    { username: DEVELOPER, name: DEVELOPER, email: `${DEVELOPER}@test.local`, division: 'TEST', status: 'offline', permission: 'developer', assignedYears: [2025, OTHER_YEAR], password },
    { username: PLANNER, name: PLANNER, email: `${PLANNER}@test.local`, division: 'TEST', status: 'offline', permission: 'planning', domains: ['ucds'], assignedYears: [2025], password, bataan: 'readWrite' },
  ]);
  await collections.yearContainers.deleteOne({ year: OTHER_YEAR });
  await collections.yearContainers.insertOne({ year: OTHER_YEAR, label: `${OTHER_YEAR} Data (test)`, status: 'active', createdAt: new Date() });
  shortCache.invalidate('years:');
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: [DEVELOPER, PLANNER] } });
  await collections.loginStatus.deleteMany({ username: { $in: [DEVELOPER, PLANNER] } });
  await collections.yearContainers.deleteOne({ year: OTHER_YEAR });
  await collections.ucds.deleteMany({ sort_key: ROW });
  await getDb().collection(REGISTER).deleteMany({});
  await getDb().collection(registerCheck.COLLECTION).deleteMany({ register: REGISTER });
  shortCache.invalidate('years:');
}, 60000);

describe('the Planning dashboard', () => {
  it('reads the register once for everyone, and again after an edit', async () => {
    const agent = await signIn(DEVELOPER);
    shortCache.invalidate('ucds:register-');
    const first = await registerReads(async () => expect((await agent.get('/api/ucds/dashboard-stats')).status).toBe(200));
    expect(first).toBeGreaterThan(0);
    // Eleven reads, seven of them counts, which the driver runs through aggregate
    // and so are seen here twice.
    expect(first).toBeLessThanOrEqual(18);
    expect(await registerReads(async () => expect((await agent.get('/api/ucds/dashboard-stats')).status).toBe(200))).toBe(0);
    shortCache.invalidate('ucds:register-');
    expect(await registerReads(() => agent.get('/api/ucds/dashboard-stats'))).toBeGreaterThan(0);
  });

  it('does not hand one year the figures of another that shares its register', async () => {
    const agent = await signIn(DEVELOPER);
    expect((await agent.get('/api/ucds/dashboard-stats')).body.year).toBe(2025);
    await agent.post('/api/years/select').send({ year: OTHER_YEAR });
    expect((await agent.get('/api/ucds/dashboard-stats')).body.year).toBe(OTHER_YEAR);
  });

  it('keeps no entry for a filter it does not know', async () => {
    const agent = await signIn(DEVELOPER);
    await agent.get('/api/ucds/dashboard-stats');
    expect(await registerReads(() => agent.get(`/api/ucds/dashboard-stats?permitTypeFilterKey=made-up-${Date.now()}`))).toBe(0);
  });
});

describe('the dashboard’s counts', () => {
  const ROWS = '__TEST-PERF-DASH-';
  beforeAll(async () => {
    await collections.ucds.deleteMany({ sort_key: { $regex: `^${ROWS}` } });
    await collections.ucds.insertMany([
      { sort_key: `${ROWS}1`, province: 'Bataan', ecc_cnc: 'ECC-1', date_monitored: '1/2/2025', iis_no_2024: 'IIS-1', pto_expiration: '2001-01-01' },
      { sort_key: `${ROWS}2`, province: 'Bataan', ecc_cnc: '', date_monitored: '   ', iis_no_2024: '', pco_validity: '2001-01-01' },
      { sort_key: `${ROWS}3`, province: 'Aurora', haz_id: 'H-1' },
    ]);
  });
  afterAll(() => collections.ucds.deleteMany({ sort_key: { $regex: `^${ROWS}` } }));

  it('are worked out by the database: no row of the register crosses the link', async () => {
    const agent = await signIn(DEVELOPER);
    shortCache.invalidate('ucds:register-');
    const find = vi.spyOn(Collection.prototype, 'find');
    let body;
    try {
      ({ body } = await agent.get('/api/ucds/dashboard-stats'));
      expect(find.mock.contexts.filter((c) => c.collectionName === 'ucds-data')).toHaveLength(0);
    } finally {
      find.mockRestore();
    }
    // Rows 1 and 3 hold a permit (2 has a blank one); 1 was monitored (2 only spaces);
    // 1 and 2 hold an expired date; 1 has a 2024 IIS number. Other tests' rows may add to these.
    expect(body.totalIndustries).toBeGreaterThanOrEqual(3);
    expect(body.industriesWithAnyPermit).toBeGreaterThanOrEqual(2);
    expect(body.monitoredThisYear).toBeGreaterThanOrEqual(1);
    expect(body.industriesWithAtLeastOneExpiredPermit).toBeGreaterThanOrEqual(2);
    expect(body.monitoringHistory.find((h) => h.year === 2024)?.count).toBeGreaterThanOrEqual(1);
  });
});

describe('an answer past its window', () => {
  const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const KEY = 'test:stale:';

  it('is handed over at once and worked out again behind it, once', async () => {
    let computed = 0;
    const compute = async () => {
      computed += 1;
      await later(30);
      return computed;
    };
    expect(await shortCache.cached(KEY, 5, compute, { staleMs: 60000 })).toBe(1);
    await later(10);
    const started = Date.now();
    // Past its window: the old answer, without waiting, however many ask.
    const [a, b] = await Promise.all([shortCache.cached(KEY, 5, compute, { staleMs: 60000 }), shortCache.cached(KEY, 5, compute, { staleMs: 60000 })]);
    expect([a, b]).toEqual([1, 1]);
    expect(Date.now() - started).toBeLessThan(25);
    await later(50);
    expect(computed).toBe(2);
    expect(await shortCache.cached(KEY, 60000, compute, { staleMs: 60000 })).toBe(2);
    shortCache.invalidate(KEY);
  });

  it('is never served after an edit, and a refresh that began before the edit is not kept', async () => {
    let value = 'before';
    const compute = async () => {
      const read = value;
      await later(30);
      return read;
    };
    await shortCache.cached(KEY, 1, compute, { staleMs: 60000 });
    await later(5);
    await shortCache.cached(KEY, 1, compute, { staleMs: 60000 }); // the refresh, reading 'before', begins
    value = 'after';
    shortCache.invalidate(KEY);
    expect(await shortCache.cached(KEY, 60000, compute, { staleMs: 60000 })).toBe('after');
    await later(50);
    expect(await shortCache.cached(KEY, 60000, compute, { staleMs: 60000 })).toBe('after');
    shortCache.invalidate(KEY);
  });

  it('stands when working it out again fails, and the next caller tries again', async () => {
    let fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await shortCache.cached(KEY, 1, async () => 'good', { staleMs: 60000 });
      await later(5);
      const compute = async () => {
        if (fail) throw new Error('link down');
        return 'newer';
      };
      expect(await shortCache.cached(KEY, 1, compute, { staleMs: 60000 })).toBe('good');
      await later(5);
      fail = false;
      expect(await shortCache.cached(KEY, 1, compute, { staleMs: 60000 })).toBe('good');
      await later(5);
      expect(await shortCache.cached(KEY, 60000, compute, { staleMs: 60000 })).toBe('newer');
    } finally {
      warn.mockRestore();
      shortCache.invalidate(KEY);
    }
  });
});

describe('a province', () => {
  it('is not sent again when the browser already has it', async () => {
    await collections.ucds.deleteMany({ sort_key: ROW });
    await collections.ucds.insertOne({ sort_key: ROW, id_no: 1, province: 'Bataan', name: 'Test' });
    shortCache.invalidate('ucds:register-');
    const agent = await signIn(PLANNER);
    const first = await agent.get('/api/get-province-data?province=Bataan');
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    expect(first.headers.etag).toBeTruthy();
    const again = await agent.get('/api/get-province-data?province=Bataan').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
    expect(again.text || '').toBe('');
    // Sent as the JSON it is kept as, with the type and the rows the screen expects.
    expect(first.headers['content-type']).toMatch(/application\/json/);
    expect(first.body.some((r) => r.sort_key === ROW)).toBe(true);
  });

  it('still answers 404 for a province with no rows', async () => {
    await collections.ucds.deleteMany({ sort_key: ROW });
    shortCache.invalidate('ucds:register-');
    const agent = await signIn(PLANNER);
    expect((await agent.get('/api/get-province-data?province=Bataan')).status).toBe(404);
  });
});

describe('VERA checking the register', () => {
  const col = () => getDb().collection(REGISTER);

  it('counts the fields at once, not one after another', async () => {
    await col().deleteMany({});
    await col().insertMany([{ sort_key: 'AU-00001', province: 'Aurora', city: 'Baler', title: 'A' }, { sort_key: 'AU-00002', province: 'Aurora', city: 'Baler', title: 'B' }]);
    const target = col();
    const aggregate = target.aggregate.bind(target);
    let running = 0;
    let most = 0;
    target.aggregate = (...args) => {
      const cursor = aggregate(...args);
      const toArray = cursor.toArray.bind(cursor);
      running += 1;
      most = Math.max(most, running);
      cursor.toArray = () => toArray().finally(() => (running -= 1));
      return cursor;
    };
    await registerCheck.scan({ col: target, register: REGISTER, cfg: {}, by: DEVELOPER });
    expect(most).toBe(Object.keys(registerCheck.FIELDS).length);
  });

  it('reads the records and ERMS at once, and still finishes when ERMS cannot be read', async () => {
    await col().deleteMany({});
    await col().insertOne({ sort_key: 'AU-00001', province: 'Aurora', city: 'Baler', title: 'A', ecc_cnc: 'ECC-R03-1', lat: 15.5, long: 120.5 });
    const started = [];
    const find = Collection.prototype.find;
    const spy = vi.spyOn(Collection.prototype, 'find').mockImplementation(function (...args) {
      started.push(this.collectionName);
      return find.apply(this, args);
    });
    const aggregateStarted = vi.spyOn(Collection.prototype, 'aggregate');
    try {
      await registerCheck.scan({ col: col(), register: REGISTER, cfg: {}, by: DEVELOPER });
      // Both had begun before the first count: nothing waits on the others.
      expect(started.slice(0, 2).sort()).toEqual(['erms-records', REGISTER].sort());
      expect(spy.mock.invocationCallOrder[1]).toBeLessThan(aggregateStarted.mock.invocationCallOrder[0]);
    } finally {
      aggregateStarted.mockRestore();
      spy.mockRestore();
    }

    const failing = vi.spyOn(Collection.prototype, 'find').mockImplementation(function (...args) {
      if (this.collectionName === 'erms-records') return { toArray: () => Promise.reject(new Error('ERMS unreachable')) };
      return find.apply(this, args);
    });
    try {
      const report = await registerCheck.scan({ col: col(), register: REGISTER, cfg: {}, by: DEVELOPER });
      expect(report.totals.records).toBe(1);
      expect(report.notes.join(' ')).toContain('could not be checked against ERMS');
    } finally {
      failing.mockRestore();
    }
  });

  it('undoes swapped coordinates in one read and one write, not per record', async () => {
    await col().deleteMany({});
    const ids = (await col().insertMany(Array.from({ length: 30 }, (_, i) => ({ sort_key: `AU-${i}`, lat: 120.5, long: 15.5 })))).insertedIds;
    const appliedIds = Object.values(ids);
    const { insertedId } = await getDb().collection(registerCheck.COLLECTION).insertOne({
      register: REGISTER,
      status: 'applied',
      startedAt: new Date(),
      proposals: [{ id: 1, field: 'coordinates', method: 'rule', applied: true, appliedIds, targets: appliedIds, from: 'x', to: 'y', count: 30 }],
    });
    const target = col();
    const findOne = vi.spyOn(target, 'findOne');
    const updateOne = vi.spyOn(target, 'updateOne');
    const find = vi.spyOn(target, 'find');
    const bulkWrite = vi.spyOn(target, 'bulkWrite');

    const result = await registerCheck.undo({ col: target, register: REGISTER, runId: String(insertedId), id: 1, user: { username: DEVELOPER } });

    expect(result).toEqual({ ok: true, restored: 30 });
    expect(findOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(1);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const back = await col().find({}).toArray();
    expect(back.every((d) => d.lat === 15.5 && d.long === 120.5)).toBe(true);
    expect(back[0].updated_by).toContain(DEVELOPER);
  });
});

describe('the timing of requests', () => {
  it('keeps the route, never the URL, and only a Developer can read it', async () => {
    const planner = await signIn(PLANNER);
    await planner.get('/api/get-province-data?province=Bataan&note=private-words');
    expect((await planner.get('/api/health/performance')).status).toBe(403);
    expect((await request(app).get('/api/health/performance')).status).toBe(401);

    const dev = await signIn(DEVELOPER);
    const res = await dev.get('/api/health/performance');
    expect(res.status).toBe(200);
    expect(res.body.routes.map((r) => r.route)).toContain('GET /api/get-province-data');
    expect(JSON.stringify(res.body)).not.toContain('private-words');
    expect(res.body.longestStallMs).toBeTypeOf('number');
  });
});
