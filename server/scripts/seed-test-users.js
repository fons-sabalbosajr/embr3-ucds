#!/usr/bin/env node
require('dotenv').config();

const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

// ---------------------------------------------------------------------------
// Test accounts for Records and Planning.
//
// Credentials come from server/.env so they are not committed, and the script
// is idempotent — run it again and the accounts are reset to this definition
// rather than duplicated.
//
//   npm run seed:test-users            create or reset them
//   npm run seed:test-users -- --drop  remove them
//
// These are for exercising the two role-based experiences. They are ordinary
// accounts with ordinary entitlement, not back doors: the Records account gets
// the Records role's domains, the Planning account gets Planning's, and both
// are refused everything those roles are refused.
// ---------------------------------------------------------------------------

const ALL_PROVINCES = {
  aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite',
  nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite',
  zambales: 'readWrite',
};

const caps = (over = {}) => ({
  canGenerateData: false,
  canManageData: false,
  canViewAdminPanel: false,
  canViewDataHistory: false,
  canAccessRangePicker: false,
  ...over,
});

function definitions() {
  const records = {
    username: process.env.TEST_RECORDS_USERNAME,
    password: process.env.TEST_RECORDS_PASSWORD,
    name: 'Records Test User',
    // `users.email` carries a unique index, so two accounts cannot both be
    // null. A distinct placeholder also means the password-reset and NAS
    // verification flows have somewhere to send to when testing them.
    email: process.env.TEST_RECORDS_EMAIL || `${process.env.TEST_RECORDS_USERNAME}@test.local`,
    permission: 'records',
    // No explicit `domains`: the role default applies, which is what a real
    // Records account created through the admin screens gets.
    capabilities: caps({ canManageData: true }),
  };
  const planning = {
    username: process.env.TEST_PLANNING_USERNAME,
    password: process.env.TEST_PLANNING_PASSWORD,
    name: 'Planning Test User',
    email: process.env.TEST_PLANNING_EMAIL || `${process.env.TEST_PLANNING_USERNAME}@test.local`,
    permission: 'planning',
    capabilities: caps({ canManageData: true, canGenerateData: true, canViewDataHistory: true }),
  };
  return [records, planning];
}

async function main() {
  const drop = process.argv.includes('--drop');
  const defs = definitions();

  const missing = defs.filter((d) => !d.username || !d.password);
  if (missing.length && !drop) {
    console.error(
      'Missing credentials in server/.env. Set:\n' +
        '  TEST_RECORDS_USERNAME, TEST_RECORDS_PASSWORD\n' +
        '  TEST_PLANNING_USERNAME, TEST_PLANNING_PASSWORD\n' +
        'Optionally TEST_RECORDS_EMAIL and TEST_PLANNING_EMAIL.'
    );
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const users = client.db().collection('users');
  const names = defs.map((d) => d.username).filter(Boolean);

  if (drop) {
    const res = await users.deleteMany({ username: { $in: names } });
    await client.db().collection('loginStatus').deleteMany({ username: { $in: names } });
    console.log(`removed ${res.deletedCount} test account(s)`);
    await client.close();
    return;
  }

  // Refuse to touch an account that was not created by this script, so a typo
  // in .env cannot overwrite a real person's login.
  for (const d of defs) {
    const existing = await users.findOne({ username: d.username });
    if (existing && existing.isTestAccount !== true) {
      console.error(
        `Refusing to overwrite "${d.username}": it exists and was not created by this script.\n` +
          'Pick a different TEST_* username in server/.env.'
      );
      await client.close();
      process.exit(1);
    }
  }

  for (const d of defs) {
    await users.updateOne(
      { username: d.username },
      {
        $set: {
          username: d.username,
          name: d.name,
          email: d.email,
          division: 'TEST',
          status: 'offline',
          assignedYears: [2025, 2026, 2027],
          password: await bcrypt.hash(d.password, 10),
          permission: d.permission,
          capabilities: d.capabilities,
          ...d.capabilities,
          ...ALL_PROVINCES,
          isTestAccount: true,
          accountCreated: new Date().toISOString().slice(0, 10),
        },
      },
      { upsert: true }
    );
    console.log(`ready: ${d.username}  (${d.permission})`);
  }

  console.log('\nSign in at the usual login page. Passwords are the TEST_* values in server/.env.');
  await client.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
