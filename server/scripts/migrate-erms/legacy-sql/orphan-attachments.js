#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { clean, parseDate } = require('../lib/source');

// ---------------------------------------------------------------------------
// The Records attachments the desktop system numbered but never linked.
//
// Its attachment register (tb_maindata_attachment_IDs) runs Att-00001 to
// Att-00098. 37 of those reached tb_maindata as "FSN-0000206 Att-00012" and
// were migrated as attachments. The other 61 carry only a file name, a date
// and who attached them — no record, no path. Three of them were filed as
// records of their own and are already in erms-records; the rest are here.
//
// Two steps, because which record an attachment belongs to is the Records
// Unit's call, not a guess:
//
//   1. node scripts/migrate-erms/legacy-sql/orphan-attachments.js
//        Reads data/erms_sql/export/records (no database) and writes
//        reports/erms-orphan-attachments.csv: each attachment with up to
//        three records whose title, proponent and place match its file name.
//        The Records Unit fills the "Confirmed parent" column.
//
//   2. node scripts/migrate-erms/legacy-sql/orphan-attachments.js --apply [--write]
//        Reads the confirmed column back and files each attachment against
//        its record under its own desktop number (FSN-0012345 Att-00047).
//        Without --write it only says what it would do. Re-runnable: an
//        attachment already on file is skipped. The scan's location is not
//        known, so each is filed without one — "File a scan" on the
//        attachment, or the share browser, puts it back.
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const EXPORT = path.join(ROOT, 'data', 'erms_sql', 'export', 'records');
const REPORT = path.join(ROOT, 'reports', 'erms-orphan-attachments.csv');
const CANDIDATES = 3;

const readJsonl = (file) =>
  fs.readFileSync(path.join(EXPORT, file), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const norm = (s) => String(s || '').trim().toLowerCase();

// Words that say what kind of document it is, not whose.
const NOISE = new Set([
  'pdf', 'ecc', 'cnc', 'original', 'amended', 'amendment', 'pages', 'from', 'volume', 'vol', 'the', 'and', 'of', 'to',
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'phils', 'philippines', 'brgy', 'bo', 'sitio', 'ne',
]);

function tokens(s) {
  return new Set(
    norm(s)
      .replace(/\.pdf$/, '')
      // ECC numbers and dates: ECC-3987'24A, ECC-OL-0198'24A, 021621
      .replace(/\becc[-\w]*'\d+\w*/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t))
  );
}

const recordTokens = (r) => tokens([r.Project_Title, r.Proponent_Name, r.Barangay, r.City].join(' '));

/**
 * How much of the file name the record accounts for, 0..1, each word
 * weighted by how rare it is among the records — "Jarkim's" says far more
 * than "gasoline" or "farm".
 */
function score(fileTokens, recTokens, weight) {
  let total = 0;
  let hit = 0;
  for (const t of fileTokens) {
    const w = weight(t);
    total += w;
    if (recTokens.has(t)) hit += w;
  }
  return total ? hit / total : 0;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

/** The register entries no record carries, less those filed as records of their own. */
function orphans() {
  const register = readJsonl('tb_maindata_attachment_IDs.jsonl');
  const main = readJsonl('tb_maindata.jsonl');
  const linked = new Set(main.map((r) => (/Att-\d+/.exec(r.Serial_No) || [])[0]).filter(Boolean));
  const asRecord = new Map(main.filter((r) => !/Att-/.test(r.Serial_No)).map((r) => [norm(r.Attach_Files), r.Serial_No]));
  return {
    list: register.filter((a) => !linked.has(a.Attachment_ID)).map((a) => ({ ...a, filedAs: asRecord.get(norm(a.Attach_Files)) || null })),
    records: main.filter((r) => /^FSN-\d+$/.test(clean(r.Serial_No) || '')),
  };
}

function report() {
  const { list, records } = orphans();
  const header = ['Attachment ID', 'File name', 'Attached', 'Attached by', 'Already filed as'];
  for (let i = 1; i <= CANDIDATES; i += 1) header.push(`Candidate ${i}`, `Candidate ${i} project`, `Candidate ${i} place`, `Candidate ${i} match`);
  header.push('Confirmed parent');

  const indexed = records.map((r) => ({ r, t: recordTokens(r) }));
  const df = new Map();
  for (const { t } of indexed) for (const w of t) df.set(w, (df.get(w) || 0) + 1);
  const weight = (w) => Math.log((indexed.length + 1) / ((df.get(w) || 0) + 1));

  const lines = [header.map(csvCell).join(',')];
  let suggested = 0;
  for (const a of list) {
    const row = [a.Attachment_ID, a.Attach_Files, a.Attached_Date, a.Attached_by, a.filedAs || ''];
    const fileTokens = tokens(a.Attach_Files);
    const best = a.filedAs
      ? []
      : indexed
          .map(({ r, t }) => ({ r, s: score(fileTokens, t, weight) }))
          .filter((x) => x.s >= 0.5)
          .sort((x, y) => y.s - x.s)
          .slice(0, CANDIDATES);
    if (best.length) suggested += 1;
    for (let i = 0; i < CANDIDATES; i += 1) {
      const b = best[i];
      row.push(b ? b.r.Serial_No : '', b ? clean(b.r.Project_Title) : '', b ? [clean(b.r.City), clean(b.r.Province)].filter(Boolean).join(', ') : '', b ? `${Math.round(b.s * 100)}%` : '');
    }
    row.push('');
    lines.push(row.map(csvCell).join(','));
  }
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${lines.join('\r\n')}\r\n`, 'utf8');
  console.log(`${list.length} attachments not linked to a record.`);
  console.log(`  ${list.filter((a) => a.filedAs).length} already filed as records of their own`);
  console.log(`  ${suggested} with at least one suggested record`);
  console.log(`Written: ${path.relative(ROOT, REPORT)} — fill "Confirmed parent", then run with --apply.`);
}

async function apply(write) {
  const { connectToMongo, getDb } = require('../../../config/db');
  const [header, ...rows] = parseCsv(fs.readFileSync(REPORT, 'utf8'));
  const col = (name) => header.indexOf(name);
  const [iId, iFile, iAt, iBy, iParent] = ['Attachment ID', 'File name', 'Attached', 'Attached by', 'Confirmed parent'].map(col);
  if ([iId, iFile, iParent].some((i) => i < 0)) throw new Error(`${path.relative(ROOT, REPORT)} is missing a column; regenerate it.`);

  await connectToMongo();
  const records = getDb().collection('erms-records');
  const tally = { filed: 0, skipped: 0, refused: 0 };
  for (const r of rows) {
    const attachmentNo = clean(r[iId]);
    const parentSerial = clean(r[iParent]);
    if (!parentSerial) continue;
    if (!/^Att-\d{5}$/.test(attachmentNo || '') || !/^FSN-\d{7}$/.test(parentSerial)) {
      console.log(`  refused  ${attachmentNo} → ${parentSerial}: not an attachment ID and a record serial`);
      tally.refused += 1;
      continue;
    }
    const already = await records.findOne({ attachmentNo }, { projection: { serialNo: 1 } });
    if (already) {
      console.log(`  skipped  ${attachmentNo}: already on file as ${already.serialNo}`);
      tally.skipped += 1;
      continue;
    }
    const parent = await records.findOne({ serialNo: parentSerial });
    if (!parent || parent.isAttachment) {
      console.log(`  refused  ${attachmentNo} → ${parentSerial}: ${parent ? 'that is itself an attachment' : 'no such record'}`);
      tally.refused += 1;
      continue;
    }
    const attached = parseDate(r[iAt]);
    const doc = {
      serialNo: `${parent.serialNo} ${attachmentNo}`,
      parentSerialNo: parent.serialNo,
      attachmentNo,
      isAttachment: true,
      proponentName: parent.proponentName,
      projectTitle: parent.projectTitle,
      remarks: null,
      permit: { type: 'other', label: null, typeRaw: null, number: parent.permit?.number || null, processSource: null, dateApproved: null, dateApprovedRaw: null, dateAmended: null, dateAmendedRaw: null },
      project: { ...(parent.project || {}) },
      location: { ...(parent.location || {}) },
      document: {
        fileName: clean(r[iFile]),
        filePath: null,
        sharePath: null,
        fileClass: parent.document?.fileClass || 'Public',
        uploadedAt: attached.value,
        uploadedBy: clean(r[iBy]),
      },
      ucdsRef: parent.ucdsRef || null,
      legacyId: attachmentNo,
      legacySource: 'erms-attachment-register',
      migratedAt: new Date(),
      dataQuality: { clean: false, issues: [{ field: 'File_Path', problem: 'not in the desktop register; scan to be located', value: null }] },
    };
    console.log(`  ${write ? 'filed  ' : 'would file'} ${doc.serialNo}  ${doc.document.fileName}`);
    if (write) await records.insertOne(doc);
    tally.filed += 1;
  }
  console.log(`${write ? 'Filed' : 'Would file'} ${tally.filed}; skipped ${tally.skipped}; refused ${tally.refused}.${write ? '' : ' Add --write to file them.'}`);
  process.exit(0);
}

if (process.argv.includes('--apply')) {
  apply(process.argv.includes('--write')).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  report();
}
