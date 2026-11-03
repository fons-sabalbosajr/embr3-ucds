/**
 * Phase 10: compare a fresh desktop-ERMS export against erms-records.
 *
 *   node scripts/migrate-erms/divergence.js --file=data/export-2026-09-15.csv
 *   node scripts/migrate-erms/divergence.js --file=... --report
 *
 * During parallel operation the desktop application and the web module can both
 * hold records. If the desktop app is genuinely read-only, a fresh export
 * should differ from the database only by what the web module has added. This
 * says whether that is true.
 *
 * Three findings, in increasing order of seriousness:
 *
 *   web-only        expected — records created in the web module
 *   source-only     a record exists in the export but not the database. Either
 *                   the export predates an import, or somebody wrote to the
 *                   desktop app after it was supposed to be frozen.
 *   conflicting     the same serial exists in both with different values. Two
 *                   systems have been edited independently and someone has to
 *                   decide which is right.
 *
 * Exits non-zero when anything but web-only is found, so it can gate a cutover.
 * Reads only; it never writes to either side.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { readRows, sourcePath } = require('./lib/source');
const { transformRow } = require('./lib/transform');
const { classify } = require('./lib/compare');

const dbFlag = process.argv.find((a) => a.startsWith('--db='));
const DB_NAME = dbFlag ? dbFlag.slice('--db='.length) : 'universe-db';
const WRITE_REPORT = process.argv.includes('--report');

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s === undefined ? '' : s).padEnd(n);


async function main() {
  const { file, rows } = readRows(sourcePath());
  const client = new MongoClient(process.env.MONGO_URI, { ssl: true, serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const records = client.db(DB_NAME).collection('erms-records');

  log(`\n${'='.repeat(78)}`);
  log('DIVERGENCE CHECK');
  log('='.repeat(78));
  log(`export   : ${file}`);
  log(`database : ${DB_NAME}.erms-records`);
  log('');

  const fromSource = new Map();
  for (let i = 0; i < rows.length; i++) {
    const doc = transformRow(rows[i], i);
    if (doc.serialNo) fromSource.set(doc.serialNo, doc);
  }

  const dbDocs = await records.find({}).toArray();
  const setAsideSerials = new Set(
    (await client.db(DB_NAME).collection('erms-set-aside').find({ scope: 'records' }, { projection: { serialNo: 1 } }).toArray()).map((d) => d.serialNo)
  );
  const { webOnly, sourceOnly, conflicting, setAside, clean } = classify(fromSource, dbDocs, { setAside: setAsideSerials });

  log(`${pad('export records', 26)}${rows.length}`);
  log(`${pad('database records', 26)}${dbDocs.length}`);
  log(`${pad('set aside (duplicates)', 26)}${setAside.length}${setAside.length ? ' — filed twice in the desktop, kept once here (expected)' : ''}`);
  log('');
  log(`${pad('web-only (expected)', 26)}${webOnly.length}`);
  log(`${pad('source-only', 26)}${sourceOnly.length}`);
  log(`${pad('conflicting', 26)}${conflicting.length}`);

  if (sourceOnly.length) {
    log(`\n${'-'.repeat(78)}`);
    log('SOURCE-ONLY — in one side but not the other');
    log('-'.repeat(78));
    log('An export taken after the desktop app was frozen should have none of');
    log('these. Their presence means either the export is stale, or the desktop');
    log('app was written to after it was supposed to be read-only.');
    for (const r of sourceOnly.slice(0, 25)) {
      log(`  ${pad(r.serialNo, 26)}${r.side}`);
    }
    if (sourceOnly.length > 25) log(`  … and ${sourceOnly.length - 25} more`);
  }

  if (conflicting.length) {
    log(`\n${'-'.repeat(78)}`);
    log('CONFLICTING — the same record, different values');
    log('-'.repeat(78));
    log('Both systems have been edited independently. Someone has to decide');
    log('which side is right; this tool will not choose.');
    for (const c of conflicting.slice(0, 15)) {
      log(`\n  ${c.serialNo}`);
      for (const ch of c.changes.slice(0, 6)) {
        log(`    ${pad(ch.field, 24)}export=${JSON.stringify(ch.source)}`);
        log(`    ${pad('', 24)}db    =${JSON.stringify(ch.database)}`);
      }
      if (c.changes.length > 6) log(`    … and ${c.changes.length - 6} more fields`);
    }
    if (conflicting.length > 15) log(`\n  … and ${conflicting.length - 15} more records`);
  }

  if (WRITE_REPORT) {
    const dir = path.resolve(__dirname, '../../../reports');
    fs.mkdirSync(dir, { recursive: true });
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    fs.writeFileSync(
      path.join(dir, 'erms-divergence.csv'),
      [
        'serialNo,finding,field,exportValue,databaseValue',
        ...sourceOnly.map((r) => [r.serialNo, r.side, '', '', ''].map(cell).join(',')),
        ...conflicting.flatMap((c) =>
          c.changes.map((ch) =>
            [c.serialNo, 'conflicting', ch.field, ch.source, ch.database].map(cell).join(',')
          )
        ),
      ].join('\n'),
      'utf8'
    );
    log(`\nreport written to reports/erms-divergence.csv`);
  }

  log(`\n${'='.repeat(78)}`);
  log(
    clean
      ? `No divergence. ${webOnly.length} record(s) exist only in the web module, which is expected.`
      : `DIVERGENCE FOUND: ${sourceOnly.length} source-only, ${conflicting.length} conflicting.`
  );
  log('='.repeat(78));

  await client.close();
  process.exit(clean ? 0 : 1);
}

main().catch((e) => {
  console.error(e.code === 'SOURCE_MISSING' ? e.message : e);
  process.exit(2);
});
