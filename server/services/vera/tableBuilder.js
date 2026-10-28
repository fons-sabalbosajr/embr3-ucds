// ---------------------------------------------------------------------------
// VERA's table builder: a Planning Unit table (services/customTables.js) made
// from the register, from a sentence.
//
// "Every poultry farm in Bulacan with its ECC, discharge permit and expiry",
// "firms with an expired PTO, by province": VERA's model turns the sentence
// into a SPEC — columns, filters, a sort, optionally per-group counts — and
// nothing else. The spec is checked field by field against the CATALOG below
// (the register's own fields, and the permit states of permitAnalysis), then
// run here, on the active year's register, within the provinces the person
// may see. The model never sees a record and never writes one: it only names
// fields, and what it names that is not in the catalog is dropped and said.
//
// The person sees the spec as a form and a preview, adjusts either, and
// creates the table; the spec is kept on the table, so "Refresh from the
// register" fills it again later. Without a model the same form is filled by
// hand.
// ---------------------------------------------------------------------------

const provider = require('./provider');
const permits = require('./permitAnalysis');
const { authorizedProvinces } = require('../authorization');
const { provinceFilter } = require('../provinces');

// ── What a table can be made of ──────────────────────────────────────────────

const f = (key, label, group, type = 'text', extra = {}) => ({ key, label, group, type, ...extra });
const CATALOG = [
  f('sort_key', 'Serial', 'Establishment'),
  f('name', 'Proponent / firm', 'Establishment'),
  f('title', 'Establishment / project title', 'Establishment'),
  f('industry_type', 'Industry type', 'Establishment', 'text', { sample: true }),
  f('industry_subtype', 'Industry sub-type', 'Establishment', 'text', { sample: true }),
  f('industry_class', 'Industry classification', 'Establishment', 'text', { sample: true }),
  f('psic_code', 'PSIC code', 'Establishment'),
  f('address', 'Address', 'Location'),
  f('brgy', 'Barangay', 'Location'),
  f('city', 'City / municipality', 'Location', 'text', { sample: true }),
  f('province', 'Province', 'Location', 'text', { sample: true }),
  f('cong_district', 'Congressional district', 'Location', 'text', { sample: true }),
  f('lat', 'Latitude', 'Location', 'number'),
  f('long', 'Longitude', 'Location', 'number'),
  f('mbu_area', 'Within Manila Bay area', 'Location', 'text', { sample: true }),
  f('waterbody', 'Receiving water body', 'Location'),
  f('protected_area', 'Protected area', 'Location'),
  f('section_incharged', 'Section in charge', 'Monitoring', 'text', { sample: true }),
  f('handler', 'Inspector / handler', 'Monitoring', 'text', { sample: true }),
  f('monitoring_sched', 'Schedule of monitoring', 'Monitoring', 'text', { sample: true }),
  f('insp_type', 'Type of inspection', 'Monitoring', 'text', { sample: true }),
  f('date_monitored', 'Date monitored', 'Monitoring', 'date'),
  f('with_nov', 'With previously issued NOV', 'Monitoring', 'text', { sample: true }),
  f('ecc_cnc', 'ECC/CNC reference', 'Permits'),
  f('permit_process', 'ECC/CNC permit process', 'Permits', 'text', { sample: true }),
  f('date_approved', 'ECC/CNC date approved', 'Permits', 'date'),
  f('pto_code', 'PTO code', 'Permits'),
  f('pto_issued', 'PTO date issued', 'Permits', 'date'),
  f('pto_expiration', 'PTO expiry', 'Permits', 'date'),
  f('wwdp_code', 'WWDP code', 'Permits'),
  f('wwdp_issued', 'WWDP date issued', 'Permits', 'date'),
  f('wwdp_expiration', 'WWDP expiry', 'Permits', 'date'),
  f('haz_id', 'Hazardous waste ID', 'Permits'),
  f('haz_issued', 'Hazardous waste ID date issued', 'Permits', 'date'),
  f('pco_no', 'PCO accreditation no.', 'Permits'),
  f('pco_name', 'PCO name', 'Permits'),
  f('pco_validity', 'PCO validity', 'Permits', 'date'),
  f('pd1586', 'NOV recommendation — PD 1586', 'Compliance', 'text', { sample: true }),
  f('ra8749', 'NOV recommendation — RA 8749', 'Compliance', 'text', { sample: true }),
  f('ra9275', 'NOV recommendation — RA 9275', 'Compliance', 'text', { sample: true }),
  f('ra6969', 'NOV recommendation — RA 6969', 'Compliance', 'text', { sample: true }),
  f('v_pd1586', 'Violation — PD 1586', 'Compliance'),
  f('v_ra8749', 'Violation — RA 8749', 'Compliance'),
  f('v_ra9275', 'Violation — RA 9275', 'Compliance'),
  f('v_ra6969_haz', 'Violation — RA 6969 (hazardous waste)', 'Compliance'),
  f('docket_no', 'Docket number', 'Legal'),
  f('nov_issued', 'Date NOV issued', 'Legal', 'date'),
  f('order_status', 'Order status', 'Legal', 'text', { sample: true }),
  f('amount', 'Penalty amount paid', 'Legal', 'number'),
  // VERA's permit check, worked out per record (permitAnalysis.js).
  ...['ecc', 'pto', 'wwdp', 'hw', 'pco'].map((k) =>
    f(`vera_${k}`, `VERA: ${{ ecc: 'ECC/CNC', pto: 'PTO', wwdp: 'WWDP', hw: 'HW ID', pco: 'PCO' }[k]} status`, "VERA's permit check", 'text', {
      virtual: true,
      values: ['valid', 'expiring', 'expired', 'missing', 'on-file', 'not-needed', 'not-assessed'],
    })
  ),
  f('vera_expires_next', 'VERA: next permit expiry', "VERA's permit check", 'date', { virtual: true }),
  f('vera_serious', 'VERA: serious findings', "VERA's permit check", 'number', { virtual: true }),
  f('vera_findings', 'VERA: findings', "VERA's permit check", 'number', { virtual: true }),
  f('vera_summary', 'VERA: what needs attention', "VERA's permit check", 'text', { virtual: true }),
];
const FIELD = new Map(CATALOG.map((c) => [c.key, c]));
const OPS = ['eq', 'ne', 'contains', 'in', 'empty', 'filled', 'gt', 'lt', 'before', 'after', 'within_days'];
const MAX_COLUMNS = 30;
const MAX_FILTERS = 12;
const MAX_ROWS = 2000;
const PREVIEW = 50;

// ── The spec ─────────────────────────────────────────────────────────────────

const clean = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * A spec as the model (or the form) sent it, checked: only catalog fields,
 * known operators, bounded sizes. What is dropped is said in `notes`.
 */
function cleanSpec(input) {
  const s = input && typeof input === 'object' ? input : {};
  const notes = [];
  const known = (key, where) => {
    if (FIELD.has(key)) return true;
    if (key) notes.push(`"${clean(key, 40)}" is not a field of the register, so it was left out of the ${where}.`);
    return false;
  };
  const seen = new Set();
  const columns = [];
  for (const c of Array.isArray(s.columns) ? s.columns.slice(0, MAX_COLUMNS) : []) {
    const name = clean(c?.name, 60).replace(/[[\]]/g, '');
    if (c?.formula) {
      const formula = String(c.formula).trim().slice(0, 300);
      if (name && formula.startsWith('=') && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        columns.push({ name, formula });
      }
      continue;
    }
    if (!known(c?.field, 'columns')) continue;
    const label = name || FIELD.get(c.field).label;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    columns.push({ name: label, field: c.field });
  }
  const filters = [];
  for (const x of Array.isArray(s.filters) ? s.filters.slice(0, MAX_FILTERS) : []) {
    if (!known(x?.field, 'filters')) continue;
    if (!OPS.includes(x.op)) {
      notes.push(`The condition "${clean(x.op, 20)}" is not one VERA can apply; it was left out.`);
      continue;
    }
    const value = Array.isArray(x.value) ? x.value.slice(0, 30).map((v) => clean(v, 80)) : clean(x.value, 120);
    filters.push({ field: x.field, op: x.op, value });
  }
  const group = Array.isArray(s.group?.by) ? s.group.by.filter((k) => known(k, 'grouping')).slice(0, 2) : [];
  const counts = (Array.isArray(s.group?.counts) ? s.group.counts : [])
    .slice(0, 10)
    .filter((c) => c && clean(c.name) && known(c.field, 'counts') && OPS.includes(c.op))
    .map((c) => ({ name: clean(c.name, 60).replace(/[[\]]/g, ''), field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.map((v) => clean(v)) : clean(c.value, 120) }));
  const sort = s.sort && FIELD.has(s.sort.field) ? { field: s.sort.field, dir: s.sort.dir === 'desc' ? 'desc' : 'asc' } : null;
  const limit = Math.min(MAX_ROWS, Math.max(1, Number.isFinite(Number(s.limit)) ? Math.round(Number(s.limit)) : MAX_ROWS));
  if (!columns.length && !group.length) notes.push('The table needs at least one column.');
  return { spec: { title: clean(s.title, 80), columns, filters, sort, limit, ...(group.length ? { group: { by: group, counts } } : {}) }, notes };
}

// ── Running it ───────────────────────────────────────────────────────────────

const escapeRx = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "Nueva Ecija" matches "Nueva_Ecija": the register keeps underscores in places.
const loose = (v) => escapeRx(clean(v, 120)).replace(/(?:\\\s|\s|_)+/g, '[\\s_]+');
const isBlank = (v) => v == null || /^\s*$/.test(String(v));

/** The part of a filter the database can do itself; the rest is done here. */
function mongoOf(x) {
  const d = FIELD.get(x.field);
  if (d.virtual || ['gt', 'lt', 'before', 'after', 'within_days'].includes(x.op)) return null;
  const k = x.field;
  if (x.op === 'eq') return { [k]: { $regex: `^\\s*${loose(x.value)}\\s*$`, $options: 'i' } };
  if (x.op === 'ne') return { [k]: { $not: new RegExp(`^\\s*${loose(x.value)}\\s*$`, 'i') } };
  if (x.op === 'contains') return { [k]: { $regex: loose(x.value), $options: 'i' } };
  if (x.op === 'in') return { [k]: { $regex: `^\\s*(${[].concat(x.value).map(loose).join('|')})\\s*$`, $options: 'i' } };
  if (x.op === 'empty') return { $or: [{ [k]: { $exists: false } }, { [k]: null }, { [k]: { $regex: '^\\s*$' } }] };
  if (x.op === 'filled') return { [k]: { $nin: [null, ''], $exists: true } };
  return null;
}

const DAY = 24 * 3600 * 1000;
const latestDate = (v) => {
  const ds = permits.readDates(v).dates;
  return ds.length ? new Date(Math.max(...ds)) : null;
};
const asNumber = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

/** One filter on one (already enriched) row. */
function test(row, x, today) {
  const v = row[x.field];
  const s = String(v ?? '').trim().toLowerCase();
  const want = Array.isArray(x.value) ? x.value.map((w) => String(w).toLowerCase()) : String(x.value ?? '').toLowerCase();
  const norm = (t) => t.replace(/[\s_]+/g, ' ');
  switch (x.op) {
    case 'eq':
      return norm(s) === norm(String(want));
    case 'ne':
      return norm(s) !== norm(String(want));
    case 'contains':
      return norm(s).includes(norm(String(want)));
    case 'in':
      return [].concat(want).map(norm).includes(norm(s));
    case 'empty':
      return isBlank(v);
    case 'filled':
      return !isBlank(v);
    case 'gt':
    case 'lt': {
      const a = asNumber(v);
      const b = asNumber(x.value);
      return a !== null && b !== null && (x.op === 'gt' ? a > b : a < b);
    }
    case 'before':
    case 'after': {
      const a = latestDate(v);
      const b = latestDate(x.value);
      return Boolean(a && b) && (x.op === 'before' ? a < b : a > b);
    }
    case 'within_days': {
      const a = latestDate(v);
      const n = asNumber(x.value);
      return Boolean(a) && n !== null && a >= today && a - today <= n * DAY;
    }
    default:
      return true;
  }
}

/** The permit check's values on a row, when the spec uses any. */
function enrich(row, today) {
  const a = permits.analyze(row, { today });
  const out = { ...row };
  for (const p of a.permits) if (['ecc', 'pto', 'wwdp', 'hw', 'pco'].includes(p.key)) out[`vera_${p.key}`] = p.state;
  const next = a.permits
    .map((p) => (p.expires && p.state !== 'expired' ? new Date(p.expires) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()))
    .sort((x, y) => x - y)[0];
  out.vera_expires_next = next ? `${next.getMonth() + 1}/${next.getDate()}/${next.getFullYear()}` : '';
  out.vera_serious = a.summary.high;
  out.vera_findings = a.findings.length;
  out.vera_summary = a.findings
    .filter((x) => x.severity !== 'low')
    .slice(0, 3)
    .map((x) => x.text)
    .join(' ');
  return out;
}

const cellOf = (v, d) => {
  if (v == null) return '';
  if (d?.type === 'number') return asNumber(v) ?? String(v);
  return String(v).replace(/\r\n?/g, '\n').trim();
};

// The whole register with VERA's permit check worked out, kept a short while:
// reading it takes seconds on the shared cluster, and a person adjusting a
// table previews it again and again. Never longer than the TTL — edits to the
// register show at the next read after it.
const ENRICHED_TTL = 2 * 60 * 1000;
const enriched = new Map(); // register → { at, rows }
const CATALOG_FIELDS = CATALOG.filter((c) => !c.virtual).map((c) => c.key);

async function enrichedRegister(col, today) {
  const hit = enriched.get(col.collectionName);
  if (hit && Date.now() - hit.at < ENRICHED_TTL) return hit.rows;
  const projection = Object.fromEntries([...new Set([...CATALOG_FIELDS, ...permits.FIELDS])].map((k) => [k, 1]));
  const rows = [];
  for await (const doc of col.find({}, { projection })) rows.push(enrich(doc, today));
  enriched.set(col.collectionName, { at: Date.now(), rows });
  // Not held past its use: the next read after the TTL starts afresh.
  setTimeout(() => {
    const now = enriched.get(col.collectionName);
    if (now && Date.now() - now.at >= ENRICHED_TTL) enriched.delete(col.collectionName);
  }, ENRICHED_TTL + 1000).unref?.();
  return rows;
}

/** The provinces a person may see, as a test on a row (all seven: no test). */
function provinceTest(keys) {
  const { PROVINCES } = require('../provinces');
  if (keys.length >= PROVINCES.length) return () => true;
  const norm = (v) => String(v ?? '').replace(/[\s_]+/g, ' ').trim().toLowerCase();
  const allowed = new Set(PROVINCES.filter((p) => keys.includes(p.key)).map((p) => norm(p.value)));
  return (row) => allowed.has(norm(row.province));
}

/**
 * Run a checked spec on the register, within the person's provinces.
 * @returns {{columns, rows, total, truncated, notes}} rows as { values } keyed by column name
 */
async function run(spec, { col, user, container, today = new Date(), limit, also = [], keep = false } = {}) {
  // With no year container, the seven provinces bounded by the account's own grant.
  const keys = authorizedProvinces(user, container || null);
  const fields = new Set(['sort_key', ...also, ...spec.columns.filter((c) => c.field).map((c) => c.field), ...spec.filters.map((x) => x.field), ...(spec.group?.by || []), ...(spec.group?.counts || []).map((c) => c.field)]);
  if (spec.sort) fields.add(spec.sort.field);
  const virtual = [...fields].some((k) => FIELD.get(k)?.virtual);

  const matched = [];
  if (virtual) {
    // VERA's permit check is worked out per record: the whole register, every filter here.
    const inScope = provinceTest(keys);
    for (const row of await enrichedRegister(col, today)) if (inScope(row) && spec.filters.every((x) => test(row, x, today))) matched.push(row);
  } else {
    const scope = provinceFilter(keys) || {};
    const projection = Object.fromEntries([...fields].map((k) => [k, 1]));
    const pushed = spec.filters.map(mongoOf).filter(Boolean);
    const rest = spec.filters.filter((x) => !mongoOf(x));
    const query = { ...scope, ...(pushed.length ? { $and: pushed } : {}) };
    for await (const row of col.find(query, { projection })) if (rest.every((x) => test(row, x, today))) matched.push(row);
  }

  // A count question (countFor) reads the matched rows themselves.
  if (keep) return { matched };

  if (spec.group) {
    const by = spec.group.by;
    const groups = new Map();
    for (const r of matched) {
      const k = by.map((b) => clean(String(r[b] ?? '').replace(/_/g, ' '), 120) || '(blank)');
      const id = k.join('\u0000');
      if (!groups.has(id)) groups.set(id, { k, n: 0, counts: spec.group.counts.map(() => 0) });
      const g = groups.get(id);
      g.n += 1;
      spec.group.counts.forEach((c, i) => {
        if (test(r, c, today)) g.counts[i] += 1;
      });
    }
    const columns = [...by.map((b) => ({ name: FIELD.get(b).label, type: 'text' })), { name: 'Establishments', type: 'number', total: 'sum' }, ...spec.group.counts.map((c) => ({ name: c.name, type: 'number', total: 'sum' }))];
    const rows = [...groups.values()]
      .sort((a, b) => b.n - a.n || a.k.join(' ').localeCompare(b.k.join(' ')))
      .map((g) => ({ values: Object.fromEntries([...by.map((b, i) => [FIELD.get(b).label, g.k[i]]), ['Establishments', g.n], ...spec.group.counts.map((c, i) => [c.name, g.counts[i]])]) }));
    return { columns, rows: rows.slice(0, limit || spec.limit), total: rows.length, truncated: rows.length > (limit || spec.limit), notes: [] };
  }

  if (spec.sort) {
    const { field, dir } = spec.sort;
    const d = FIELD.get(field);
    const keyOf = (r) => (d.type === 'number' ? asNumber(r[field]) : d.type === 'date' ? latestDate(r[field])?.getTime() ?? null : String(r[field] ?? '').toLowerCase());
    matched.sort((a, b) => {
      const x = keyOf(a);
      const y = keyOf(b);
      if (x === y) return 0;
      if (x === null || x === '') return 1;
      if (y === null || y === '') return -1;
      return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    });
  } else {
    matched.sort((a, b) => String(a.sort_key || '').localeCompare(String(b.sort_key || '')));
  }
  const columns = spec.columns.map((c) => (c.formula ? { name: c.name, type: 'formula', formula: c.formula } : { name: c.name, type: FIELD.get(c.field).type === 'number' ? 'number' : 'text' }));
  const cap = limit || spec.limit;
  const rows = matched.slice(0, cap).map((r) => ({ values: Object.fromEntries(spec.columns.filter((c) => c.field).map((c) => [c.name, cellOf(r[c.field], FIELD.get(c.field))])) }));
  return { columns, rows, total: matched.length, truncated: matched.length > cap, notes: [] };
}

// ── The catalog, with the values people actually typed ───────────────────────

const samples = new Map(); // register → { at, values }
const SAMPLE_TTL = 10 * 60 * 1000;

/** The catalog, and for the categorical fields their commonest values in this register. */
async function catalog(col) {
  const hit = samples.get(col.collectionName);
  let values = hit && Date.now() - hit.at < SAMPLE_TTL ? hit.values : null;
  if (!values) {
    const wanted = CATALOG.filter((c) => c.sample);
    const facet = Object.fromEntries(wanted.map((c) => [c.key, [{ $match: { [c.key]: { $type: 'string', $ne: '' } } }, { $group: { _id: `$${c.key}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 25 }]]));
    const [out] = await col.aggregate([{ $facet: facet }]).toArray();
    values = Object.fromEntries(Object.entries(out || {}).map(([k, v]) => [k, v.map((x) => String(x._id).replace(/\s+/g, ' ').trim()).filter(Boolean)]));
    samples.set(col.collectionName, { at: Date.now(), values });
  }
  return CATALOG.map((c) => ({ key: c.key, label: c.label, group: c.group, type: c.type, ...(c.values ? { values: c.values } : values[c.key] ? { values: values[c.key] } : {}) }));
}

// ── Drafting with the model ──────────────────────────────────────────────────

const SYSTEM = [
  "You turn a request for a table into a JSON spec over EMB Region III's register of establishments (the Monitoring Plan). You never see the data.",
  'Use ONLY the field keys in FIELDS. Never invent a field. If the request needs data the fields do not hold, leave it out and say so in "notes".',
  'Filter values for fields that list VALUES must be copied from those values (case and spelling as listed); for others, use "contains" with a short word.',
  'For "expired", "missing", "valid" or "expiring" permits use the vera_* status fields (values: valid, expiring, expired, missing, on-file, not-needed, not-assessed).',
  'For "how many … per/by …" use "group": {"by": [field], "counts": [{"name", "field", "op", "value"}]} — then "columns" may be empty. ' +
    'Put each condition being counted in "counts", NOT in "filters": filters narrow the whole table, so a count repeating a filter only repeats "Establishments".',
  'Operators: eq, ne, contains, in (value is a list), empty, filled, gt, lt (numbers), before, after (dates, m/d/yyyy), within_days (a date within N days from today).',
  'A formula column may compute from other columns of the table by name: {"name": "Days left", "formula": "=DAYS([PTO expiry], TODAY())"} — only when asked.',
  'Reply with JSON only: {"title": "...", "columns": [{"name": "...", "field": "..."}], "filters": [...], "sort": {"field": "...", "dir": "asc"|"desc"}, "group": ..., "notes": ["..."]}',
].join('\n');

/** Ask the model for a spec; checked before anything is run. */
async function draft(request, { cfg, col }) {
  if (!provider.isOperational(cfg)) return { ok: false, status: 409, message: "VERA's AI model is not available right now. Build the table with the form below instead — pick the columns and conditions yourself." };
  const cat = await catalog(col);
  // Ten values a field, each short: enough to copy a spelling, and the draft stays near a thousand tokens.
  const fields = cat.map((c) => `${c.key} — ${c.label} (${c.type})${c.values ? ` VALUES: ${c.values.slice(0, 10).map((v) => clean(v, 40)).join(' | ')}` : ''}`).join('\n');
  const out = await provider.complete(cfg, {
    system: SYSTEM,
    prompt: `FIELDS:\n${fields}\n\nToday is ${new Date().toLocaleDateString('en-US')}.\n\nREQUEST: ${clean(request, 600)}`,
    maxTokens: 1500,
    tier: 'main',
    feature: 'table',
  });
  const text = String(out.text || '');
  let parsed = null;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, status: 502, message: 'VERA could not turn that into a table. Try saying which establishments and which columns, or use the form.' };
  const { spec, notes } = cleanSpec(parsed);
  const said = (Array.isArray(parsed.notes) ? parsed.notes : []).map((n) => clean(n, 300)).filter(Boolean).slice(0, 5);
  return { ok: true, spec, notes: [...said, ...notes], model: out.model };
}

// ── Counting, for Ask VERA ───────────────────────────────────────────────────

// "How many WWDP in San Fernando?", "ilang establishments ang may expired PTO?"
// ("how may" is how it is often typed).
const COUNT_RE = /\b(how\s+ma(?:ny|y)|number\s+of|no\.?\s+of|count|counts|total|totals|ilan|ilang|bilang|kabuuan)\b/i;
// …about the register's establishments and permits, not a document count.
const REGISTER_RE =
  /\b(establishments?|firms?|compan(?:y|ies)|proponents?|projects?|facilit(?:y|ies)|monitoring\s+plan|register|universe|ecc|cnc|pto|wwdp|discharge\s+permits?|permits?\s+to\s+operate|haz\w*|hw\s*id|pco|nov|violations?|compliant|non-?compliant|expired|expiring|valid|missing|section|industry|poultry|piggery|resort|hospital|mining|quarry|province|city|municipality|barangay|aurora|bataan|bulacan|nueva\s+ecija|pampanga|tarlac|zambales)\b/i;
const wantsCount = (message) => COUNT_RE.test(String(message || '')) && REGISTER_RE.test(String(message || ''));

// Read by rule, not by a model: the question's permit, its state, the place,
// the industry and the section are matched against the register's own values,
// the count is made here, and the answer is written here — no model call, no
// tokens, and the number is exact. A question naming nothing it can match is
// left to the ordinary path.

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
const placeCore = (v) => fold(v).replace(/^city of /, '').replace(/ city$/, '').replace(/^municipality of /, '');
// A permit by its name, or by the law that requires it ("under RA 9275").
const KIND_WORDS = [
  ['wwdp', /\b(wwdp|dp|discharge\s+permits?|wastewater\s+discharge|r\.?\s?a\.?\s*(?:no\.?\s*)?9275|clean\s+water\s+act)\b/i, 'wwdp_code', 'a Wastewater Discharge Permit (WWDP)', 'RA 9275'],
  ['pto', /\b(pto|permits?\s+to\s+operate|poa|r\.?\s?a\.?\s*(?:no\.?\s*)?8749|clean\s+air\s+act)\b/i, 'pto_code', 'a Permit to Operate (PTO)', 'RA 8749'],
  // "ECC/CNC" together; else a CNC and an ECC are two different things.
  ['ecccnc', /\b(ecc\s*(?:\/|and|or|&)\s*cnc|cnc\s*(?:\/|and|or|&)\s*ecc|p\.?\s?d\.?\s*(?:no\.?\s*)?1586)\b/i, 'ecc_cnc', 'an ECC or a CNC', 'PD 1586'],
  ['cnc', /\b(cncs?|certificates?\s+of\s+non-?\s?coverage)\b/i, 'ecc_cnc', 'a CNC (Certificate of Non-Coverage)', 'PD 1586'],
  ['ecc', /\b(eccs?|environmental\s+compliance\s+certificates?)\b/i, 'ecc_cnc', 'an ECC', 'PD 1586'],
  ['hw', /\b(hw\s*ids?|haz\w*|hazardous\s+waste|generator\s+ids?|r\.?\s?a\.?\s*(?:no\.?\s*)?6969)\b/i, 'haz_id', 'a Hazardous Waste Generator ID', 'RA 6969'],
  ['pco', /\b(pco|pollution\s+control\s+officers?)\b/i, 'pco_no', 'a PCO accreditation', 'DAO 2014-02'],
];
const STATUS_FIELD = { ecc: 'pd1586', cnc: 'pd1586', ecccnc: 'pd1586', pto: 'ra8749', wwdp: 'ra9275', hw: 'ra6969' };
// Which the ECC/CNC column holds: a CNC by its process ("CNC Manual", "CNC
// Online") or a number written "CNC-…"; an ECC otherwise. The old numbers
// ("03PA-0302-01-007-120A") carry no prefix, so the process decides them.
const cncProcess = (r) => /^\s*cnc/i.test(String(r.permit_process || ''));
const NUMBERS_OF = {
  cnc: (r) => permits.numbersIn(r.ecc_cnc).filter((n) => /^CNC/i.test(n) || (cncProcess(r) && !/^ECC/i.test(n))),
  ecc: (r) => permits.numbersIn(r.ecc_cnc).filter((n) => /^ECC/i.test(n) || (!/^CNC/i.test(n) && !cncProcess(r))),
};
const numbersOfKind = (key, code, r) => (NUMBERS_OF[key] ? NUMBERS_OF[key](r) : permits.numbersIn(r[code]));
const vstate = (key) => (key === 'cnc' || key === 'ecccnc' ? 'ecc' : key);
const STATES = [
  ['expired', /\b(expired|lapsed|past\s+(?:its|their)\s+expiry|paso\s+na)\b/i],
  ['expiring', /\b(expiring|about\s+to\s+expire|due\s+for\s+renewal|for\s+renewal|malapit\s+ma-?expire)\b/i],
  // "no WWDP", never the "No." of "No. of WWDP".
  ['missing', /\b(missing|without|walang|lacking|kulang)\b|\bno\s+(?:wwdp|dp|pto|ecc|cnc|hw|haz\w*|pco|permits?|discharge|valid)\b/i],
  ['valid', /\b(valid|active|in\s+date|current)\b/i],
];
const GROUP_WORDS = [
  ['province', /\b(?:per|by|each|every|bawat)\s+province/i],
  ['city', /\b(?:per|by|each|every|bawat)\s+(?:city|municipality|town|lgu)/i],
  ['section_incharged', /\b(?:per|by|each|every|bawat)\s+(?:section|unit)/i],
  ['industry_class', /\b(?:per|by|each|every|bawat)\s+(?:industry|classification|type)/i],
];
const NOT_INDUSTRY = new Set(
  ('industry industries project projects other others including services service facility facilities establishment establishments operation operations activities ' +
    'and with without under manufacturing processing heavy production monitoring permit permits register universe expired valid missing there their which ' +
    'province provinces municipality total count number container containers years exact exactly please about those these')
    .split(' ')
);

const values = new Map(); // register → { at, city, province, industry words, sections }
async function valuesOf(col) {
  const hit = values.get(col.collectionName);
  if (hit && Date.now() - hit.at < SAMPLE_TTL) return hit;
  const [city, industryClass, industryType, industrySub, sections] = await Promise.all(['city', 'industry_class', 'industry_type', 'industry_subtype', 'section_incharged'].map((k) => col.distinct(k)));
  const words = new Set();
  for (const v of [...industryClass, ...industryType, ...industrySub]) for (const w of fold(v).split(' ')) if (w.length >= 5 && !NOT_INDUSTRY.has(w)) words.add(w);
  const out = { at: Date.now(), city: city.filter((v) => typeof v === 'string' && v.trim()), industry: words, sections: sections.filter((v) => typeof v === 'string' && v.trim()) };
  values.set(col.collectionName, out);
  return out;
}

/** The question read into conditions; null when it names nothing to count by. */
async function readCount(message, col) {
  const { PROVINCES } = require('../provinces');
  const text = ` ${fold(message)} `;
  const v = await valuesOf(col);
  const conds = []; // { label, test(row), state? }
  let needsCheck = false;

  // Provinces, then cities (a province's own name is the province unless "city" is said).
  const provinces = PROVINCES.filter((p) => text.includes(` ${fold(p.label)} `));
  const cityCores = [...new Set(v.city.map(placeCore))]
    .filter((c) => c.length >= 4 && text.includes(` ${c} `))
    .filter((c) => !provinces.some((p) => fold(p.label) === c) || text.includes(` ${c} city `) || text.includes(` city of ${c} `))
    .sort((a, b) => b.length - a.length);
  const cities = cityCores.filter((c, i) => !cityCores.slice(0, i).some((longer) => longer.includes(c)));
  // Each condition also narrows the database read (`mongo`) where it can.
  if (cities.length) {
    const set = new Set(cities);
    const written = v.city.filter((x) => set.has(placeCore(x)));
    conds.push({
      label: `City / municipality is ${cities.map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase())).join(' or ')}${written.length > cities.length ? ` (written in the register as ${[...new Set(written)].slice(0, 4).map((w) => `"${w}"`).join(', ')})` : ''}`,
      test: (r) => set.has(placeCore(r.city)),
      mongo: { city: { $in: written } },
    });
  }
  if (provinces.length) {
    const set = new Set(provinces.map((p) => fold(p.value)));
    conds.push({
      label: `Province is ${provinces.map((p) => p.label).join(' or ')}`,
      test: (r) => set.has(fold(r.province)),
      mongo: { province: { $regex: `^\\s*(${provinces.map((p) => p.value.replace(/_/g, '[ _]')).join('|')})\\s*$`, $options: 'i' } },
    });
  }

  // The permit asked about, and its state ("ECC/CNC" is one ask, not two).
  let kinds = KIND_WORDS.filter(([, re]) => re.test(message));
  if (kinds.some(([k]) => k === 'ecccnc')) kinds = kinds.filter(([k]) => k !== 'ecc' && k !== 'cnc');
  const state = (STATES.find(([, re]) => re.test(message)) || [])[0] || null;
  const nonCompliant = /\bnon-?\s?compliant|not\s+compliant|recommended\s+for\s+(?:an?\s+)?nov/i.test(message);
  const holds = (code) => ({ [code]: { $regex: '\\d' } });
  for (const [key, , code, what, law] of kinds) {
    if (nonCompliant && STATUS_FIELD[key]) {
      conds.push({ label: `NOV recommendation under ${law} is Non-Compliant`, test: (r) => /non/i.test(String(r[STATUS_FIELD[key]] || '')), mongo: { [STATUS_FIELD[key]]: { $regex: 'non', $options: 'i' } } });
    } else if (state) {
      needsCheck = true;
      const own = NUMBERS_OF[key];
      conds.push({
        label: `${what}: ${state} (VERA's permit check)`,
        // An ECC's or a CNC's state is the ECC/CNC column's; the kind must be the one asked.
        test: (r) => r[`vera_${vstate(key)}`] === state && (!own || state === 'missing' || own(r).length > 0),
        kind: key,
        ...(state === 'missing' ? {} : { mongo: holds(code) }),
      });
    } else {
      conds.push({
        label: `holds ${what} (a permit number on the register${key === 'cnc' ? '; a CNC by its permit process or a number written CNC-' : key === 'ecc' ? '; an ECC, not a CNC' : ''})`,
        test: (r) => numbersOfKind(key, code, r).length > 0,
        kind: key,
        holds: key,
        mongo: holds(code),
      });
    }
  }
  if (!kinds.length && state === 'expired') {
    needsCheck = true;
    conds.push({ label: 'any permit expired (VERA\'s permit check)', test: (r) => ['ecc', 'pto', 'wwdp', 'hw', 'pco'].some((k) => r[`vera_${k}`] === 'expired') });
  }
  if (/\bserious\s+findings?\b/i.test(message)) {
    needsCheck = true;
    conds.push({ label: 'with serious findings (VERA\'s permit check)', test: (r) => r.vera_serious > 0 });
  }
  const novAsked = /\bnov\b|notices?\s+of\s+violation/i.test(message) && !nonCompliant;
  if (novAsked && /\b(with|has|have|had|issued|may)\b/i.test(message)) {
    conds.push({ label: 'With previously issued NOV is YES', test: (r) => /^y/i.test(String(r.with_nov || '').trim()), mongo: { with_nov: { $regex: '^\\s*y', $options: 'i' } } });
  }
  // A condition asked for but not read is never dropped silently: a count
  // without it would be a wrong number, so the question goes the ordinary way.
  if (nonCompliant && !conds.some((c) => /Non-Compliant/.test(c.label))) return null;
  if (state && state !== 'expired' && !kinds.length) return null;

  // The industry, by a word the register's industry values use.
  const words = [...new Set(text.trim().split(' ').map((w) => w.replace(/s$/, '')))].filter((w) => w.length >= 5 && (v.industry.has(w) || v.industry.has(`${w}s`)));
  const placeWords = new Set([...cities, ...provinces.map((p) => fold(p.label))].join(' ').split(' '));
  const industry = words.filter((w) => !placeWords.has(w)).slice(0, 2);
  if (industry.length) {
    conds.push({
      label: `Industry mentions ${industry.map((w) => `"${w}"`).join(' and ')}`,
      test: (r) => industry.every((w) => fold(`${r.industry_type} ${r.industry_subtype} ${r.industry_class} ${r.title}`).includes(w)),
      mongo: { $and: industry.map((w) => ({ $or: ['industry_type', 'industry_subtype', 'industry_class', 'title'].map((k) => ({ [k]: { $regex: escapeRx(w), $options: 'i' } })) })) },
    });
  }
  // The section in charge, by its name.
  const section = v.sections.filter((s) => fold(s).length >= 3 && text.includes(` ${fold(s)} `)).sort((a, b) => b.length - a.length)[0];
  if (section) conds.push({ label: `Section in charge is ${section}`, test: (r) => fold(r.section_incharged) === fold(section), mongo: { section_incharged: section } });

  const group = (GROUP_WORDS.find(([, re]) => re.test(message)) || [])[0] || null;
  if (!conds.length && !group && !/\b(establishments?|firms?|register|monitoring\s+plan|universe)\b/i.test(message)) return null;
  return { conds, group, needsCheck, kinds: kinds.map(([k]) => k) };
}

/**
 * Answer a count question from the register — exact, and with no model call.
 * @returns {Promise<{answer: string, total: number}|null>} null when it is not one VERA can read
 */
async function countFor(message, { col, user, container, year, today = new Date() }) {
  if (!wantsCount(message)) return null;
  const q = await readCount(message, col);
  if (!q) return null;
  // The database narrows by what it can (place, permit held, NOV status, the
  // account's provinces); every condition is then tested here, and VERA's
  // permit check worked out only on the records that are left.
  const scope = provinceFilter(authorizedProvinces(user, container || null));
  const narrowed = q.conds.map((c) => c.mongo).filter(Boolean);
  const query = { ...(scope || {}), ...(narrowed.length ? { $and: narrowed } : {}) };
  const fields = ['sort_key', 'name', 'title', 'city', 'province', 'industry_type', 'industry_subtype', 'industry_class', 'section_incharged', 'with_nov', 'permit_process', 'ecc_cnc', 'pto_code', 'wwdp_code', 'haz_id', 'pco_no', ...Object.values(STATUS_FIELD)];
  const projection = Object.fromEntries([...new Set([...fields, ...(q.needsCheck ? permits.FIELDS : [])])].map((k) => [k, 1]));
  const matched = [];
  for await (const doc of col.find(query, { projection })) {
    const r = q.needsCheck ? enrich(doc, today) : doc;
    if (q.conds.every((c) => c.test(r))) matched.push(r);
  }
  const n = (x) => new Intl.NumberFormat('en-PH').format(x);
  const where = q.conds.length ? q.conds.map((c) => c.label).join('; ') : 'every establishment';
  const lines = [];
  // The headline: establishments, and for a permit asked about, its permit numbers too.
  // "How many WWDP": the establishments holding one, and the permit numbers they hold.
  const held = q.conds.filter((c) => c.holds);
  const kind = held.length === 1 ? KIND_WORDS.find(([k]) => k === held[0].holds) : null;
  const numbers = kind ? matched.reduce((s, r) => s + numbersOfKind(kind[0], kind[2], r).length, 0) : 0;
  const kindName = kind ? { ecccnc: 'ECC/CNC', cnc: 'CNC', ecc: 'ECC' }[kind[0]] || kind[0].toUpperCase() : '';
  lines.push(
    `**${n(matched.length)}** establishment${matched.length === 1 ? '' : 's'} in the ${year || 'active'} Monitoring Plan match${matched.length === 1 ? 'es' : ''}${kind && numbers !== matched.length ? `, holding **${n(numbers)}** ${kindName} number${numbers === 1 ? '' : 's'} in all (some hold more than one)` : ''}.`
  );
  lines.push('', `Counted just now from every record you may see. Conditions: ${where}.`);
  if (q.group) {
    const groups = new Map();
    for (const r of matched) {
      const k = clean(String(r[q.group] ?? '').replace(/_/g, ' '), 80) || '(blank)';
      groups.set(k, (groups.get(k) || 0) + 1);
    }
    lines.push('', `By ${labelOf(q.group).toLowerCase()}:`, ...[...groups].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, c]) => `- ${k}: ${n(c)}`));
  }
  if (matched.length && matched.length <= 8) {
    lines.push('', ...matched.map((r) => `- ${r.sort_key || '—'} · ${r.title || r.name || '—'} · ${String(r.city || '').replace(/_/g, ' ')}`));
  } else if (matched.length) {
    lines.push('', `To see them all, add a table in the year's menu and choose **Build with VERA**, or filter the province's Monitoring Plan.`);
  }
  return { answer: lines.join('\n'), total: matched.length, numbers: kind ? numbers : null, kindName, where };
}

const labelOf = (key) => FIELD.get(key)?.label || key;

module.exports = { CATALOG, OPS, MAX_ROWS, PREVIEW, cleanSpec, run, catalog, draft, countFor, wantsCount, enrich, test };
