// ---------------------------------------------------------------------------
// VERA's data corrections: the project types and specific project types in
// the Records Document Library.
//
// Years of typing by hand have left the same value spelled many ways —
// "Gasoline Filling Station", "Gasoline filling station", "Gasoline Filling
// Station" with two spaces — and a few real misspellings ("Infrastracture",
// "Meterials"). Counted, grouped or searched, each spelling is a different
// type. VERA finds them and proposes one spelling for each; the Developer
// reviews the report (Admin Settings › VERA Assistant › Data corrections)
// and applies it, all or in part.
//
// Two passes:
//   1. Same wording — spellings that differ only in capitals, spacing or
//      punctuation ("&" and "and") become the one used most. Certain.
//   2. Spelling — for project types, VERA's AI model (when one is on) is
//      asked for clear misspellings only, never rewording, and every answer
//      is checked to be a small edit of the original. Without a model, near-
//      identical spellings are paired by edit distance instead, marked for
//      review.
//
// Applying a proposal changes exactly the records that held the old value,
// remembers which they were, and can be undone to the record. Every scan,
// apply and undo is in VERA's activity log.
// ---------------------------------------------------------------------------

const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../config/db');
const provider = require('./provider');

const RECORDS = 'erms-records';
const COLLECTION = 'vera-corrections';
const FIELDS = {
  'project.type': 'Project type',
  'project.otherType': 'Specific project type',
  // The same proponent, city or barangay written several ways ("ABC
  // Corp." / "ABC CORP" / "ABC  Corp") is one value counted as several and
  // missed by a search. Names get the same-wording pass only: two names a
  // letter apart can be two different companies.
  proponentName: 'Proponent',
  // Titles too: the same title written with other capitals, spacing or
  // punctuation becomes one — same wording only, never a spelling guess.
  projectTitle: 'Project title',
  'location.city': 'City / municipality',
  'location.barangay': 'Barangay',
};
// Place names: near-identical spellings are paired for review too.
const PLACE_FIELDS = new Set(['location.city', 'location.barangay']);
// Remembering which records a proposal changed is what makes undo exact; a
// proposal touching more than this is still applied, but undone by value.
const MAX_REMEMBERED = 20000;

const collection = () => getDb().collection(COLLECTION);
const records = () => getDb().collection(RECORDS);

/** The comparison key: capitals, spacing, punctuation and "&"/"and" ignored. */
const keyOf = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bw\//g, 'with ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Spaces tidied: no doubles, none at either end. */
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Levenshtein distance, bounded: stops early past `max`. */
function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How a spelling reads, for choosing between equally common ones: no stray spaces, then more capitalised words. */
const readability = (s) => (tidy(s) === s ? 100 : 0) + (String(s).match(/\b[A-Z]/g) || []).length;

/** Every distinct value of a field with its count. */
async function countsOf(field) {
  const rows = await records()
    .aggregate([{ $match: { [field]: { $nin: [null, ''] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }])
    .toArray();
  return rows.filter((r) => typeof r._id === 'string' && r._id.trim()).map((r) => ({ value: r._id, count: r.count }));
}

/** Pass 1: one spelling per wording. Returns { proposals, canonical: Map(value -> count) }. */
function sameWording(field, values) {
  const groups = new Map();
  for (const v of values) {
    const k = keyOf(v.value);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const proposals = [];
  const canonical = new Map();
  for (const group of groups.values()) {
    const chosen = [...group].sort((a, b) => b.count - a.count || readability(b.value) - readability(a.value))[0];
    const to = tidy(chosen.value);
    canonical.set(to, group.reduce((a, g) => a + g.count, 0));
    for (const v of group) {
      if (v.value === to) continue;
      proposals.push({
        field,
        from: v.value,
        to,
        count: v.count,
        reason: tidy(v.value) === to ? 'Extra spaces' : 'Same wording, different capitals or punctuation',
        method: 'rule',
        confidence: 'certain',
      });
    }
  }
  return { proposals, canonical };
}

/**
 * Values the desktop system cut short ("Infrastracture Projects (ROAD and
 * BRIDG…"): each goes to the one full value it is the start of, when there
 * is exactly one.
 */
function cutShort(field, canonical) {
  const full = [...canonical.keys()].filter((v) => !/(…|\.\.\.)$/.test(v));
  const proposals = [];
  for (const [value, count] of canonical) {
    const m = /^(.*?)(…|\.\.\.)$/.exec(value);
    if (!m || m[1].trim().length < 8) continue;
    const start = keyOf(m[1]);
    const matches = full.filter((f) => keyOf(f).startsWith(start));
    if (matches.length === 1) proposals.push({ field, from: value, to: matches[0], count, reason: 'Cut short — completed', method: 'rule', confidence: 'certain' });
  }
  return proposals;
}

// What the model has said of each value, per field: "this is the spelling"
// or "it is fine". A check after a correction changes the list, so the whole
// list never matched the cache again and every value was sent once more; now
// only the values it has not judged are sent, and none at all when it has
// judged them all. Process memory, the semantic cache's lifetime and switch.
const judged = new Map(); // `${field}\u0000${value}` -> { to: string|null, expires }
const JUDGED_TTL_MS = () => Number(process.env.VERA_CACHE_TTL_MS) || 12 * 60 * 60 * 1000;

/** Pass 2 with the model: clear misspellings among the project types, checked to be small edits. */
async function spellingByModel(field, canonical, cfg) {
  const remember = require('./semanticCache').enabled(cfg);
  const now = Date.now();
  const known = (v) => {
    const j = remember && judged.get(`${field}\u0000${v}`);
    return j && j.expires > now ? j : null;
  };
  const list = [...canonical.keys()].filter((v) => !known(v)).sort();
  const fromMemory = () =>
    [...canonical.keys()]
      .map((from) => ({ from, to: known(from)?.to }))
      .filter((p) => p.to && p.to !== p.from && canonical.has(p.from))
      .map((p) => ({ field, from: p.from, to: p.to, count: canonical.get(p.from), reason: 'Spelling', method: 'vera-ai', confidence: 'review' }));
  if (!list.length) return { proposals: fromMemory(), model: 'remembered', rejected: 0, sent: 0 };
  const system =
    'You correct SPELLING ONLY in a list of environmental project type names used by a Philippine government office. ' +
    'Return a JSON array of objects {"from": "<exact item from the list>", "to": "<the same name, correctly spelled>"} — ' +
    'only for items with a clear misspelling of an English word (e.g. "Infrastracture" -> "Infrastructure"). ' +
    'Never reword, reorder, expand abbreviations, change capitalisation style, merge different types, or translate. ' +
    'If nothing is misspelled, return []. Output the JSON array and nothing else.';
  const prompt = `LIST:\n${list.map((v) => `- ${v}`).join('\n')}`;
  // A spelling pass, checked afterwards to be small edits: the light model's work.
  const out = await provider.complete(cfg, { system, prompt, maxTokens: 2048, tier: 'light', feature: 'spelling-check' });
  const text = String(out?.text || '');
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  let pairs = [];
  try {
    pairs = JSON.parse(json || '[]');
  } catch {
    // Not understood: nothing is remembered, so the next check asks again.
    return { proposals: fromMemory(), model: out?.model || null, rejected: 0, sent: list.length };
  }
  const fixes = new Map();
  let rejected = 0;
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const from = typeof p?.from === 'string' ? p.from : null;
    const to = typeof p?.to === 'string' ? tidy(p.to) : null;
    if (!from || !to || from === to || !canonical.has(from)) {
      rejected += 1;
      continue;
    }
    // A spelling fix is a small edit; anything more is rewording, refused.
    const d = distance(from.toLowerCase(), to.toLowerCase(), 6);
    if (d > Math.max(2, Math.round(from.length * 0.08))) {
      rejected += 1;
      continue;
    }
    fixes.set(from, to);
  }
  // Every value sent is judged now: its fix, or fine as it is.
  if (remember) {
    // A bound, not a policy: past it the memory starts afresh.
    if (judged.size + list.length > 50000) judged.clear();
    for (const v of list) judged.set(`${field}\u0000${v}`, { to: fixes.get(v) || null, expires: now + JUDGED_TTL_MS() });
  }
  const proposals = [...fixes].map(([from, to]) => ({ field, from, to, count: canonical.get(from), reason: 'Spelling', method: 'vera-ai', confidence: 'review' }));
  // With what was judged before, for the values not sent this time.
  const sent = new Set(list);
  proposals.push(...fromMemory().filter((p) => !sent.has(p.from)));
  return { proposals, model: out?.model || null, rejected, sent: list.length };
}

/** Pass 2 without a model: near-identical spellings paired, the rarer towards the more common. */
function spellingByRule(field, canonical) {
  const list = [...canonical.entries()].map(([value, count]) => ({ value, count, key: keyOf(value) })).sort((a, b) => b.count - a.count);
  const proposals = [];
  const taken = new Set();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (taken.has(a.value) || a.key.length < 10) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (taken.has(b.value) || b.key.length < 10) continue;
      if (distance(a.key, b.key, 2) <= 2) {
        proposals.push({ field, from: b.value, to: a.value, count: b.count, reason: 'Nearly the same spelling', method: 'rule', confidence: 'review' });
        taken.add(b.value);
      }
    }
  }
  return proposals;
}

/**
 * A fresh scan, stored as a report. Earlier unapplied reports are replaced.
 * @param cfg  VERA's settings, for the model
 */
async function scan({ cfg, by }) {
  await connectToMongo();
  const started = new Date();
  const notes = [];
  const all = [];
  // What the report says at a glance (the tab shows it as chips): each field
  // with its values and corrections, and how the spelling was checked. The
  // notes keep the same in sentences, for reports read elsewhere.
  const summary = { fields: [], spelling: null };
  // The six counts at once: each is one aggregation over the library, and
  // they waited on one another for nothing.
  const counted = await Promise.all(Object.keys(FIELDS).map((field) => countsOf(field)));
  for (const [i, field] of Object.keys(FIELDS).entries()) {
    const values = counted[i];
    const first = sameWording(field, values);
    // Values cut short go to their full value, and leave the spelling pass.
    const completed = cutShort(field, first.canonical);
    for (const p of completed) first.canonical.delete(p.from);
    first.proposals.push(...completed);
    let spelling = [];
    if (field === 'project.type') {
      if (provider.isOperational(cfg)) {
        try {
          const r = await spellingByModel(field, first.canonical, cfg);
          spelling = r.proposals;
          const of = first.canonical.size;
          summary.spelling = { by: r.sent ? 'model' : 'memory', model: r.sent ? r.model || null : null, sent: r.sent, remembered: of - r.sent, of, refused: r.rejected };
          notes.push(
            r.sent
              ? `Project type spelling: ${r.sent === of ? `all ${of}` : `${r.sent} new of ${of}`} sent to ${r.model || "VERA's model"}${r.sent < of ? `, ${of - r.sent} remembered` : ''}${r.rejected ? `; ${r.rejected} suggestion(s) refused as more than a spelling fix` : ''}.`
              : `Project type spelling: all ${of} remembered from before — no AI request.`
          );
        } catch (err) {
          spelling = spellingByRule(field, first.canonical);
          summary.spelling = { by: 'rule', why: err.message };
          notes.push(`Project type spelling paired by rule: the AI model could not be used (${err.message})`);
        }
      } else {
        spelling = spellingByRule(field, first.canonical);
        summary.spelling = { by: 'rule', why: 'No AI model is switched on.' };
        notes.push('Project type spelling paired by rule: no AI model is switched on.');
      }
    } else if (PLACE_FIELDS.has(field)) {
      spelling = spellingByRule(field, first.canonical);
    }
    // A value pointing at one that is itself corrected (cut short, misspelled)
    // goes straight to the final value.
    const fieldProposals = [...first.proposals, ...spelling];
    const next = new Map(fieldProposals.map((p) => [p.from, p.to]));
    for (const p of fieldProposals) {
      for (let hops = 0; hops < 4 && next.has(p.to) && next.get(p.to) !== p.from; hops++) p.to = next.get(p.to);
    }
    const kept = fieldProposals.filter((p) => p.from !== p.to);
    all.push(...kept);
    summary.fields.push({ field, label: FIELDS[field], values: values.length, proposals: kept.length });
    notes.push(`${FIELDS[field]}: ${values.length.toLocaleString('en-US')} values, ${kept.length} to correct.`);
  }
  const proposals = all
    .sort((a, b) => (a.field === b.field ? b.count - a.count : a.field.localeCompare(b.field)))
    .map((p, i) => ({ id: i + 1, ...p, applied: false, appliedAt: null, appliedBy: null, changed: 0 }));
  await collection().deleteMany({ status: 'proposed' });
  const doc = {
    status: 'proposed',
    startedAt: started,
    finishedAt: new Date(),
    by: by || null,
    notes,
    summary,
    totals: {
      proposals: proposals.length,
      records: proposals.reduce((a, p) => a + p.count, 0),
    },
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
    summary: run.summary || null,
    totals: run.totals,
    proposals: (run.proposals || []).map(({ appliedIds, ...p }) => ({ ...p, fieldLabel: FIELDS[p.field] || p.field })),
  };

/**
 * The latest report, and the earlier ones in brief. Only the latest is read
 * whole: the other nine were read with every proposal (hundreds of KB each)
 * on each refresh of the tab, to count how many had been applied.
 */
async function latest() {
  await connectToMongo();
  const [current, history] = await Promise.all([
    collection().findOne({}, { sort: { startedAt: -1 } }),
    collection()
      .aggregate([
        { $sort: { startedAt: -1 } },
        { $skip: 1 },
        { $limit: 9 },
        { $project: { status: 1, startedAt: 1, by: 1, totals: 1, applied: { $size: { $filter: { input: { $ifNull: ['$proposals', []] }, cond: '$$this.applied' } } } } },
      ])
      .toArray(),
  ]);
  return {
    current: publicRun(current || null),
    history: history.map((r) => ({ id: String(r._id), status: r.status, startedAt: r.startedAt, by: r.by, totals: r.totals, applied: r.applied })),
  };
}

/**
 * How many proposals of the latest report wait for the Developer, for the
 * bell — counted by the database, not read whole. The latest report only:
 * once it was applied in full, this went back to an older, part-applied
 * report that later checks had replaced, and the bell said 658 were waiting
 * while the tab showed none.
 */
async function pendingCount() {
  await connectToMongo();
  const [run] = await collection()
    .aggregate([
      { $sort: { startedAt: -1 } },
      { $limit: 1 },
      { $project: { waiting: { $size: { $filter: { input: { $ifNull: ['$proposals', []] }, cond: { $not: ['$$this.applied'] } } } } } },
    ])
    .toArray();
  return run?.waiting || 0;
}

/** A dotted field's value in a document ("project.type"). */
const valueAt = (doc, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);

/**
 * Apply proposals (by id, or all not yet applied).
 *
 * One read per field finds every record to change, and one batched write
 * changes them all. (It used to be a read and a write per proposal: "Apply
 * all" on a report of a thousand corrections took minutes, the request was
 * cut off midway, and the records it had changed were never written into
 * the report — changed, but shown as waiting and impossible to undo.)
 */
async function apply(runId, ids, user) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await collection().findOne({ _id: new ObjectId(runId) }) : null;
  if (!run) return { ok: false, status: 404, message: 'That report is no longer there. Run a new check.' };
  const wanted = ids === 'all' ? run.proposals.filter((p) => !p.applied) : run.proposals.filter((p) => !p.applied && ids.includes(p.id));
  if (!wanted.length) return { ok: true, applied: 0, changed: 0 };
  const now = new Date();
  const who = user?.username || 'unknown';

  // The records holding each old value, field by field.
  const hitsOf = new Map(); // `${field}\u0000${from}` -> [_id]
  const byField = new Map();
  for (const p of wanted) {
    if (!byField.has(p.field)) byField.set(p.field, new Set());
    byField.get(p.field).add(p.from);
  }
  for (const [field, froms] of byField) {
    const docs = await records()
      .find({ [field]: { $in: [...froms] } }, { projection: { _id: 1, [field]: 1 } })
      .toArray();
    for (const d of docs) {
      const key = `${field}\u0000${valueAt(d, field)}`;
      if (!hitsOf.has(key)) hitsOf.set(key, []);
      hitsOf.get(key).push(d._id);
    }
  }

  const ops = [];
  for (const p of wanted) {
    const hits = hitsOf.get(`${p.field}\u0000${p.from}`) || [];
    p.applied = true;
    p.appliedAt = now;
    p.appliedBy = who;
    p.changed = hits.length;
    p.appliedIds = hits.length <= MAX_REMEMBERED ? hits : null;
    if (hits.length) {
      ops.push({
        updateMany: {
          filter: { _id: { $in: hits }, [p.field]: p.from },
          update: { $set: { [p.field]: p.to, updatedAt: now, updatedBy: `VERA (approved by ${who})` } },
        },
      });
    }
  }
  const res = ops.length ? await records().bulkWrite(ops, { ordered: false }) : { modifiedCount: 0 };
  const changed = res.modifiedCount || 0;

  const left = run.proposals.filter((p) => !p.applied).length;
  await collection().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: left ? 'partly-applied' : 'applied' } });
  if (changed) {
    // A corrected value can be the one a record was flagged for; recheck
    // those records (this also clears the dashboard and tells open screens).
    const touched = wanted.flatMap((p) => hitsOf.get(`${p.field}\u0000${p.from}`) || []);
    await require('../../modules/erms/services/recordService').recheckDataQuality({ _id: { $in: touched } }, `VERA (approved by ${who})`);
  }
  return { ok: true, applied: wanted.length, changed };
}

/** Put one applied proposal back as it was. */
async function undo(runId, id, user) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await collection().findOne({ _id: new ObjectId(runId) }) : null;
  const p = run?.proposals.find((x) => x.id === id);
  if (!p || !p.applied) return { ok: false, status: 404, message: 'Nothing to undo there.' };
  const filter = p.appliedIds ? { _id: { $in: p.appliedIds }, [p.field]: p.to } : { [p.field]: p.to };
  const res = await records().updateMany(filter, { $set: { [p.field]: p.from, updatedAt: new Date(), updatedBy: `VERA undo (by ${user?.username || 'unknown'})` } });
  Object.assign(p, { applied: false, appliedAt: null, appliedBy: null, changed: 0, appliedIds: null });
  await collection().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: run.proposals.some((x) => x.applied) ? 'partly-applied' : 'proposed' } });
  require('../../modules/erms/services/recordService').recordsChanged();
  return { ok: true, restored: res.modifiedCount };
}

/**
 * "Let VERA fix it": a fresh check, then every proposal she is certain of
 * applied — the same wording written differently, values cut short. What
 * needs a person's eye (a spelling, a near-identical name) stays proposed in
 * the report. Each change can still be undone from the report.
 */
async function autoFix({ cfg, by, user }) {
  const run = await scan({ cfg, by });
  const certain = run.proposals.filter((p) => p.confidence === 'certain').map((p) => p.id);
  const result = certain.length ? await apply(String(run._id), certain, user) : { applied: 0, changed: 0 };
  return { ...result, left: run.proposals.length - certain.length };
}

module.exports = { COLLECTION, FIELDS, autoFix, keyOf, tidy, distance, sameWording, spellingByRule, spellingByModel, scan, latest, pendingCount, apply, undo };
