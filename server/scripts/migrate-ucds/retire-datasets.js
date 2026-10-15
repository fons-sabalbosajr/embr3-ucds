#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { connectToMongo, getDb } = require('../../config/db');

// ---------------------------------------------------------------------------
// Retire the UCDS datasets other than the Monitoring Plan and the Survey
// (15 Oct 2026). For each imported dataset that is neither:
//
//   1. backups/ucd/<year>/<key>.xlsx — the rows, one sheet per sheet, for people;
//   2. backups/ucd/<year>/<key>.json — the registry entry and every row as
//      stored, for an exact restore (scripts/migrate-ucds/restore-datasets.js);
//   3. both checked to hold every row; only then are the rows and the
//      registry entry deleted.
//
// `--dry` writes the backups and checks them, deletes nothing.
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'backups', 'ucd');
const KEEP = /monitoring-plan|survey/i;

(async () => {
  const dry = process.argv.includes('--dry');
  const { client } = await connectToMongo();
  const db = getDb();
  const registry = db.collection('ucds-dataset-registry');
  const rows = db.collection('ucds-dataset-rows');
  const entries = (await registry.find({}).toArray()).filter((r) => !KEEP.test(r.key));
  let total = 0;
  for (const entry of entries) {
    const docs = await rows.find({ year: entry.year, dataset: entry.key }).sort({ sheet: 1, n: 1 }).toArray();
    const dir = path.join(OUT, String(entry.year));
    fs.mkdirSync(dir, { recursive: true });
    // People's copy: one sheet per sheet, the columns as imported.
    const wb = XLSX.utils.book_new();
    const bySheet = new Map();
    for (const d of docs) {
      const s = d.sheet || 'Sheet1';
      if (!bySheet.has(s)) bySheet.set(s, []);
      bySheet.get(s).push(d.data || {});
    }
    let i = 0;
    for (const [name, data] of bySheet) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), `${String(name).slice(0, 28) || 'Sheet'}${i++ ? i : ''}`.slice(0, 31));
    if (!bySheet.size) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(no rows)']]), 'Sheet1');
    const xlsxPath = path.join(dir, `${entry.key}.xlsx`);
    XLSX.writeFile(wb, xlsxPath);
    // The exact copy.
    const jsonPath = path.join(dir, `${entry.key}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ retiredAt: new Date(), registry: entry, rows: docs }, null, 0));
    // Checked before anything is deleted.
    const back = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const sheetRows = XLSX.readFile(xlsxPath).SheetNames.reduce((n, s) => n + XLSX.utils.sheet_to_json(XLSX.readFile(xlsxPath).Sheets[s]).length, 0);
    const ok = back.rows.length === docs.length && (docs.length === 0 || sheetRows === docs.length);
    console.log(`${entry.year} ${entry.key}: ${docs.length} rows → ${path.relative(ROOT, xlsxPath)} (${sheetRows} rows), .json (${back.rows.length}) ${ok ? 'checked' : 'MISMATCH'}`);
    if (!ok) {
      console.error('Backup does not hold every row; nothing deleted for this dataset.');
      continue;
    }
    total += docs.length;
    if (!dry) {
      const del = await rows.deleteMany({ year: entry.year, dataset: entry.key });
      await registry.deleteOne({ _id: entry._id });
      console.log(`   deleted ${del.deletedCount} rows and the registry entry`);
    }
  }
  console.log(`${dry ? '[dry run] would delete' : 'deleted'} ${total} rows in ${entries.length} datasets; kept: ${(await registry.find({}).toArray()).filter((r) => KEEP.test(r.key)).map((r) => `${r.year} ${r.key}`).join(', ') || 'none imported'}`);
  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
