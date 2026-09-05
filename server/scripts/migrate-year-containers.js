#!/usr/bin/env node
/**
 * Year container migration.
 *
 *   node scripts/migrate-year-containers.js            # dry run (default)
 *   node scripts/migrate-year-containers.js --apply    # write changes
 *
 * What it does, all of it additive:
 *   1. Registers the year containers that already have data (2024, 2025).
 *   2. Stamps `year` on year-scoped collections that have no year yet.
 *   3. Grants existing non-admin accounts the baseline year explicitly, so
 *      runtime authorization can fail closed on a missing assignment.
 *
 * What it never does: delete, move, duplicate or rewrite an existing document
 * field. `_id`s, references, timestamps and audit fields are untouched.
 * Every step is reversible with a matching `$unset`.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../config/dns').configureDns();

const { connectToMongo, collections, client, getDb } = require('../config/db');
const { FIELD_SCOPED_DATASETS, scopeOf, YEAR_FIELD } = require('../services/yearScope');
const { roleOf, ROLES } = require('../services/authorization');

const APPLY = process.argv.includes('--apply');
const BASELINE_YEAR = 2025;

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s).padEnd(n);

async function seedYearContainers() {
  log('\n--- 1. Year container registry ---');

  // Register a year for every survey-data-<year> collection that exists, plus
  // the baseline. Those collections are the evidence of which years have data.
  const names = (await getDb().listCollections().toArray()).map((c) => c.name);
  const surveyYears = names
    .map((n) => /^survey-data-(\d{4})$/.exec(n))
    .filter(Boolean)
    .map((m) => Number(m[1]));

  const years = [...new Set([...surveyYears, BASELINE_YEAR])].sort((a, b) => a - b);

  for (const year of years) {
    const existing = await collections.yearContainers.findOne({ year });
    if (existing) {
      log(`  ${pad(year, 6)} already registered (${existing.status})`);
      continue;
    }
    const doc = {
      year,
      label: `${year} Data`,
      description: year === BASELINE_YEAR ? 'Baseline UCDS dataset.' : `${year} data container.`,
      status: 'active',
      createdAt: new Date(),
      createdBy: 'migration',
    };
    if (APPLY) await collections.yearContainers.insertOne(doc);
    log(`  ${pad(year, 6)} ${APPLY ? 'registered' : 'would register'}`);
  }
  return years;
}

async function stampYearField() {
  log('\n--- 2. Stamp `year` on year-scoped collections ---');
  log(`  ${pad('dataset', 16)}${pad('total', 9)}${pad('missing', 9)}action`);

  const results = [];
  for (const key of FIELD_SCOPED_DATASETS) {
    const { collection } = scopeOf(key, BASELINE_YEAR);
    const total = await collection.countDocuments({});
    const missing = await collection.countDocuments({ [YEAR_FIELD]: { $exists: false } });

    let action = 'nothing to do';
    if (missing > 0) {
      if (APPLY) {
        const r = await collection.updateMany(
          { [YEAR_FIELD]: { $exists: false } },
          { $set: { [YEAR_FIELD]: BASELINE_YEAR } }
        );
        action = `stamped ${r.modifiedCount} -> ${BASELINE_YEAR}`;
      } else {
        action = `would stamp ${missing} -> ${BASELINE_YEAR}`;
      }
    }
    log(`  ${pad(key, 16)}${pad(total, 9)}${pad(missing, 9)}${action}`);
    results.push({ key, total, missing });
  }
  return results;
}

async function grantBaselineYearToUsers() {
  log('\n--- 3. Grant baseline year to existing accounts ---');
  const users = await collections.users
    .find({}, { projection: { username: 1, permission: 1, assignedYears: 1 } })
    .toArray();

  for (const u of users) {
    const role = roleOf(u);
    if (role !== ROLES.GUEST) {
      log(`  ${pad(u.username, 20)}${pad(role, 11)}all years (no assignment needed)`);
      continue;
    }
    if (Array.isArray(u.assignedYears) && u.assignedYears.length) {
      log(`  ${pad(u.username, 20)}${pad(role, 11)}already assigned [${u.assignedYears}]`);
      continue;
    }
    if (APPLY) {
      await collections.users.updateOne(
        { _id: u._id },
        { $set: { assignedYears: [BASELINE_YEAR] } }
      );
    }
    log(`  ${pad(u.username, 20)}${pad(role, 11)}${APPLY ? 'granted' : 'would grant'} [${BASELINE_YEAR}]`);
  }
}

async function verify(before) {
  log('\n--- 4. Verification ---');
  let ok = true;
  for (const { key, total } of before) {
    const { collection } = scopeOf(key, BASELINE_YEAR);
    const after = await collection.countDocuments({});
    const stamped = await collection.countDocuments({ [YEAR_FIELD]: { $exists: true } });
    const unstamped = after - stamped;
    const countHeld = after === total;
    if (!countHeld) ok = false;
    if (APPLY && unstamped > 0) ok = false;
    log(
      `  ${pad(key, 16)}count ${pad(`${total} -> ${after}`, 16)}` +
        `stamped ${pad(stamped, 8)}${countHeld ? 'OK' : 'COUNT CHANGED'}`
    );
  }
  log(`\n  ${ok ? 'PASS — no records lost' : 'FAIL — investigate before continuing'}`);
  return ok;
}

(async () => {
  await connectToMongo();
  log(APPLY ? '=== APPLYING MIGRATION ===' : '=== DRY RUN (pass --apply to write) ===');

  await seedYearContainers();
  const before = await stampYearField();
  await grantBaselineYearToUsers();
  const ok = await verify(before);

  if (!APPLY) log('\nNo changes were written. Re-run with --apply to commit.');
  await client.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('\nMigration failed:', e);
  process.exit(1);
});
