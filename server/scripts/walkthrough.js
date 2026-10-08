/**
 * Phase 9: a per-role functional walkthrough.
 *
 *   node scripts/walkthrough.js
 *   node scripts/walkthrough.js --base=https://embr3-api.onrender.com
 *
 * Drives the real HTTP API as each role and reports what that role can and
 * cannot reach. It is a companion to the human click-through, not a substitute:
 * it proves the API behaves, while a person still has to confirm the screens
 * render and the workflows make sense.
 *
 * Creates its own throwaway accounts, prefixed __walkthrough_, and removes them
 * afterwards. It never signs in as, or modifies, a real user.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const baseFlag = process.argv.find((a) => a.startsWith('--base='));
const BASE = baseFlag ? baseFlag.slice('--base='.length) : `http://localhost:${process.env.PORT || 8081}`;
const PASSWORD = 'Walkthrough!x9';

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s === undefined ? '' : s).padEnd(n);

// Sent as-is; stored normalised. Both forms are removed afterwards.
const PROBE_CODE = '__WT_PROBE';
const { normalizeCode } = require('../shared/services/orgUnits');

const PROVINCES = {
  aurora: 'none', bataan: 'readWrite', bulacan: 'none', nuevaEcija: 'none',
  pampanga: 'view', tarlac: 'none', zambales: 'none',
};

const caps = (over = {}) => ({
  canGenerateData: false, canManageData: false, canViewAdminPanel: false,
  canViewDataHistory: false, canAccessRangePicker: false, ...over,
});

const ROLES = [
  {
    user: '__walkthrough_planning',
    label: 'Planning Personnel',
    doc: { permission: 'planning', domains: ['ucds'], capabilities: caps({ canManageData: true }) },
  },
  {
    user: '__walkthrough_records',
    label: 'Records Personnel',
    doc: { permission: 'records', domains: ['erms'], capabilities: caps({ canManageData: true }) },
  },
  {
    user: '__walkthrough_viewer',
    label: 'Read-only viewer',
    doc: { permission: 'viewer', domains: ['ucds'], capabilities: caps() },
  },
  {
    user: '__walkthrough_admin',
    label: 'Administrator',
    doc: {
      permission: 'admin',
      domains: ['ucds', 'erms', 'admin'],
      capabilities: caps({ canManageData: true, canViewAdminPanel: true }),
    },
  },
];

/** What each role is expected to be able to do. */
const CHECKS = [
  { label: 'sign in', method: 'POST', path: '/login', auth: false },
  { label: 'read own entitlement', method: 'GET', path: '/api/auth/me' },
  { label: 'list year containers', method: 'GET', path: '/api/years' },
  { label: 'select a year container', method: 'POST', path: '/api/years/select', body: { year: 2025 } },
  { label: 'read the establishment register', method: 'GET', path: '/api/ucds/count' },
  { label: 'read healthcare data', method: 'GET', path: '/api/healthcare' },
  { label: 'read the ERMS dashboard', method: 'GET', path: '/api/erms/dashboard' },
  { label: 'list ERMS records', method: 'GET', path: '/api/erms/records?pageSize=1' },
  { label: 'list archive boxes', method: 'GET', path: '/api/erms/boxes' },
  { label: 'run an ERMS report', method: 'GET', path: '/api/erms/reports/inventory?limit=1' },
  { label: 'search the register from ERMS', method: 'GET', path: '/api/erms/register/search?q=inc' },
  { label: 'read shared org units', method: 'GET', path: '/api/org-units' },
  // The service normalises a code before storing it, so the probe is written as
  // WT-PROBE rather than what is sent. Cleaning up by the raw value therefore
  // left it behind, and the next run reported 409 instead of 201 — the endpoint
  // was fine, the script was not.
  { label: 'create an org unit (admin)', method: 'POST', path: '/api/org-units', body: { code: PROBE_CODE } },
];

const VERDICT = (status) => {
  if (status === 200 || status === 201) return 'allowed';
  if (status === 401) return 'not signed in';
  if (status === 403) return 'refused';
  if (status === 404) return 'not found';
  if (status === 409) return 'conflict';
  if (status === 400) return 'rejected';
  return `HTTP ${status}`;
};

function session() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    return res.status;
  };
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, { ssl: true, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME || 'universe-db');
  const users = db.collection('users');
  const names = ROLES.map((r) => r.user);

  // Reachability first, so a wrong --base fails clearly instead of as 14 errors.
  try {
    await fetch(`${BASE}/healthz`);
  } catch (e) {
    console.error(`Cannot reach ${BASE} — is the server running?\n  ${e.message}`);
    process.exit(2);
  }

  // Clear any residue from a run that did not reach its cleanup.
  await db
    .collection('org-units')
    .deleteMany({ code: { $in: [PROBE_CODE, normalizeCode(PROBE_CODE)] } });

  const password = await bcrypt.hash(PASSWORD, 10);
  await users.deleteMany({ username: { $in: names } });
  await users.insertMany(
    ROLES.map((r) => ({
      username: r.user,
      name: r.label,
      email: `${r.user}@test.local`,
      division: 'TEST',
      status: 'offline',
      assignedYears: [2025],
      password,
      ...PROVINCES,
      ...r.doc,
    }))
  );

  try {
    log(`\n${'='.repeat(96)}`);
    log(`FUNCTIONAL WALKTHROUGH — ${BASE}`);
    log('='.repeat(96));
    log(pad('', 34) + ROLES.map((r) => pad(r.label.split(' ')[0], 16)).join(''));
    log('-'.repeat(96));

    const results = [];
    for (const check of CHECKS) {
      const row = [];
      for (const role of ROLES) {
        const call = role.call || (role.call = session());
        if (check.path === '/login') {
          row.push(VERDICT(await call('POST', '/login', { username: role.user, password: PASSWORD })));
          continue;
        }
        row.push(VERDICT(await call(check.method, check.path, check.body)));
      }
      results.push({ check, row });
      log(pad(check.label, 34) + row.map((v) => pad(v, 16)).join(''));
    }

    log('-'.repeat(96));
    log('\nWhat to confirm by hand, which this cannot:');
    log('  - the screens behind these routes render, and in both themes');
    log('  - the province tab panes and survey forms still work after the Phase 5 move');
    log('  - a Records clerk can complete a real filing end to end');
    log('  - the sidebar shows each role only what it should');
  } finally {
    await users.deleteMany({ username: { $in: names } });
    await db.collection('login-status').deleteMany({ username: { $in: names } });
    await db
      .collection('org-units')
      .deleteMany({ code: { $in: [PROBE_CODE, normalizeCode(PROBE_CODE)] } });
    await db.collection('app-logs').deleteMany({ username: { $in: names } });
    log('\nthrowaway accounts removed');
    await client.close();
  }
}

main().catch((e) => {
  console.error('Walkthrough failed:', e.message);
  process.exit(1);
});
