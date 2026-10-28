// ---------------------------------------------------------------------------
// The Universe Central DB's reports and its anchor to ERMS.
//
// Anchor: every Monitoring Plan permit (the ECC/CNC on an establishment) is
// checked against the Records Unit's Document Library, by the same matcher
// the register links use (dashes, spaces, zero padding, the letter O for a
// zero). The answer is only whether the permit is on file and under which
// FSN — for validation. Seeing the scan itself goes through the Document
// Portal's request, as everywhere else.
//
// Export: the Monitoring Plan of a province (or all within reach) as Excel,
// every field the establishments carry.
//
// Accomplishment: per province, how many establishments, how many have a
// monitoring schedule, how many were monitored, and how many have no record
// in ERMS.
// ---------------------------------------------------------------------------

const XLSX = require('xlsx');
const { getDb } = require('../../../config/db');
const pm = require('./permitMatch');

const INDEX_TTL = 10 * 60 * 1000;
let cached = { at: 0, index: null };
// A build in progress: callers that arrive meanwhile wait for it rather than
// each reading the whole Document Library again (3 s on the shared cluster).
let building = null;

/** The ERMS Document Library as a permit index (main records; attachments share their number). */
async function ermsIndex() {
  if (cached.index && Date.now() - cached.at < INDEX_TTL) return cached.index;
  if (!building) {
    building = buildErmsIndex().finally(() => {
      building = null;
    });
  }
  return building;
}

async function buildErmsIndex() {
  const rows = await getDb()
    .collection('erms-records')
    .find({ isAttachment: { $ne: true }, $or: [{ 'permit.number': { $nin: [null, ''] } }, { 'permit.refs.number': { $nin: [null, ''] } }] }, { projection: { serialNo: 1, permit: 1 } })
    .toArray();
  const index = pm.buildIndex(
    rows.map((r) => ({
      sort_key: r.serialNo,
      ecc_cnc: [r.permit?.number, ...(r.permit?.refs || []).map((x) => x.number)].filter(Boolean).join(', '),
      permit: r.permit,
    }))
  );
  cached = { at: Date.now(), index };
  return index;
}

/** One establishment's permit against ERMS: { status, serials, label, dateApproved }. */
function anchorOne(index, eccCnc) {
  const number = String(eccCnc || '').trim();
  if (!number || /^(n\/?a|none|-+)$/i.test(number)) return { status: 'none', serials: [] };
  const hit = pm.findMatch(index, number);
  const rows = hit ? [hit.row] : pm.candidatesOf(index, number).map((c) => c.row);
  if (!rows.length) return { status: 'missing', serials: [] };
  const first = rows[0];
  return {
    status: 'found',
    serials: [...new Set(rows.map((r) => r.sort_key))],
    label: first.permit?.label || first.permit?.type || null,
    dateApproved: first.permit?.dateApproved || null,
  };
}

/** sort_key → anchor, for the establishments named (within the caller's scope). */
async function anchor(scoped, sortKeys) {
  const index = await ermsIndex();
  const docs = await scoped.find({ sort_key: { $in: sortKeys } }, { projection: { sort_key: 1, ecc_cnc: 1 } }).toArray();
  return Object.fromEntries(docs.map((d) => [d.sort_key, anchorOne(index, d.ecc_cnc)]));
}

// The register's own columns first, in the order the Monitoring Plan reads;
// anything else an establishment carries after them.
const ORDER = [
  'sort_key', 'id_no', 'name', 'title', 'industry_type', 'industry_subtype', 'industry_class', 'psic_code', 'province', 'city', 'brgy', 'street', 'address', 'cong_district', 'waterbody', 'lat', 'long',
  'ecc_cnc', 'date_approved', 'date_amended', 'permit_process', 'pto_code', 'pto_issued', 'pto_expiration', 'wwdp_code', 'wwdp_issued', 'wwdp_expiration', 'haz_id', 'haz_issued', 'pco_no', 'pco_name', 'pco_validity',
  'section_incharged', 'mbu_area', 'monitoring_sched', 'insp_type', 'date_monitored', 'date_routed', 'date_signed', 'days_dmds', 'days_drds', 'iis_no_2024', 'iis_no_2025', 'title_status', 'remarks',
  'handler', 'legal_officer', 'docket_no', 'denr_pab_case_no', 'nov_issued', 'with_nov', 'penalty_date', 'tc_date_actual', 'tc_commitment', 'tc_compliance_link', 'other_tc_remarks',
  'v_pd1586', 'v_ra8749', 'v_ra9275', 'v_ra6969_haz', 'emp_total', 'bod', 'wwtf_type', 'pismu_tracking', 'pismu_count_month', 'amount', 'or_number',
];
const { HEALTHCARE_SERIAL, isHealthcare, healthcareFilter } = require('./healthcare');

const SKIP = new Set(['_id', 'helper_column', 'helper_count', 'searchText']);
// The register spells a province several ways ("Nueva_Ecija", " Tarlac", "BATAAN").
const provinceRegex = (province) => new RegExp(`^\\s*${String(province).replace(/[^A-Za-z_ ]/g, '').replace(/[_ ]/g, '[_ ]')}\\s*$`, 'i');
const header = (k) => k.replace(/_/g, ' ').replace(/\b(ecc|cnc|pto|wwdp|haz|pco|psic|nov|tc|iis|mbu|bod|wwtf|or|pd|ra|denr|pab|pismu|id|dmds|drds)\b/gi, (m) => m.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
const cell = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? JSON.stringify(v) : v);

/** The Monitoring Plan as an Excel workbook, with the ERMS anchor as a column. */
async function monitoringPlanWorkbook(scoped, { province, ownRegister = false } = {}) {
  // Healthcare Industries (a year with its own register) is the healthcare
  // list, and a province there is the province without it — as the screens
  // show them (see healthcare.js).
  const filter = !province
    ? {}
    : isHealthcare(province)
      ? (ownRegister ? healthcareFilter() : { _id: null })
      : ownRegister
        ? { province: provinceRegex(province), sort_key: { $not: HEALTHCARE_SERIAL } }
        : { province: provinceRegex(province) };
  const docs = await scoped.find(filter).sort({ id_no: 1 }).toArray();
  const keys = new Set();
  for (const d of docs) for (const k of Object.keys(d)) if (!SKIP.has(k)) keys.add(k);
  const columns = [...ORDER.filter((k) => keys.has(k)), ...[...keys].filter((k) => !ORDER.includes(k)).sort()];
  const index = await ermsIndex();
  const rows = docs.map((d) => {
    const row = {};
    for (const k of columns) row[header(k)] = cell(d[k]);
    const a = anchorOne(index, d.ecc_cnc);
    row['In ERMS'] = a.status === 'found' ? 'yes' : a.status === 'missing' ? 'not found' : '';
    row['ERMS FSN'] = a.serials.join(', ');
    return row;
  });
  const headers = rows.length ? Object.keys(rows[0]) : ['ID No'];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(50, Math.max(h.length, ...rows.slice(0, 300).map((r) => String(r[h] ?? '').length)) + 2) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (province ? `${province} Monitoring Plan` : 'Monitoring Plan').slice(0, 31));
  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }), count: rows.length };
}

/**
 * The spreadsheet view as Excel: the establishments the person sees (their
 * serials, in their order — filtered and sorted on the screen), the columns
 * they chose, under the labels they read. Within the caller's scope only: a
 * serial outside it is simply not found. The 2026 IIS numbers, which the
 * register does not hold yet, come from the RAW data as on the screen.
 */
async function viewWorkbook(scoped, { serials = [], columns = [], sheet = 'Monitoring Plan' } = {}) {
  const keys = serials.map(String).filter(Boolean).slice(0, 20000);
  const cols = columns
    .filter((c) => c && /^[a-z0-9_]{1,40}$/i.test(String(c.key)) && !SKIP.has(c.key))
    .slice(0, 120)
    .map((c) => ({ key: String(c.key), label: String(c.label || header(c.key)).slice(0, 80) }));
  if (!cols.length) cols.push({ key: 'sort_key', label: 'Serial No' });
  const projection = Object.fromEntries([...cols.map((c) => [c.key === 'brgy' ? 'brgy' : c.key, 1]), ['sort_key', 1], ['barangay', 1]]);
  const docs = await scoped.find({ sort_key: { $in: keys } }, { projection }).toArray();
  const bySerial = new Map(docs.map((d) => [d.sort_key, d]));
  let iis2026 = {};
  if (cols.some((c) => c.key === 'iis_no_2026')) {
    try {
      iis2026 = await require('../../../services/progressTracker').rawIis('');
    } catch {
      iis2026 = {};
    }
  }
  const rows = [];
  for (const k of keys) {
    const d = bySerial.get(k);
    if (!d) continue;
    const row = {};
    for (const c of cols) {
      let v = d[c.key];
      if ((v === undefined || v === null || v === '') && c.key === 'brgy') v = d.barangay;
      if ((v === undefined || v === null || v === '') && c.key === 'iis_no_2026') v = iis2026[d.sort_key];
      row[c.label] = cell(v);
    }
    rows.push(row);
  }
  const headers = cols.map((c) => c.label);
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(50, Math.max(h.length, ...rows.slice(0, 300).map((r) => String(r[h] ?? '').length)) + 2) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheet || 'Monitoring Plan').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }), count: rows.length };
}

const provinceLabel = (p) => String(p || 'Unfiled').trim().replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ── The Reports page ─────────────────────────────────────────────────────────
// Accomplishment and the ERMS validation list both need the whole register
// with each permit checked against ERMS. On 28 Oct 2026, over the 2027
// register's 26,199 establishments, that was 2.8 s to read the register,
// 3.3 s to build the ERMS index (cold) and 0.8 s to match — on every request,
// for each tab, and again for every province picked. It is now worked out
// once per scope, kept for a few minutes (cleared by any register edit: the
// key starts with the controller's REGISTER_CACHE prefix), and both reports
// are read from it.

const shortCache = require('../../../shared/services/shortCache');
const REPORTS_TTL = 5 * 60 * 1000;
const REPORTS_CACHE = 'ucds:register-reports:';

/** Every establishment in scope with its permit's ERMS status, in the register's order. */
async function anchoredRegister(scoped) {
  const [docs, index] = await Promise.all([
    scoped
      .find({}, { projection: { _id: 0, sort_key: 1, id_no: 1, title: 1, name: 1, ecc_cnc: 1, province: 1, city: 1, date_approved: 1, monitoring_sched: 1, date_monitored: 1 } })
      .sort({ id_no: 1 })
      .toArray(),
    ermsIndex(),
  ]);
  return docs.map((d) => ({ ...d, erms: anchorOne(index, d.ecc_cnc).status }));
}

/** The anchored register for a scope: shared for REPORTS_TTL when `cacheKey` names the scope. */
const anchoredFor = (scoped, cacheKey) =>
  cacheKey ? shortCache.cached(`${REPORTS_CACHE}${cacheKey}`, REPORTS_TTL, () => anchoredRegister(scoped)) : anchoredRegister(scoped);

/** Per province: establishments, scheduled, monitored, with a permit, found in ERMS. */
async function accomplishment(scoped, { cacheKey } = {}) {
  const docs = await anchoredFor(scoped, cacheKey);
  const by = new Map();
  for (const d of docs) {
    const p = provinceLabel(d.province);
    if (!by.has(p)) by.set(p, { province: p, establishments: 0, scheduled: 0, monitored: 0, withPermit: 0, inErms: 0, notInErms: 0 });
    const r = by.get(p);
    r.establishments += 1;
    if (String(d.monitoring_sched || '').trim()) r.scheduled += 1;
    if (String(d.date_monitored || '').trim()) r.monitored += 1;
    if (d.erms !== 'none') r.withPermit += 1;
    if (d.erms === 'found') r.inErms += 1;
    if (d.erms === 'missing') r.notInErms += 1;
  }
  return [...by.values()].sort((a, b) => b.establishments - a.establishments);
}

/** Establishments whose permit is not in the ERMS Document Library — the list to validate. */
async function notInErms(scoped, { province, cacheKey } = {}) {
  const docs = await anchoredFor(scoped, cacheKey);
  const inProvince = province ? provinceRegex(province) : null;
  return docs
    .filter((d) => d.erms === 'missing' && (!inProvince || inProvince.test(String(d.province || ''))))
    .map((d) => ({ sort_key: d.sort_key, title: d.title || d.name || '', ecc_cnc: d.ecc_cnc, province: provinceLabel(d.province), city: d.city || '', date_approved: d.date_approved || '' }));
}

module.exports = { notInErms, ermsIndex, anchorOne, anchor, monitoringPlanWorkbook, viewWorkbook, accomplishment, provinceLabel, REPORTS_CACHE };
