// ---------------------------------------------------------------------------
// VERA's check of the Universe Central DB register (15 Oct 2026).
//
// The Monitoring Plan was kept in spreadsheets by many hands for years, and
// it shows: the same city written three ways, "PAMPANGA" beside "Pampanga",
// a latitude typed in the longitude column, one ECC on two firms. VERA reads
// the active year's register (yearScope.registerOf) and reports two kinds of
// finding:
//
//   Fixes — a value to replace with another, field by field. Spellings that
//     differ only in capitals, spacing or punctuation, and province names,
//     she is certain of; near-identical place and industry spellings (by
//     rule, or by her AI model for the industry classes when one is on) are
//     marked for review. Coordinates entered the wrong way round are swapped.
//     Applied by a person, all or in part, and each can be undone to the
//     record. "Let VERA fix it" applies only what she is certain of.
//
//   For review — what needs a person: the same permit on more than one firm,
//     firms with no title, city or permit, coordinates outside Region III,
//     permits past their expiry. Listed with the serials to open; VERA does
//     not change these.
//
// Reports are kept in vera-ucds-checks, one current per register.
// ---------------------------------------------------------------------------

const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../../config/db');
const { sameWording, spellingByRule, spellingByModel, tidy } = require('../../../services/vera/dataCorrections');
const provider = require('../../../services/vera/provider');
const { PROVINCES } = require('../../../services/provinces');
const pm = require('./permitMatch');

const COLLECTION = 'vera-ucds-checks';
const checks = () => getDb().collection(COLLECTION);

// Fields whose spellings VERA reconciles, and how far she goes:
//   near: 'spelling' — near-identical spellings paired for review (the
//     industry classifications, where "Piggery Farm"/"Pigery Farm" is a slip);
//   near: 'accents' — only the same name with and without its accents
//     ("Santo Nino"/"Santo Niño"). Places a letter apart are usually two real
//     places — Santa Rosa and Santa Rita, San Manuel and San Miguel — so
//     nothing closer is ever proposed for them;
//   near: false — the same wording only.
const FIELDS = {
  province: { label: 'Province', near: false },
  city: { label: 'City / municipality', near: 'accents' },
  brgy: { label: 'Barangay', near: 'accents' },
  industry_type: { label: 'Industry type', near: 'spelling' },
  industry_subtype: { label: 'Industry sub-type', near: 'spelling' },
  industry_class: { label: 'Industry classification', near: 'spelling' },
  section_incharged: { label: 'Section in charge', near: false },
  handler: { label: 'Inspector / handler', near: false },
  permit_process: { label: 'Permit process', near: false },
  cong_district: { label: 'Congressional district', near: false },
};
const COORDS = 'coordinates';
const MAX_SAMPLES = 50;
const MAX_REMEMBERED = 20000;

// Region III, generously: anything outside is a typing slip or another region.
const REGION = { lat: [14.3, 16.7], long: [119.5, 122.4] };
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const inRange = (v, [lo, hi]) => v != null && v >= lo && v <= hi;

const blank = (v) => v == null || /^(\s*|n\/?a|-+|none|null|tba|tbd)$/i.test(String(v).trim());

/** m/d/yyyy, yyyy-mm-dd or a Date → Date, else null. */
function dateOf(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/** Province spellings to the register's own ("PAMPANGA", "Nueva Ecija" → "Nueva_Ecija"). */
function provinceFixes(values) {
  const out = [];
  for (const v of values) {
    const key = String(v.value).replace(/[\s_]+/g, '').toLowerCase();
    const p = PROVINCES.find((x) => x.value.replace(/_/g, '').toLowerCase() === key);
    if (p && p.value !== v.value) out.push({ field: 'province', from: v.value, to: p.value, count: v.count, reason: 'Province written differently', method: 'rule', confidence: 'certain' });
  }
  return out;
}

// "No Barangay", "--n/a--", "not applicable": a blank written out, not a
// spelling to reconcile.
const PLACEHOLDER = /^[\s\-–_.()]*(no\b.*|n\s*\/?\s*a|none|not applicable|null|tba|tbd|-+)[\s\-–_.()]*$/i;

async function countsOf(col, field) {
  const rows = await col.aggregate([{ $match: { [field]: { $type: 'string', $nin: [''] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]).toArray();
  return rows.filter((r) => String(r._id).trim() && !PLACEHOLDER.test(r._id)).map((r) => ({ value: r._id, count: r.count }));
}

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const ROMAN_OR_NUMBER = /\b([ivxlc]+|\d+)\b/gi;
const numerals = (s) => (String(s).match(ROMAN_OR_NUMBER) || []).map((x) => x.toLowerCase()).join(' ');

/**
 * A near spelling is a typo only where the words that differ are long ones:
 * "Subdivision"/"Subdivisions" is; "gas"/"bag" is two different words.
 */
function typoOnly(from, to) {
  const a = fold(from).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const b = fold(to).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((w, i) => w === b[i] || Math.min(w.length, b[i].length) >= 5);
}

/**
 * Places: a name most records write with underscores ("San_Jose_Del_Monte" —
 * the workbook's dropdown lists need them) is reconciled to its spaced form,
 * in the same capitals ("San Jose Del Monte"). The other spellings go there
 * as before (certain); turning the underscored majority into spaces is
 * proposed for review only — VERA does not do it by herself, as the
 * spreadsheets the register is exchanged with may rely on it.
 */
const UNDERSCORES = 'Underscores for spaces';
function preferSpaces(field, proposals, values) {
  const counts = new Map(values.map((v) => [v.value, v.count]));
  const byTarget = new Map();
  for (const p of proposals) {
    if (!byTarget.has(p.to)) byTarget.set(p.to, []);
    byTarget.get(p.to).push(p);
  }
  const out = [];
  for (const [to, group] of byTarget) {
    if (!to.includes('_') || !group.some((p) => !p.from.includes('_'))) {
      out.push(...group);
      continue;
    }
    // The other spellings still go to the majority's (consistent at once);
    // the majority's own change to spaces waits for a person.
    out.push(...group);
    out.push({ field, from: to, to: tidy(to.replace(/_/g, ' ')), count: counts.get(to) || 0, reason: UNDERSCORES, method: 'rule', confidence: 'review' });
  }
  return out;
}

/** The same place written with and without its accents: towards the accented spelling. */
function accentsOnly(field, canonical) {
  const groups = new Map();
  for (const [value, count] of canonical) {
    const k = fold(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ value, count });
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const to = [...g].sort((a, b) => Number(fold(b.value) !== b.value) - Number(fold(a.value) !== a.value) || b.count - a.count)[0].value;
    for (const v of g) if (v.value !== to) out.push({ field, from: v.value, to, count: v.count, reason: 'Same name, accents missing', method: 'rule', confidence: 'certain' });
  }
  return out;
}

/**
 * A fresh check of `col` (the active year's register, province-scoped by the
 * caller's wrapper is not needed: the Developer checks the whole register).
 */
async function scan({ col, register, cfg, by }) {
  await connectToMongo();
  const started = new Date();
  const notes = [];
  const fixes = [];

  for (const [field, { label, near }] of Object.entries(FIELDS)) {
    const values = await countsOf(col, field);
    const first = field === 'province' ? { proposals: provinceFixes(values), canonical: new Map() } : sameWording(field, values);
    let spelling = [];
    if (near === 'accents') {
      spelling = accentsOnly(field, first.canonical);
    } else if (near === 'spelling') {
      if (field === 'industry_class' && provider.isOperational(cfg)) {
        try {
          const r = await spellingByModel(field, first.canonical, cfg);
          spelling = r.proposals;
          notes.push(`Industry classifications spell-checked by VERA's model (${r.model || 'model'})${r.rejected ? `; ${r.rejected} suggestion(s) refused as more than a spelling fix` : ''}.`);
        } catch (err) {
          spelling = spellingByRule(field, first.canonical);
          notes.push(`The AI model could not be reached (${err.code || err.message}); industry classifications were paired by rule instead.`);
        }
      } else {
        spelling = spellingByRule(field, first.canonical);
      }
      // "Phase I"/"Phase II", "Zone 1"/"Zone 2": a different numeral is a
      // different thing, however close the spelling.
      spelling = spelling.filter((p) => numerals(p.from) === numerals(p.to) && (p.method === 'vera-ai' || typoOnly(p.from, p.to)));
    }
    if (near === 'accents') first.proposals = preferSpaces(field, first.proposals, values);
    const all = [...first.proposals, ...spelling];
    // Chains collapse (a value pointing at one itself corrected goes to the
    // final value) — but not through the underscores review, which waits.
    const next = new Map(all.filter((p) => p.reason !== UNDERSCORES).map((p) => [p.from, p.to]));
    for (const p of all) for (let hops = 0; hops < 4 && next.has(p.to) && next.get(p.to) !== p.from; hops++) p.to = next.get(p.to);
    fixes.push(...all.filter((p) => p.from !== p.to));
    notes.push(`${label}: ${values.length} different values checked.`);
  }

  // One pass over the records for what is per record.
  const swapped = [];
  const outside = [];
  const missing = [];
  const expired = [];
  const byPermit = new Map();
  const today = new Date();
  const cursor = col.find({}, { projection: { sort_key: 1, title: 1, name: 1, city: 1, province: 1, ecc_cnc: 1, lat: 1, long: 1, pto_code: 1, pto_expiration: 1, wwdp_code: 1, wwdp_expiration: 1 } });
  let total = 0;
  for await (const d of cursor) {
    total += 1;
    const ref = { sort_key: d.sort_key, title: d.title || d.name || '', province: d.province || '' };
    const lat = num(d.lat);
    const long = num(d.long);
    if (lat != null && long != null) {
      if (inRange(long, REGION.lat) && inRange(lat, REGION.long)) swapped.push({ ...ref, _id: d._id, lat: d.lat, long: d.long });
      else if (!inRange(lat, REGION.lat) || !inRange(long, REGION.long)) outside.push({ ...ref, detail: `${d.lat}, ${d.long}` });
    }
    const gaps = [];
    if (blank(d.title) && blank(d.name)) gaps.push('title');
    if (blank(d.city)) gaps.push('city');
    if (blank(d.ecc_cnc)) gaps.push('ECC/CNC');
    if (gaps.length) missing.push({ ...ref, detail: gaps.join(', ') });
    for (const [code, exp, label] of [['pto_code', 'pto_expiration', 'PTO'], ['wwdp_code', 'wwdp_expiration', 'WWDP']]) {
      const when = !blank(d[code]) && dateOf(d[exp]);
      if (when && when < today) expired.push({ ...ref, detail: `${label} ${d[code]} expired ${d[exp]}` });
    }
    if (!blank(d.ecc_cnc)) {
      // The first permit number in the field, compared loosely (hyphens,
      // spaces, padding), as the ERMS anchor compares them.
      const first = pm.numbersIn(d.ecc_cnc)[0] || d.ecc_cnc;
      const key = pm.unpadded(first) || pm.loosen(first);
      if (key && key.length >= 6) {
        if (!byPermit.has(key)) byPermit.set(key, []);
        byPermit.get(key).push({ ...ref, detail: d.ecc_cnc });
      }
    }
  }
  const duplicates = [...byPermit.values()].filter((list) => list.length > 1);

  if (swapped.length) {
    fixes.push({ field: COORDS, from: 'latitude ↔ longitude', to: 'swapped back', count: swapped.length, reason: 'Latitude and longitude entered the wrong way round', method: 'rule', confidence: 'certain', targets: swapped.map((s) => s._id), samples: swapped.slice(0, MAX_SAMPLES).map(({ _id, ...s }) => ({ ...s, detail: `${s.lat}, ${s.long}` })) });
  }

  const review = [
    { key: 'duplicate-permits', label: 'The same permit on more than one firm', hint: 'Open each and keep the right firm on the permit; the other may be a duplicate to archive or a typing slip.', count: duplicates.length, samples: duplicates.slice(0, MAX_SAMPLES).map((g) => ({ sort_key: g.map((x) => x.sort_key).join(', '), title: g.map((x) => x.title).filter(Boolean).slice(0, 2).join(' / '), province: g[0].province, detail: g[0].detail })) },
    { key: 'missing', label: 'Firms missing a title, city or permit', hint: 'Fill these from the permit or the last inspection report.', count: missing.length, samples: missing.slice(0, MAX_SAMPLES) },
    { key: 'outside-region', label: 'Coordinates outside Region III', hint: 'Check the latitude and longitude against the address; a digit is often missing.', count: outside.length, samples: outside.slice(0, MAX_SAMPLES) },
    { key: 'expired', label: 'Permits past their expiry', hint: 'Due for renewal: confirm with the firm, then update the permit dates.', count: expired.length, samples: expired.slice(0, MAX_SAMPLES) },
  ];

  const proposals = fixes
    .sort((a, b) => (a.field === b.field ? b.count - a.count : a.field.localeCompare(b.field)))
    .map((p, i) => ({ id: i + 1, ...p, applied: false, appliedAt: null, appliedBy: null, changed: 0 }));
  await checks().deleteMany({ register, status: 'proposed' });
  const doc = {
    register,
    status: 'proposed',
    startedAt: started,
    finishedAt: new Date(),
    by: by || null,
    notes: [`${total} records in the register checked.`, ...notes],
    totals: { records: total, proposals: proposals.length, toChange: proposals.reduce((a, p) => a + p.count, 0), review: review.reduce((a, r) => a + r.count, 0) },
    proposals,
    review,
  };
  const { insertedId } = await checks().insertOne(doc);
  return { _id: insertedId, ...doc };
}

const labelOf = (field) => (field === COORDS ? 'Coordinates' : FIELDS[field]?.label || field);

const publicRun = (run) =>
  run && {
    id: String(run._id),
    register: run.register,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    by: run.by,
    notes: run.notes || [],
    totals: run.totals,
    proposals: (run.proposals || []).map(({ appliedIds, targets, ...p }) => ({ ...p, fieldLabel: labelOf(p.field) })),
    review: run.review || [],
  };

async function latest(register) {
  await connectToMongo();
  const run = await checks().find({ register }).sort({ startedAt: -1 }).limit(1).next();
  return { current: publicRun(run) };
}

async function apply({ col, register, runId, ids, user }) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await checks().findOne({ _id: new ObjectId(runId), register }) : null;
  if (!run) return { ok: false, status: 404, message: 'That report is no longer there. Run a new check.' };
  // Underscores-for-spaces last: the other spellings first go to the
  // majority's, then the majority (now everything) changes at once.
  const wanted = run.proposals
    .filter((p) => !p.applied && (ids === 'all' || ids.includes(p.id)))
    .sort((a, b) => Number(a.reason === UNDERSCORES) - Number(b.reason === UNDERSCORES));
  const now = new Date();
  const who = user?.username || 'unknown';
  const stamp = { updated_at: now, updated_by: `VERA (approved by ${who})` };
  let changed = 0;
  for (const p of wanted) {
    if (p.field === COORDS) {
      // Swap each record's own pair, only where it is still the wrong way round.
      let n = 0;
      for (const _id of p.targets || []) {
        const d = await col.findOne({ _id }, { projection: { lat: 1, long: 1 } });
        if (!d || !(inRange(num(d.long), REGION.lat) && inRange(num(d.lat), REGION.long))) continue;
        await col.updateOne({ _id }, { $set: { lat: d.long, long: d.lat, ...stamp } });
        n += 1;
      }
      p.changed = n;
      p.appliedIds = p.targets || [];
    } else {
      const hits = await col.find({ [p.field]: p.from }, { projection: { _id: 1 } }).limit(MAX_REMEMBERED + 1).toArray();
      const res = await col.updateMany({ [p.field]: p.from }, { $set: { [p.field]: p.to, ...stamp } });
      p.changed = res.modifiedCount;
      p.appliedIds = hits.length <= MAX_REMEMBERED ? hits.map((h) => h._id) : null;
    }
    p.applied = true;
    p.appliedAt = now;
    p.appliedBy = who;
    changed += p.changed;
    if (p.reason === UNDERSCORES) {
      // What still waits towards the underscored spelling goes to the spaced
      // one now; a fix from the spaced to the underscored one would undo
      // this, so it is settled as superseded.
      for (const q of run.proposals) {
        if (q.applied || q.field !== p.field) continue;
        if (q.from === p.to && q.to === p.from) Object.assign(q, { applied: true, appliedAt: now, appliedBy: who, changed: 0, superseded: true });
        else if (q.to === p.from) q.to = p.to;
      }
    }
  }
  const left = run.proposals.filter((p) => !p.applied).length;
  await checks().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: left ? 'partly-applied' : 'applied' } });
  if (changed) require('../../../shared/services/shortCache').invalidate('ucds:');
  return { ok: true, applied: wanted.length, changed };
}

async function undo({ col, register, runId, id, user }) {
  await connectToMongo();
  const run = ObjectId.isValid(runId) ? await checks().findOne({ _id: new ObjectId(runId), register }) : null;
  const p = run?.proposals.find((x) => x.id === id);
  if (!p || !p.applied || p.superseded) return { ok: false, status: 404, message: 'Nothing to undo there.' };
  const stamp = { updated_at: new Date(), updated_by: `VERA undo (by ${user?.username || 'unknown'})` };
  let restored = 0;
  if (p.field === COORDS) {
    for (const _id of p.appliedIds || []) {
      const d = await col.findOne({ _id }, { projection: { lat: 1, long: 1 } });
      if (!d) continue;
      await col.updateOne({ _id }, { $set: { lat: d.long, long: d.lat, ...stamp } });
      restored += 1;
    }
  } else {
    const filter = p.appliedIds ? { _id: { $in: p.appliedIds }, [p.field]: p.to } : { [p.field]: p.to };
    restored = (await col.updateMany(filter, { $set: { [p.field]: p.from, ...stamp } })).modifiedCount;
  }
  Object.assign(p, { applied: false, appliedAt: null, appliedBy: null, changed: 0, appliedIds: null });
  await checks().updateOne({ _id: run._id }, { $set: { proposals: run.proposals, status: run.proposals.some((x) => x.applied) ? 'partly-applied' : 'proposed' } });
  require('../../../shared/services/shortCache').invalidate('ucds:');
  return { ok: true, restored };
}

/** A fresh check, then everything VERA is certain of applied. */
async function autoFix({ col, register, cfg, by, user }) {
  const run = await scan({ col, register, cfg, by });
  const certain = run.proposals.filter((p) => p.confidence === 'certain').map((p) => p.id);
  const result = certain.length ? await apply({ col, register, runId: String(run._id), ids: certain, user }) : { applied: 0, changed: 0 };
  return { ...result, left: run.proposals.length - certain.length };
}

module.exports = { COLLECTION, FIELDS, REGION, scan, latest, apply, undo, autoFix, provinceFixes, dateOf, tidy };
