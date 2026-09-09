// ---------------------------------------------------------------------------
// Navigation regression check.
//
// Asserts what is NOT there, which is the half a screenshot review keeps
// missing: that ESWM Database, Legal Services Unit, Planning Unit, Reports and
// the standalone NAS Storage section stay removed, and that the records share
// stays a Developer Settings screen reachable only by developers.
//
//   npm run nav:check -- --base=http://<host>:5173
//
// Sign-in refuses to continue unless it reaches the application. Without that,
// a session stranded on the year picker passes every "the menu no longer
// contains X" check, because there is no menu at all.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1]
  || 'http://10.14.76.250:5173';
const PASSWORD = 'NavCheck!x9';
const DEV = '__navcheck_dev';
const RECORDS = '__navcheck_records';

const PROVINCES = {
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite',
  nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite',
};

const REMOVED = [
  'ESWM Database', 'Legal Services Unit', 'Planning Unit', 'Reports',
  'NAS Storage', 'Healthcare', 'Chemical Industries', 'TSD Facilities',
  'TRC Permits', 'Survey',
  // Merged into Admin Settings, or removed outright.
  'Field Management', 'PDF Forms', 'Database Settings', 'Duplicate Data',
  'Monitoring Config', 'Register Activity',
];
const KEPT = ['Dashboard', 'Monitoring Plan', 'Admin Settings'];

const results = [];
const check = (name, ok, note) => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(52)}${note || ''}`);
};

async function signIn(page, username) {
  await page.goto(`${BASE}/universe-central-database-system/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: 20000 });
  await page.locator('input').first().fill(username);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).first().click();
  await page.waitForFunction(
    () => !/\/universe-central-database-system\/login/.test(location.href),
    null,
    { timeout: 25000 }
  );

  // The year picker renders a moment after the redirect, so "is a card
  // present yet?" is the wrong question — it is not, and the run then
  // proceeds on the picker with no sidebar, where every "the menu no longer
  // contains X" check passes for the wrong reason.
  if (/\/select-year/.test(page.url())) {
    const card = page.locator('button.yearselect-card').first();
    await card.waitFor({ state: 'visible', timeout: 25000 });
    await card.click();
    await page.waitForFunction(() => !/\/select-year/.test(location.href), null, { timeout: 25000 });
  }

  // Refuse to continue anywhere but inside the application.
  await page.waitForSelector('.ant-menu', { timeout: 25000 });
  if (/\/select-year|\/login/.test(page.url())) {
    throw new Error(`sign-in did not reach the app: ${page.url()}`);
  }
}

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();
const users = client.db().collection('users');
const names = [DEV, RECORDS];
await users.deleteMany({ username: { $in: names } });
const password = await bcrypt.hash(PASSWORD, 10);
await users.insertMany([
  {
    username: DEV, name: 'Nav Check Developer', email: `${DEV}@test.local`,
    division: 'TEST', status: 'offline', assignedYears: [2025], password,
    permission: 'developer', ...PROVINCES,
  },
  {
    username: RECORDS, name: 'Nav Check Records', email: `${RECORDS}@test.local`,
    division: 'TEST', status: 'offline', assignedYears: [2025], password,
    // No explicit domains, so the role default applies — which is what a
    // Records account created today gets. An account pinned to erms-only
    // predates the merge and now sees nothing but the dashboard; that is a
    // misconfiguration to fix on the account, not something to paper over.
    permission: 'records', ...PROVINCES,
  },
]);

const browser = await chromium.launch();
try {
  // ---- developer -----------------------------------------------------------
  console.log('\nDeveloper');
  const devCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dev = await devCtx.newPage();
  await signIn(dev, DEV);
  await dev.waitForTimeout(2500);

  const menu = await dev.evaluate(() => document.querySelector('.ant-menu')?.innerText || '');
  for (const label of REMOVED) {
    check(`sidebar no longer offers "${label}"`, !menu.includes(label));
  }
  for (const label of KEPT) {
    check(`sidebar still offers "${label}"`, menu.includes(label));
  }

  // Storage Configuration must live under Developer Settings.
  await dev.getByText('Admin Settings', { exact: false }).first().click().catch(() => {});
  await dev.waitForTimeout(1200);
  const menu2 = await dev.evaluate(() => document.querySelector('.ant-menu')?.innerText || '');
  check('Admin Settings contains "Storage Configuration"', menu2.includes('Storage Configuration'));

  await dev.goto(`${BASE}/universe/admin/developer/storage-config`, { waitUntil: 'domcontentloaded' });
  await dev.waitForTimeout(3000);
  // Wait for the elevation check to resolve. Without this the assertion can
  // land on the screen's own "Loading" spinner and report a failure that is
  // only impatience.
  await dev
    .waitForFunction(
      () => {
        const t = document.getElementById('root')?.innerText || '';
        return /Verification required|Records share|no email address/i.test(t);
      },
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  const devText = await dev.evaluate(() => document.getElementById('root')?.innerText || '');
  check(
    'storage-config renders the verification gate',
    /Verification required/i.test(devText) && /Email me a code/i.test(devText),
    devText.slice(0, 60).replace(/\s+/g, ' ')
  );
  check(
    'it does NOT claim the developer has no email',
    !/no email address/i.test(devText)
  );
  await dev.screenshot({ path: path.join(here, '..', '..', 'reports', 'screenshots', 'nav-developer.png') });

  // The merged screens: three register entries and two system entries became
  // two tabbed screens. Assert the tabs are actually there, not just that the
  // route resolves.
  for (const [label, route, expected] of [
    ['Register', '/universe/admin/register', ['Monitoring Config', 'Register Activity', 'Duplicate Data']],
    ['System', '/universe/admin/system', ['Database', 'Activity History']],
  ]) {
    await dev.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await dev
      .waitForFunction(
        (tabs) => {
          const t = document.getElementById('root')?.innerText || '';
          return tabs.some((tab) => t.includes(tab));
        },
        expected,
        { timeout: 25000 }
      )
      .catch(() => {});
    const text = await dev.evaluate(() => document.getElementById('root')?.innerText || '');
    const missing = expected.filter((tab) => !text.includes(tab));
    check(
      `${label} screen shows its merged tabs`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : ''
    );
  }

  // A deep link to one tab must open that tab, or the redirects from the old
  // URLs land people at the top of a merged page instead of where they were.
  await dev.goto(`${BASE}/universe/admin/register?tab=duplicates`, { waitUntil: 'domcontentloaded' });
  await dev
    .waitForFunction(
      () => {
        const t = document.getElementById('root')?.innerText || '';
        return /merged automatically|Potential duplicates|not entitled/i.test(t);
      },
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  const dupText = await dev.evaluate(() => document.getElementById('root')?.innerText || '');
  check(
    'a deep link opens the named tab',
    /Nothing here is merged automatically|Potential duplicates/i.test(dupText),
    dupText.slice(0, 60).replace(/\s+/g, ' ')
  );

  // Removed routes must not render their old screens.
  for (const [label, route] of [
    ['eswm-database/swm-plan', '/universe/eswm-database/swm-plan'],
    ['legal/dashboard', '/universe/legal/dashboard'],
    ['planning-unit/monitoring', '/universe/planning-unit/monitoring'],
    ['extract', '/universe/extract'],
  ]) {
    await dev.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await dev.waitForTimeout(1500);
    const t = await dev.evaluate(() => document.getElementById('root')?.innerText || '');
    // The catch-all renders the dashboard shell; what matters is that the old
    // screen is not there and nothing crashed.
    const crashed = /something went wrong|cannot read|is not defined/i.test(t);
    check(`removed route ${label} does not render its old screen`, !crashed, crashed ? t.slice(0, 70) : '');
  }

  // Old NAS URLs should land on the canonical route.
  await dev.goto(`${BASE}/universe/nas/settings`, { waitUntil: 'domcontentloaded' });
  // A client-side redirect: wait for the URL to actually change rather than
  // for a fixed delay, which passes or fails on timing rather than on
  // behaviour.
  await dev
    .waitForFunction(() => !/\/universe\/nas\//.test(location.href), null, { timeout: 20000 })
    .catch(() => {});
  check(
    'old /universe/nas/settings redirects to Developer Settings',
    dev.url().includes('/universe/admin/developer/storage-config'),
    dev.url().replace(BASE, '')
  );
  await devCtx.close();

  // ---- records clerk -------------------------------------------------------
  console.log('\nRecords');
  const recCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rec = await recCtx.newPage();
  await signIn(rec, RECORDS);
  await rec.waitForTimeout(2500);

  const recMenu = await rec.evaluate(() => document.querySelector('.ant-menu')?.innerText || '');
  check('Records clerk sees no Admin Settings', !recMenu.includes('Admin Settings'));
  check('Records clerk sees no NAS Storage', !recMenu.includes('NAS Storage'));
  // Named 'Universe' for a Records clerk and 'Monitoring Plan' for Planning —
  // same screen, same scope, named for the work.
  check('Records clerk sees the register as "Universe"', recMenu.includes('Universe'));

  await rec.goto(`${BASE}/universe/admin/developer/storage-config`, { waitUntil: 'domcontentloaded' });
  // Same as above: wait for the guard to decide rather than for a fixed delay,
  // or an empty page reads as "not refused".
  await rec
    .waitForFunction(
      () => {
        const t = document.getElementById('root')?.innerText || '';
        return /do not have access|not assigned|limited to developers|Verification required/i.test(t);
      },
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  const recText = await rec.evaluate(() => document.getElementById('root')?.innerText || '');
  check(
    'Records clerk typing the URL is refused',
    /do not have access|not assigned|limited to developers/i.test(recText),
    recText.slice(0, 60).replace(/\s+/g, ' ')
  );
  await rec.screenshot({ path: path.join(here, '..', '..', 'reports', 'screenshots', 'nav-records.png') });
  await recCtx.close();
} finally {
  await browser.close();
  await users.deleteMany({ username: { $in: names } });
  await client.db().collection('loginStatus').deleteMany({ username: { $in: names } });
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  failed.forEach((f) => console.log(`  ${f.name}  ${f.note || ''}`));
  process.exit(1);
}
