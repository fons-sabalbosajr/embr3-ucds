/**
 * Phase 6, step 1: profile the ERMS extract.
 *
 *   node scripts/migrate-erms/profile.js [--file=<path>]
 *
 * Reads nothing from and writes nothing to the database. The point is to learn
 * what is actually in the file before designing the transform — the source has
 * no schema, so field shapes have to be measured rather than assumed.
 */

require('dotenv').config();
const { COLUMNS, readRows, clean, parseDate, parseNumber } = require('./lib/source');
const { PROVINCES } = require('../../services/provinces');

const log = (...a) => console.log(...a);
const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;
const pad = (s, n) => String(s).padEnd(n);

function topValues(values, limit = 12) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function main() {
  const { file, rows, physicalLines } = readRows();
  const total = rows.length;

  log('='.repeat(78));
  log('ERMS EXTRACT PROFILE');
  log('='.repeat(78));
  log(`file            : ${file}`);
  log(`physical lines  : ${physicalLines}`);
  log(`parsed records  : ${total}`);
  log(`embedded newline: ${physicalLines - total - 1} lines absorbed into quoted fields`);
  log('');

  // --- column fill rates ---------------------------------------------------
  log('-'.repeat(78));
  log('COLUMN FILL RATES  (after normalising "n/a" and placeholders to null)');
  log('-'.repeat(78));
  log(`${pad('column', 24)}${pad('filled', 10)}${pad('empty', 10)}distinct`);
  const filled = {};
  for (const col of COLUMNS) {
    const values = rows.map((r) => clean(r[col]));
    const nonNull = values.filter((v) => v !== null);
    filled[col] = nonNull;
    const distinct = new Set(nonNull).size;
    log(`${pad(col, 24)}${pad(pct(nonNull.length, total), 10)}${pad(pct(total - nonNull.length, total), 10)}${distinct}`);
  }

  // --- Serial_No: the business key ----------------------------------------
  log('');
  log('-'.repeat(78));
  log('SERIAL_NO  (candidate business key)');
  log('-'.repeat(78));
  const serials = rows.map((r) => clean(r.Serial_No));
  const missing = serials.filter((s) => !s).length;
  const seen = new Map();
  for (const s of serials) if (s) seen.set(s, (seen.get(s) || 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  log(`missing        : ${missing}`);
  log(`distinct       : ${seen.size}`);
  log(`duplicated     : ${dupes.length}`);
  if (dupes.length) {
    log('  first 10 duplicates:');
    for (const [s, n] of dupes.slice(0, 10)) log(`    ${s} x${n}`);
  }
  const malformed = serials.filter((s) => s && !/^FSN-\d+$/.test(s));
  log(`not FSN-\\d+    : ${malformed.length}${malformed.length ? ` e.g. ${malformed.slice(0, 5).join(', ')}` : ''}`);

  // --- permit types --------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('PERMIT_TYPE');
  log('-'.repeat(78));
  for (const [v, n] of topValues(filled.Permit_Type)) {
    log(`${pad(n, 8)}${pct(n, total).padEnd(9)}${v.slice(0, 58)}`);
  }

  log('');
  log('PERMIT_PROCESS_SOURCE');
  for (const [v, n] of topValues(filled.Permit_Process_Source, 8)) log(`${pad(n, 8)}${v.slice(0, 58)}`);

  log('');
  log('FILE_CLASS');
  for (const [v, n] of topValues(filled.File_Class, 8)) log(`${pad(n, 8)}${v.slice(0, 58)}`);

  // --- dates ---------------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('DATE PARSING');
  log('-'.repeat(78));
  for (const col of ['Date_Approved', 'Date_Amended', 'Date_Uploaded']) {
    const parsed = rows.map((r) => parseDate(r[col]));
    const present = parsed.filter((p) => p.raw !== null);
    const failed = present.filter((p) => !p.ok);
    log(`${pad(col, 16)}present ${pad(present.length, 8)}parsed ${pad(present.length - failed.length, 8)}FAILED ${failed.length}`);
    if (failed.length) {
      const samples = [...new Set(failed.map((f) => f.raw))].slice(0, 8);
      for (const s of samples) log(`    unparseable: ${JSON.stringify(s)}`);
    }
    const years = present.filter((p) => p.ok).map((p) => p.value.getFullYear());
    if (years.length) log(`    year range: ${Math.min(...years)}–${Math.max(...years)}`);
  }

  // --- provinces -----------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('PROVINCE  (must map onto the UCDS canonical keys)');
  log('-'.repeat(78));
  const canonical = new Map(PROVINCES.map((p) => [p.value.toLowerCase().replace(/[ _]/g, ''), p.key]));
  const unmapped = [];
  for (const [v, n] of topValues(filled.Province, 30)) {
    const key = canonical.get(String(v).toLowerCase().replace(/[ _]/g, ''));
    log(`${pad(n, 8)}${pad(v.slice(0, 40), 42)}${key || '*** NO MATCH ***'}`);
    if (!key) unmapped.push([v, n]);
  }
  const unmappedTotal = unmapped.reduce((a, [, n]) => a + n, 0);
  log(`\nrecords with an unmappable province: ${unmappedTotal} (${pct(unmappedTotal, total)})`);

  // --- coordinates ---------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('COORDINATES');
  log('-'.repeat(78));
  const lats = rows.map((r) => parseNumber(r.Latitude)).filter((v) => v !== null);
  const lngs = rows.map((r) => parseNumber(r.Longitude)).filter((v) => v !== null);
  log(`latitude  numeric: ${lats.length} (${pct(lats.length, total)})`);
  log(`longitude numeric: ${lngs.length} (${pct(lngs.length, total)})`);
  // Region III sits roughly at 14.5–16.5 N, 119.7–121.5 E.
  const outOfRange = lats.filter((v) => v < 14 || v > 17).length;
  if (lats.length) log(`latitude outside Region III range (14–17): ${outOfRange}`);

  // --- file paths ----------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('FILE_PATH  (NAS references — files are not migrated, only referenced)');
  log('-'.repeat(78));
  const paths = filled.File_Path;
  const prefixes = topValues(paths.map((p) => p.split('\\').slice(0, 4).join('\\')), 8);
  log(`records with a path: ${paths.length} (${pct(paths.length, total)})`);
  log('common roots:');
  for (const [v, n] of prefixes) log(`  ${pad(n, 8)}${v}`);
  const notUnc = paths.filter((p) => !/^[A-Za-z]:\\/.test(p) && !p.startsWith('\\\\'));
  log(`paths that are neither drive-qualified nor UNC: ${notUnc.length}`);
  const pdfs = paths.filter((p) => /\.pdf$/i.test(p)).length;
  log(`paths ending .pdf: ${pdfs} (${pct(pdfs, paths.length || 1)} of those with a path)`);

  // --- the UCDS join -------------------------------------------------------
  log('');
  log('-'.repeat(78));
  log('PERMIT_TYPE_NO  (the proposed join key onto ucds-data.ecc_cnc)');
  log('-'.repeat(78));
  const permits = filled.Permit_Type_No;
  const distinctPermits = new Set(permits);
  log(`present        : ${permits.length} (${pct(permits.length, total)})`);
  log(`distinct       : ${distinctPermits.size}`);
  log(`reused across records: ${permits.length - distinctPermits.size}`);
  log('shapes:');
  const shape = (s) => s.replace(/\d+/g, '#').replace(/[A-Za-z]+/g, 'A');
  for (const [v, n] of topValues(permits.map(shape), 10)) log(`  ${pad(n, 8)}${v}`);

  log('');
  log('='.repeat(78));
  log('Profile only — nothing was written. Next: stage.js');
  log('='.repeat(78));
}

try {
  main();
} catch (e) {
  console.error(e.code === 'SOURCE_MISSING' ? e.message : e);
  process.exit(1);
}
