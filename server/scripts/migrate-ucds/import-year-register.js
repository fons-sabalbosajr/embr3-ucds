#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { connectToMongo, getDb } = require('../../config/db');

// ---------------------------------------------------------------------------
// Give a year container its own Monitoring Plan register, loaded from the
// Planning Unit's RAW universe workbooks (15 Oct 2026, for 2027).
//
// The register up to 2026 is the shared `ucds-data`. The RAW workbooks are a
// renumbered, revised universe — serials no longer line up with the register
// and about one row in five is new — so merging them in would rewrite what
// 2024–2026 show. Instead the year gets `ucds-data-<year>`, and its
// container is marked { register: 'ucds-data-<year>' }; every register read
// for that year goes there (see services/yearScope.js registerOf).
//
//   node scripts/migrate-ucds/import-year-register.js --year 2027 --dir ../backups/ucd
//   … --write          load it (replaces that year's register), mark the container
//
// Without --write it reads the workbooks and prints what it would load: rows
// per sheet, serials repeated, and how full each field is.
//
// What a year starts with: the firm, its permits and its monitoring history
// (the IIS numbers of earlier years). The previous year's activity — the
// schedule, the dates monitored, routed and signed, the report tracking — is
// left blank for the year's own work, as the RAW workbooks already are for
// most rows; anything still in them for those columns is not carried over.
// ---------------------------------------------------------------------------

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const YEAR = Number(arg('year'));
const DIR = path.resolve(arg('dir', path.join(__dirname, '..', '..', '..', 'backups', 'ucd')));
const WRITE = process.argv.includes('--write');
const TARGET = `ucds-data-${YEAR}`;

const { YEARLY, LOOKUP_SHEETS, SET_ASIDE, squeeze, fieldsOf, cell, serial, provinceOf } = require('../../modules/ucds/services/rawWorkbook');
const { PROVINCES } = require('../../services/provinces');


// Only the sheets the Progress Tracker counts as the universe (the province's
// own sheet, the 2027 lists' sheets): not the additions logs (NEW ADDITIONS
// LOG, ADDED FIRM SUMMARY), whose rows are already on the main sheet, nor the
// review sheets (NEW - CHECK DUPLICATE, HAZWASTE ID ONLY (ERMS)), still pending.
const { mainSheetsOf } = require('../../services/progressTracker/analyze');

// A row on a province's own sheet with its Province cell empty or mistyped (4
// Nov 2026: 37 blank and one "`", at the foot of the Bataan, Pampanga and
// Zambales sheets) is that province's: the screens read a province by this field,
// so without it the firm is on no screen at all. A province written in the cell
// is kept, whatever the sheet.
function provinceOfRow(value, sheetName) {
  const stated = provinceOf(value);
  if (PROVINCES.some((p) => p.value === stated)) return stated;
  const fromSheet = provinceOf(sheetName);
  return PROVINCES.some((p) => p.value === fromSheet) ? fromSheet : stated;
}

function readWorkbook(file) {
  const wb = XLSX.readFile(file, { cellDates: true });
  const main = new Set(mainSheetsOf(wb));
  const sheets = [];
  for (const name of wb.SheetNames) {
    if (LOOKUP_SHEETS.test(name) || SET_ASIDE.test(name)) continue;
    if (!main.has(name)) {
      console.log(`${path.basename(file)} › ${name}: not a main sheet — not loaded`);
      continue;
    }
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
    const at = grid.findIndex((r) => r.some((c) => squeeze(c).startsWith('serial_no')));
    if (at < 0) continue;
    const fields = fieldsOf(grid[at]);
    const rows = [];
    for (const r of grid.slice(at + 1)) {
      const s = serial(r[fields.indexOf('sort_key')]);
      if (!s) continue;
      const doc = { ...s };
      fields.forEach((f, i) => {
        if (!f || f === 'sort_key' || YEARLY.has(f)) return;
        const v = cell(r[i]);
        if (v != null) doc[f] = v;
      });
      if (!doc.title && !doc.name) continue;
      const province = provinceOfRow(doc.province, name);
      if (province != null && province !== '') doc.province = province;
      rows.push(doc);
    }
    sheets.push({ name, rows, unmapped: grid[at].filter((h, i) => squeeze(h) && !fields[i]).map((h) => squeeze(h).slice(0, 40)) });
  }
  return sheets;
}

async function main() {
  if (!(YEAR >= 2027 && YEAR <= 2100)) {
    console.error('Give --year (2027 or later): earlier years keep the shared register.');
    process.exit(1);
  }
  const files =fs.readdirSync(DIR, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? fs.readdirSync(path.join(DIR, d.name)).map((f) => path.join(DIR, d.name, f)) : [path.join(DIR, d.name)]
  ).filter((f) => /_RAW\.xlsx$/i.test(f) && !/^~\$/.test(path.basename(f)))
    // The provinces' own universes first, then the healthcare, chemical,
    // importer and TSD/TRC ones (Z_…): the id_no order is the screens' order.
    .sort((a, b) => Number(/^Z_/i.test(path.basename(a))) - Number(/^Z_/i.test(path.basename(b))) || path.basename(a).localeCompare(path.basename(b)));
  if (!files.length) {
    console.error(`No *_RAW.xlsx workbooks under ${DIR}.`);
    process.exit(1);
  }

  const docs = [];
  const seen = new Map();
  const fill = {};
  for (const file of files) {
    for (const sheet of readWorkbook(file)) {
      console.log(`${path.basename(file)} › ${sheet.name}: ${sheet.rows.length} rows${sheet.unmapped.length ? `; not loaded: ${sheet.unmapped.join(', ')}` : ''}`);
      for (const d of sheet.rows) {
        if (seen.has(d.sort_key)) {
          console.log(`  repeated serial ${d.sort_key} (also in ${seen.get(d.sort_key)}) — kept the first`);
          continue;
        }
        seen.set(d.sort_key, `${path.basename(file)} › ${sheet.name}`);
        for (const k of Object.keys(d)) fill[k] = (fill[k] || 0) + 1;
        docs.push(d);
      }
    }
  }
  docs.forEach((d, i) => { d.id_no = i + 1; d.year = YEAR; });
  console.log(`\n${docs.length} records for ${YEAR}.`);
  console.log('Fields filled:', Object.entries(fill).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
  const byProvince = docs.reduce((m, d) => ((m[d.province || '(none)'] = (m[d.province || '(none)'] || 0) + 1), m), {});
  console.log('By province:', JSON.stringify(byProvince));

  if (!WRITE) {
    console.log(`\nDry run: nothing written. Add --write to load ${TARGET} and mark the ${YEAR} container.`);
    return;
  }

  const { client } = await connectToMongo();
  try {
    const db = getDb();
    const container = await db.collection('year-containers').findOne({ year: YEAR });
    if (!container) throw new Error(`There is no ${YEAR} container.`);
    // Loaded beside the register, then put in its place at once: the year's
    // screens never see it empty or half loaded.
    const staging = db.collection(`${TARGET}-loading`);
    await staging.drop().catch(() => null);
    for (let i = 0; i < docs.length; i += 1000) await staging.insertMany(docs.slice(i, i + 1000), { ordered: true });
    const count = await staging.countDocuments();
    if (count !== docs.length) throw new Error(`Loaded ${count} of ${docs.length}; the register was not replaced.`);
    for (const key of [{ sort_key: 1 }, { id_no: 1 }, { province: 1 }, { ecc_cnc: 1 }, { province: 1, sort_key: 1 }]) await staging.createIndex(key);
    await staging.rename(TARGET, { dropTarget: true });
    await db.collection('year-containers').updateOne({ year: YEAR }, { $set: { register: TARGET, registerLoadedAt: new Date(), registerSource: files.map((f) => path.basename(f)) } });
    console.log(`\nLoaded ${count} records into ${TARGET}; the ${YEAR} container now reads it.`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { fieldsOf, serial, cell, provinceOf, provinceOfRow, readWorkbook };
