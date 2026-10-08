#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const nas = require('../services/nasStorage');

// ---------------------------------------------------------------------------
// Phase 10 readiness — one command, go/no-go.
//
// The cutover checklist in docs/CUTOVER.md mixes two kinds of item: things a
// machine can verify, and things only a person can (has a clerk actually filed
// a record end to end?). This runs every one of the first kind and states
// plainly which of the second kind remain.
//
// It exists because the checks were spread across five commands, and a
// pre-flight that takes five commands is a pre-flight that gets skipped on the
// morning it matters most.
//
//   node scripts/cutover-check.js
//
// Exits non-zero if any automated gate fails, so it can guard a scheduled run.
// A pass does NOT mean "cut over" — it means nothing mechanical is blocking.
// ---------------------------------------------------------------------------

const results = [];
const record = (name, state, detail) => results.push({ name, state, detail });

const OK = 'pass';
const FAIL = 'fail';
const WARN = 'warn';

async function checkNas() {
  if (!nas.isConfigured()) {
    return record('records share configured', FAIL, 'NAS_ROOT is not set');
  }

  const baseDir = String(process.env.NAS_BASE_DIR || '').trim();
  if (/^[A-Za-z]:/.test(baseDir) || /^\\{2}/.test(baseDir)) {
    record(
      'NAS_BASE_DIR sane',
      FAIL,
      `set to "${baseDir}" — a drive/UNC path. Every document will fail to open.`
    );
  } else {
    record('NAS_BASE_DIR sane', OK, baseDir ? `"${baseDir}"` : 'empty (correct here)');
  }

  const probe = await nas.testConnection();
  if (!probe.ok) {
    return record('records share reachable', FAIL, `${probe.reason}/${probe.code}`);
  }
  record('records share reachable', OK, `${probe.ms}ms, ${probe.entryCount} entries at root`);

  if (!nas.nasConfig().enabled) {
    record('document access enabled', WARN, 'NAS_ENABLED=false — documents will not open');
  } else {
    record('document access enabled', OK, null);
  }
}

async function checkDocumentCoverage(db) {
  const col = db.collection('erms-records');
  const docs = await col
    .aggregate([
      { $match: { 'document.sharePath': { $nin: [null, ''] } } },
      { $sample: { size: 150 } },
      { $project: { 'document.sharePath': 1 } },
    ])
    .toArray();

  if (!docs.length) return record('documents resolve', FAIL, 'no records carry a share path');

  let ok = 0;
  for (const d of docs) {
    const stat = await nas.statFile(d.document.sharePath);
    if (stat.ok) ok += 1;
  }
  const pct = (ok / docs.length) * 100;

  // The migrated data itself has ~1-2% of rows pointing at folders that no
  // longer exist, so 100% is not the target and demanding it would mean this
  // never passes. A drop well below that says the server lost the share.
  record(
    'documents resolve',
    pct >= 90 ? OK : FAIL,
    `${pct.toFixed(1)}% of ${docs.length} sampled (expect ~98%)`
  );
}

async function checkModuleFlag() {
  const on = String(process.env.ERMS_MODULE_ENABLED || '').trim().toLowerCase() === 'true';
  record(
    'ERMS module enabled',
    on ? OK : FAIL,
    on ? null : 'ERMS_MODULE_ENABLED is not true — Records staff cannot file anything'
  );
}

async function checkAuth() {
  const bypass = String(process.env.BYPASS_AUTH || '').trim().toLowerCase();
  record(
    'auth not bypassed',
    bypass === 'true' || bypass === 'true;' ? FAIL : OK,
    bypass ? `BYPASS_AUTH=${bypass}` : null
  );

  const secret = process.env.SESSION_SECRET || '';
  record(
    'session secret set',
    secret.length >= 16 ? OK : FAIL,
    secret.length ? `${secret.length} characters` : 'not set'
  );

  // A trailing semicolon has silently broken this deployment twice.
  const offenders = Object.entries(process.env)
    .filter(([k, v]) => /^(NAS_|ERMS_|BYPASS_|ALLOWED_|SERVER_|VITE_)/.test(k) && /;\s*$/.test(v || ''))
    .map(([k]) => k);
  record(
    'no trailing semicolons in .env',
    offenders.length ? FAIL : OK,
    offenders.length ? offenders.join(', ') : null
  );
}

async function checkData(db) {
  const col = db.collection('erms-records');
  const total = await col.countDocuments();
  record('records present', total > 0 ? OK : FAIL, `${total} in erms-records`);

  const flagged = await col.countDocuments({ 'dataQuality.clean': false });
  record(
    'flagged records reviewed',
    flagged === 0 ? OK : WARN,
    flagged ? `${flagged} still flagged — a person decides these` : null
  );

  const linked = await col.countDocuments({ ucdsRef: { $ne: null } });
  record(
    'register link rate',
    OK,
    `${((linked / total) * 100).toFixed(1)}% (${linked}/${total}) — Planning accepts or improves this`
  );

  const noPath = await col.countDocuments({
    $or: [{ 'document.sharePath': null }, { 'document.sharePath': '' }],
  });
  record('records carry a file path', noPath === 0 ? OK : WARN, noPath ? `${noPath} without one` : null);
}

function checkBaseline() {
  const dir = path.join(__dirname, '..', '..', 'reports');
  let baseline = null;
  try {
    baseline = fs
      .readdirSync(dir)
      .filter((f) => /^divergence-.*\.txt$/.test(f))
      .sort()
      .pop();
  } catch {
    /* no reports directory yet */
  }
  record(
    'divergence baseline taken',
    baseline ? OK : WARN,
    baseline || 'none — run `npm run daily-check` before the freeze'
  );
}

/**
 * Room on the cluster. It is a free tier shared with six other applications,
 * and at its cap Atlas blocks writes for all of them — which, for a records
 * system mid-parallel-period, is the outage that sends everyone back to the
 * desktop app. The cap is what Atlas counts: data plus indexes, uncompressed,
 * across every database. ATLAS_STORAGE_LIMIT_MB changes it after an upgrade.
 */
async function checkClusterStorage(client) {
  const limitMb = Number(process.env.ATLAS_STORAGE_LIMIT_MB) || 512;
  try {
    const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
    let usedMb = 0;
    for (const { name } of databases) {
      if (['admin', 'local', 'config'].includes(name)) continue;
      const s = await client.db(name).command({ dbStats: 1 });
      usedMb += (s.dataSize + s.indexSize) / 1e6;
    }
    const pct = (usedMb / limitMb) * 100;
    record(
      'cluster has room',
      pct >= 90 ? FAIL : pct >= 75 ? WARN : OK,
      `${usedMb.toFixed(0)} of ${limitMb} MB (${pct.toFixed(0)}%) — at 100% Atlas blocks writes for every app on the cluster`
    );
  } catch (err) {
    record('cluster has room', WARN, `could not measure: ${err.message}`);
  }
}

const HUMAN_GATES = [
  'A Records clerk has filed a record end to end, while the desktop app still works',
  'Planning personnel have clicked through the UCDS screens',
  'The NAS credential is stored on the server account the API runs as (cmdkey)',
  'The server has a stable address (static IP or DNS name), not a DHCP lease',
  'The NAS bridge server (emb3winsrvr2019) is online in `tailscale status`',
  'Someone has agreed to run the daily check for the whole parallel period',
];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME || undefined);

  await checkModuleFlag();
  await checkAuth();
  await checkNas();
  await checkData(db);
  await checkClusterStorage(client);
  if (nas.isConfigured()) await checkDocumentCoverage(db);
  checkBaseline();

  await client.close();

  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  const mark = { [OK]: ' ok ', [FAIL]: 'FAIL', [WARN]: 'warn' };

  console.log('\n' + '='.repeat(78));
  console.log('CUTOVER READINESS');
  console.log('='.repeat(78) + '\n');
  for (const r of results) {
    console.log(`  ${mark[r.state]}  ${r.name.padEnd(width)}${r.detail || ''}`);
  }

  const failed = results.filter((r) => r.state === FAIL);
  const warned = results.filter((r) => r.state === WARN);

  console.log('\n' + '-'.repeat(78));
  console.log('Still needs a person — none of these can be checked from here:');
  for (const g of HUMAN_GATES) console.log(`  [ ] ${g}`);
  console.log('-'.repeat(78));

  if (failed.length) {
    console.log(`\n${failed.length} automated gate(s) FAILED. Do not freeze the desktop app.\n`);
    process.exit(1);
  }
  console.log(
    `\nAutomated gates pass${warned.length ? ` (${warned.length} warning(s))` : ''}. ` +
      'That means nothing mechanical is blocking — it is not itself a decision to cut over.\n'
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
