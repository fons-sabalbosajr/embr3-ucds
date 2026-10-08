#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Load test: the whole office using E-Universe at once.
//
//   node scripts/load-test.js                       100 users, 3 minutes
//   node scripts/load-test.js --users=150 --seconds=300 --think=5-15
//
// Runs the application in this process against the TEST database
// (TEST_MONGO_URI, a local MongoDB by default — never production; see
// tests/setup.js) and signs in a mixed population: Planning staff on the
// register and province screens, administrators, and the Records, Legal and
// Laboratory units. Each one then opens their screens over and over, a few
// seconds apart — faster than anyone works — firing every request the real
// screen makes, six at a time as a browser does.
//
// What a screen asks for comes from scripts/load-profile.json: recorded by
// driving the real application in a browser, every API call per screen per
// role, each listed once (the development build's StrictMode doubles them).
// Re-record it when screens change what they load.
//
// It reports the time each screen took to load, failures, bytes sent, the
// database operations per second (the number that matters on Atlas, whose
// free tier limits operations per second for the whole cluster), the
// server's memory, and how long work waited for Node's single thread.
//
// The accounts and their sessions are removed afterwards.
// ---------------------------------------------------------------------------

// As server.js: more libuv threads for password checks and file access.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
require('dotenv').config();
const productionUri = process.env.MONGO_URI;
process.env.MONGO_URI = String(process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017').trim();
process.env.MONGO_DB_NAME = String(process.env.TEST_MONGO_DB_NAME || 'universe-db-test').trim();
if (process.env.MONGO_URI === productionUri) throw new Error('TEST_MONGO_URI is production; the load test needs its own server.');
// The rate limiter counts per account and would only measure itself.
process.env.NODE_ENV = 'test';

const http = require('http');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');
const bcrypt = require('bcrypt');

const PROFILE = require(path.join(__dirname, 'load-profile.json'));

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const USERS = Number(arg('users', 100));
const SECONDS = Number(arg('seconds', 180));
const [THINK_MIN, THINK_MAX] = String(arg('think', '5-15')).split('-').map((s) => Number(s) * 1000);
const PREFIX = '__load_';
const PASSWORD = 'LoadTestPw!x9';
const BROWSER_PARALLEL = 6;
// --burst: everyone presses Sign in at the same moment, instead of arriving
// over 20 seconds — the worst case for sign-in.
const BURST = process.argv.includes('--burst');

// Who is signed in, out of a hundred: most of the office is Planning.
const MIX = { planning: 45, admin: 10, records: 25, legal: 10, laboratory: 10 };
const ALL_PROVINCES = { aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite', nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite' };
const CAPS = { canGenerateData: true, canManageData: true, canViewAdminPanel: true, canViewDataHistory: true, canAccessRangePicker: true };

const keepAlive = new http.Agent({ keepAlive: true, maxSockets: 2000 });

function call(port, method, urlPath, { cookie, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const t0 = process.hrtime.bigint();
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        agent: keepAlive,
        headers: {
          // As a browser asks: compressed. The server's gzip is part of the cost.
          'accept-encoding': 'gzip',
          ...(cookie ? { cookie } : {}),
          ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let bytes = 0;
        res.on('data', (c) => { bytes += c.length; });
        res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, bytes, cookie: res.headers['set-cookie'] }));
      }
    );
    req.setTimeout(120000, () => req.destroy());
    req.on('error', () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, bytes: 0 }));
    if (data) req.write(data);
    req.end();
  });
}

/** Fire a screen's requests BROWSER_PARALLEL at a time; resolve when all are done. */
async function loadScreen(port, cookie, requests, onRequest) {
  const queue = [...requests];
  const worker = async () => {
    while (queue.length) {
      const [method, urlPath] = queue.shift().split(' ');
      onRequest(await call(port, method, urlPath, { cookie }), method, urlPath);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BROWSER_PARALLEL, requests.length) }, worker));
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function opcounters(db) {
  const { opcounters: o } = await db.admin().command({ serverStatus: 1 });
  return o.insert + o.query + o.update + o.delete + o.getmore + o.command;
}

async function main() {
  const db = require('../config/db');
  await db.connectToMongo();
  const app = require('../app');
  const server = http.createServer(app);
  // As server.js sets them.
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  const years = (await db.getDb().collection('year-containers').find({}).toArray()).map((y) => y.year).filter(Boolean);
  const total = Object.values(MIX).reduce((a, b) => a + b, 0);
  const roles = Object.entries(MIX).flatMap(([role, n]) => Array(Math.round((n / total) * USERS)).fill(role)).slice(0, USERS);
  const docFor = (role) => ({
    planning: { permission: 'planning', capabilities: CAPS, assignedYears: years },
    admin: { permission: 'admin', domains: ['ucds', 'erms', 'admin'], capabilities: CAPS, assignedYears: years },
    records: { permission: 'records' },
    legal: { permission: 'records', ermsUnit: 'legal' },
    laboratory: { permission: 'records', ermsUnit: 'laboratory' },
  })[role];

  const users = db.collections.users;
  await users.deleteMany({ username: new RegExp(`^${PREFIX}`) });
  const password = await bcrypt.hash(PASSWORD, 10);
  const accounts = roles.map((role, i) => ({
    role,
    doc: { username: `${PREFIX}${role}_${i}`, name: `Load ${i}`, email: `load${i}@test.local`, division: 'TEST', status: 'offline', assignedYears: [], ...ALL_PROVINCES, password, ...docFor(role) },
  }));
  await users.insertMany(accounts.map((a) => a.doc));
  console.log(`Population: ${Object.entries(MIX).map(([r]) => `${roles.filter((x) => x === r).length} ${r}`).join(', ')}`);

  // --cost: what one call to each endpoint costs the database, measured one
  // endpoint at a time under one signed-in session, so the operations can be
  // attributed. Then exits.
  if (process.argv.includes('--cost')) {
    const adminDb = db.client.db('admin');
    for (const role of ['planning', 'records']) {
      const { doc } = accounts.find((a) => a.role === role);
      const login = await call(port, 'POST', '/login', { body: { username: doc.username, password: PASSWORD } });
      const cookie = (login.cookie || []).map((c) => c.split(';')[0]).join('; ');
      if (role === 'planning') await call(port, 'POST', '/api/years/select', { cookie, body: { year: years[0] } });
      const unique = [...new Set(Object.values(PROFILE[role]).flat())].map((r) => r.replace(/__rec_[a-z]+/g, doc.username));
      console.log(`\n  ${role}: database operations per call (20 calls each, after one warm-up)`);
      const rows = [];
      for (const r of unique) {
        const [method, urlPath] = r.split(' ');
        await call(port, method, urlPath, { cookie });
        const before = await opcounters(adminDb);
        for (let i = 0; i < 20; i += 1) await call(port, method, urlPath, { cookie });
        const after = await opcounters(adminDb);
        rows.push([((after - before - 1) / 20), r]); // -1: the serverStatus read itself
      }
      for (const [ops, r] of rows.sort((a, b) => b[0] - a[0])) console.log(`  ${ops.toFixed(1).padStart(6)}  ${r.slice(0, 80)}`);
    }
    await users.deleteMany({ username: new RegExp(`^${PREFIX}`) });
    await db.getDb().collection('sessions').deleteMany({ 'session.user.username': new RegExp(`^${PREFIX}`) });
    server.close();
    process.exit(0);
  }

  // Measured from here: sign-in is part of the load.
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let peakRss = 0;
  const memTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 500);
  const opsBefore = await opcounters(db.client.db('admin'));
  const started = Date.now();

  const requestMs = [];
  const statuses = new Map();
  const failures = new Map();
  const screenMs = new Map(); // screen -> [ms]
  let bytes = 0;
  const byPath = new Map(); // "GET /api/x" -> { ms: [], bytes }
  const record = (r, method, urlPath) => {
    const key = `${method} ${urlPath.replace(/\?.*/, '')}`;
    const p = byPath.get(key) || { ms: [], bytes: 0 };
    p.ms.push(r.ms);
    p.bytes += r.bytes;
    byPath.set(key, p);
    requestMs.push(r.ms);
    bytes += r.bytes;
    statuses.set(r.status, (statuses.get(r.status) || 0) + 1);
    if (r.status >= 400 || r.status === 0) {
      const key = `${r.status} ${method} ${urlPath.replace(/\?.*/, '')}`;
      failures.set(key, (failures.get(key) || 0) + 1);
    }
  };

  // Everyone arrives within the first 20 seconds, as at the start of a day.
  const signInMs = [];
  const loginMs = [];
  const deadline = started + SECONDS * 1000;
  await Promise.all(
    accounts.map(async ({ role, doc }, i) => {
      if (!BURST) await sleep((i / accounts.length) * 20000);
      const t0 = Date.now();
      const login = await call(port, 'POST', '/login', { body: { username: doc.username, password: PASSWORD } });
      record(login, 'POST', '/login');
      loginMs.push(login.ms);
      if (login.status !== 200) return;
      const cookie = (login.cookie || []).map((c) => c.split(';')[0]).join('; ');
      if (role === 'planning' || role === 'admin') {
        const pick = await call(port, 'POST', '/api/years/select', { cookie, body: { year: years[0] } });
        record(pick, 'POST', '/api/years/select');
      }
      const screens = PROFILE[role];
      const own = (list) => list.map((r) => r.replace(/__rec_[a-z]+/g, doc.username));
      if (screens['after-sign-in']) await loadScreen(port, cookie, own(screens['after-sign-in']), record);
      signInMs.push(Date.now() - t0);

      const names = Object.keys(screens).filter((s) => s !== 'after-sign-in');
      while (Date.now() < deadline) {
        const screen = names[Math.floor(Math.random() * names.length)];
        const s0 = Date.now();
        await loadScreen(port, cookie, own(screens[screen]), record);
        const label = `${role} ${screen}`;
        if (!screenMs.has(label)) screenMs.set(label, []);
        screenMs.get(label).push(Date.now() - s0);
        await sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
      }
    })
  );

  const elapsed = (Date.now() - started) / 1000;
  const opsAfter = await opcounters(db.client.db('admin'));
  clearInterval(memTimer);
  loop.disable();

  requestMs.sort((a, b) => a - b);
  signInMs.sort((a, b) => a - b);
  loginMs.sort((a, b) => a - b);
  console.log(`\n${USERS} users for ${elapsed.toFixed(0)} s, ${THINK_MIN / 1000}-${THINK_MAX / 1000} s between screens`);
  console.log(`  requests        ${requestMs.length} (${(requestMs.length / elapsed).toFixed(1)}/s)   p50 ${pct(requestMs, 50).toFixed(0)} ms  p95 ${pct(requestMs, 95).toFixed(0)} ms  p99 ${pct(requestMs, 99).toFixed(0)} ms`);
  console.log(`  status          ${[...statuses].sort().map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  console.log(`  sign-in only    p50 ${pct(loginMs, 50).toFixed(0)} ms  p95 ${pct(loginMs, 95).toFixed(0)} ms  max ${loginMs[loginMs.length - 1]?.toFixed(0)} ms${BURST ? '  (all at once)' : ''}  threadpool ${process.env.UV_THREADPOOL_SIZE}`);
  console.log(`  sign-in to ready p50 ${pct(signInMs, 50)} ms  p95 ${pct(signInMs, 95)} ms  (${signInMs.length}/${USERS} signed in)`);
  console.log(`  sent            ${(bytes / 1e6).toFixed(0)} MB compressed (${((bytes * 8) / 1e6 / elapsed).toFixed(1)} Mbit/s average)`);
  console.log(`  database        ${((opsAfter - opsBefore) / elapsed).toFixed(1)} operations/s`);
  console.log(`  node thread     waited p99 ${(loop.percentile(99) / 1e6).toFixed(0)} ms, max ${(loop.max / 1e6).toFixed(0)} ms`);
  console.log(`  memory          peak ${(peakRss / 1e6).toFixed(0)} MB`);
  console.log('\n  screen load time (all of its requests)            n     p50     p95     max');
  for (const [label, list] of [...screenMs].sort()) {
    list.sort((a, b) => a - b);
    console.log(`  ${label.padEnd(46)} ${String(list.length).padStart(4)} ${String(pct(list, 50)).padStart(6)}ms ${String(pct(list, 95)).padStart(6)}ms ${String(list[list.length - 1]).padStart(6)}ms`);
  }
  console.log('\n  where the time goes (by total time)                      n   total s   p95 ms   MB');
  for (const [key, p] of [...byPath].sort((a, b) => b[1].ms.reduce((s, x) => s + x, 0) - a[1].ms.reduce((s, x) => s + x, 0)).slice(0, 12)) {
    p.ms.sort((a, b) => a - b);
    const sum = p.ms.reduce((s, x) => s + x, 0) / 1000;
    console.log(`  ${key.slice(0, 52).padEnd(52)} ${String(p.ms.length).padStart(6)} ${sum.toFixed(0).padStart(8)} ${pct(p.ms, 95).toFixed(0).padStart(8)} ${(p.bytes / 1e6).toFixed(1).padStart(6)}`);
  }
  if (failures.size) {
    console.log('\n  failures');
    for (const [k, v] of [...failures].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  }

  await users.deleteMany({ username: new RegExp(`^${PREFIX}`) });
  await db.collections.loginStatus.deleteMany({ username: new RegExp(`^${PREFIX}`) });
  await db.getDb().collection('sessions').deleteMany({ 'session.user.username': new RegExp(`^${PREFIX}`) });
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
