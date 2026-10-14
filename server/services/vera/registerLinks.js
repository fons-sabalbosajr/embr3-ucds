// ---------------------------------------------------------------------------
// VERA's register links: Records Document Library entries that are not linked
// to their establishment in the Universe central register (UCDS).
//
// A record links itself when it is saved, by its permit (reference) number.
// Thousands never did, mostly because the number was typed by hand:
//
//   RO3-1103-0138                        the letter O for a zero
//   03NE070124-025-116A12 MARCH 2007     a date run into the number
//   Amended: X  Original: Y              two numbers in one cell
//   ECC‐OL‐R03‐2016‐0052                 a typographic dash
//
// The permit matcher now reads all of those (modules/ucds/services/
// permitMatch). VERA goes further, in passes from surest to least sure, and
// proposes a link for each record she can place; the Developer reviews the
// report (Admin Settings › VERA Assistant › Register links) and applies it.
//
//   1. Same number      — the matcher finds it.                       certain
//   2. Shared number    — the number belongs to several
//                         establishments; the proponent's name or the
//                         project title picks exactly one.            likely
//   3. Number typo      — the same groups of digits in the same order
//                         (leading zeros aside), and the names agree. likely
//   4. Same proponent   — the number is not in the register at all,
//                         but the proponent (or project title) names
//                         exactly one establishment in the same
//                         province. With the AI model on, VERA reads
//                         both sides and says whether they are one
//                         establishment: yes → likely, no → dropped.  review
//
// A link VERA makes says so (matchedOn "vera:<pass>"), remembers what the
// record held before, and can be undone to the record. Nothing changes until
// the Developer applies it.
// ---------------------------------------------------------------------------

const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');
const pm = require('../../modules/ucds/services/permitMatch');

const RECORDS = 'erms-records';
const REGISTER = 'ucds-data';
const COLLECTION = 'vera-register-links';
// The AI model reads at most this many "same proponent" pairs per check, in
// batches — bounded so a check stays inside the free tier.
const JUDGE_BATCH = 40;
const JUDGE_MAX = 400;

const collection = () => getDb().collection(COLLECTION);
const records = () => getDb().collection(RECORDS);

const PASSES = {
  number: 'Same permit number',
  shared: 'Number shared — the name picks one',
  typo: 'Number typed with a slip — the names agree',
  proponent: 'Same proponent — number not in the register',
};

// Words that say nothing about who someone is.
const NOISE = new Set(
  'MR MRS MS MISS HON HONORABLE ENGR ENG DR ATTY SPS SPOUSES THE OF AND INC INCORPORATED CORP CORPORATION CO COMPANY LTD LIMITED ENTERPRISE ENTERPRISES OPC PHILS PHIL PHILIPPINES'.split(' ')
);

/** A name as a set of words: capitals, punctuation, titles and company suffixes ignored. */
function wordsOf(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !NOISE.has(w));
}

const nameKey = (s) => [...new Set(wordsOf(s))].sort().join(' ');

/** Two names for the same person or company: the same words, or nearly. */
function namesAgree(a, b) {
  const x = new Set(wordsOf(a));
  const y = new Set(wordsOf(b));
  if (x.size < 2 || y.size < 2) return x.size === 1 && y.size === 1 && [...x][0] === [...y][0] && [...x][0].length >= 5;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  if (shared < 2) return false;
  const smaller = Math.min(x.size, y.size);
  return shared / smaller >= 0.8 || shared / (x.size + y.size - shared) >= 0.6;
}

/** Does the register row look like this record's establishment, by proponent or project title? */
const agrees = (rec, row) =>
  namesAgree(rec.proponentName, row.name) ||
  namesAgree(rec.proponentName, row.title) ||
  namesAgree(rec.projectTitle, row.name) ||
  namesAgree(rec.projectTitle, row.title);

const provinceKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** "03-1103-138": the groups of digits, leading zeros aside. */
const groupsKey = (s) => (String(s).match(/\d+/g) || []).map((g) => String(Number(g))).join('-');

/** Rows by a key, every row kept (the caller decides what a tie means). */
function multiIndex(rows, keysOf) {
  const map = new Map();
  for (const row of rows) {
    for (const k of new Set(keysOf(row))) {
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      const list = map.get(k);
      if (!list.some((r) => r.sort_key === row.sort_key)) list.push(row);
    }
  }
  return map;
}

const permitsOf = (row) => [row.ecc_cnc, row.haz_id].filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 160);

/** The one row in `rows` that agrees with the record, or null when none or several do. */
function pickByName(rec, rows) {
  const agreeing = rows.filter((row) => agrees(rec, row));
  return agreeing.length === 1 ? agreeing[0] : null;
}

/**
 * Place one record, without the model.
 * @returns {{row, pass, confidence, detail}|null}
 */
function place(rec, ctx) {
  const number = rec.permit?.number;
  if (number && String(number).trim()) {
    // 1. Same number.
    //    Digits alone are blunt (a CNC and an ECC can share them), so a
    //    digits-only match counts only when the names agree too.
    const hit = pm.findMatch(ctx.index, number);
    const named = hit && agrees(rec, hit.row);
    if (hit && (hit.strategy !== 'digits' || named)) {
      const strict = ['exact', 'loose', 'unpadded', 'hw'].includes(hit.strategy);
      return {
        row: hit.row,
        pass: 'number',
        confidence: strict || named ? 'certain' : 'likely',
        detail: hit.strategy,
      };
    }
    // 2. Shared number, picked by name.
    const shared = pm.candidatesOf(ctx.index, number).map((c) => c.row);
    if (shared.length > 1) {
      const row = pickByName(rec, shared);
      if (row) return { row, pass: 'shared', confidence: 'likely', detail: `${shared.length} establishments` };
    }
    // 3. The same digits, typed with a slip, and the names agree.
    for (const n of pm.numbersIn(number)) {
      const key = groupsKey(n);
      if (key.split('-').length < 2 || pm.digitsOf(n).length < 7) continue;
      const rows = ctx.byGroups.get(key) || [];
      const row = pickByName(rec, rows);
      if (row) return { row, pass: 'typo', confidence: 'likely', detail: n };
    }
  }
  // 4. Same proponent, number not in the register: one establishment of that
  //    name in the record's province.
  const province = provinceKey(rec.location?.province);
  const inProvince = (rows) => rows.filter((r) => !province || !r.province || provinceKey(r.province) === province);
  const byName = inProvince(ctx.byName.get(nameKey(rec.proponentName)) || []);
  const byTitle = inProvince(ctx.byTitle.get(nameKey(rec.projectTitle)) || []);
  const pool = byName.length === 1 ? byName : byTitle.length === 1 ? byTitle : [];
  if (pool.length === 1 && !(byName.length === 1 && byTitle.length === 1 && byName[0].sort_key !== byTitle[0].sort_key)) {
    // The proponent AND the project agree: one establishment, surely enough.
    // The proponent alone may have several projects: that is for review.
    const row = pool[0];
    const proponentAgrees = namesAgree(rec.proponentName, row.name) || namesAgree(rec.proponentName, row.title);
    const projectAgrees = namesAgree(rec.projectTitle, row.title) || namesAgree(rec.projectTitle, row.name);
    const both = proponentAgrees && projectAgrees;
    return { row, pass: 'proponent', confidence: both ? 'likely' : 'review', detail: both ? 'proponent and project' : byName.length === 1 ? 'proponent' : 'project title' };
  }
  return null;
}

/** Ask the model, in batches, whether each "same proponent" pair is one establishment. */
async function judge(pairs, cfg) {
  const system =
    'You compare records of a Philippine environmental regulator. Each item gives a document record (proponent, project, permit number, place) ' +
    'and an establishment from the central register (name, establishment title, permit numbers, place). ' +
    'Decide whether the record belongs to that same establishment — the same proponent AND the same project or facility. ' +
    'A company with several facilities is NOT the same establishment unless the project matches. A different permit number alone does not mean "no": ' +
    'the register may list only a later or earlier permit. Answer with a JSON array of {"n": <item number>, "same": "yes" | "no" | "unsure"} ' +
    'covering every item, and nothing else.';
  const verdicts = new Map();
  let calls = 0;
  let model = null;
  for (let i = 0; i < pairs.length; i += JUDGE_BATCH) {
    const batch = pairs.slice(i, i + JUDGE_BATCH);
    const items = batch.map((p, k) => ({
      n: k + 1,
      record: { proponent: p.rec.proponentName || '', project: p.rec.projectTitle || '', permit: p.rec.permit?.number || '', place: [p.rec.location?.city, p.rec.location?.provinceLabel || p.rec.location?.province].filter(Boolean).join(', ') },
      register: { name: p.row.name || '', title: p.row.title || '', permits: permitsOf(p.row), place: [p.row.city, p.row.province].filter(Boolean).join(', ').replace(/_/g, ' ') },
    }));
    // A batch takes longer than a chat answer; give it room.
    const out = await provider.complete(
      { ...cfg, requestTimeoutMs: Math.max(Number(cfg?.requestTimeoutMs) || 0, 60000) },
      { system, prompt: JSON.stringify(items), maxTokens: 2048 }
    );
    calls += 1;
    model = out?.model || model;
    const text = String(out?.text || '');
    let answers = [];
    try {
      answers = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1) || '[]');
    } catch {
      answers = [];
    }
    for (const a of Array.isArray(answers) ? answers : []) {
      const p = batch[Number(a?.n) - 1];
      if (p && ['yes', 'no', 'unsure'].includes(a?.same)) verdicts.set(p, a.same);
    }
  }
  return { verdicts, calls, model };
}

/**
 * A fresh check of every unlinked record, stored as a report. An earlier
 * report with nothing applied is replaced.
 * @param cfg  VERA's settings, for the model
 */
async function scan({ cfg, by }) {
  await connectToMongo();
  const db = getDb();
  const started = new Date();
  const notes = [];

  const unlinked = await records()
    .find(
      { $or: [{ ucdsRef: null }, { ucdsRef: { $exists: false } }, { 'ucdsRef.unmatched': true }] },
      { projection: { serialNo: 1, permit: 1, proponentName: 1, projectTitle: 1, location: 1, ucdsRef: 1 } }
    )
    .toArray();
  const register = await db
    .collection(REGISTER)
    .find({}, { projection: { sort_key: 1, name: 1, title: 1, ecc_cnc: 1, haz_id: 1, province: 1, city: 1 } })
    .toArray();

  const ctx = {
    index: pm.buildIndex(register),
    byGroups: multiIndex(register, (row) =>
      ['ecc_cnc', 'haz_id'].flatMap((f) => pm.tokensOf(row[f]).map((t) => groupsKey(pm.clean(t)))).filter((k) => k.split('-').length >= 2)
    ),
    byName: multiIndex(register, (row) => [nameKey(row.name)].filter((k) => k.length >= 6)),
    byTitle: multiIndex(register, (row) => [nameKey(row.title)].filter((k) => k.length >= 10)),
  };

  const found = [];
  let noNumber = 0;
  for (const rec of unlinked) {
    if (!rec.permit?.number || !pm.numbersIn(rec.permit.number).length) noNumber += 1;
    const placed = place(rec, ctx);
    if (placed) found.push({ rec, ...placed });
  }

  // The model reads the least sure pairs, when it is on.
  const toJudge = found.filter((f) => f.confidence === 'review').slice(0, JUDGE_MAX);
  let dropped = 0;
  if (toJudge.length) {
    if (provider.isOperational(cfg)) {
      try {
        const { verdicts, calls, model } = await judge(toJudge, cfg);
        for (const f of toJudge) {
          const v = verdicts.get(f);
          if (v === 'yes') Object.assign(f, { confidence: 'likely', method: 'vera-ai' });
          else if (v === 'no') Object.assign(f, { dropped: true });
          else f.method = 'rule';
        }
        dropped = toJudge.filter((f) => f.dropped).length;
        notes.push(
          `VERA's model (${model || 'model'}) read ${toJudge.length} "same proponent" pair(s) in ${calls} request(s): ` +
            `${toJudge.filter((f) => f.method === 'vera-ai').length} confirmed, ${dropped} dropped as different establishments.`
        );
        const unread = found.filter((f) => f.confidence === 'review').length - toJudge.length;
        if (unread > 0) notes.push(`${unread} more "same proponent" pair(s) were not read by the model this time; they are left for your review.`);
      } catch (err) {
        notes.push(`The AI model could not be reached (${err.code || err.message}); the "same proponent" links are left for your review.`);
      }
    } else {
      notes.push('No AI model is switched on: the "same proponent" links are left for your review.');
    }
  }

  const kept = found.filter((f) => !f.dropped);
  const rank = { certain: 0, likely: 1, review: 2 };
  const proposals = kept
    .sort((a, b) => rank[a.confidence] - rank[b.confidence] || String(a.rec.serialNo).localeCompare(String(b.rec.serialNo)))
    .map((f, i) => ({
      id: i + 1,
      recordId: f.rec._id,
      serialNo: f.rec.serialNo || null,
      permitNumber: f.rec.permit?.number || null,
      proponentName: f.rec.proponentName || null,
      projectTitle: f.rec.projectTitle || null,
      province: f.rec.location?.province || null,
      provinceLabel: f.rec.location?.provinceLabel || null,
      sortKey: f.row.sort_key,
      registerName: f.row.name || null,
      registerTitle: f.row.title || null,
      registerPermits: permitsOf(f.row),
      registerProvince: f.row.province || null,
      pass: f.pass,
      reason: PASSES[f.pass],
      detail: f.detail || null,
      confidence: f.confidence,
      method: f.method || 'rule',
      previous: f.rec.ucdsRef ?? null,
      applied: false,
      appliedAt: null,
      appliedBy: null,
    }));

  const byPass = Object.fromEntries(Object.keys(PASSES).map((k) => [k, proposals.filter((p) => p.pass === k).length]));
  notes.unshift(
    `${unlinked.length} unlinked record(s) read against ${register.length} register establishments. ` +
      `${proposals.length} can be linked: ${byPass.number} by the same number, ${byPass.shared} by a shared number, ` +
      `${byPass.typo} by a number typed with a slip, ${byPass.proponent} by the same proponent.`
  );
  const rest = unlinked.length - proposals.length - dropped;
  if (rest > 0) {
    notes.push(
      `${rest} record(s) have no establishment in the register yet${noNumber ? ` (${noNumber} of all unlinked have no usable permit number)` : ''}. ` +
        'They link by themselves once the establishment is added to the register and the record is saved again.'
    );
  }

  await collection().deleteMany({ status: 'proposed' });
  const doc = {
    status: 'proposed',
    startedAt: started,
    finishedAt: new Date(),
    by: by || null,
    notes,
    totals: { unlinked: unlinked.length, proposals: proposals.length, byPass, dropped },
    proposals,
  };
  const { insertedId } = await collection().insertOne(doc);
  return { _id: insertedId, ...doc };
}

const publicRun = (run) =>
  run && {
    id: String(run._id),
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    by: run.by,
    notes: run.notes || [],
    totals: run.totals,
    proposals: (run.proposals || []).map(({ previous, ...p }) => ({ ...p, recordId: String(p.recordId) })),
  };

/** The latest report. */
async function latest() {
  await connectToMongo();
  const run = await collection().findOne({}, { sort: { startedAt: -1 } });
  return { current: publicRun(run || null) };
}

/** How many links wait for the Developer, for the bell. */
async function pendingCount() {
  await connectToMongo();
  const run = await collection().findOne({ status: { $in: ['proposed', 'partly-applied'] } }, { sort: { startedAt: -1 }, projection: { proposals: 1 } });
  return (run?.proposals || []).filter((p) => !p.applied).length;
}

/** Apply links (by id, or every one not yet applied). A record linked since the check is left alone. */
async function apply(runId, ids, user) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await collection().findOne({ _id: new ObjectId(runId) }) : null;
  if (!run) return { ok: false, status: 404, message: 'That report is no longer there. Run a new check.' };
  const wanted = run.proposals.filter((p) => !p.applied && (ids === 'all' || ids.includes(p.id)));
  const now = new Date();
  const who = user?.username || 'unknown';
  let linked = 0;
  let skipped = 0;
  for (const p of wanted) {
    const res = await records().updateOne(
      { _id: p.recordId, $or: [{ ucdsRef: null }, { ucdsRef: { $exists: false } }, { 'ucdsRef.unmatched': true }] },
      {
        $set: {
          ucdsRef: {
            sortKey: p.sortKey,
            nameSnapshot: p.registerName || p.registerTitle || null,
            provinceKey: p.province || null,
            matchedOn: `vera:${p.pass}`,
            capturedAt: now,
            unmatched: false,
            linkedBy: `VERA (approved by ${who})`,
          },
          updatedAt: now,
          updatedBy: `VERA (approved by ${who})`,
        },
      }
    );
    if (res.modifiedCount) {
      Object.assign(p, { applied: true, appliedAt: now, appliedBy: who });
      linked += 1;
    } else {
      skipped += 1;
    }
  }
  const left = run.proposals.filter((p) => !p.applied).length;
  await collection().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: left ? 'partly-applied' : 'applied' } });
  if (linked) require('../../shared/services/shortCache').invalidate('erms:records:');
  return { ok: true, applied: linked, skipped };
}

/** Take back one link VERA made, if the record still holds it. */
async function undo(runId, id, user) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await collection().findOne({ _id: new ObjectId(runId) }) : null;
  const p = run?.proposals.find((x) => x.id === id);
  if (!p || !p.applied) return { ok: false, status: 404, message: 'Nothing to undo there.' };
  const res = await records().updateOne(
    { _id: p.recordId, 'ucdsRef.sortKey': p.sortKey, 'ucdsRef.matchedOn': `vera:${p.pass}` },
    { $set: { ucdsRef: p.previous ?? null, updatedAt: new Date(), updatedBy: `VERA undo (by ${user?.username || 'unknown'})` } }
  );
  Object.assign(p, { applied: false, appliedAt: null, appliedBy: null });
  await collection().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: run.proposals.some((x) => x.applied) ? 'partly-applied' : 'proposed' } });
  require('../../shared/services/shortCache').invalidate('erms:records:');
  return { ok: true, restored: res.modifiedCount };
}

module.exports = { COLLECTION, PASSES, wordsOf, nameKey, namesAgree, groupsKey, place, judge, scan, latest, pendingCount, apply, undo };
