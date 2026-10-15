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
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');
const { firstPages } = require('./projectTypeCheck');

const MAX_CHARS = 1500;
const PAGES = 2;
const SYSTEM =
  'You transcribe scanned documents of a Philippine environmental regulator. Write out the readable text of the attached pages as plain text, ' +
  'in reading order: names, numbers, dates, addresses, titles. No commentary, no formatting, no guesses for illegible parts. ' +
  `Stop after about ${MAX_CHARS} characters.`;

const sourceOf = (unit) => (!unit || unit === 'records' ? 'erms-records' : 'erms-documents');
const filterOf = (unit, serialNo) => (!unit || unit === 'records' ? { serialNo } : { unit, serialNo });
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

/** Read one document's scan; returns { ok, text } or { ok: false, status, message }. */
async function readOne(cfg, unit, serialNo, by) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and reading a scan needs it." };
  await connectToMongo();
  const col = getDb().collection(sourceOf(unit));
  const doc = await col.findOne(filterOf(unit, serialNo), { projection: { serialNo: 1, document: 1 } });
  if (!doc) return { ok: false, status: 404, message: 'Not found.' };
  const pdf = await firstPages(doc, PAGES).catch(() => null);
  if (!pdf) return { ok: false, status: 422, message: 'The scan could not be read: it is not a PDF on the share, or the share is not reachable.' };
  const out = await provider.complete(cfg, { system: SYSTEM, prompt: 'Transcribe the attached pages.', maxTokens: 900, documents: [{ mimeType: 'application/pdf', data: pdf }] });
  const text = tidy(out.text);
  await col.updateOne({ _id: doc._id }, { $set: { scanText: text, scanTextAt: new Date(), scanTextBy: by || null } });
  return { ok: true, text, model: out.model };
}

/** The next `limit` documents of a unit with a scan and no text read yet. */
async function readNext(cfg, unit, limit, by) {
  await connectToMongo();
  const col = getDb().collection(sourceOf(unit));
  const filter = { ...(unit && unit !== 'records' ? { unit } : {}), 'document.fileName': { $nin: [null, ''] }, scanText: { $exists: false } };
  const docs = await col.find(filter, { projection: { serialNo: 1 } }).sort({ _id: -1 }).limit(Math.min(50, Math.max(1, limit))).toArray();
  const totals = { read: 0, failed: 0 };
  for (const d of docs) {
    try {
      const r = await readOne(cfg, unit, d.serialNo, by);
      if (r.ok) totals.read += 1;
      else {
        totals.failed += 1;
        // Not readable (no PDF, no share): marked, so the next run moves on.
        if (r.status === 422) await col.updateOne({ _id: d._id }, { $set: { scanText: '', scanTextAt: new Date() } });
      }
    } catch {
      totals.failed += 1;
    }
  }
  const left = await col.countDocuments(filter);
  return { ...totals, left };
}

module.exports = { MAX_CHARS, readOne, readNext };
