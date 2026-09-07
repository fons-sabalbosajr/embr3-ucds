/**
 * Phase 3 backfill: give every account an explicit domain and capability set,
 * and normalise per-province grants.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-authorization.js
 *   node scripts/migrate-authorization.js --apply
 *
 * What it writes, per user:
 *
 *   domains        derived from the role. Every existing account is a UCDS
 *                  user, so nobody's access changes.
 *   capabilities   the five named booleans, lifted from the loose top-level
 *                  fields into one object.
 *   <province>     normalised to 'none' | 'view' | 'readWrite'. The collection
 *                  currently holds a mix of booleans and strings.
 *
 * The legacy top-level capability booleans are deliberately left in place:
 * removing them is a separate, later step, once nothing reads them.
 */

require('dotenv').config();
const { connectToMongo, collections } = require('../config/db');
const { roleOf, domainsOf, capabilitiesOf, CAPABILITY_KEYS } = require('../services/authorization');
const { PROVINCE_KEYS, accessLevel, userProvinceKeys } = require('../services/provinces');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);
const pad = (s, n) => String(s === undefined ? '' : s).padEnd(n);

async function main() {
  await connectToMongo();

  const users = await collections.users.find({}).toArray();
  log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${users.length} accounts\n`);
  log(pad('username', 18) + pad('role', 11) + pad('domains', 24) + 'province scope');
  log('-'.repeat(96));

  let changed = 0;

  for (const u of users) {
    const role = roleOf(u);
    const domains = domainsOf(u);
    const capabilities = capabilitiesOf(u);

    // Normalise province grants in place.
    const provinces = {};
    for (const key of PROVINCE_KEYS) provinces[key] = accessLevel(u[key]);

    // What the pre-fix code resolved: a strict `=== true` test, which returned
    // nothing for string-valued accounts.
    const beforeKeys = PROVINCE_KEYS.filter((k) => u[k] === true);
    const beforeEffective = beforeKeys.length === 0 ? 'ALL (empty scope => null filter)' : beforeKeys.join(',');

    const after = PROVINCE_KEYS.filter((k) => provinces[k] !== 'none');

    const set = { domains, capabilities, ...provinces };

    const needsWrite =
      JSON.stringify(u.domains || null) !== JSON.stringify(domains) ||
      JSON.stringify(u.capabilities || null) !== JSON.stringify(capabilities) ||
      PROVINCE_KEYS.some((k) => u[k] !== provinces[k]);

    log(
      pad(u.username, 18) +
        pad(role, 11) +
        pad(domains.join(','), 24) +
        (after.length === PROVINCE_KEYS.length ? 'all 7' : after.join(',') || '(none)')
    );

    // Show every account whose effective register scope changes, so the
    // difference is visible rather than silent. Developers and Admins are
    // unaffected: authorizedProvinces() short-circuits for them.
    const unrestrictedByRole = ['developer', 'admin'].includes(role);
    const effectiveAfter =
      unrestrictedByRole || after.length === PROVINCE_KEYS.length ? 'ALL (by role or full grant)' : after.join(',') || 'NONE';

    if (!unrestrictedByRole && beforeEffective !== effectiveAfter) {
      log(`${' '.repeat(18)}EFFECTIVE SCOPE CHANGE: ${beforeEffective}  ->  ${effectiveAfter}`);
    }

    const missingCaps = CAPABILITY_KEYS.filter((k) => !(k in u));
    if (missingCaps.length) {
      log(`${' '.repeat(18)}capabilities absent on document, defaulted false: ${missingCaps.join(', ')}`);
    }

    if (needsWrite) {
      changed++;
      if (APPLY) await collections.users.updateOne({ _id: u._id }, { $set: set });
    }
  }

  log('-'.repeat(96));
  log(`${changed} of ${users.length} accounts ${APPLY ? 'updated' : 'would be updated'}.`);
  if (!APPLY) log('\nRe-run with --apply to write.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
