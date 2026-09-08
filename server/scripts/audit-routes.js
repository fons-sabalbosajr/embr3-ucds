/**
 * Phase 9: print every route the application serves and how it is guarded.
 *
 *   node scripts/audit-routes.js
 *   node scripts/audit-routes.js --unprotected   # only the ones to worry about
 *
 * Reads the live Express router rather than the route files, so it cannot
 * drift from what is actually mounted. Exits non-zero if any route outside the
 * public allowlist is missing a session check.
 */

require('dotenv').config();
const app = require('../app');
const { uniqueRoutes, PUBLIC_ROUTES, domainOf } = require('../shared/routeInventory');

const ONLY_UNPROTECTED = process.argv.includes('--unprotected');
const log = (...a) => console.log(...a);
const pad = (s, n) => String(s === undefined ? '' : s).padEnd(n);

const routes = uniqueRoutes(app).sort((a, b) => a.path.localeCompare(b.path));

const classify = (r) => {
  const key = `${r.method} ${r.path}`;
  if (PUBLIC_ROUTES.has(key)) return 'public';
  if (!r.guards.includes('authenticateSession')) return 'UNPROTECTED';
  if (r.guards.includes('requireDomain')) return 'domain';
  if (r.guards.includes('requireDeveloper') || r.guards.includes('requireYearManager')) {
    return 'role';
  }
  return 'session';
};

const rows = routes.map((r) => ({ ...r, level: classify(r) }));
const unprotected = rows.filter((r) => r.level === 'UNPROTECTED');

if (!ONLY_UNPROTECTED) {
  log(`\n${'='.repeat(104)}`);
  log('ROUTE PROTECTION AUDIT');
  log('='.repeat(104));
  log(`${pad('method', 7)}${pad('path', 52)}${pad('level', 13)}${pad('domain', 8)}guards`);
  log('-'.repeat(104));

  for (const r of rows) {
    log(
      pad(r.method, 7) +
        pad(r.path.slice(0, 50), 52) +
        pad(r.level, 13) +
        pad(r.level === 'public' ? '—' : domainOf(r.path), 8) +
        r.guards.join(' → ')
    );
  }
}

const counts = rows.reduce((acc, r) => ({ ...acc, [r.level]: (acc[r.level] || 0) + 1 }), {});

log(`\n${'-'.repeat(104)}`);
log(`${rows.length} routes: ` + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));

if (unprotected.length) {
  log('\nROUTES WITH NO SESSION CHECK (and not on the public allowlist):');
  for (const r of unprotected) log(`  ${pad(r.method, 7)}${r.path}`);
  log('\nEither add authenticateSession, or add the route to PUBLIC_ROUTES in');
  log('shared/routeInventory.js with a reason.');
  process.exit(1);
}

log('\nEvery route outside the public allowlist requires a session.');
process.exit(0);
