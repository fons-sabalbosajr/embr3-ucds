// ---------------------------------------------------------------------------
// VERA reads a scan's text, so the Document Library can search inside it.
//
// Most scans are images: there is no text in the PDF to search. VERA's AI
// model reads the first pages (as it does for the project type check) and
// writes out the text; the first 1,500 characters are kept on the record as
// `scanText`, and the library's search looks there too.
//
// Measured, never automatic: each document is one model call, and the text
// is stored on a database with little room to spare. One document at a time
// from its page, or the next few from VERA's settings — the Developer's or an
// administrator's.
//
// The batch (29 Oct 2026). It read one scan after another, and three things
// made "Read with VERA" slow and look broken:
//   - a Legal or Laboratory scan was looked for on the Records share, not
//     found, and stamped unreadable for good;
//   - the share not answering for a moment was taken as "not a PDF", and
//     the whole batch stamped unreadable for good;
//   - with no model answering (a day's quota spent), every document still
//     waited its turn to fail, and failed again first on the next run.
// Now: the unit's own share; a few read at once; only a file that will
// never do is stamped unreadable; the batch stops when no model answers; and
// a document the model could not read waits a day before it is tried again.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');
const { pagesOf, UNREADABLE } = require('./projectTypeCheck');

const MAX_CHARS = 1500;
const PAGES = 2;
// Scans read at once: the share and the model each take seconds per scan,
// and a free tier allows a few calls a minute, not dozens.
const AT_ONCE = Math.max(1, Number(process.env.VERA_SCAN_CONCURRENCY) || 3);
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
// A model failure that no other document would escape: the batch stops.
const STOPS_BATCH = new Set(['all_resting', 'no_model', 'quota_exhausted', 'auth_failed', 'no_credit', 'not_configured']);
const SYSTEM =
  'You transcribe scanned documents of a Philippine environmental regulator. Write out the readable text of the attached pages as plain text, ' +
  'in reading order: names, numbers, dates, addresses, titles. No commentary, no formatting, no guesses for illegible parts. ' +
  `Stop after about ${MAX_CHARS} characters.`;

const sourceOf = (unit) => (!unit || unit === 'records' ? 'erms-records' : 'erms-documents');
const filterOf = (unit, serialNo) => (!unit || unit === 'records' ? { serialNo } : { unit, serialNo });
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

const SHARE_TROUBLE = {
  'not-configured': 'its storage share is not set up on this server',
  disabled: 'its storage share is switched off on this server',
  denied: 'the server was refused access to the share',
  unreachable: 'the share did not answer',
};

/**
 * Read one document's scan; { ok, text } or { ok: false, status, message,
 * unreadable?, code? }. `unreadable`: the file will never do (stamp it);
 * `code`: the model's failure, mapped (provider.sanitizeError).
 */
async function readDoc(cfg, unit, doc, by) {
  const col = getDb().collection(sourceOf(unit));
  // A unit document's scan is on its unit's share unless it names another.
  const { pdf, reason } = await pagesOf(doc, PAGES, { container: unit && unit !== 'records' ? unit : undefined }).catch(() => ({ reason: 'unreachable' }));
  if (!pdf) {
    if (UNREADABLE.has(reason)) return { ok: false, status: 422, unreadable: true, message: 'The scan could not be read: it is not a readable PDF on the share.' };
    return { ok: false, status: 503, message: `The scan could not be read now: ${SHARE_TROUBLE[reason] || 'the share did not answer'}. Try again later.` };
  }
  let out;
  try {
    out = await provider.complete(cfg, { system: SYSTEM, prompt: 'Transcribe the attached pages.', maxTokens: 900, documents: [{ mimeType: 'application/pdf', data: pdf }], feature: 'scan-text' });
  } catch (err) {
    const safe = provider.sanitizeError(err);
    return { ok: false, status: 503, code: safe.code, message: safe.message };
  }
  const text = tidy(out.text);
  // Nothing written out is not a reading: tried again later, not kept as empty.
  if (!text) return { ok: false, status: 502, code: 'empty', message: 'The model wrote out no text for this scan.' };
  await col.updateOne({ _id: doc._id }, { $set: { scanText: text, scanTextAt: new Date(), scanTextBy: by || null }, $unset: { scanTextFailedAt: '' } });
  return { ok: true, text, model: out.model };
}

/** Read one document's scan, from its own page; returns { ok, text } or { ok: false, status, message }. */
async function readOne(cfg, unit, serialNo, by) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and reading a scan needs it." };
  await connectToMongo();
  const doc = await getDb().collection(sourceOf(unit)).findOne(filterOf(unit, serialNo), { projection: { serialNo: 1, document: 1 } });
  if (!doc) return { ok: false, status: 404, message: 'Not found.' };
  const r = await readDoc(cfg, unit, doc, by);
  if (r.unreadable) await getDb().collection(sourceOf(unit)).updateOne({ _id: doc._id }, { $set: { scanText: '', scanTextAt: new Date() } });
  return r;
}

/**
 * The next `limit` documents of a unit with a scan and no text read yet, a
 * few at a time. Returns { ok, read, failed, unreadable, left, stopped? }.
 */
async function readNext(cfg, unit, limit, by) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and reading a scan needs it." };
  await connectToMongo();
  const col = getDb().collection(sourceOf(unit));
  const filter = { ...(unit && unit !== 'records' ? { unit } : {}), 'document.fileName': { $nin: [null, ''] }, scanText: { $exists: false } };
  // Not one the model failed on in the last day: it was first in line again
  // on every run, and failed again.
  const due = { ...filter, $or: [{ scanTextFailedAt: { $exists: false } }, { scanTextFailedAt: { $lt: new Date(Date.now() - RETRY_AFTER_MS) } }] };
  const queue = await col.find(due, { projection: { serialNo: 1, document: 1 } }).sort({ _id: -1 }).limit(Math.min(50, Math.max(1, limit))).toArray();
  const totals = { read: 0, failed: 0, unreadable: 0 };
  const failedIds = [];
  const unreadableIds = [];
  let stopped = null;

  const worker = async () => {
    while (queue.length && !stopped) {
      const doc = queue.shift();
      const r = await readDoc(cfg, unit, doc, by).catch(() => ({ ok: false, status: 503 }));
      if (r.ok) totals.read += 1;
      else if (r.unreadable) {
        totals.unreadable += 1;
        unreadableIds.push(doc._id);
      } else if (STOPS_BATCH.has(r.code) || (r.status === 503 && !r.code)) {
        // No model will answer, or the share is down: the rest would only
        // wait to fail the same way. This one stays as it was.
        stopped = stopped || r.message;
      } else {
        totals.failed += 1;
        failedIds.push(doc._id);
      }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));

  const now = new Date();
  if (unreadableIds.length) await col.updateMany({ _id: { $in: unreadableIds } }, { $set: { scanText: '', scanTextAt: now } });
  if (failedIds.length) await col.updateMany({ _id: { $in: failedIds } }, { $set: { scanTextFailedAt: now } });
  const left = await col.countDocuments(filter);
  return { ok: true, ...totals, left, ...(stopped ? { stopped } : {}) };
}

module.exports = { MAX_CHARS, readOne, readNext };
