import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import app from '../app.js';
import db from '../config/db.js';
import inventoryModule from '../shared/routeInventory.js';

const { connectToMongo, collections } = db;
const { uniqueRoutes, PUBLIC_ROUTES, domainOf } = inventoryModule;

// ---------------------------------------------------------------------------
// Phase 9: the whole surface, not a sample.
//
// Walks the live Express router and exercises every route it finds. Reading
// route files by hand is what let fourteen /api/dev/* endpoints serve the
// audit trail to anonymous callers for as long as they did; asking the app
// what it registered cannot drift from what it serves.
//
// A new route is covered the moment it is added — including one added with its
// guard missing, which is the case worth catching.
// ---------------------------------------------------------------------------

const PASSWORD = 'Phase9Pw!x9';
const PLANNING = '__test_p9_planning'; // ucds only
const RECORDS = '__test_p9_records'; // erms only
const USERNAMES = [PLANNING, RECORDS];

const routes = uniqueRoutes(app);

/** Substitute something plausible for a path parameter. */
const concrete = (path) =>
  path
    .replace(/:serialNo/g, 'FSN-9999999')
    .replace(/:sortKey/g, 'ZZ-00000')
    .replace(/:filename/g, 'nonexistent.pdf')
    .replace(/:id\b/g, '000000000000000000000000')
    .replace(/:key/g, 'inventory')
    .replace(/:code/g, 'NOBOX')
    .replace(/:year/g, '2025')
    .replace(/:email/g, 'nobody@test.local')
    .replace(/:permitKey/g, 'ecc')
    .replace(/:sort_key/g, 'ZZ-00000')
    .replace(/:identifier/g, 'ZZ-00000')
    .replace(/:provinceName/g, 'Bataan')
    .replace(/:[A-Za-z_]+/g, 'x');

const base = (username, extra) => ({
  username,
  name: username,
  email: `${username}@test.local`,
  division: 'TEST',
  status: 'offline',
  assignedYears: [2025],
  aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none',
  pampanga: 'none', tarlac: 'none', zambales: 'none',
  capabilities: {
    canGenerateData: false, canManageData: false, canViewAdminPanel: false,
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

const call = (agent, route) => {
  const path = concrete(route.path);
  const method = route.method.toLowerCase();
  const req = agent[method](path);
  return ['post', 'put', 'patch'].includes(method) ? req.send({}) : req;
};

beforeAll(async () => {
  await connectToMongo();
  const password = await bcrypt.hash(PASSWORD, 10);
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.users.insertMany([
    base(PLANNING, { password, permission: 'planning', domains: ['ucds'] }),
    base(RECORDS, { password, permission: 'records', domains: ['erms'] }),
  ]);
}, 60000);

afterAll(async () => {
  await collections.users.deleteMany({ username: { $in: USERNAMES } });
  await collections.loginStatus.deleteMany({ username: { $in: USERNAMES } });
}, 60000);

describe('route inventory', () => {
  it('finds the application’s routes', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every route is either public by declaration or requires a session', () => {
    const unguarded = routes.filter(
      (r) =>
        !PUBLIC_ROUTES.has(`${r.method} ${r.path}`) &&
        !r.guards.includes('authenticateSession')
    );

    // Naming them makes a failure actionable rather than a bare count.
    expect(unguarded.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every ERMS route carries a domain check, not just a session check', () => {
    const ermsRoutes = routes.filter((r) => r.path.startsWith('/api/erms/'));
    expect(ermsRoutes.length).toBeGreaterThan(0);

    const missing = ermsRoutes.filter((r) => !r.guards.includes('requireDomain'));
    expect(missing.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
});

describe('unauthenticated access', () => {
  const guarded = routes.filter((r) => !PUBLIC_ROUTES.has(`${r.method} ${r.path}`));

  it('no route outside the allowlist answers without a session', async () => {
    const leaked = [];

    for (const route of guarded) {
      const res = await call(request(app), route);
      // 401 is the expected answer. 404 is acceptable for a path whose
      // parameter cannot exist. Anything else means the request was served.
      if (res.status !== 401 && res.status !== 404) {
        leaked.push(`${route.method} ${route.path} -> ${res.status}`);
      }
    }

    expect(leaked).toEqual([]);
  }, 180000);
});

describe('the domain boundary, across every route', () => {
  it('a Planning user is refused every ERMS route', async () => {
    const agent = await signIn(PLANNING);
    const ermsRoutes = routes.filter((r) => r.path.startsWith('/api/erms/'));
    const allowed = [];

    for (const route of ermsRoutes) {
      const res = await call(agent, route);
      if (res.status !== 403) allowed.push(`${route.method} ${route.path} -> ${res.status}`);
    }

    expect(allowed).toEqual([]);
  }, 120000);

  it('a Records user is refused every UCDS data route', async () => {
    const agent = await signIn(RECORDS);
    // Routes that declare requireDomain and belong to UCDS.
    const ucdsRoutes = routes.filter(
      (r) => r.guards.includes('requireDomain') && domainOf(r.path) === 'ucds'
    );
    expect(ucdsRoutes.length).toBeGreaterThan(0);

    const allowed = [];
    for (const route of ucdsRoutes) {
      const res = await call(agent, route);
      if (res.status !== 403) allowed.push(`${route.method} ${route.path} -> ${res.status}`);
    }

    expect(allowed).toEqual([]);
  }, 120000);

  it('a Planning user is refused the developer routes', async () => {
    const agent = await signIn(PLANNING);
    const devRoutes = routes.filter((r) => r.path.startsWith('/api/dev/'));
    expect(devRoutes.length).toBeGreaterThan(0);

    const allowed = [];
    for (const route of devRoutes) {
      const res = await call(agent, route);
      if (res.status !== 403) allowed.push(`${route.method} ${route.path} -> ${res.status}`);
    }

    expect(allowed).toEqual([]);
  }, 120000);
});
