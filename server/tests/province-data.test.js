import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';

const { connectToMongo, collections } = db;

// ---------------------------------------------------------------------------
// GET /api/get-province-data — the Monitoring Plan province screens.
//
// This endpoint called an undefined `withProvinceScope` and threw on every
// request, all the way back to the original main. It was never covered, which
// is why nobody noticed until the screen was opened.
//
// The province scope is the part worth asserting: the register is regional,
// and a planner assigned two provinces must not be able to read a third by
// naming it in the query.
// ---------------------------------------------------------------------------

const PASSWORD = 'ProvinceTest!x9';
const PLANNER = '__test_prov_planner';

async function signIn(username) {
  const agent = request.agent(app);
  const res = await agent.post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  await agent.post('/api/years/select').send({ year: 2025 });
  return agent;
}

beforeAll(async () => {
  await connectToMongo();
  await collections.users.deleteMany({ username: PLANNER });
  await collections.users.insertOne({
    username: PLANNER,
    name: PLANNER,
    email: `${PLANNER}@test.local`,
    division: 'TEST',
    status: 'offline',
    assignedYears: [2025],
    password: await bcrypt.hash(PASSWORD, 10),
    permission: 'planning',
    domains: ['ucds'],
    aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none',
    pampanga: 'view', tarlac: 'none', zambales: 'none',
  });
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: PLANNER });
  await collections['loginStatus'].deleteMany({ username: PLANNER });
}, 60000);

describe('province data', () => {
  it('returns rows for a province the account holds', async () => {
    const agent = await signIn(PLANNER);
    const res = await agent.get('/api/get-province-data?province=Bataan');
    // 200 with rows, or 404 when that container genuinely has none — either is
    // a working endpoint. A 500 is the bug this covers.
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      for (const row of res.body.slice(0, 20)) {
        expect(String(row.province || 'Bataan').toLowerCase()).toBe('bataan');
      }
    }
  }, 60000);

  it('never answers with a server error', async () => {
    const agent = await signIn(PLANNER);
    for (const province of ['Bataan', 'Pampanga']) {
      const res = await agent.get(`/api/get-province-data?province=${province}`);
      expect(res.status).not.toBe(500);
    }
  }, 60000);

  it('refuses a province the account does not hold', async () => {
    const agent = await signIn(PLANNER);
    const res = await agent.get('/api/get-province-data?province=Zambales');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROVINCE_FORBIDDEN');
  }, 60000);

  it('requires the province parameter', async () => {
    const agent = await signIn(PLANNER);
    const res = await agent.get('/api/get-province-data');
    expect(res.status).toBe(400);
  }, 60000);

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).get('/api/get-province-data?province=Bataan');
    expect(res.status).toBe(401);
  });
});
