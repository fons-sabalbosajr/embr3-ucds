#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { connectToMongo, collections } = require('../config/db');

// ---------------------------------------------------------------------------
// Three demonstration accounts, one per staff type, for showing the
// application without touching a real person's data:
//
//   demo.records     ERMS User (Records)     ERMS + register, Records container
//   demo.legal       ERMS User (Legal)       the Legal Services unit only
//   demo.laboratory  ERMS User (Laboratory)  the Laboratory unit only
//   demo.planning    Planning Admin          UCDS, Records + Legal + Laboratory containers
//   demo.encoder     Encoder                 UCDS only, Bataan, no storage
//
// Passwords come from the server .env when set there (DEMO_RECORDS_PASSWORD,
// DEMO_PLANNING_PASSWORD, DEMO_ENCODER_PASSWORD), so a developer can sign in
// to the demo accounts without hunting for a printout; otherwise they are
// generated here and printed once. Either way they are stored hashed.
// Re-running resets the passwords. `--remove` deletes the three accounts and
// their sessions.
// ---------------------------------------------------------------------------

const YEARS = [2024, 2025, 2026];
const NONE = { aurora: 'none', bataan: 'none', bulacan: 'none', nuevaEcija: 'none', pampanga: 'none', tarlac: 'none', zambales: 'none' };
const ALL = { aurora: 'readWrite', bataan: 'readWrite', bulacan: 'readWrite', nuevaEcija: 'readWrite', pampanga: 'readWrite', tarlac: 'readWrite', zambales: 'readWrite' };

const ACCOUNTS = [
  {
    username: 'demo.records',
    passwordEnv: 'DEMO_RECORDS_PASSWORD',
    name: 'Demo Records Admin',
    email: 'demo.records@emb3.local',
    division: 'ORD-RECORDS (DEMO)',
    permission: 'records',
    ermsUnit: 'records',
    assignedYears: YEARS,
    nasContainers: ['records'],
    // The Records Unit files for the whole region: every province, as the
    // desktop system's clerks had. (It used to be Bataan only, which made
    // the register look like a Bataan register.)
    ...ALL,
  },
  {
    username: 'demo.legal',
    passwordEnv: 'DEMO_LEGAL_PASSWORD',
    name: 'Demo Legal Officer',
    email: 'demo.legal@emb3.local',
    division: 'LEGAL SERVICES (DEMO)',
    permission: 'records',
    ermsUnit: 'legal',
    assignedYears: [],
    nasContainers: ['legal'],
    ...NONE,
  },
  {
    username: 'demo.laboratory',
    passwordEnv: 'DEMO_LABORATORY_PASSWORD',
    name: 'Demo Laboratory Analyst',
    email: 'demo.laboratory@emb3.local',
    division: 'ORD-LABORATORY (DEMO)',
    permission: 'records',
    ermsUnit: 'laboratory',
    assignedYears: [],
    nasContainers: ['laboratory'],
    ...NONE,
  },
  {
    username: 'demo.planning',
    passwordEnv: 'DEMO_PLANNING_PASSWORD',
    name: 'Demo Planning Admin',
    email: 'demo.planning@emb3.local',
    division: 'ORD-PISMU (DEMO)',
    permission: 'planning',
    assignedYears: YEARS,
    nasContainers: ['records', 'legal', 'laboratory'],
    ...NONE,
    bataan: 'readWrite',
    pampanga: 'readWrite',
    canManageData: true,
    canViewDataHistory: true,
  },
  {
    username: 'demo.encoder',
    passwordEnv: 'DEMO_ENCODER_PASSWORD',
    name: 'Demo Encoder',
    email: 'demo.encoder@emb3.local',
    division: 'ORD-PEMU-BATAAN (DEMO)',
    permission: 'viewer',
    assignedYears: [2026],
    nasContainers: [],
    ...NONE,
    bataan: 'readWrite',
    canManageData: true,
  },
];

const password = () =>
  // 12 characters from a set without look-alikes, plus a symbol and a digit
  // so it passes any strength rule the sign-in screens apply.
  Array.from(crypto.randomBytes(10), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[b % 54]).join('') + '!' + (crypto.randomInt(10, 99));

(async () => {
  const { client } = await connectToMongo();
  const usernames = ACCOUNTS.map((a) => a.username);

  if (process.argv.includes('--remove')) {
    const users = await collections.users.find({ username: { $in: usernames } }).toArray();
    for (const u of users) {
      await client.db(process.env.MONGO_DB_NAME || undefined).collection('sessions').deleteMany({ 'session.user.userId': String(u._id) });
      await collections.loginStatus.deleteMany({ $or: [{ userId: u._id }, { username: u.username }] });
    }
    const r = await collections.users.deleteMany({ username: { $in: usernames } });
    console.log(`removed ${r.deletedCount} demo account(s)`);
    process.exit(0);
  }

  console.log('Demo accounts (passwords shown once — store them somewhere safe):\n');
  for (const { passwordEnv, ...a } of ACCOUNTS) {
    const fromEnv = String(process.env[passwordEnv] || '').trim();
    if (fromEnv && fromEnv.length < 8) {
      console.error(`${passwordEnv} must be at least 8 characters.`);
      process.exit(1);
    }
    const plain = fromEnv || password();
    const doc = {
      ...a,
      password: await bcrypt.hash(plain, 10),
      status: 'offline',
      avatar: null,
      isDemo: true,
      canAccessRangePicker: a.canAccessRangePicker === true,
      canGenerateData: false,
      canManageData: a.canManageData === true,
      canViewAdminPanel: false,
      canViewDataHistory: a.canViewDataHistory === true,
      designation: 'Demonstration account',
      office: 'EMB Region III',
      region: 'III',
      updatedAt: new Date(),
    };
    await collections.users.updateOne({ username: a.username }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    console.log(`  ${a.username.padEnd(14)} ${plain}    (${a.permission}${fromEnv ? `, from ${passwordEnv}` : ''})`);
  }
  console.log('\nSign-in: username or the @emb3.local email. No mail is sent to these addresses.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
