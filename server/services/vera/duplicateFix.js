// ---------------------------------------------------------------------------
// VERA's quick fix for the Duplicates tab (Settings › ERMS › Duplicates).
//
// The tab lists a permit number filed more than once (Records), or a file
// name filed more than once (Legal Services, Laboratory). Some of those are
// right — an original and its amendment, a record and its attachments, one
// name reused for two documents — and some are one document entered twice.
// VERA reads each group and says which:
//
//   duplicate   the same document filed twice: same kind, the names agree,
//               and at most one scan between them (or the same scan twice).
//               Fixable: the most complete entry is kept, a scan the others
//               hold is moved to it, and the others are set aside.
//   legitimate  an amendment, attachments, a name reused for different
//               documents. "Not a duplicate" hides the group from the list.
//   review      something a person must look at: different proponents under
//               one permit number (a number typed wrong?), or two different
//               scans. VERA says what she saw; nothing is done.
//
// Set aside is not deleted: the entry goes, whole, to `erms-set-aside`, with
// who did it and which entry was kept, and "Restore" puts it back as it was.
// The scans on the share are never touched. The Developer or an
// administrator fixes; anyone who sees the tab sees VERA's reading.
// ---------------------------------------------------------------------------

const { connectToMongo, getDb } = require('../../config/db');
const { namesAgree } = require('./registerLinks');

const SET_ASIDE = 'erms-set-aside';
const REVIEWS = 'vera-duplicate-reviews';
const UNITS = ['records', 'legal', 'laboratory'];

const sourceOf = (scope) => (scope === 'records' ? 'erms-records' : 'erms-documents');
const hasScan = (d) => Boolean(d.document?.fileName || d.document?.sharePath || d.document?.filePath);
const filled = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + filled(x), 0) : v === null || v === undefined || v === '' ? 0 : 1);
// The same name: capitals, spacing and punctuation aside, or the same words
// (company suffixes and titles aside — registerLinks.namesAgree).
const bare = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ñ]+/g, '');
const sameName = (a, b) => bare(a) === bare(b) || namesAgree(a, b);
const groupKey = (scope, key) => `${scope}:${String(key).toLowerCase()}`;

/** The entry to keep: a scan first, then the most filled in, then the oldest serial. */
function best(docs) {
  return [...docs].sort(
    (a, b) =>
      Number(hasScan(b)) - Number(hasScan(a)) ||
      Number(Boolean(a.isAttachment)) - Number(Boolean(b.isAttachment)) ||
      filled(b) - filled(a) ||
      String(a.serialNo).localeCompare(String(b.serialNo))
  )[0];
}

// What tells one document from another of the same kind: entries that
// differ in any of these are separate documents, even sharing a scan (a
// laboratory scan often holds several chain-of-custody forms).
const UNIT_IDS = ['cocNo', 'docketNo', 'referenceNo', 'orNumber', 'dateOfSampling', 'dateIssued', 'date'];
const idOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : bare(v));
function differIn(docs, read, names) {
  for (const name of names) {
    const values = new Set(docs.map((d) => read(d, name)).filter((v) => v !== null && v !== undefined && v !== '').map(idOf));
    if (values.size > 1) return name;
  }
  return null;
}

/** One group's verdict. */
function judge(scope, docs) {
  const parents = docs.filter((d) => !d.isAttachment);
  const serials = new Set(docs.map((d) => d.serialNo));
  if (scope === 'records') {
    // A record and its own attachments carry its permit number: right.
    if (parents.length <= 1 && docs.every((d) => !d.isAttachment || serials.has(d.parentSerialNo))) {
      return { verdict: 'legitimate', reason: 'A record and its attachments, which carry its permit number.' };
    }
    const types = new Set(parents.map((d) => d.permit?.type || ''));
    if (types.size > 1) return { verdict: 'legitimate', reason: `Different kinds of permit under one number (${[...types].filter(Boolean).join(', ')}) — an original and its amendment.` };
    const names = parents.map((d) => d.proponentName || d.projectTitle || '');
    const agree = names.every((n) => sameName(n, names[0]));
    if (!agree) return { verdict: 'review', reason: 'Different proponents under one permit number — perhaps a number typed wrong. Check each against its scan.' };
    if (differIn(parents, (d) => d.permit?.dateApproved, ['dateApproved'])) return { verdict: 'review', reason: 'The same permit number and proponent, approved on different dates — a re-issue, or a date typed wrong. Check each against its scan.' };
  } else {
    const types = new Set(docs.map((d) => d.docType));
    if (types.size > 1) return { verdict: 'legitimate', reason: 'One file name used for different kinds of document.' };
    const titles = docs.map((d) => d.title || d.fields?.firmName || d.fields?.companyName || '');
    const agree = titles.every((t) => sameName(t, titles[0]));
    if (!agree) return { verdict: 'legitimate', reason: 'One file name reused for documents of different firms or cases.' };
    const field = differIn(docs, (d, k) => d.fields?.[k], UNIT_IDS);
    if (field) return { verdict: 'legitimate', reason: `Separate documents in one scan — each has its own ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.` };
  }
  const pool = scope === 'records' ? parents : docs;
  const scans = new Set(pool.filter(hasScan).map((d) => String(d.document.sharePath || d.document.filePath || d.document.fileName).toLowerCase()));
  if (scans.size > 1) return { verdict: 'review', reason: 'The same document entered more than once, but with different scans. Open each and keep the right one.' };
  const keep = best(pool);
  return {
    verdict: 'duplicate',
    reason: `The same document entered ${pool.length} times${scans.size ? ', with one scan between them' : ''}. VERA keeps ${keep.serialNo}${hasScan(keep) ? '' : ' (and moves the scan to it)'}.`,
    keep: keep.serialNo,
    setAside: pool.filter((d) => d.serialNo !== keep.serialNo).map((d) => d.serialNo),
  };
}

/** The groups of a scope with VERA's reading. Groups already marked "not a duplicate" are left out. */
async function review(scope, allowedProvinces = null) {
  if (!UNITS.includes(scope)) throw Object.assign(new Error('Unknown unit.'), { status: 400 });
  await connectToMongo();
  const db = getDb();
  const col = db.collection(sourceOf(scope));
  const match =
    scope === 'records'
      ? { 'permit.number': { $nin: [null, '', 'n/a', 'N/A'] }, ...(Array.isArray(allowedProvinces) ? { 'location.province': { $in: allowedProvinces } } : {}) }
      : { unit: scope, 'document.fileName': { $nin: [null, ''] } };
  const by = scope === 'records' ? '$permit.number' : '$document.fileName';
  const groups = await col
    .aggregate([{ $match: match }, { $group: { _id: by, count: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { count: { $gt: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 300 }])
    .toArray();
  const reviewed = new Map((await db.collection(REVIEWS).find({ scope }).toArray()).map((r) => [r.key, r]));
  const docs = await col.find({ _id: { $in: groups.flatMap((g) => g.ids) } }).toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const out = [];
  for (const g of groups) {
    const members = g.ids.map((id) => byId.get(String(id))).filter(Boolean);
    const key = groupKey(scope, g._id);
    const seen = reviewed.get(key);
    // Marked "not a duplicate" for exactly these entries: hidden. A new entry
    // under the same number or name brings the group back.
    if (seen && seen.serials.length === members.length && members.every((m) => seen.serials.includes(m.serialNo))) continue;
    out.push({
      key,
      value: g._id,
      count: members.length,
      serials: members.map((m) => m.serialNo),
      withScan: members.filter(hasScan).map((m) => m.serialNo),
      ...judge(scope, members),
    });
  }
  return out;
}

/** Fix the duplicate groups named (or all VERA can fix): keep one, move its scan to it, set the rest aside. */
async function fix(scope, keys, user, allowedProvinces = null) {
  const groups = (await review(scope, allowedProvinces)).filter((g) => g.verdict === 'duplicate' && (keys === 'all' || keys.includes(g.key)));
  const db = getDb();
  const col = db.collection(sourceOf(scope));
  const who = user?.username || 'unknown';
  let setAside = 0;
  for (const g of groups) {
    const kept = await col.findOne({ serialNo: g.keep });
    if (!kept) continue;
    for (const serialNo of g.setAside) {
      const extra = await col.findOne({ serialNo });
      if (!extra) continue;
      // The scan comes to the entry kept, when that has none.
      if (!hasScan(kept) && hasScan(extra)) {
        await col.updateOne({ _id: kept._id }, { $set: { 'document.fileName': extra.document.fileName || null, 'document.filePath': extra.document.filePath || null, 'document.sharePath': extra.document.sharePath || null, 'document.movedFrom': serialNo, 'document.movedAt': new Date(), 'document.movedBy': `VERA (approved by ${who})` } });
        kept.document = { ...(kept.document || {}), fileName: extra.document.fileName, sharePath: extra.document.sharePath, filePath: extra.document.filePath };
      }
      await db.collection(SET_ASIDE).insertOne({ scope, collection: sourceOf(scope), serialNo, keptSerialNo: g.keep, reason: g.reason, doc: extra, setAsideAt: new Date(), setAsideBy: who });
      await col.deleteOne({ _id: extra._id });
      setAside += 1;
    }
  }
  require('../../shared/services/shortCache').invalidate('erms:');
  return { groups: groups.length, setAside };
}

/** "Not a duplicate": the group, as it is now, leaves the list. */
async function dismiss(scope, key, user, allowedProvinces = null) {
  const g = (await review(scope, allowedProvinces)).find((x) => x.key === key);
  if (!g) return { ok: false, status: 404, message: 'That group is no longer in the list.' };
  await getDb().collection(REVIEWS).updateOne({ scope, key }, { $set: { scope, key, serials: g.serials, verdict: 'not-duplicate', by: user?.username || null, at: new Date() } }, { upsert: true });
  return { ok: true };
}

/** Entries set aside, newest first. */
async function setAsideList(scope) {
  await connectToMongo();
  return (await getDb().collection(SET_ASIDE).find({ scope }, { projection: { doc: 0 } }).sort({ setAsideAt: -1 }).limit(200).toArray()).map(({ _id, ...x }) => ({ id: String(_id), ...x }));
}

/** Put an entry set aside back, exactly as it was. */
async function restore(scope, serialNo) {
  await connectToMongo();
  const db = getDb();
  const kept = await db.collection(SET_ASIDE).findOne({ scope, serialNo }, { sort: { setAsideAt: -1 } });
  if (!kept) return { ok: false, status: 404, message: 'Nothing set aside under that serial.' };
  if (await db.collection(kept.collection).findOne({ serialNo })) return { ok: false, status: 409, message: `${serialNo} is already on file.` };
  await db.collection(kept.collection).insertOne(kept.doc);
  await db.collection(SET_ASIDE).deleteOne({ _id: kept._id });
  require('../../shared/services/shortCache').invalidate('erms:');
  return { ok: true };
}

module.exports = { SET_ASIDE, REVIEWS, judge, review, fix, dismiss, setAsideList, restore };
