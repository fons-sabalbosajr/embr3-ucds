// ---------------------------------------------------------------------------
// VERA's serial number check, across the three ERMS units: Records (FSN-…),
// Legal Services and Laboratory (one series per kind of document).
//
// What she looks for, unit by unit:
//
//   duplicate    two documents with the same serial               problem
//   malformed    a serial in no series the unit numbers by
//                (a stray space, a missing prefix, a typed one)     problem
//   behind       the counter that hands out the next serial is
//                below the highest serial on file: the next save
//                would be refused, or worse, collide               problem — VERA fixes it
//   orphan       an attachment ("… Att-00012") whose record is
//                not on file                                         review
//   gaps         numbers skipped in a series (cancelled saves,
//                the desktop system's deletions) — said, not fixed  note
//
// Only "behind" is fixed by VERA: the counter is moved up to the highest
// serial on file, never down, so nothing already filed changes. The rest is
// for the Developer to look at; renaming a serial would break every link,
// paper label and log that names it.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const config = require('../../modules/erms/services/configService');

const COLLECTION = 'vera-serial-checks';
const SEQUENCES = 'erms-sequences';
const UNIT_LABEL = { records: 'Records', legal: 'Legal Services', laboratory: 'Laboratory' };

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ATT = / Att-(\d+)$/;

/** The series a unit numbers by: [{ id, label, prefix, pad, re }]. */
async function seriesOf(unit) {
  if (unit === 'records') {
    return [{ id: 'serialNo', label: 'FSN', prefix: 'FSN-', pad: 7, re: /^FSN-(\d+)$/ }];
  }
  const cfg = await config.unit(unit);
  return (cfg?.docTypes || [])
    .filter((t) => t.serial?.prefix)
    .map((t) => ({ id: `unit:${unit}:${t.code}`, label: t.label, prefix: t.serial.prefix, pad: t.serial.pad || 5, re: new RegExp(`^${escapeRe(t.serial.prefix)}(\\d+)$`) }));
}

/** Ranges of missing numbers, as "12–15", at most `max` of them. */
function gapsIn(numbers, max = 6) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const out = [];
  let missing = 0;
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1] + 1;
    const to = sorted[i] - 1;
    if (to < from) continue;
    missing += to - from + 1;
    if (out.length < max) out.push(from === to ? String(from) : `${from}–${to}`);
  }
  return { missing, ranges: out };
}

async function checkUnit(unit) {
  const db = getDb();
  const col = db.collection(unit === 'records' ? 'erms-records' : 'erms-documents');
  const scope = unit === 'records' ? {} : { unit };
  const rows = await col.find(scope, { projection: { serialNo: 1, parentSerialNo: 1, isAttachment: 1 } }).toArray();
  const series = await seriesOf(unit);
  const findings = [];
  const serials = new Set();

  // Duplicates.
  const seen = new Map();
  for (const r of rows) {
    const s = String(r.serialNo || '');
    serials.add(s);
    seen.set(s, (seen.get(s) || 0) + 1);
  }
  for (const [serialNo, count] of seen) {
    if (count > 1) findings.push({ kind: 'duplicate', severity: 'problem', serialNo, detail: `${count} documents carry this serial.` });
  }

  // Malformed, orphans, and the numbers in each series.
  const numbers = new Map(series.map((s) => [s.id, []]));
  const attNumbers = [];
  for (const r of rows) {
    const s = String(r.serialNo || '');
    if (!s.trim()) {
      findings.push({ kind: 'malformed', severity: 'problem', serialNo: '(blank)', detail: 'A document with no serial at all.' });
      continue;
    }
    const att = ATT.exec(s);
    const base = att ? s.slice(0, att.index) : s;
    if (att) {
      attNumbers.push(Number(att[1]));
      const parent = r.parentSerialNo || base;
      if (!serials.has(parent)) findings.push({ kind: 'orphan', severity: 'review', serialNo: s, detail: `Its record ${parent} is not on file.` });
    }
    const hit = series.find((x) => x.re.test(base));
    if (!hit) {
      const trimmed = base.replace(/\s+/g, '');
      const near = series.find((x) => x.re.test(trimmed));
      findings.push({
        kind: 'malformed',
        severity: 'problem',
        serialNo: s,
        detail: near ? `Has a space in it — "${trimmed}" in the ${near.label} series.` : `In no series ${UNIT_LABEL[unit]} numbers by (${series.map((x) => x.prefix + '…').join(', ') || 'none configured'}).`,
      });
      continue;
    }
    if (!att) numbers.get(hit.id).push(Number(hit.re.exec(base)[1]));
  }

  // The counters, against the highest serial on file.
  const counters = await db.collection(SEQUENCES).find({ _id: { $in: [...series.map((s) => s.id), unit === 'records' ? 'attachmentNo' : `unit:${unit}:attachmentNo`] } }).toArray();
  const seqOf = (id) => counters.find((c) => c._id === id)?.seq;
  const summary = [];
  for (const s of series) {
    const list = numbers.get(s.id);
    if (!list.length) continue;
    const highest = Math.max(...list);
    const seq = seqOf(s.id);
    const gaps = gapsIn(list);
    summary.push({ series: s.label, prefix: s.prefix, count: list.length, highest: `${s.prefix}${String(highest).padStart(s.pad, '0')}`, counter: typeof seq === 'number' ? seq : null, missing: gaps.missing });
    if (typeof seq === 'number' && seq < highest) {
      findings.push({ kind: 'behind', severity: 'problem', serialNo: `${s.prefix}${String(seq + 1).padStart(s.pad, '0')}`, detail: `The ${s.label} counter is at ${seq}, below the highest on file (${highest}): the next save would take a number already used.`, fix: { sequence: s.id, to: highest } });
    }
    if (gaps.missing) {
      findings.push({ kind: 'gaps', severity: 'note', serialNo: s.prefix, detail: `${gaps.missing} number(s) skipped in the ${s.label} series: ${gaps.ranges.join(', ')}${gaps.ranges.length >= 6 ? ', …' : ''}.` });
    }
  }
  const attId = unit === 'records' ? 'attachmentNo' : `unit:${unit}:attachmentNo`;
  const attSeq = seqOf(attId);
  if (attNumbers.length && typeof attSeq === 'number' && attSeq < Math.max(...attNumbers)) {
    const highest = Math.max(...attNumbers);
    findings.push({ kind: 'behind', severity: 'problem', serialNo: `Att-${String(attSeq + 1).padStart(5, '0')}`, detail: `The attachment counter is at ${attSeq}, below the highest attachment on file (${highest}).`, fix: { sequence: attId, to: highest } });
  }

  return { unit, label: UNIT_LABEL[unit], documents: rows.length, series: summary, findings };
}

/** A fresh check of all three units, stored as a report. */
async function scan({ by } = {}) {
  await connectToMongo();
  const startedAt = new Date();
  const units = [];
  for (const unit of ['records', 'legal', 'laboratory']) units.push(await checkUnit(unit));
  let id = 0;
  for (const u of units) for (const f of u.findings) f.id = ++id;
  const doc = {
    startedAt,
    finishedAt: new Date(),
    by: by || null,
    totals: {
      problems: units.reduce((a, u) => a + u.findings.filter((f) => f.severity === 'problem').length, 0),
      review: units.reduce((a, u) => a + u.findings.filter((f) => f.severity === 'review').length, 0),
      fixable: units.reduce((a, u) => a + u.findings.filter((f) => f.fix && !f.fixed).length, 0),
    },
    units,
  };
  const col = getDb().collection(COLLECTION);
  const { insertedId } = await col.insertOne(doc);
  // The last five reports are enough to compare against.
  const old = await col.find({}, { projection: { _id: 1 } }).sort({ startedAt: -1 }).skip(5).toArray();
  if (old.length) await col.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  return { id: String(insertedId), ...doc };
}

async function latest() {
  await connectToMongo();
  const run = await getDb().collection(COLLECTION).findOne({}, { sort: { startedAt: -1 } });
  return run ? { id: String(run._id), ...run, _id: undefined } : null;
}

/**
 * Fix what VERA may fix: counters behind the highest serial, moved up to it
 * ($max — never down). Then a fresh check, so the report shows what is left.
 */
async function fix({ by } = {}) {
  await connectToMongo();
  const run = await getDb().collection(COLLECTION).findOne({}, { sort: { startedAt: -1 } });
  const fixes = (run?.units || []).flatMap((u) => u.findings.filter((f) => f.fix));
  for (const f of fixes) {
    await getDb().collection(SEQUENCES).updateOne({ _id: f.fix.sequence }, { $max: { seq: f.fix.to } }, { upsert: true });
  }
  const report = await scan({ by });
  return { fixed: fixes.length, report };
}

/** Problems waiting in the latest report, for the tab's badge. */
async function pendingCount() {
  const run = await latest();
  return run ? run.totals.problems : 0;
}

module.exports = { COLLECTION, gapsIn, checkUnit, scan, latest, fix, pendingCount };
