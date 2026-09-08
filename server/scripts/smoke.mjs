/**
 * UI smoke test — do the screens actually render?
 *
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs --base=http://10.14.76.250:5173 --api=http://10.14.76.250:8081
 *   node scripts/smoke.mjs --headed          # watch it drive
 *
 * The test suite proves the API behaves and the build proves imports resolve.
 * Neither proves a screen renders: Phase 5a moved 225 files, and a component
 * that throws at runtime still builds cleanly and still passes every API test.
 *
 * This signs in as a throwaway account per role, visits each screen that role
 * should reach, and fails on a blank page, an error boundary, or an uncaught
 * exception. Screenshots land in reports/screenshots/ so a human can look.
 *
 * Requires the SPA and API to be running. It creates its own accounts and
 * removes them afterwards; it never signs in as a real user.
 */

import { chromium } from 'playwright';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
dotenv.config({ path: path.join(repoRoot, 'server', '.env') });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = arg('base', 'http://localhost:5173');
const API = arg('api', process.env.VITE_API_BASE_URL || 'http://localhost:8081');
const HEADED = process.argv.includes('--headed');
const SHOTS = path.join(repoRoot, 'reports', 'screenshots');
const PASSWORD = 'Smoke!x9Test';

const PROVINCES = {
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite',
  nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
};

const caps = (over = {}) => ({
  canGenerateData: true, canManageData: true, canViewAdminPanel: true,
  canViewDataHistory: true, canAccessRangePicker: true, ...over,
});

const ACCOUNTS = [
  {
    user: '__smoke_admin',
    label: 'Administrator',
    doc: { permission: 'admin', domains: ['ucds', 'erms', 'admin'], capabilities: caps() },
    screens: [
      ['dashboard', '/universe/dashboard'],
      ['province-bataan', '/universe/province/Bataan'],
      ['survey', '/universe/survey'],
      ['healthcare', '/universe/healthcare'],
      ['chemicals', '/universe/chemicals'],
      ['tsd', '/universe/tsd'],
      ['trc', '/universe/trc'],
      ['eswm', '/universe/eswm-database'],
      ['eswm-swmplan', '/universe/eswm-database/swm-plan'],
      ['planning-monitoring', '/universe/planning-unit/monitoring'],
      ['planning-validations', '/universe/planning-unit/validations'],
      ['extract', '/universe/extract'],
      ['legal-dashboard', '/universe/legal/dashboard'],
      ['register-config', '/universe/register/config'],
      ['admin-users', '/universe/admin/users'],
      ['admin-org-units', '/universe/admin/org-units'],
      ['admin-audit', '/universe/admin/audit'],
      ['admin-developer-fields', '/universe/admin/developer/field-management'],
      ['erms-dashboard', '/universe/erms/dashboard'],
      ['erms-records', '/universe/erms/records'],
      ['erms-archive', '/universe/erms/archive'],
      ['erms-reports', '/universe/erms/reports'],
    ],
  },
  {
    user: '__smoke_records',
    label: 'Records Personnel',
    doc: { permission: 'records', domains: ['erms'], capabilities: caps() },
    screens: [
      ['records-erms-dashboard', '/universe/erms/dashboard'],
      ['records-erms-records', '/universe/erms/records'],
      ['records-erms-archive', '/universe/erms/archive'],
      // Must be refused, and refused *gracefully* — an explanation, not a crash.
      ['records-denied-province', '/universe/province/Bataan', { expectForbidden: true }],
    ],
  },
];

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s).padEnd(n);

async function seedAccounts(db) {
  const password = await bcrypt.hash(PASSWORD, 10);
  const names = ACCOUNTS.map((a) => a.user);
  await db.collection('users').deleteMany({ username: { $in: names } });
  await db.collection('users').insertMany(
    ACCOUNTS.map((a) => ({
      username: a.user,
      name: a.label,
      email: `${a.user}@test.local`,
      division: 'TEST',
      status: 'offline',
      assignedYears: [2025],
      password,
      ...PROVINCES,
      ...a.doc,
    }))
  );
  return names;
}

// The public site lives under /universe-central-database-system, so a naive
// /\/universe/ test matches the login page too. These have to be precise or a
// failed sign-in reads as a success and every screen "passes" as the login form.
const ON_LOGIN = /\/universe-central-database-system\/login/;
const ON_PICKER = /\/select-year/;
// Must not match the public site at /universe-central-database-system, so the
// segment has to end here — either a slash or the end of the path.
const IN_APP = /\/universe(\/|$|\?)/;

const whereIs = (page) => {
  const url = page.url();
  if (ON_LOGIN.test(url)) return 'login';
  if (ON_PICKER.test(url)) return 'year-picker';
  if (IN_APP.test(url)) return 'app';
  return 'elsewhere';
};

/** Sign in through the real form, then pick a year container. Throws if either fails. */
async function signIn(page, username) {
  await page.goto(`${BASE}/universe-central-database-system/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: 20000 });

  await page.locator('input').first().fill(username);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).first().click();

  // Leaving the login page is the only proof the credentials were accepted.
  await page
    .waitForFunction(() => !/\/universe-central-database-system\/login/.test(location.href), null, {
      timeout: 25000,
    })
    .catch(() => {});

  if (whereIs(page) === 'login') {
    const message = await page
      .locator('.ant-message, .ant-alert, .swal2-html-container')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(`still on the login page${message ? ` — "${message.trim().slice(0, 80)}"` : ''}`);
  }

  if (whereIs(page) === 'year-picker') {
    // Rendered from /api/years as `button.yearselect-card`, so wait for one
    // rather than guessing a delay — and use the class the component actually
    // has, not the AntD one it looks like.
    const card = page.locator('button.yearselect-card').first();
    await card.waitFor({ state: 'visible', timeout: 20000 });
    await card.click();
    await page.waitForFunction(() => !/\/select-year/.test(location.href), null, { timeout: 20000 });
  }

  if (whereIs(page) !== 'app') {
    throw new Error(`expected to be inside the app, but at ${page.url()}`);
  }
}

/** A screen counts as rendered if it has real content and no error boundary. */
async function inspect(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const text = (root?.innerText || '').trim();
    const html = (root?.innerHTML || '').trim();
    const lower = text.toLowerCase();
    return {
      textLength: text.length,
      htmlLength: html.length,
      // RouteError renders this; a React error boundary usually says something similar.
      hasErrorBoundary:
        lower.includes('something went wrong') ||
        lower.includes('unexpected application error') ||
        lower.includes('failed to load the page'),
      isForbidden:
        lower.includes('do not have access') || lower.includes('403'),
      heading: text.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 90),
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const client = new MongoClient(process.env.MONGO_URI, { ssl: true, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db('universe-db');
  const names = await seedAccounts(db);

  const browser = await chromium.launch({ headless: !HEADED });
  const results = [];

  try {
    for (const account of ACCOUNTS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      // Anything the app throws at runtime, and any failed asset.
      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

      log(`\n${'='.repeat(88)}`);
      log(`${account.label}  (${account.user})`);
      log('='.repeat(88));

      try {
        await signIn(page, account.user);
      } catch (e) {
        log(`  SIGN-IN FAILED: ${e.message.split('\n')[0]}`);
        await page.screenshot({ path: path.join(SHOTS, `${account.user}-signin-failed.png`) });
        results.push({ account: account.label, screen: 'sign in', ok: false, note: e.message.split('\n')[0] });
        await context.close();
        continue;
      }

      for (const [name, route, opts = {}] of account.screens) {
        const before = pageErrors.length;
        consoleErrors.length = 0;

        await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => {});

        // Each visit is a full page load, so the app re-checks the session and
        // the year container before rendering anything. A fixed delay reported
        // ProtectedRoute's "Loading..." as a blank screen; wait for real
        // content instead, and let the timeout be the failure.
        await page
          .waitForFunction(
            () => {
              const t = (document.getElementById('root')?.innerText || '').trim();
              return t.length > 40 && !/^loading/i.test(t);
            },
            null,
            { timeout: 25000 }
          )
          .catch(() => {});
        // Let in-flight data settle once the shell is up.
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        const state = await inspect(page);
        const threw = pageErrors.slice(before);
        const shot = path.join(SHOTS, `${name}.png`);
        await page.screenshot({ path: shot }).catch(() => {});

        // Being bounced back to the login page or the year picker is a failure,
        // not a render. Without this every screen "passes" as the login form.
        const at = whereIs(page);
        const blank = state.textLength < 40;
        const expectedForbidden = opts.expectForbidden === true;

        let ok;
        let note;
        if (at !== 'app') {
          ok = false;
          note = `bounced to ${at}`;
        } else if (expectedForbidden) {
          ok = state.isForbidden && !state.hasErrorBoundary && threw.length === 0;
          note = state.isForbidden ? 'refused with an explanation' : 'expected a refusal';
        } else {
          ok = !blank && !state.hasErrorBoundary && threw.length === 0;
          note = threw.length
            ? `threw: ${threw[0]}`
            : state.hasErrorBoundary
              ? 'error boundary'
              : blank
                ? `blank (${state.textLength} chars)`
                : state.heading;
        }

        results.push({ account: account.label, screen: name, route, ok, note, consoleErrors: [...consoleErrors] });
        log(`  ${ok ? 'ok  ' : 'FAIL'}  ${pad(name, 28)}${note}`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await db.collection('users').deleteMany({ username: { $in: names } });
    await db.collection('login-status').deleteMany({ username: { $in: names } });
    await client.close();
  }

  const failed = results.filter((r) => !r.ok);
  log(`\n${'='.repeat(88)}`);
  log(`${results.length - failed.length}/${results.length} screens rendered`);
  if (failed.length) {
    log('\nFAILED:');
    for (const f of failed) {
      log(`  ${pad(f.account, 22)}${pad(f.screen, 26)}${f.note}`);
      for (const c of (f.consoleErrors || []).slice(0, 2)) log(`      console: ${c}`);
    }
  }
  log(`\nscreenshots: ${SHOTS}`);
  log('='.repeat(88));

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke run failed:', e);
  process.exit(2);
});
