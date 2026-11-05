#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Time E-Universe's real screens and VERA's checks against the real data,
// through the real Express app, with no way to change anything.
//
//   node measure.js                 every screen, year 2026
//   node measure.js --year=2027     another year's register
//   node measure.js scan            only URLs or groups containing "scan"
//   node measure.js --warm          after the startup warm-up: what a person gets
//
// What keeps it safe, set before the app loads:
//   - every collection write is replaced by a no-op that counts the attempt;
//   - the model API keys are blank and fetch throws, so no tokens are spent;
//   - mail is off;
//   - sign-in is stubbed inside this process only (NODE_ENV=test, a fake session
//     acting as Developer). No port is opened, so nothing else can reach it.
//
// Columns: first call, longest hold on the event loop during it (how long
// everyone else would wait), second call (shows caching), status, body size
// before compression, read operations (a count run by the driver through
// aggregate shows as two).
// ---------------------------------------------------------------------------

const path = require('path');
const Module = require('module');
const { monitorEventLoopDelay } = require('perf_hooks');

const SERVER = path.resolve(__dirname, '../../../../server');
process.chdir(SERVER);

const args = process.argv.slice(2);
const YEAR = Number(args.find((a) => a.startsWith('--year='))?.split('=')[1]) || 2026;
const only = args.find((a) => !a.startsWith('--'));

// Empty before dotenv, which never overrides what is already set.
for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'EMAIL_USER', 'EMAIL_PASS']) process.env[k] = '';
process.env.NODE_ENV = 'test';
require(path.join(SERVER, 'node_modules/dotenv')).config({ path: path.join(SERVER, '.env'), quiet: true });
global.fetch = async () => {
  throw new Error('network blocked by measure.js');
};

const { Collection, Db } = require(path.join(SERVER, 'node_modules/mongodb'));
let blocked = 0;
const ack = { acknowledged: true, insertedId: null, insertedIds: {}, insertedCount: 0, modifiedCount: 0, matchedCount: 0, upsertedCount: 0, deletedCount: 0, value: null };
for (const m of ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'bulkWrite', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'createIndex', 'createIndexes', 'dropIndex', 'drop', 'rename']) {
  Collection.prototype[m] = async function () {
    blocked += 1;
    return ack;
  };
}
Db.prototype.dropDatabase = async () => {
  throw new Error('blocked by measure.js');
};
Db.prototype.createCollection = async () => {
  blocked += 1;
  return null;
};

let reads = 0;
const readLog = {};
for (const m of ['find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'distinct']) {
  const original = Collection.prototype[m];
  Collection.prototype[m] = function (...a) {
    reads += 1;
    const k = `${this.collectionName}.${m}`;
    readLog[k] = (readLog[k] || 0) + 1;
    return original.apply(this, a);
  };
}

const realSession = require(path.join(SERVER, 'node_modules/express-session'));
const fakeSession = Object.assign(
  () => (req, res, next) => {
    req.session = { activeYear: YEAR, user: { username: '__measure__', permission: 'developer' }, save: (cb) => cb && cb(), destroy: (cb) => cb && cb(), touch() {}, regenerate: (cb) => cb && cb() };
    next();
  },
  realSession
);
const load = Module._load;
Module._load = function (id, ...rest) {
  return id === 'express-session' ? fakeSession : load.call(this, id, ...rest);
};

const print = console.log;
console.log = console.warn = console.info = () => {};
const request = require(path.join(SERVER, 'node_modules/supertest'));
const app = require(path.join(SERVER, 'app'));
const { connectToMongo, client } = require(path.join(SERVER, 'config/db'));

const SCREENS = [
  ['register', 'GET', '/api/ucds-data?page=1&pageSize=50'],
  ['register', 'GET', '/api/ucds-data?search=cement&page=1&pageSize=50'],
  ['register', 'GET', '/api/get-province-data?province=Bulacan'],
  ['register', 'GET', '/api/ucds/dashboard-stats'],
  ['register', 'GET', '/api/permits-summary'],
  ['register', 'GET', '/api/ucds/search-name?query=cement'],
  ['register', 'GET', '/api/ucds/duplicates'],
  ['register', 'GET', '/api/ucds/reports/not-in-erms'],
  ['register', 'GET', '/api/ucds/reports/accomplishment'],
  ['register', 'GET', '/api/ucds-log?page=1&limit=50'],
  ['erms', 'GET', '/api/erms/dashboard'],
  ['erms', 'GET', '/api/erms/filter-options'],
  ['erms', 'GET', '/api/erms/records?page=1&limit=50'],
  ['erms', 'GET', '/api/erms/records?search=cement&page=1&limit=50'],
  ['erms', 'GET', '/api/erms/records/duplicate-groups'],
  ['erms', 'GET', '/api/erms/duplicates/records'],
  ['erms', 'GET', '/api/erms/units/legal/dashboard'],
  ['erms', 'GET', '/api/erms/units/laboratory/dashboard'],
  ['erms', 'GET', '/api/erms/units/legal/documents?page=1&limit=50'],
  ['erms', 'GET', '/api/erms/boxes'],
  ['vera', 'GET', '/api/vera/usage'],
  ['vera', 'GET', '/api/vera/fixes-pending'],
  ['vera', 'GET', '/api/vera/corrections'],
  ['vera', 'GET', '/api/vera/project-types'],
  ['vera', 'GET', '/api/vera/ucds-check'],
  ['vera-scan', 'POST', '/api/vera/corrections/scan'],
  ['vera-scan', 'POST', '/api/vera/serials/scan'],
  ['vera-scan', 'POST', '/api/vera/register-links/scan'],
  ['vera-scan', 'POST', '/api/vera/ucds-check/scan'],
  ['vera-scan', 'POST', '/api/vera/ucds-check/auto-fix'],
];

(async () => {
  await connectToMongo();
  await new Promise((r) => setTimeout(r, 1500));
  if (args.includes('--warm')) {
    const warmStarted = Date.now();
    await require(path.join(SERVER, 'controllers/ucdsController')).warmRegisterCaches({ provinces: true });
    print(`Warmed in ${((Date.now() - warmStarted) / 1000).toFixed(1)} s.`);
  }
  const stalls = monitorEventLoopDelay({ resolution: 10 });
  stalls.enable();
  print(`Year ${YEAR}.        first     stall    second  status      body   reads`);
  for (const [group, method, url] of SCREENS) {
    if (only && !url.includes(only) && !group.includes(only)) continue;
    reads = 0;
    for (const k of Object.keys(readLog)) delete readLog[k];
    stalls.reset();
    const at = Date.now();
    let status = 0;
    let bytes = 0;
    try {
      const res = await request(app)[method.toLowerCase()](url).set('Accept', 'application/json').send(method === 'POST' ? {} : undefined).timeout({ response: 240000 });
      status = res.status;
      bytes = Buffer.byteLength(res.text || '');
    } catch (e) {
      status = e.status || e.code || 'ERR';
    }
    const first = Date.now() - at;
    const stall = Math.round(stalls.max / 1e6);
    const firstReads = reads;
    let second = '';
    if (method === 'GET') {
      const t = Date.now();
      await request(app).get(url).catch(() => {});
      second = `${Date.now() - t}`;
    }
    print(`${String(first).padStart(9)} ms ${String(stall).padStart(6)} ms ${second.padStart(6)} ms  ${String(status).padEnd(5)} ${String(Math.round(bytes / 1024)).padStart(6)} KB ${String(firstReads).padStart(5)}  ${method} ${url}`);
  }
  print(`\nWrites blocked: ${blocked}. Nothing reached the database or a model.`);
  await client.close();
  process.exit(0);
})().catch((e) => {
  print(`measure failed: ${e.name}: ${e.message}`);
  process.exit(1);
});
