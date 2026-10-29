// ---------------------------------------------------------------------------
// VERA's project type check: is each Records document filed under the right
// project type, judged by the document itself?
//
// For each record VERA reads the first pages of its scan (the ECC or permit
// names the project and what it does) with the record's title, proponent and
// specific project type, and picks the project type from the Records Unit's
// own list that fits. Where that differs from the one on the record, she
// proposes it, with her reason and how sure she is. Nothing changes until the
// Developer applies a proposal; each applied one can be undone.
//
// Settings (Admin Settings › VERA Assistant › Project types), kept in VERA's
// settings document under `projectTypeCheck`:
//   enabled        the check may run at all                    off
//   readScans      send the scan's first pages to the model    on
//   pages          how many first pages                        2
//   perRun         records read per check                      20
//   minConfidence  the least sure a proposal may be            "high"
//
// Records are taken newest first and each is read once: a later check goes on
// to the next ones. The model's cost is bounded by `perRun`; one record is
// one model call.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');

const COLLECTION = 'vera-project-type-checks';
const RECORDS = 'erms-records';
const DEFAULTS = Object.freeze({ enabled: false, readScans: true, pages: 2, perRun: 20, minConfidence: 'high' });
const RANK = { low: 1, medium: 2, high: 3 };

const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

/** The check's settings, from VERA's settings document, with defaults. */
function settingsOf(cfg) {
  const s = cfg?.projectTypeCheck || {};
  return {
    enabled: s.enabled === true,
    readScans: s.readScans !== false,
    pages: clampInt(s.pages, 1, 5, DEFAULTS.pages),
    perRun: clampInt(s.perRun, 1, 200, DEFAULTS.perRun),
    minConfidence: RANK[s.minConfidence] ? s.minConfidence : DEFAULTS.minConfidence,
  };
}

/** Settings as saved: only the known keys, in range. */
const cleanSettings = (input) => settingsOf({ projectTypeCheck: input });

/** The Records Unit's project types (Settings › ERMS › Menus), and those in use. */
async function projectTypes() {
  const db = getDb();
  const list = await db.collection('erms-lookups').findOne({ kind: 'project-types' });
  const fromList = (list?.items || []).map((i) => String(i.label || i.value || i).trim()).filter(Boolean);
  if (fromList.length) return [...new Set(fromList)];
  return (await db.collection(RECORDS).distinct('project.type')).filter((t) => typeof t === 'string' && t.trim());
}

// Why a scan's pages could not be had. These say the file itself will not do
// (reading it again changes nothing); any other reason — the share down,
// switched off, refusing this server — may pass, and is worth another try.
const UNREADABLE = new Set(['no-file', 'missing', 'not-a-file', 'invalid-path', 'not-pdf', 'too-large', 'damaged']);

/**
 * The scan's first pages as a small PDF, base64 — { pdf } — or { reason }.
 * `container`: the share to look on when the record does not name its own
 * (a Legal or Laboratory document's is its unit's, never the Records share).
 */
async function pagesOf(record, pages, { container } = {}) {
  const nas = require('../nasStorage');
  const stored = record.document?.sharePath || record.document?.filePath;
  if (!stored) return { reason: 'no-file' };
  const file = await nas.statFile(stored, String(record.document?.container || container || nas.RECORDS_KEY).toLowerCase());
  if (!file.ok) return { reason: file.reason || 'unreachable' };
  if (file.contentType !== 'application/pdf') return { reason: 'not-pdf' };
  if (file.size > 60 * 1024 * 1024) return { reason: 'too-large' };
  let whole;
  try {
    whole = await new Promise((resolve, reject) => {
      const chunks = [];
      nas.openStream(file.resolved).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    });
  } catch {
    return { reason: 'unreachable' };
  }
  return cutPages(whole, pages);
}

/**
 * A PDF's first `pages` pages as a small PDF, base64 — { pdf } or { reason }.
 * For a file in hand: a scan on the share (pagesOf), or one a clerk has just
 * chosen in the upload form, before it is filed (services/vera/uploadGuide).
 */
async function cutPages(whole, pages) {
  // A PDF may carry a few bytes before its header; readers look in the first kilobyte.
  if (!Buffer.isBuffer(whole) || !whole.subarray(0, 1024).includes('%PDF-')) return { reason: 'not-pdf' };
  if (whole.length > 60 * 1024 * 1024) return { reason: 'too-large' };
  const { PDFDocument } = require('pdf-lib');
  try {
    const src = await PDFDocument.load(whole, { ignoreEncryption: true, updateMetadata: false });
    const cut = await PDFDocument.create();
    const copied = await cut.copyPages(src, Array.from({ length: Math.min(pages, src.getPageCount()) }, (_, i) => i));
    copied.forEach((p) => cut.addPage(p));
    const out = Buffer.from(await cut.save({ useObjectStreams: true }));
    // Inline documents are limited in size by both providers.
    return out.length <= 15 * 1024 * 1024 ? { pdf: out.toString('base64') } : { reason: 'too-large' };
  } catch {
    return { reason: 'damaged' };
  }
}

/** The scan's first pages as a small PDF, base64; null when it cannot be read. */
async function firstPages(record, pages, options) {
  return (await pagesOf(record, pages, options)).pdf || null;
}

const SYSTEM =
  'You check the filing of documents at a Philippine environmental regulator (EMB Region III). Each document is an ECC, CNC or permit for one project. ' +
  'Choose the ONE project type from the given list that best describes the project the document is about (what the project physically is or does). ' +
  'Use the document pages when attached; otherwise the record details. Copy the type exactly as written in the list. ' +
  'Reply with JSON only: {"projectType": "<exact item from the list>", "confidence": "high"|"medium"|"low", "reason": "<one short sentence citing what in the document shows it>"}.';

function parseVerdict(text, allowed) {
  const s = String(text || '');
  try {
    const v = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    const match = allowed.find((t) => t.toLowerCase() === String(v.projectType || '').trim().toLowerCase());
    if (!match) return null;
    return { projectType: match, confidence: RANK[v.confidence] ? v.confidence : 'low', reason: String(v.reason || '').slice(0, 400) };
  } catch {
    return null;
  }
}

/**
 * Read the next `perRun` records not yet checked and record a verdict for
 * each: a proposal where the type differs (and VERA is sure enough), "ok"
 * where it agrees.
 */
async function scan({ cfg, by }) {
  await connectToMongo();
  const settings = settingsOf(cfg);
  if (!settings.enabled) return { ok: false, status: 409, message: 'The project type check is switched off. Turn it on in its settings first.' };
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and this check needs it to read the documents." };
  const db = getDb();
  const checked = await db.collection(COLLECTION).distinct('serialNo');
  const allowed = await projectTypes();
  if (!allowed.length) return { ok: false, status: 409, message: 'There is no list of project types to choose from (Settings › ERMS › Menus).' };
  const records = await db
    .collection(RECORDS)
    .find({ serialNo: { $nin: checked }, isAttachment: { $ne: true } }, { projection: { serialNo: 1, proponentName: 1, projectTitle: 1, project: 1, permit: 1, document: 1 } })
    .sort({ 'document.uploadedAt': -1 })
    .limit(settings.perRun)
    .toArray();

  const totals = { read: 0, proposals: 0, agree: 0, unsure: 0, failed: 0, withScan: 0 };
  for (const r of records) {
    let pdf = null;
    if (settings.readScans) {
      try {
        pdf = await firstPages(r, settings.pages);
      } catch {
        pdf = null;
      }
    }
    if (pdf) totals.withScan += 1;
    const prompt =
      `PROJECT TYPES:\n${allowed.map((t) => `- ${t}`).join('\n')}\n\n` +
      `RECORD:\nProject title: ${r.projectTitle || '—'}\nProponent: ${r.proponentName || '—'}\nSpecific project type: ${r.project?.otherType || '—'}\n` +
      `Permit: ${r.permit?.label || r.permit?.type || '—'} ${r.permit?.number || ''}\nProject type on file: ${r.project?.type || '(none)'}\n` +
      (pdf ? '\nThe first pages of the document are attached.' : '\nNo document pages could be read; judge from the record.');
    let verdict = null;
    try {
      const out = await provider.complete(cfg, { system: SYSTEM, prompt, maxTokens: 400, documents: pdf ? [{ mimeType: 'application/pdf', data: pdf }] : [] });
      verdict = parseVerdict(out.text, allowed);
    } catch {
      verdict = null;
    }
    totals.read += 1;
    const current = r.project?.type || null;
    let status;
    if (!verdict) {
      status = 'failed';
      totals.failed += 1;
    } else if (current && verdict.projectType.toLowerCase() === current.toLowerCase()) {
      status = 'ok';
      totals.agree += 1;
    } else if (RANK[verdict.confidence] < RANK[settings.minConfidence]) {
      status = 'unsure';
      totals.unsure += 1;
    } else {
      status = 'proposed';
      totals.proposals += 1;
    }
    await db.collection(COLLECTION).updateOne(
      { serialNo: r.serialNo },
      {
        $set: {
          serialNo: r.serialNo,
          projectTitle: r.projectTitle || null,
          proponentName: r.proponentName || null,
          current,
          suggested: verdict?.projectType || null,
          confidence: verdict?.confidence || null,
          reason: verdict?.reason || null,
          readScan: Boolean(pdf),
          status,
          checkedAt: new Date(),
          checkedBy: by || null,
        },
      },
      { upsert: true }
    );
  }
  // A failed read is tried again next time.
  await db.collection(COLLECTION).deleteMany({ status: 'failed', checkedAt: { $lt: new Date(Date.now() - 60 * 1000) } });
  return { ok: true, totals, left: Math.max(0, (await db.collection(RECORDS).countDocuments({ isAttachment: { $ne: true } })) - (await db.collection(COLLECTION).countDocuments())) };
}

/** The proposals waiting, the latest verdicts, and how far the check has gone. */
async function report() {
  await connectToMongo();
  const col = getDb().collection(COLLECTION);
  const [proposals, recent, counts, records] = await Promise.all([
    col.find({ status: 'proposed' }).sort({ checkedAt: -1 }).limit(500).toArray(),
    col.find({ status: { $in: ['applied', 'dismissed', 'unsure'] } }).sort({ checkedAt: -1 }).limit(50).toArray(),
    col.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    getDb().collection(RECORDS).countDocuments({ isAttachment: { $ne: true } }),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  const strip = ({ _id, ...x }) => x;
  return { proposals: proposals.map(strip), recent: recent.map(strip), counts: by, records, checked: Object.values(by).reduce((a, n) => a + n, 0) };
}

/**
 * Apply one proposal (or all waiting), recording what the record held. One
 * batched write to the records and one to the check — it was two writes per
 * proposal, a thousand round trips for "Apply all" on a full page.
 */
async function apply(serialNos, user) {
  await connectToMongo();
  const db = getDb();
  const filter = serialNos === 'all' ? { status: 'proposed' } : { status: 'proposed', serialNo: { $in: serialNos } };
  const wanted = await db.collection(COLLECTION).find(filter, { projection: { serialNo: 1, suggested: 1 } }).toArray();
  if (!wanted.length) return { applied: 0, changed: 0 };
  const who = user?.username || 'unknown';
  const now = new Date();
  const res = await db.collection(RECORDS).bulkWrite(
    wanted.map((p) => ({
      updateOne: { filter: { serialNo: p.serialNo }, update: { $set: { 'project.type': p.suggested, updatedAt: now, updatedBy: `VERA (approved by ${who})` } } },
    })),
    { ordered: false }
  );
  const changed = res.modifiedCount || 0;
  await db.collection(COLLECTION).updateMany({ serialNo: { $in: wanted.map((p) => p.serialNo) } }, { $set: { status: 'applied', appliedAt: now, appliedBy: who } });
  if (changed) require('../../shared/services/shortCache').invalidate('erms:records:');
  return { applied: wanted.length, changed };
}

/** Put an applied proposal back, or set one aside without applying it. */
async function settle(serialNo, action, user) {
  await connectToMongo();
  const db = getDb();
  const p = await db.collection(COLLECTION).findOne({ serialNo });
  if (!p) return { ok: false, status: 404, message: 'There is no check for that record.' };
  if (action === 'undo') {
    if (p.status !== 'applied') return { ok: false, status: 409, message: 'That proposal was not applied.' };
    await db.collection(RECORDS).updateOne({ serialNo, 'project.type': p.suggested }, { $set: { 'project.type': p.current, updatedAt: new Date(), updatedBy: `VERA undo (by ${user?.username || 'unknown'})` } });
    await db.collection(COLLECTION).updateOne({ serialNo }, { $set: { status: 'proposed' }, $unset: { appliedAt: '', appliedBy: '' } });
    require('../../shared/services/shortCache').invalidate('erms:records:');
  } else {
    await db.collection(COLLECTION).updateOne({ serialNo }, { $set: { status: 'dismissed', dismissedBy: user?.username || null, dismissedAt: new Date() } });
  }
  return { ok: true };
}

module.exports = { COLLECTION, DEFAULTS, UNREADABLE, settingsOf, cleanSettings, parseVerdict, projectTypes, pagesOf, cutPages, firstPages, scan, report, apply, settle };
