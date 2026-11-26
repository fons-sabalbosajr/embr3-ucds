#!/usr/bin/env node
/**
 * Bring the desktop ERMS's changes into E-Universe without undoing
 * E-Universe's own corrections: a three-way merge.
 *
 *   node scripts/migrate-erms/merge-from-sql.js            dry run: reads, writes a report, changes nothing
 *   node scripts/migrate-erms/merge-from-sql.js --apply    makes the changes the dry run listed
 *
 * Three versions of each record:
 *
 *   baseline   the migration extract, data/tb_maindata_erms.csv (--baseline=)
 *   desktop    the desktop's table now, read live from the legacy SQL Server
 *              (dbmain_records.dbo.tb_maindata; services/legacySql.js)
 *   web        erms-records in MongoDB now
 *
 * Field by field (the fields divergence.js compares):
 *
 *   desktop = baseline                         nothing happened on the desktop: keep web
 *   desktop changed, web = baseline            the desktop's edit: TAKE IT
 *   desktop changed, web = desktop             both made the same edit: nothing to do
 *   desktop changed, web changed differently   CONFLICT: listed for a person to decide
 *
 * A record on the desktop but not in E-Universe or the baseline was filed on
 * the desktop after the migration: it is ADDED, converted exactly as the
 * migration converted the rest (lib/transform.js). Duplicates set aside at
 * migration (erms-set-aside) are skipped, as divergence.js skips them.
 *
 * Reads only, unless --apply. With --apply: new records are inserted (never
 * overwriting one that appeared meanwhile), desktop-only edits are set field
 * by field, and every record touched gets an entry in the audit trail
 * (Admin Settings › Audit Logs › ERMS, "desktop sync"). Conflicts are never
 * applied. The report is written to reports/erms-merge-<date>.json either way.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { readRows } = require('./lib/source');
const { transformRow } = require('./lib/transform');
const { COMPARED } = require('./lib/compare');
const { connectToMongo, getDb } = require('../../config/db');
const legacySql = require('../../services/legacySql');

const APPLY = process.argv.includes('--apply');
const flag = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASELINE = path.resolve(flag('baseline', path.join(__dirname, '../../../data/tb_maindata_erms.csv')));
const SQL_DB = flag('sql-db', 'dbmain_records');
const SQL_TABLE = flag('sql-table', 'tb_maindata');

const log = (...a) => console.log(...a);
const norm = (v) => (v === undefined || v === '' ? null : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
/** The stored value at a dotted path, for writing (Dates stay Dates). */
const at = (doc, field) => field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);

function bySerial(docs) {
  const map = new Map();
  for (const d of docs) if (d?.serialNo) map.set(d.serialNo, d);
  return map;
}

async function main() {
  log(`\n${'='.repeat(78)}\nERMS THREE-WAY MERGE ${APPLY ? '(APPLY)' : '(dry run: nothing is changed)'}\n${'='.repeat(78)}`);

  const baselineRows = readRows(BASELINE).rows;
  const baseline = bySerial(baselineRows.map(transformRow));
  log(`baseline : ${BASELINE} (${baseline.size.toLocaleString()} records)`);

  await connectToMongo();
  let desktopRows;
  try {
    desktopRows = await legacySql.readTable(SQL_DB, 'dbo', SQL_TABLE);
  } finally {
    await legacySql.close();
  }
  const desktop = bySerial(desktopRows.map(transformRow));
  log(`desktop  : SQL Server ${SQL_DB}.dbo.${SQL_TABLE} (${desktop.size.toLocaleString()} records, live)`);

  const db = getDb();
  const records = db.collection('erms-records');
  const web = bySerial(await records.find({}).toArray());
  const setAside = new Set((await db.collection('erms-set-aside').find({ scope: 'records' }, { projection: { serialNo: 1 } }).toArray()).map((d) => d.serialNo));
  log(`web      : ${db.databaseName}.erms-records (${web.size.toLocaleString()} records; ${setAside.size} set aside)\n`);

  const added = [];
  const takeDesktop = [];
  const conflicts = [];
  const noBaseline = [];
  const missingInWeb = [];
  const removedOnDesktop = [];

  for (const [serial, d] of desktop) {
    if (setAside.has(serial)) continue;
    const w = web.get(serial);
    const b = baseline.get(serial);
    if (!w) {
      if (!b) added.push(d);
      else missingInWeb.push(serial); // was migrated, is gone from E-Universe: a person decides
      continue;
    }
    const take = [];
    const clash = [];
    for (const [field, get] of COMPARED) {
      const dv = get(d);
      const wv = get(w);
      if (same(dv, wv)) continue;
      if (!b) {
        clash.push({ field, desktop: norm(dv), web: norm(wv) });
        continue;
      }
      const bv = get(b);
      if (same(dv, bv)) continue; // the desktop did not change it; web's value stands
      if (same(wv, bv)) take.push({ field, from: norm(wv), to: norm(dv), value: at(d, field) });
      else clash.push({ field, baseline: norm(bv), desktop: norm(dv), web: norm(wv) });
    }
    if (take.length) takeDesktop.push({ serialNo: serial, changes: take });
    if (clash.length) (b ? conflicts : noBaseline).push({ serialNo: serial, fields: clash });
  }
  for (const serial of baseline.keys()) {
    if (!desktop.has(serial) && web.has(serial) && !setAside.has(serial)) removedOnDesktop.push(serial);
  }

  const fieldCount = takeDesktop.reduce((n, r) => n + r.changes.length, 0);
  log('RESULT');
  log(`  new on the desktop, to add            ${added.length}`);
  log(`  desktop edits to take (records/fields) ${takeDesktop.length} / ${fieldCount}`);
  log(`  conflicts (both changed a field)      ${conflicts.length}`);
  log(`  differ, but no baseline to judge by   ${noBaseline.length}`);
  log(`  migrated but missing in E-Universe    ${missingInWeb.length}`);
  log(`  removed on the desktop since          ${removedOnDesktop.length}`);
  log(`  (E-Universe corrections kept: every field the desktop did not change)`);

  const fieldTally = (list, key) => {
    const t = {};
    for (const r of list) for (const c of r[key]) t[c.field] = (t[c.field] || 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  };
  if (takeDesktop.length) log(`\n  desktop edits by field: ${fieldTally(takeDesktop, 'changes').map(([f, n]) => `${f} ${n}`).join(', ')}`);
  if (conflicts.length) log(`  conflicts by field:     ${fieldTally(conflicts, 'fields').map(([f, n]) => `${f} ${n}`).join(', ')}`);
  if (added.length) log(`  new serials:            ${added.slice(0, 6).map((d) => d.serialNo).join(', ')}${added.length > 6 ? ` … ${added[added.length - 1].serialNo}` : ''}`);

  const reportsDir = path.resolve(__dirname, '../../../reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const reportFile = path.join(reportsDir, `erms-merge-${stamp}${APPLY ? '-applied' : ''}.json`);
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        applied: APPLY,
        sources: { baseline: BASELINE, desktop: `${SQL_DB}.dbo.${SQL_TABLE}`, web: `${db.databaseName}.erms-records` },
        added: added.map((d) => ({ serialNo: d.serialNo, proponentName: d.proponentName, projectTitle: d.projectTitle, permitType: d.permit?.type })),
        takeDesktop: takeDesktop.map((r) => ({ serialNo: r.serialNo, changes: r.changes.map(({ value, ...c }) => c) })),
        conflicts,
        noBaseline,
        missingInWeb,
        removedOnDesktop,
      },
      null,
      2
    )
  );
  log(`\nreport: ${path.relative(path.resolve(__dirname, '../../..'), reportFile)} (kept locally; reports/ is not in git)`);

  if (!APPLY) {
    log('\nDry run: nothing was changed. Review the report, then run again with --apply.');
    return;
  }

  // ---- apply ---------------------------------------------------------------
  const now = new Date();
  const auditEntries = [];
  if (added.length) {
    const res = await records.bulkWrite(
      added.map((doc) => ({
        updateOne: {
          filter: { serialNo: doc.serialNo },
          // Never overwrites a record that appeared since the dry run.
          update: { $setOnInsert: { ...doc, migratedAt: now, syncedFromDesktopAt: now } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    log(`\nadded ${res.upsertedCount} new record(s)`);
    for (const doc of added) {
      auditEntries.push({ serialNo: doc.serialNo, label: `Added from the desktop ERMS (filed there after the migration)` });
    }
  }
  if (takeDesktop.length) {
    const ops = takeDesktop.map((r) => ({
      updateOne: {
        filter: { serialNo: r.serialNo },
        update: { $set: { ...Object.fromEntries(r.changes.map((c) => [c.field, c.value ?? null])), syncedFromDesktopAt: now, updatedAt: now } },
      },
    }));
    for (let i = 0; i < ops.length; i += 500) await records.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    log(`took ${fieldCount} desktop edit(s) on ${takeDesktop.length} record(s)`);
    for (const r of takeDesktop) {
      auditEntries.push({
        serialNo: r.serialNo,
        label: `Desktop edits taken: ${r.changes.map((c) => `${c.field} "${c.from ?? ''}" -> "${c.to ?? ''}"`).join('; ')}`.slice(0, 1000),
      });
    }
  }
  if (auditEntries.length) {
    await db.collection('app-logs').insertMany(
      auditEntries.map((e) => ({
        username: 'cli:desktop-sync',
        domain: 'erms',
        method: 'CLI',
        path: '/api/erms/records',
        actionType: 'desktop-sync',
        actionLabel: e.label,
        serialNo: e.serialNo,
        timestamp: now,
      }))
    );
    log(`audit trail: ${auditEntries.length} entr${auditEntries.length === 1 ? 'y' : 'ies'} (Audit Logs › ERMS, "desktop sync")`);
  }
  log(`conflicts left for a person: ${conflicts.length + noBaseline.length} (see the report)`);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\nFAILED:', e.code || '', e.message);
    await legacySql.close().catch(() => {});
    process.exit(2);
  });
