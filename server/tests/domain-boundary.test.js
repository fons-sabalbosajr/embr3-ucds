import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// The domain boundary, driven over HTTP against the real app.
//
// Uses throwaway accounts created and deleted here, so no existing user is
// touched. Requires MONGO_URI — this is an integration suite, not a unit one.
// ---------------------------------------------------------------------------

const PASSWORD = 'Phase4TestPw!x9';
const PLANNING = '__test_planning';
const RECORDS = '__test_records';
const USERNAMES = [PLANNING, RECORDS];

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none',
  pampanga: 'none', tarlac: 'none', zambales: 'none',
  ...extra,
});

/** Log in and return an agent that carries the session cookie. */
async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(PLANNING, {
      password,
      permission: 'planning',
      domains: ['ucds'],
      capabilities: { canGenerateData: true, canManageData: false, canViewAdminPanel: false, canViewDataHistory: true, canAccessRangePicker: false },
      bataan: 'readWrite',
      pampanga: 'view',
    }),
    base(RECORDS, {
      password,
      permission: 'records',
      domains: ['erms'],
      capabilities: { canGenerateData: false, canManageData: false, canViewAdminPanel: false, canViewDataHistory: false, canAccessRangePicker: false },
    }),
  ]);
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections['loginStatus'].deleteMany({ username: { $in: USERNAMES } });
}, 60000);

describe('unauthenticated access', () => {
  // Every one of these answered 200 to an anonymous caller before Phase 3.
  it.each([
    '/api/auth/me',
    '/api/ucds/count',
    '/api/healthcare',
    '/api/chemicals',
    '/api/tsd',
    '/api/swm-plan-data',
    '/api/swm-plan-stats',
    '/api/draft-report',
    '/api/org-units',
  ])('%s requires a session', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it('answers an unknown API path with JSON, not an HTML error page', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('a user holding the ucds domain', () => {
  it('reports its own entitlement', async () => {
    const agent = await signIn(PLANNING);
    const { body, status } = await agent.get('/api/auth/me');

    expect(status).toBe(200);
    expect(body.role).toBe('planning');
    expect(body.domains).toEqual(['ucds']);
    expect(body.provinces).toEqual(['bataan', 'pampanga']);
    expect(body.capabilities.canViewDataHistory).toBe(true);
    expect(body.capabilities.canViewAdminPanel).toBe(false);
    expect(body.provinceAccess.bataan).toBe('readWrite');
    expect(body.provinceAccess.pampanga).toBe('view');
    expect(body.provinceAccess.aurora).toBe('none');
  });

  it('reaches UCDS data once a year container is selected', async () => {
    const agent = await signIn(PLANNING);
    expect((await agent.post('/api/years/select').send({ year: 2025 })).status).toBe(200);
    expect((await agent.get('/api/ucds/count')).status).toBe(200);
    expect((await agent.get('/api/healthcare')).status).toBe(200);
  });

  it('sees only its own provinces in the register', async () => {
    const agent = await signIn(PLANNING);
    await agent.post('/api/years/select').send({ year: 2025 });

    // The endpoint answers with a bare JSON number, not an object.
    const res = await agent.get('/api/ucds/count');
    const count = Number(res.text);
    const total = await collections.ucds.countDocuments({});

    expect(Number.isFinite(count)).toBe(true);
    expect(count).toBeGreaterThan(0);
    // The account holds bataan + pampanga, so it must not see the whole
    // register. This is the Phase 3 escalation, asserted.
    expect(count).toBeLessThan(total);
  });

  it('is refused the admin domain', async () => {
    const agent = await signIn(PLANNING);
    const res = await agent.post('/api/org-units').send({ code: 'NOPE' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOMAIN_FORBIDDEN');
  });
});

describe('a user without the ucds domain', () => {
  it('reports only the erms domain', async () => {
    const agent = await signIn(RECORDS);
    const { body } = await agent.get('/api/auth/me');
    expect(body.role).toBe('records');
    expect(body.domains).toEqual(['erms']);
  });

  it.each([
    '/api/ucds/count',
    '/api/healthcare',
    '/api/postings',
    '/api/swm-plan-data',
    '/api/draft-report',
  ])('is refused %s', async (path) => {
    const agent = await signIn(RECORDS);
    const res = await agent.get(path);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOMAIN_FORBIDDEN');
  });

  it('may still select a year, which is a shared concept', async () => {
    const agent = await signIn(RECORDS);
    expect((await agent.post('/api/years/select').send({ year: 2025 })).status).toBe(200);
  });

  it('is still refused UCDS data after selecting a year', async () => {
    const agent = await signIn(RECORDS);
    await agent.post('/api/years/select').send({ year: 2025 });
    expect((await agent.get('/api/ucds/count')).status).toBe(403);
  });

  it('may read shared org master data', async () => {
    const agent = await signIn(RECORDS);
    const res = await agent.get('/api/org-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orgUnits)).toBe(true);
  });
});

describe('request validation', () => {
  it('rejects a malformed body with per-field errors', async () => {
    const agent = await signIn(PLANNING);
    // Refused for the domain before validation runs, which is the correct
    // order: authorization first, then shape.
    const res = await agent.post('/api/org-units').send({ code: '' });
    expect(res.status).toBe(403);
  });
});
