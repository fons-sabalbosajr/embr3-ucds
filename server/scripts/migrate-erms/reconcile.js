/**
 * Phase 6, step 3: verify the staged import against the source and against the
 * UCDS register.
 *
 *   node scripts/migrate-erms/reconcile.js
 *   node scripts/migrate-erms/reconcile.js --db=universe-db-staging
 *   node scripts/migrate-erms/reconcile.js --write-refs   # persist ucdsRef
 *
 * Reads the register from production (universe-db) regardless of the staging
 * target, because that is what the link has to resolve against.
 *
 * Exits non-zero if a gate fails, so this can front a cutover.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { readRows, sourcePath } = require('./lib/source');
const { buildIndex, findMatch } = require('../../modules/ucds/services/permitMatch');

const dbFlag = process.argv.find((a) => a.startsWith('--db='));
const DB_NAME = dbFlag ? dbFlag.slice('--db='.length) : 'universe-db-staging';
const WRITE_REFS = process.argv.includes('--write-refs');

const log = (...a) => console.log(...a);
const pad = (s, n) => String(s).padEnd(n);
const pct = (n, t) => (t ? `${((n / t) * 100).toFixed(1)}%` : '—');

const results = [];
function gate(label, pass, detail) {
  results.push({ label, pass, detail });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${pad(label, 52)}${detail}`);
}

async function main() {
  const { rows } = readRows(sourcePath());
  const client = new MongoClient(process.env.MONGO_URI, { ssl: true, serverSelectionTimeoutMS: 30000 });
  await client.connect();

  const staged = client.db(DB_NAME).collection('erms-records');
  const idMap = client.db(DB_NAME).collection('erms-id-map');
  const register = client.db('universe-db').collection('ucds-data');

  log(`\n${'='.repeat(76)}`);
  log(`RECONCILIATION — ${DB_NAME}`);
  log('='.repeat(76));

  // --- counts and identity -------------------------------------------------
  log('\nCOUNTS AND IDENTITY');
  const sourceCount = rows.length;
  const stagedCount = await staged.countDocuments({});
  gate('source count equals staged count', sourceCount === stagedCount, `${sourceCount} vs ${stagedCount}`);

  const distinctSerials = (await staged.distinct('serialNo')).length;
  gate('serialNo unique across staged records', distinctSerials === stagedCount, `${distinctSerials} distinct`);

  const missingSerial = await staged.countDocuments({ serialNo: { $in: [null, ''] } });
  gate('every record has a serialNo', missingSerial === 0, `${missingSerial} missing`);

  const mapCount = await idMap.countDocuments({ collection: 'erms-records' });
  gate('id-map has one row per record', mapCount === stagedCount, `${mapCount} rows`);

  const missingLegacy = await staged.countDocuments({ legacyId: { $in: [null, ''] } });
  gate('legacy id preserved on every record', missingLegacy === 0, `${missingLegacy} missing`);

  // --- field integrity -----------------------------------------------------
  log('\nFIELD INTEGRITY');
  const unmappedProvince = await staged.countDocuments({ 'location.province': null });
  gate('every province mapped to a canonical key', unmappedProvince === 0, `${unmappedProvince} unmapped`);

  const unknownPermit = await staged.countDocuments({ 'permit.type': 'other' });
  gate('every permit type recognised', unknownPermit === 0, `${unknownPermit} unrecognised`);

  const noPath = await staged.countDocuments({ 'document.sharePath': null });
  gate('every document has a share-relative path', noPath === 0, `${noPath} without one`);

  const noUploadDate = await staged.countDocuments({ 'document.uploadedAt': null });
  gate('every document has an upload date', noUploadDate === 0, `${noUploadDate} without one`);

  const flagged = await staged.countDocuments({ 'dataQuality.clean': false });
  log(`  INFO  ${pad('records flagged for review', 52)}${flagged} (${pct(flagged, stagedCount)})`);

  // --- attachments ---------------------------------------------------------
  log('\nATTACHMENTS');
  const attachments = await staged.find({ isAttachment: true }).toArray();
  const parents = [...new Set(attachments.map((a) => a.parentSerialNo))];
  const foundParents = await staged.countDocuments({ serialNo: { $in: parents } });
  gate(
    'every attachment resolves to a parent record',
    foundParents === parents.length,
    `${foundParents}/${parents.length} parents present`
  );

  // --- the UCDS join -------------------------------------------------------
  log('\nCROSS-DOMAIN LINK  (erms permit number -> ucds-data ecc_cnc / haz_id)');
  const registerRows = await register
    .find(
      { $or: [{ ecc_cnc: { $nin: [null, ''] } }, { haz_id: { $nin: [null, ''] } }] },
      { projection: { sort_key: 1, name: 1, title: 1, province: 1, ecc_cnc: 1, haz_id: 1 } }
    )
    .toArray();

  const index = buildIndex(registerRows);
  log(`  register entries with a permit number : ${registerRows.length}`);
  log(`  indexed keys: ${index.exact.size} exact, ${index.loose.size} loose, ${index.digits.size} digits-only`);

  const ermsRecords = await staged
    .find({}, { projection: { serialNo: 1, permit: 1, 'location.province': 1 } })
    .toArray();

  const byStrategy = new Map();
  const byType = new Map();
  const updates = [];
  let matched = 0;

  for (const rec of ermsRecords) {
    const type = rec.permit?.type || 'unknown';
    const stats = byType.get(type) || { total: 0, matched: 0 };
    stats.total++;

    const hit = findMatch(index, rec.permit?.number);
    if (hit) {
      matched++;
      stats.matched++;
      byStrategy.set(hit.strategy, (byStrategy.get(hit.strategy) || 0) + 1);
      updates.push({
        updateOne: {
          filter: { _id: rec._id },
          update: {
            $set: {
              ucdsRef: {
                sortKey: hit.row.sort_key,
                nameSnapshot: hit.row.name || hit.row.title || null,
                provinceKey: rec.location?.province || null,
                matchedOn: hit.strategy,
                capturedAt: new Date(),
                unmatched: false,
              },
            },
          },
        },
      });
    }
    byType.set(type, stats);
  }

  log(`\n  matched  : ${matched} of ${ermsRecords.length} (${pct(matched, ermsRecords.length)})`);
  log(`  unmatched: ${ermsRecords.length - matched}`);
  log('\n  by strategy:');
  for (const [s, n] of [...byStrategy.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${pad(s, 10)}${pad(n, 8)}${pct(n, matched)} of matches`);
  }
  log('\n  by permit type:');
  for (const [t, s] of [...byType.entries()].sort((a, b) => b.total - a.total)) {
    log(`    ${pad(t, 16)}${String(s.matched).padStart(6)}/${pad(s.total, 8)}${pct(s.matched, s.total)}`);
  }
  log('\n  INFO  an unmatched permit is a finding for Planning, not a migration');
  log('        failure — the two systems were maintained independently, and the');
  log('        register simply does not cover every record ERMS holds.');

  if (WRITE_REFS && updates.length) {
    for (let i = 0; i < updates.length; i += 1000) {
      await staged.bulkWrite(updates.slice(i, i + 1000), { ordered: false });
    }
    log(`\n  wrote ucdsRef onto ${updates.length} records`);
  } else if (updates.length) {
    log(`\n  (${updates.length} refs computed but not written — pass --write-refs)`);
  }

  // --- findings for Planning and Records ----------------------------------
  const REPORT_DIR = path.resolve(__dirname, '../../../reports');
  if (process.argv.includes('--report')) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const flaggedDocs = await staged.find({ 'dataQuality.clean': false }).toArray();
    const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const qualityCsv = [
      'serialNo,sourceRow,field,problem,value,proponentName,projectTitle',
      ...flaggedDocs.flatMap((d) =>
        d.dataQuality.issues.map((i) =>
          [d.serialNo, d.sourceRow, i.field, i.problem, i.value, d.proponentName, d.projectTitle]
            .map(csvCell)
            .join(',')
        )
      ),
    ].join('\n');
    fs.writeFileSync(path.join(REPORT_DIR, 'erms-data-quality.csv'), qualityCsv, 'utf8');

    const unmatchedDocs = await staged
      .find({ ucdsRef: null }, { projection: { serialNo: 1, permit: 1, proponentName: 1, projectTitle: 1, location: 1 } })
      .toArray();
    const unmatchedCsv = [
      'serialNo,permitType,permitNumber,province,proponentName,projectTitle',
      ...unmatchedDocs.map((d) =>
        [d.serialNo, d.permit?.type, d.permit?.number, d.location?.province, d.proponentName, d.projectTitle]
          .map(csvCell)
          .join(',')
      ),
    ].join('\n');
    fs.writeFileSync(path.join(REPORT_DIR, 'erms-unmatched-permits.csv'), unmatchedCsv, 'utf8');

    log(`\n  reports written to ${REPORT_DIR}`);
    log(`    erms-data-quality.csv      ${flaggedDocs.length} records needing a decision`);
    log(`    erms-unmatched-permits.csv ${unmatchedDocs.length} records with no register entry`);
    log('  (--report reflects whatever ucdsRef currently holds; run --write-refs first)');
  }

  // --- summary -------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  log(`\n${'='.repeat(76)}`);
  log(`${results.length - failed.length}/${results.length} gates passed`);
  if (failed.length) {
    log('\nFAILED GATES:');
    for (const f of failed) log(`  - ${f.label}: ${f.detail}`);
  }
  log('='.repeat(76));

  await client.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.code === 'SOURCE_MISSING' ? e.message : e);
  process.exit(1);
});
