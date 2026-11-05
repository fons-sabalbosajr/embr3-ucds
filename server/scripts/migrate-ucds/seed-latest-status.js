#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const path = require('path');
const { connectToMongo, getDb, client } = require('../../config/db');
const { readWorkbook, workbooksIn } = require('./import-year-register');

// ---------------------------------------------------------------------------
// Fill a loaded register's Latest Status/Recommendations (the Monitoring Plan
// template's column, 5 Nov 2026) from the RAW workbooks it was loaded from: the
// year before's Remarks/Recommendations, which the load leaves out of the new
// year's own column. The importer now does this on every load; this is for the
// register already loaded before it did.
//
//   node scripts/migrate-ucds/seed-latest-status.js --year 2027 --dir "../data/ucd 2027 mtr"
//   … --write          apply it (without it, prints what it would change)
//
// A row is matched on its serial and its firm together, or on its firm alone,
// never on a serial alone: reloads have renumbered serials. A value already on
// a record is kept. Only this field is written: `updated_by` is how a reload
// tells whether a person edited the register since the last load.
// ---------------------------------------------------------------------------

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const YEAR = Number(arg('year'));
const DIR = path.resolve(arg('dir', ''));
const WRITE = process.argv.includes('--write');

const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const firmOf = (d) => `${key(d.name)}|${key(d.title)}`;
const same = (a, b) => key(a) !== '' && key(a) === key(b);
const blank = (v) => v === undefined || v === null || v === '';

/** A database step, tried again a few times: the office link to Atlas drops (it did, 5 Nov 2026). */
async function tried(what, run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt === 20) throw err;
      console.log(`${what}, try ${attempt}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
}

async function main() {
  if (!(YEAR >= 2027)) {
    console.error('Give --year (2027 or later) and --dir (the folder the register was loaded from).');
    process.exit(1);
  }
  // As the importer reads them: its sheets, its order, the first of a repeated serial.
  const seen = new Set();
  const wanted = [];
  for (const file of workbooksIn(DIR)) {
    for (const sheet of readWorkbook(file)) {
      for (const d of sheet.rows) {
        if (seen.has(d.sort_key)) continue;
        seen.add(d.sort_key);
        if (!blank(d.latest_status)) wanted.push({ ...d, unit: path.basename(file) });
      }
    }
  }
  console.log(`\n${seen.size} rows read; ${wanted.length} hold a Remarks/Recommendations.`);

  // Connected only now: reading the workbooks holds Node for minutes, and a
  // connection left open through that is dropped.
  await tried('connecting', () => connectToMongo());
  const col = getDb().collection(`ucds-data-${YEAR}`);
  // In pages, each tried again by itself: the link drops long reads, so a read
  // of the whole register failed again and again (5 Nov 2026).
  const rows = [];
  for (let last = null; ;) {
    const page = await tried(`reading the register after row ${rows.length}`, () =>
      col.find(last ? { _id: { $gt: last } } : {}, { projection: { sort_key: 1, name: 1, title: 1, ecc_cnc: 1, latest_status: 1 } }).sort({ _id: 1 }).limit(2000).toArray()
    );
    if (!page.length) break;
    rows.push(...page);
    last = page[page.length - 1]._id;
  }
  const bySerial = new Map(rows.map((r) => [r.sort_key, r]));
  const byFirm = new Map();
  for (const r of rows) byFirm.set(firmOf(r), [...(byFirm.get(firmOf(r)) || []), r]);

  const ops = [];
  const taken = new Set();
  const counts = { bySerialAndFirm: 0, byFirmAlone: 0, kept: 0, unmatched: 0 };
  const perValue = {};
  const perUnit = {};
  const unmatched = [];
  for (const d of wanted) {
    const here = bySerial.get(d.sort_key);
    const sameFirm = here && (same(here.title, d.title) || same(here.ecc_cnc, d.ecc_cnc));
    const others = byFirm.get(firmOf(d)) || [];
    const target = sameFirm ? here : others.length === 1 ? others[0] : null;
    if (!target || taken.has(String(target._id))) {
      counts.unmatched += 1;
      unmatched.push(`${d.sort_key} ${d.title || d.name} → ${d.latest_status}`);
      continue;
    }
    taken.add(String(target._id));
    if (!blank(target.latest_status)) {
      counts.kept += 1;
      continue;
    }
    counts[sameFirm ? 'bySerialAndFirm' : 'byFirmAlone'] += 1;
    perValue[d.latest_status] = (perValue[d.latest_status] || 0) + 1;
    perUnit[d.unit] = (perUnit[d.unit] || 0) + 1;
    ops.push({ updateOne: { filter: { _id: target._id, latest_status: { $in: [null, ''] } }, update: { $set: { latest_status: d.latest_status } } } });
  }

  console.log(`Register: ${rows.length} rows.`);
  console.log('Matches:', counts);
  console.log('By workbook:', perUnit);
  console.log('By value:', perValue);
  if (unmatched.length) console.log(`Not matched (left blank):\n  ${unmatched.slice(0, 40).join('\n  ')}${unmatched.length > 40 ? `\n  … and ${unmatched.length - 40} more` : ''}`);

  if (!WRITE) {
    console.log(`\nDry run: nothing written. Add --write to fill ${ops.length} rows.`);
    return;
  }
  let modified = 0;
  for (let i = 0; i < ops.length; i += 500) {
    // Safe to repeat: each only fills a blank.
    const res = await tried(`writing from row ${i + 1}`, () => col.bulkWrite(ops.slice(i, i + 500), { ordered: false }));
    modified += res.modifiedCount;
  }
  const filled = await tried('counting', () => col.countDocuments({ latest_status: { $nin: [null, ''] } }));
  console.log(`\nWrote ${modified} of ${ops.length}. The register now has ${filled} rows with a Latest Status.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
