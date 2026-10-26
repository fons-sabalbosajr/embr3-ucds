// ---------------------------------------------------------------------------
// VERA's Ref. No. check: does the number encoded on a Records record match
// the one printed on its scan?
//
// A clerk types the ECC/CNC Ref. No. from the paper; the scan is filed with
// it. A digit typed wrong, or a scan filed against the neighbouring record,
// leaves the two disagreeing — and the register link, the search and every
// report read the typed one. VERA reads the first pages of the scan and
// copies the number printed there, exactly as printed. She is NOT told the
// encoded number, so she cannot simply agree with it; the two are compared
// afterwards, ignoring spacing, punctuation and zero padding.
//
//   match       the scan carries the encoded number (or one of the record's
//               other Ref. Nos.)
//   differs     the scan carries another number: proposed, for a person to
//               apply or keep — never changed by VERA alone
//   missing     nothing was encoded; the scan's number is proposed
//   unreadable  no number could be read with certainty
//   failed      the scan could not be opened, or the model did not answer
//
// When the scan's number is already on another record, the scan is more
// likely filed against the wrong record than the number typed wrong: the
// proposal says so and cannot be applied (move the scan instead).
//
// Applying goes through the record's own update (recordService.updateRecord):
// the duplicate rule, the province write scope, the register link recomputed,
// "Needs review" settled. The number it replaced is kept, so it can be undone.
//
// One model call per document. One record from its page (whoever may edit
// it), or the next few from VERA's settings (the Developer).
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');
const { firstPages } = require('./projectTypeCheck');
const { loosen, unpadded } = require('../../modules/ucds/services/permitMatch');

const COLLECTION = 'vera-refno-checks';
const RECORDS = 'erms-records';
const PAGES = 2;
const RANK = { low: 1, medium: 2, high: 3 };
// Asked again within this long, the stored reading is returned: a double
// click is not a second model call.
const FRESH_MS = 60 * 1000;

const checks = () => getDb().collection(COLLECTION);
const records = () => getDb().collection(RECORDS);

const SYSTEM =
  'You read scanned permits of a Philippine environmental regulator (DENR-EMB Region III): Environmental Compliance Certificates (ECC), ' +
  'Certificates of Non-Coverage (CNC) and other permits. Find the document\'s OWN reference number — the one labelled "ECC Ref. No.", ' +
  '"ECC No.", "CNC No.", "CNC Ref. No.", "Reference No.", "Ref. No.", "Control No." or "Permit No.", or printed as the permit\'s number ' +
  'at the top or the bottom of the first page. Copy it EXACTLY as printed, character for character: keep its letters, hyphens and zeros; ' +
  'do not correct, complete or reformat it. List any other permit or reference numbers printed (for example the original ECC an ' +
  'amendment refers to) under "others". If the number cannot be read with certainty, give null. ' +
  'Reply with JSON only: {"refNo": "<exact>" | null, "label": "<the words printed before it>", "others": ["<exact>"], ' +
  '"documentKind": "ECC" | "CNC" | "other", "confidence": "high" | "medium" | "low"}.';

const text = (s, max = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Two Ref. Nos. are one when they differ only in spacing, punctuation, capitals or zero padding. */
const sameNumber = (a, b) => Boolean(a && b) && (loosen(a) === loosen(b) || unpadded(a) === unpadded(b));

/** The model's reply as a reading, or null. */
function parseReading(out) {
  const s = String(out || '');
  try {
    const v = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    const refNo = text(v.refNo, 80) || null;
    // A number has digits; "N/A", "illegible" and the like are no reading.
    const real = (n) => n && (n.match(/\d/g) || []).length >= 3;
    return {
      refNo: real(refNo) ? refNo : null,
      label: text(v.label, 60) || null,
      others: (Array.isArray(v.others) ? v.others : []).map((o) => text(o, 80)).filter(real).slice(0, 6),
      documentKind: ['ECC', 'CNC', 'other'].includes(v.documentKind) ? v.documentKind : 'other',
      confidence: RANK[v.confidence] ? v.confidence : 'low',
    };
  } catch {
    return null;
  }
}

/**
 * What a reading means for the record: its status and, where the number
 * should change, the number proposed.
 */
function verdictOf(record, reading) {
  const encoded = record.permit?.number || null;
  const ownRefs = [encoded, ...(record.permit?.refs || []).map((r) => r.number)].filter(Boolean);
  if (!reading) return { status: 'failed', proposed: null };
  if (!reading.refNo) return { status: 'unreadable', proposed: null };
  if (ownRefs.some((n) => sameNumber(n, reading.refNo))) {
    return { status: 'match', proposed: null, writtenDifferently: Boolean(encoded) && sameNumber(encoded, reading.refNo) && encoded !== reading.refNo };
  }
  return {
    status: encoded ? 'differs' : 'missing',
    proposed: reading.refNo,
    // The scan names the encoded number too — an amendment citing its original
    // ECC, typically. Worth a closer look before replacing it.
    encodedMentioned: Boolean(encoded) && reading.others.some((n) => sameNumber(n, encoded)),
  };
}

/** Another record already holding `number` (not this record's own family), or null. */
async function holderOf(number, record) {
  if (!number) return null;
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Spacing and hyphens either way: "ECC-R3-1907-0215" and "ECC R3 1907 0215".
  const loose = new RegExp(`^${loosen(number).split('').map(escape).join('[\\s-]*')}$`, 'i');
  const family = record.parentSerialNo || record.serialNo;
  const hit = await records().findOne(
    { 'permit.number': loose, serialNo: { $ne: record.serialNo }, parentSerialNo: { $ne: family } },
    { projection: { serialNo: 1, proponentName: 1, projectTitle: 1 } }
  );
  return hit && hit.serialNo !== family ? { serialNo: hit.serialNo, proponentName: hit.proponentName || null, projectTitle: hit.projectTitle || null } : null;
}

const publicCheck = (c) => {
  if (!c) return null;
  const { _id, ...rest } = c;
  return rest;
};

/**
 * Read one record's scan and compare its Ref. No. with the encoded one.
 * Returns { ok, check } or { ok: false, status, message }.
 */
async function checkOne(cfg, serialNo, by, { force = false } = {}) {
  await connectToMongo();
  const record = await records().findOne(
    { serialNo },
    { projection: { serialNo: 1, parentSerialNo: 1, isAttachment: 1, proponentName: 1, projectTitle: 1, permit: 1, document: 1 } }
  );
  if (!record) return { ok: false, status: 404, message: 'Record not found.' };
  if (record.isAttachment) {
    return { ok: false, status: 409, message: "An attachment carries its record's Ref. No.; check the record it belongs to." };
  }
  if (!record.document?.sharePath && !record.document?.filePath) return { ok: false, status: 422, message: 'This record has no scan to read.' };

  const earlier = await checks().findOne({ serialNo });
  if (!force && earlier?.checkedAt && Date.now() - new Date(earlier.checkedAt).getTime() < FRESH_MS && earlier.encoded === (record.permit?.number || null)) {
    return { ok: true, check: publicCheck(earlier), cached: true };
  }
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and reading a scan needs it." };

  const pdf = await firstPages(record, PAGES).catch(() => null);
  let reading = null;
  let model = null;
  let failure = null;
  if (!pdf) failure = 'The scan could not be opened: it is not a PDF on the share, or the share is not reachable.';
  else {
    try {
      const out = await provider.complete(cfg, {
        system: SYSTEM,
        prompt: 'Read the reference number of the attached document.',
        maxTokens: 300,
        documents: [{ mimeType: 'application/pdf', data: pdf }],
      });
      reading = parseReading(out.text);
      model = out.model || null;
      if (!reading) failure = 'VERA could not make out an answer from the model.';
    } catch (err) {
      failure = `The AI model could not be reached (${err.code || err.message}).`;
    }
  }

  const verdict = verdictOf(record, reading);
  const clash = verdict.proposed ? await holderOf(verdict.proposed, record) : null;
  const check = {
    serialNo,
    proponentName: record.proponentName || null,
    projectTitle: record.projectTitle || null,
    fileName: record.document?.fileName || null,
    encoded: record.permit?.number || null,
    onScan: reading?.refNo || null,
    label: reading?.label || null,
    others: reading?.others || [],
    documentKind: reading?.documentKind || null,
    confidence: reading?.confidence || null,
    status: verdict.status,
    proposed: verdict.proposed,
    writtenDifferently: Boolean(verdict.writtenDifferently),
    encodedMentioned: Boolean(verdict.encodedMentioned),
    // The scan's number on another record: the scan is probably misfiled.
    clash,
    failure,
    model,
    checkedAt: new Date(),
    checkedBy: by || null,
  };
  await checks().updateOne(
    { serialNo },
    { $set: check, $unset: { appliedAt: '', appliedBy: '', previous: '', dismissedAt: '', dismissedBy: '' } },
    { upsert: true }
  );
  return { ok: true, check };
}

/** The stored check for one record, or null. */
async function forRecord(serialNo) {
  await connectToMongo();
  return publicCheck(await checks().findOne({ serialNo }));
}

/** The next `limit` records with a scan and no check yet, newest upload first. */
async function checkNext(cfg, limit, by) {
  await connectToMongo();
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available, and this check needs it to read the documents." };
  const done = await checks().distinct('serialNo');
  const filter = { isAttachment: { $ne: true }, 'document.sharePath': { $nin: [null, ''] }, serialNo: { $nin: done } };
  const next = await records()
    .find(filter, { projection: { serialNo: 1 } })
    .sort({ 'document.uploadedAt': -1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 20)))
    .toArray();
  const totals = { read: 0, match: 0, differs: 0, missing: 0, unreadable: 0, failed: 0 };
  for (const r of next) {
    const res = await checkOne(cfg, r.serialNo, by, { force: true }).catch(() => null);
    totals.read += 1;
    const status = res?.ok ? res.check.status : 'failed';
    totals[status] = (totals[status] || 0) + 1;
  }
  // A failed read (the share was down, the model timed out) is tried again next time.
  await checks().deleteMany({ status: 'failed', checkedAt: { $lt: new Date(Date.now() - FRESH_MS) } });
  const left = await records().countDocuments({ ...filter, serialNo: { $nin: await checks().distinct('serialNo') } });
  return { ok: true, totals, left };
}

/** The proposals waiting, the latest others, and how far the check has gone. */
async function report() {
  await connectToMongo();
  const [proposals, recent, counts, withScan] = await Promise.all([
    checks().find({ status: { $in: ['differs', 'missing'] } }).sort({ checkedAt: -1 }).limit(500).toArray(),
    checks().find({ status: { $in: ['applied', 'kept', 'unreadable', 'failed'] } }).sort({ checkedAt: -1 }).limit(50).toArray(),
    checks().aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    records().countDocuments({ isAttachment: { $ne: true }, 'document.sharePath': { $nin: [null, ''] } }),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return {
    proposals: proposals.map(publicCheck),
    recent: recent.map(publicCheck),
    counts: by,
    withScan,
    checked: Object.values(by).reduce((a, n) => a + n, 0),
  };
}

/**
 * Put the scan's number on the record.
 * @param actor { username, writableProvinces } — the record's own write rules apply
 */
async function apply(serialNo, actor) {
  await connectToMongo();
  const c = await checks().findOne({ serialNo });
  // A number kept earlier can still be applied on a second look.
  if (!c || !['differs', 'missing', 'kept'].includes(c.status) || !c.proposed) return { ok: false, status: 409, message: 'There is no Ref. No. waiting to be applied on that record. Check it again.' };
  const record = await records().findOne({ serialNo }, { projection: { permit: 1, serialNo: 1, parentSerialNo: 1 } });
  if (!record) return { ok: false, status: 404, message: 'Record not found.' };
  if ((record.permit?.number || null) !== c.encoded) {
    return { ok: false, status: 409, message: `The Ref. No. was changed to ${record.permit?.number || 'nothing'} since VERA read the scan. Check it again.` };
  }
  const clash = await holderOf(c.proposed, record);
  if (clash) {
    return { ok: false, status: 409, message: `${c.proposed} is already on ${clash.serialNo}. The scan is probably filed against the wrong record — move it there instead.` };
  }
  const recordService = require('../../modules/erms/services/recordService');
  const { before, after } = await recordService.updateRecord(serialNo, { permit: { number: c.proposed } }, actor);
  await checks().updateOne(
    { serialNo },
    { $set: { status: 'applied', previous: c.encoded, appliedAt: new Date(), appliedBy: actor?.username || null } }
  );
  return { ok: true, before, after, from: c.encoded, to: c.proposed };
}

/** Put an applied number back, or keep the encoded one and set the proposal aside. */
async function settle(serialNo, action, actor) {
  await connectToMongo();
  const c = await checks().findOne({ serialNo });
  if (!c) return { ok: false, status: 404, message: 'There is no Ref. No. check for that record.' };
  if (action === 'undo') {
    if (c.status !== 'applied') return { ok: false, status: 409, message: 'That Ref. No. was not applied.' };
    const record = await records().findOne({ serialNo }, { projection: { permit: 1 } });
    if ((record?.permit?.number || null) !== c.proposed) {
      return { ok: false, status: 409, message: `The Ref. No. has been changed again since (${record?.permit?.number || 'nothing'}); edit the record instead.` };
    }
    const recordService = require('../../modules/erms/services/recordService');
    const { before, after } = await recordService.updateRecord(serialNo, { permit: { number: c.previous || null } }, actor);
    await checks().updateOne({ serialNo }, { $set: { status: c.previous ? 'differs' : 'missing' }, $unset: { appliedAt: '', appliedBy: '', previous: '' } });
    return { ok: true, before, after, from: c.proposed, to: c.previous || null };
  }
  if (!['differs', 'missing'].includes(c.status)) return { ok: false, status: 409, message: 'There is nothing waiting to set aside.' };
  await checks().updateOne({ serialNo }, { $set: { status: 'kept', dismissedAt: new Date(), dismissedBy: actor?.username || null } });
  return { ok: true };
}

module.exports = { COLLECTION, SYSTEM, sameNumber, parseReading, verdictOf, checkOne, checkNext, forRecord, report, apply, settle };
