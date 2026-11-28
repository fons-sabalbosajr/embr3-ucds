// ---------------------------------------------------------------------------
// What a tracked workbook holds, in counts the progress tracker compares.
//
// RAW universe workbooks (kind 'raw'). Only the MAIN worksheet counts as the
// universe: in a province's workbook the sheet named after the province
// (BULACAN, NUEVA_ECIJA…); in the 2027 lists (Healthcare, TSD / TRC…) their
// list sheets. Around it:
//
//   - the additions log (NEW ADDITIONS LOG, ADDED FIRM SUMMARY…: Source,
//     Sheet, Serial_No) says which serials were added and from where — the
//     ERMS export (CSV tb_main_data) or ECC Online — so the main sheet splits
//     into the baseline firms and those added from each source;
//   - the review sheets (NEW - CHECK DUPLICATE, HAZWASTE ID ONLY (ERMS))
//     hold firms not yet on the main sheet: pending, not counted;
//   - DUPLICATE, FOR DELISTING and FOR DELETION are the rows set aside.
//
// On the main sheet: the permits by kind (and on the added rows), and the
// rows people have coloured — the Planning Unit fills the cells they
// updated, so a coloured row is an updated row. The fill the additions are
// marked with (green for ERMS, blue for ECC Online) is the addition, not an
// update, so on an added row it is not counted as highlighting. Each main
// row also gets a fingerprint per section (profile, monitoring, permits,
// legal), so a later version can say which rows were added and which
// changed, and in what part.
//
// Newly issued permit workbooks (kind 'permits'): the permit numbers each
// holds (the ReferenceNo, HW GR No., Registration No. … column), counted
// once however many sheets repeat them, by province — and the firm each was
// issued to (its project name or proponent), for the validation check.
//
// The validation check (unvalidatedHighlights): a main row coloured since
// the baseline — marked as updated — while a permit newly issued to that
// same firm is still nowhere in the RAW data. Colouring a row is the
// Planning Unit's "validated"; a row coloured without its new permit was not.
//
// Pure: a workbook in, numbers out. No I/O.
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const XLSX = require('xlsx');
const { LOOKUP_SHEETS, GROUPS, PERMIT_FIELDS, groupOf, squeeze, fieldsOf, cell, serial, provinceOf } = require('../../modules/ucds/services/rawWorkbook');

// Bumped when what a reading counts changes: a baseline read under another
// version is not comparable (the tracker says so and offers a new one).
const ANALYSIS_VERSION = 2;

const PERMIT_COLUMNS = new Set(GROUPS.permits);
// The review sheets: firms waiting to be checked before they join the main sheet.
const REVIEW = /check\s*duplicate|hazwaste\s*id\s*only|\(erms\)/i;
const CATEGORY = (name) =>
  REVIEW.test(name) ? 'review' : /duplicate/i.test(name) ? 'duplicate' : /delisting/i.test(name) ? 'delisting' : /deletion/i.test(name) ? 'deletion' : 'main';
const CATEGORIES = ['main', 'review', 'duplicate', 'delisting', 'deletion'];
// Where an added firm came from, as the additions log's Source column says it.
const SOURCES = ['erms', 'ecconline', 'other'];
const sourceOf = (v) => (/ecc\s*-?\s*online/i.test(v) ? 'ecconline' : /csv|tb_main|erms/i.test(v) ? 'erms' : 'other');
const bySource = () => ({ erms: 0, ecconline: 0, other: 0 });
const blank = (v) => v == null || /^(\s*|n\/?a|-+|none|null|not applicable)$/i.test(String(v).trim());
// Written in a permit column while a permit is still being processed: not a
// permit yet. The UCD Tracking System's summary leaves these out of its
// counts, and so does the tracker (they are counted apart, as pending).
const PENDING_PERMIT = /in-?\s*process|interconnected|app\.?\s*no/i;

/** A permit number compared loosely: capitals, spaces and separators ignored, numbers unpadded. */
const permitKey = (v) =>
  String(v ?? '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p.replace(/^R[O0](\d)$/, 'R$1')))
    .join('-');
/** Every permit number in a cell ("ECC-1 / ECC-2" holds two). */
const permitKeys = (v) =>
  String(v ?? '')
    .split(/[\n;,/]|\s{2,}|\band\b/i)
    .map((x) => x.trim())
    .filter((x) => /\d{2,}/.test(x) && x.length >= 6)
    .map(permitKey);

const hash = (values) => crypto.createHash('sha1').update(values.join('\u0001')).digest('base64').slice(0, 8);

// The unit a row is counted under in the tracker's province matrix (the old
// UCD Tracking System's "tracking_v3" sheet, one column per province): the
// province, or — for the 2027 lists that span the provinces — the list.
const PROVINCE_CODE = { AU: 'Aurora', BA: 'Bataan', BU: 'Bulacan', NE: 'Nueva_Ecija', PA: 'Pampanga', TA: 'Tarlac', ZA: 'Zambales' };
const SERIES_UNIT = [
  [/^HC(CL)?-/i, 'Healthcare Industries'],
  // HCCP-/IMT-<province>-n up to the RAW workbooks; CP-/IM-n in the 2027 final ones.
  [/^(HCCP|CP)-/i, 'Chemical permits'],
  [/^(TSD|TRC)-/i, 'TSD / TRC'],
  [/^(IMT|IM)-/i, 'Importers'],
];
const PROVINCE_NAMES = new Set(Object.values(PROVINCE_CODE));
function unitOf(key, province) {
  const series = SERIES_UNIT.find(([re]) => re.test(key));
  if (series) return series[1];
  // The serial's province code first (AU-12, BU-0034); the province cell only
  // when it names one province ("Bataan, Pampanga, Zambales" does not).
  const code = /(?:^|-)([A-Z]{2})-\d+$/i.exec(key)?.[1]?.toUpperCase();
  if (PROVINCE_CODE[code]) return PROVINCE_CODE[code];
  return PROVINCE_NAMES.has(province) ? province : '(no province)';
}
const HEALTHCARE_UNITS = new Set(SERIES_UNIT.map(([, u]) => u));
/** The tracker's three kinds of list: the provinces, the 2027 healthcare lists, the rest (ECP…). */
const groupOfUnit = (unit) => (PROVINCE_NAMES.has(unit) ? 'province' : HEALTHCARE_UNITS.has(unit) ? 'healthcare' : 'other');

const kinds = () => Object.fromEntries(Object.keys(PERMIT_FIELDS).map((k) => [k, 0]));
const emptyUnit = () => ({
  rows: 0, // the main sheet's firms
  base: 0, // of which not added this updating
  added: bySource(),
  review: 0, // on the review sheets, not yet on the main sheet
  reviewSheets: {},
  pending: bySource(), // review rows the additions log lists
  duplicate: 0,
  delisting: 0,
  deletion: 0,
  permits: kinds(),
  pendingPermits: kinds(), // "In-process", "Interconnected", "App No." — not counted as permits
  addedPermits: kinds(), // on the added rows
  addedPermitsBy: bySource(),
  addedPermitsByKind: { erms: kinds(), ecconline: kinds(), other: kinds() }, // by source, by kind
  withPermit: 0,
  colored: 0, // main rows carrying a highlight (the addition marker aside)
  coloredBase: 0, // of which baseline rows
  coloredPermit: 0,
  rowColors: {}, // highlight fill -> rows
  // The Data Visualization tab (after the EMB R3 "Universe of Industries and
  // Projects" report): main-sheet firms by industry classification and by
  // municipality, and ECC/CNCs by year.
  classes: {},
  cities: {},
  eccYears: {},
});

// MongoDB keys may not hold dots or start with "$": a classification such as
// "Subdivisions and other housing proj." is kept with a look-alike dot.
const safeKey = (v) => String(v).trim().replace(/\s+/g, ' ').replace(/\./g, '․').replace(/^\$+/, '').slice(0, 80);

/**
 * The year an ECC/CNC was approved: its date, else its number, in the shapes
 * the Region has used — ECC-OL-R03-2016-0002, R03-02032016-3825 (a date
 * inside), and year-month after the region or province code: R3-0809-277,
 * 03BU-0512-29-577-120A, III-0105-123, III-BUL-0512, CNC-03BU-0512.
 */
function eccYear(date, number) {
  const now = new Date().getFullYear();
  const ok = (y) => y >= 1975 && y <= now;
  const d = /\b(19[7-9]\d|20\d{2})\b/.exec(String(date || ''));
  if (d && ok(Number(d[1]))) return Number(d[1]);
  const num = String(number || '').toUpperCase();
  const full = /-(19[7-9]\d|20\d{2})-/.exec(num) || /R0?3-\d{4}(19[7-9]\d|20\d{2})-/.exec(num);
  if (full && ok(Number(full[1]))) return Number(full[1]);
  const yymm = /(?:R0?3|III|\b0?3[A-Z]{2})(?:-[A-Z]{2,3})?-*(\d{2})(0[1-9]|1[0-2])/.exec(num);
  if (yymm) {
    const y = Number(yymm[1]);
    const year = y > now - 2000 ? 1900 + y : 2000 + y;
    if (ok(year)) return year;
  }
  return null;
}
const coord = (v) => {
  const x = Number(String(v ?? '').trim());
  return Number.isFinite(x) && x !== 0 ? Math.round(x * 1e5) / 1e5 : null;
};

/** A fill colour's family, from its hue, saturation and lightness (light and dark shades as one). */
function colourFamily(rgb) {
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(rgb || ''));
  if (!m) return 'gray';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return 'gray';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange'; // peach and beige shades too
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue'; // sky blue shades too
  if (h < 300) return 'purple';
  return 'pink';
}

// The workshop's rule for the newly issued lists (Workshop No. 1-3, "Input
// newly issued permits"): the masterlist holder looks each permit up in the
// RAW data and colours its row on the list by what they found — and so what
// the RAW data must then show. `inRaw`: the permit must be in the RAW data
// (true), must not be (false: the firm is not in the universe yet).
const MASTERLIST_LEGEND = {
  green: { label: 'Permit found', meaning: 'The firm is in the universe and its permit is already in the records.', inRaw: true },
  pink: { label: 'Renewed permit', meaning: "The firm is in the universe and was issued a renewed permit: its permit data updated.", inRaw: true },
  yellow: { label: 'New permit', meaning: 'The firm is in the universe with no permit encoded: the newly issued permit added.', inRaw: true },
  red: { label: 'Firm not in the universe', meaning: 'The firm is not yet in the universe: for verification with the facilitator.', inRaw: false },
  // Red's next step: the firm added to the RAW data, its row turned orange.
  // Orange rises as red falls; its permit must then be in the RAW data.
  orange: { label: 'Firm added in the universe RAW', meaning: 'Was red (not in the universe); the firm has since been added to the RAW data with its permit.', inRaw: true },
};

/**
 * What a permit on a newly issued list stands at, from its colour and the
 * RAW data:
 *   todo          no colour, not in the RAW data — not worked on yet
 *   unmarked      no colour, but already in the RAW data
 *   ok            the colour and the RAW data agree
 *   greenButNew   green ("already in the records"), but written in only this
 *                 updating — pink or yellow was meant
 *   notEncoded    green, pink or yellow, yet not in the RAW data
 *   redInRaw      red ("not in the universe"), yet in the RAW data
 *   otherColour   a colour the workshop does not use
 */
function permitStatus(family, inRaw, inRawAtBaseline) {
  if (!family) return inRaw ? 'unmarked' : 'todo';
  const rule = MASTERLIST_LEGEND[family];
  if (!rule) return 'otherColour';
  if (rule.inRaw && !inRaw) return 'notEncoded';
  if (!rule.inRaw && inRaw) return 'redInRaw';
  if (family === 'green' && inRawAtBaseline === false) return 'greenButNew';
  return 'ok';
}

// The workbook being read's theme colours (lt1, dk1, lt2, dk2, accent1–6,
// hlink, folHlink — Excel's palette order), for a fill picked from the theme
// ("White, Background 1, Darker 15%"), which the file keeps as a theme number
// and a tint, not an RGB. Set by analyzeRaw / analyzePermits for the workbook
// they read (one at a time in a thread).
let THEME = [];
const themeOf = (wb) => (wb?.Themes?.themeElements?.clrScheme || []).map((c) => String(c?.rgb || '').slice(-6).toUpperCase());

/** An RGB lightened (tint > 0) or darkened (tint < 0) as Excel does: on its HSL lightness. */
function tinted(rgb, tint) {
  if (!tint) return rgb;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h * 60) + 360) % 360;
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** A colour as the file writes it — RGB, or a theme colour with its tint — as an RGB string. */
function colourRgb(col) {
  if (!col) return null;
  if (col.rgb) return String(col.rgb).slice(-6).toUpperCase();
  if (col.theme !== undefined && THEME[col.theme]) return tinted(THEME[col.theme], Number(col.tint) || 0);
  return null;
}

// A row of a newly issued list is highlighted when one fill covers this share
// of its table's columns or more (two cells at least): the masterlist holder
// colours the row. A single shaded cell is formatting — the HWG ID list shades
// its whole HW GR No. column "White, Darker 5%" on every sheet — not a row
// coloured as looked up.
const ROW_FILL_SHARE = 0.25;

/** The colour a list's row was given (the fill on most of its cells), or null — see ROW_FILL_SHARE. */
function rowFillOf(ws, r, range) {
  const counts = {};
  let best = null;
  let most = 0;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const f = fillOf(ws[XLSX.utils.encode_cell({ r, c })]);
    if (!f) continue;
    counts[f] = (counts[f] || 0) + 1;
    if (counts[f] > most) {
      best = f;
      most = counts[f];
    }
  }
  const width = range.e.c - range.s.c + 1;
  return best && most >= 2 && most >= width * ROW_FILL_SHARE ? best : null;
}

/** The fill a cell carries, if any, as an RGB string — as Excel shows it, theme colours too. */
function fillOf(c) {
  const s = c?.s;
  if (!s || !s.patternType || s.patternType === 'none') return null;
  const rgb = colourRgb(s.fgColor) || colourRgb(s.bgColor);
  if (!rgb || rgb === 'FFFFFF') return null;
  return rgb;
}

// The ECP monitoring list (2026_ECP_RAW): a numbered list per semester, its
// own headings. Read into the same fields; its rows are keyed by sheet and
// number, as it has no serials.
const ECP_COLUMNS = [
  [/^no\.?$/, 'sort_key'],
  [/^project name/, 'title'],
  [/^project proponent/, 'name'],
  [/^project location/, 'address'],
  [/^covered municipalit/, 'city'],
  [/^province/, 'province'],
  [/^ecc reference/, 'ecc_cnc'],
  [/^date ecc issued/, 'date_approved'],
  [/section \/ unit/, 'section_incharged'],
];
function ecpFields(header) {
  const used = new Set();
  return header.map((h) => {
    const s = squeeze(h);
    const hit = ECP_COLUMNS.find(([re, f]) => re.test(s) && !used.has(f));
    if (!hit) return null;
    used.add(hit[1]);
    return hit[1];
  });
}

function layoutOf(grid, name) {
  let at = grid.findIndex((r) => r.some((c) => squeeze(c).startsWith('serial_no')));
  if (at >= 0) {
    const fields = fieldsOf(grid[at]);
    const col = fields.indexOf('sort_key');
    return { at, fields, serialOf: (r) => serial(r[col])?.sort_key || null };
  }
  at = grid.findIndex((r) => r.some((c) => /^project name/.test(squeeze(c))) && r.some((c) => /^ecc reference/.test(squeeze(c))));
  if (at < 0) return null;
  const fields = ecpFields(grid[at]);
  const col = fields.indexOf('sort_key');
  const prefix = name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 16).toUpperCase();
  return { at, fields, ecp: true, serialOf: (r) => (/^\d+$/.test(String(r[col] ?? '').trim()) ? `${prefix}-${Number(r[col])}` : null) };
}

/** "1ST SEM 2026_ECP_monitoring" -> "ECP · 1st sem": the ECP list's semesters as units of their own. */
const ecpUnit = (name) => {
  const sem = /(\d)\s*(st|nd|rd|th)\s*sem/i.exec(name);
  return sem ? `ECP · ${sem[1]}${sem[2].toLowerCase()} sem` : 'ECP';
};

/**
 * The additions log: which serials were added this updating, from which
 * source, and the fill each source's rows were marked with. Null when the
 * sheet is not one (it has no Source and Serial_No columns).
 */
function readAdditionsLog(ws, name) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const at = grid.slice(0, 12).findIndex((r) => r.some((c) => squeeze(c) === 'source') && r.some((c) => squeeze(c).startsWith('serial_no')));
  if (at < 0) return null;
  const head = grid[at].map(squeeze);
  const sourceCol = head.indexOf('source');
  const serialCol = head.findIndex((h) => h.startsWith('serial_no'));
  const nameCol = head.findIndex((h) => h.startsWith('proponent_name'));
  const titleCol = head.findIndex((h) => h.startsWith('project_title'));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const entries = [];
  const counts = bySource();
  const fills = { erms: {}, ecconline: {}, other: {} };
  for (let i = at + 1; i < grid.length; i++) {
    const key = serial(grid[i][serialCol])?.sort_key;
    if (!key) continue;
    const src = sourceOf(grid[i][sourceCol]);
    entries.push({ serial: key, src, name: nameCol >= 0 ? grid[i][nameCol] : null, title: titleCol >= 0 ? grid[i][titleCol] : null });
    counts[src] += 1;
    // The row's fill (the log row is coloured as its firm is on the main sheet).
    for (let c = range.s.c; c <= range.e.c; c++) {
      const rgb = fillOf(ws[XLSX.utils.encode_cell({ r: i + range.s.r, c })]);
      if (!rgb) continue;
      fills[src][rgb] = (fills[src][rgb] || 0) + 1;
      break;
    }
  }
  // Each source's marker: the fill most of its rows carry.
  const markers = {};
  for (const src of SOURCES) {
    const top = Object.entries(fills[src]).sort((a, b) => b[1] - a[1])[0];
    if (top) markers[src] = top[0];
  }
  return { name, category: 'log', rows: entries.length, bySource: counts, markers, entries };
}

const textKey = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Which source added a row, from the additions logs — by its project title
 * and proponent, not its serial: the main sheet gets renumbered as it is
 * sorted, and an old serial then names another firm. The serial is used only
 * for a log entry without a title.
 */
function logMatcher(logs) {
  const byPair = new Map();
  const bySerial = new Map();
  for (const l of logs) {
    for (const e of l.entries) {
      const t = textKey(e.title);
      if (t) byPair.set(`${t}|${textKey(e.name)}`, e.src);
      else bySerial.set(e.serial, e.src);
    }
  }
  return ({ key, title, name }) => byPair.get(`${textKey(title)}|${textKey(name)}`) || bySerial.get(key) || null;
}

/**
 * One sheet of a RAW workbook. `ctx`: the sheet's category, the unit its
 * rows count under (null: by serial), and the additions log's serials and
 * markers.
 */
function readRawSheet(ws, name, ctx = {}) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const layout = layoutOf(grid, name);
  if (!layout) return null;
  const { at, fields, serialOf, ecp } = layout;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const matchLog = ctx.matchLog || (() => null);
  const markers = ctx.markers || {};
  // A marker fill names its source: green rows were added from ERMS, blue
  // from ECC Online (the additions log's own legend).
  const markerSource = Object.fromEntries(Object.entries(markers).map(([src, rgb]) => [rgb, src]));
  // The row's leading cells — serial, proponent, title — carry the marker.
  const leadCols = fields.map((f, j) => (f === 'sort_key' || f === 'name' || f === 'title' ? j : -1)).filter((j) => j >= 0);
  const out = {
    name,
    category: ctx.category || CATEGORY(name),
    rows: 0,
    colored: 0,
    coloredPermit: 0,
    colors: {},
    // Rows per fill colour (a row counted once per colour it carries) — the
    // old tracker's "conditional highlighting" counts. `colors` counts cells.
    rowColors: {},
    permits: Object.fromEntries(Object.keys(PERMIT_FIELDS).map((k) => [k, 0])),
    withPermit: 0,
    provinces: {},
    units: {},
    fingerprints: {},
    keys: [],
    keySource: {},
    keyCells: {},
    records: [],
    // serial -> the row's highlight fills ("FFFF00,CAEEFB"), coloured rows only.
    highlights: {},
    // Each main row as the validation check reads it (memory only).
    checks: [],
  };
  for (let i = at + 1; i < grid.length; i++) {
    const r = grid[i];
    const key = serialOf(r);
    if (!key) continue;
    const values = {};
    fields.forEach((f, c) => {
      if (f && f !== 'sort_key') values[f] = cell(r[c]);
    });
    if (blank(values.title) && blank(values.name)) continue;
    out.rows += 1;
    const province = values.province ? provinceOf(values.province) : null;
    if (province) out.provinces[province] = (out.provinces[province] || 0) + 1;
    const unitName = ctx.unit || (ecp ? ecpUnit(name) : unitOf(key, province));
    const unit = (out.units[unitName] ||= emptyUnit());
    const main = out.category === 'main';
    // The row's fills, once: they say whether it is an addition, and what is highlighted.
    const rowFills = [];
    for (let c = range.s.c; c <= range.e.c; c++) rowFills.push(fillOf(ws[XLSX.utils.encode_cell({ r: i + range.s.r, c })]));
    let source = null;
    for (const j of leadCols) {
      if (markerSource[rowFills[j]]) {
        source = markerSource[rowFills[j]];
        break;
      }
    }
    // No marker (cleared, or never coloured): the log, by title and proponent.
    source ||= matchLog({ key, title: values.title, name: values.name, ecc: values.ecc_cnc });
    if (!main) {
      unit[out.category] += 1;
      if (out.category === 'review') {
        unit.reviewSheets[name] = (unit.reviewSheets[name] || 0) + 1;
        if (source) unit.pending[source] += 1;
      }
      continue;
    }
    unit.rows += 1;
    if (source) unit.added[source] += 1;
    else unit.base += 1;

    let any = false;
    const rowKeys = [];
    for (const [kind, field] of Object.entries(PERMIT_FIELDS)) {
      if (!blank(values[field]) && PENDING_PERMIT.test(String(values[field]))) {
        unit.pendingPermits[kind] += 1;
        continue;
      }
      if (!blank(values[field])) {
        out.permits[kind] += 1;
        unit.permits[kind] += 1;
        if (source) {
          unit.addedPermits[kind] += 1;
          unit.addedPermitsBy[source] += 1;
          unit.addedPermitsByKind[source][kind] += 1;
        }
        any = true;
        const j = fields.indexOf(field);
        for (const k of permitKeys(values[field])) {
          out.keys.push(k);
          rowKeys.push(k);
          // Which firm carries it: a newly issued permit found here is
          // encoded on a baseline firm or came with an addition.
          out.keySource[k] ||= source || 'base';
          // And where: the cell, for colouring it in the workbook (the
          // Office Script the tracker writes), with the fill it has now.
          (out.keyCells[k] ||= []).push({ sheet: name, col: XLSX.utils.encode_col(j + range.s.c), row: i + range.s.r + 1, kind, fill: rowFills[j] || null, serial: key });
        }
      }
    }
    if (any) {
      out.withPermit += 1;
      unit.withPermit += 1;
    }

    // The Data Visualization tab's counts, and the firm's row for its table and map.
    if (!blank(values.industry_class)) {
      const k = safeKey(values.industry_class);
      unit.classes[k] = (unit.classes[k] || 0) + 1;
    }
    if (!blank(values.city)) {
      const k = safeKey(String(values.city).replace(/_/g, ' '));
      unit.cities[k] = (unit.cities[k] || 0) + 1;
    }
    if (!blank(values.ecc_cnc)) {
      const y = eccYear(values.date_approved, values.ecc_cnc);
      if (y) unit.eccYears[y] = (unit.eccYears[y] || 0) + 1;
    }
    const v = (f) => (blank(values[f]) ? null : String(values[f]).trim());
    out.records.push({
      serial: key,
      unit: unitName,
      source: source || 'base',
      name: v('name'),
      title: v('title'),
      address: v('address') || [v('brgy'), v('city'), v('province')].filter(Boolean).join(', ') || null,
      city: v('city') ? v('city').replace(/_/g, ' ') : null,
      province: v('province') ? v('province').replace(/_/g, ' ') : null,
      industry: v('industry_class'),
      lat: coord(values.lat),
      lng: coord(values.long),
      ecc: v('ecc_cnc'),
      pto: v('pto_code'),
      wwdp: v('wwdp_code'),
      haz: v('haz_id'),
      chemical: v('chemical_permit'),
      tsd: v('tsd_ref_no'),
      trc: v('tp_trc_ref_no'),
      pco: v('pco_no'),
      iis2026: v('iis_no_2026'),
    });

    // Colours: the cells of this row (the sheet row is i, 0-based, as grid was
    // read from A1). On an added row its source's marker is the addition, not
    // an update: left out of the highlighting.
    let colored = false;
    let coloredPermit = false;
    const rowColors = new Set();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const rgb = rowFills[c - range.s.c];
      if (!rgb || (source && markers[source] === rgb)) continue;
      colored = true;
      rowColors.add(rgb);
      out.colors[rgb] = (out.colors[rgb] || 0) + 1;
      if (PERMIT_COLUMNS.has(fields[c - range.s.c])) coloredPermit = true;
    }
    for (const rgb of rowColors) {
      out.rowColors[rgb] = (out.rowColors[rgb] || 0) + 1;
      unit.rowColors[rgb] = (unit.rowColors[rgb] || 0) + 1;
    }
    if (colored) {
      out.colored += 1;
      unit.colored += 1;
      if (!source) unit.coloredBase += 1;
    }
    if (coloredPermit) {
      out.coloredPermit += 1;
      unit.coloredPermit += 1;
    }
    const hl = [...rowColors].sort().join(',') || null;
    if (hl) out.highlights[key] = hl;
    out.checks.push({ serial: key, unit: unitName, sheet: name, row: i + range.s.r + 1, title: v('title'), name: v('name'), keys: rowKeys, hl });

    const byGroup = { profile: [], monitoring: [], permits: [], legal: [] };
    for (const [f, v] of Object.entries(values)) byGroup[groupOf(f)].push(`${f}=${v ?? ''}`);
    out.fingerprints[key] = ['profile', 'monitoring', 'permits', 'legal'].map((g) => hash(byGroup[g].sort())).join('.');
  }
  return out;
}

/** Numbers added into `into`, nested objects alike (a unit's counts, a file's). */
function addInto(into, from) {
  for (const [k, v] of Object.entries(from || {})) {
    if (typeof v === 'number') into[k] = (into[k] || 0) + v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) addInto((into[k] ||= {}), v);
  }
  return into;
}

/** Unit counts from several sheets (or files) added together. */
function mergeUnits(list) {
  const out = {};
  for (const units of list) {
    for (const [name, u] of Object.entries(units || {})) addInto((out[name] ||= emptyUnit()), u);
  }
  return out;
}

/**
 * The province a workbook is about: the one a sheet is named after (BULACAN,
 * NUEVA_ECIJA) — else a main sheet naming one province among other words
 * ("Done | BULACAN"; not a review or set-aside sheet).
 */
function provinceSheetOf(names) {
  for (const name of names) {
    const p = provinceOf(name.trim());
    if (PROVINCE_NAMES.has(p)) return { sheet: name, province: p };
  }
  for (const name of names) {
    const p = CATEGORY(name) === 'main' ? sheetProvinceOf(name) : null;
    if (p) return { sheet: name, province: p };
  }
  return null;
}

/**
 * The sheets that are a RAW workbook's universe, as analyzeRaw counts them:
 * in a province's workbook its province sheet; in the 2027 lists every list
 * sheet — never an additions log (Source and Serial_No columns), a review
 * sheet or one set aside. For loading a year's register from the workbooks
 * (scripts/migrate-ucds/import-year-register.js), so it holds what the
 * tracker counts as firms.
 */
function mainSheetsOf(wb) {
  const names = wb.SheetNames.filter((n) => !LOOKUP_SHEETS.test(n));
  const isLog = (name) => {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false, range: 0 }).slice(0, 12);
    return grid.some((r) => r.some((c) => squeeze(c) === 'source') && r.some((c) => squeeze(c).startsWith('serial_no')));
  };
  const own = provinceSheetOf(names);
  return names.filter((n) => CATEGORY(n) === 'main' && (own ? n === own.sheet : !isLog(n)));
}

/** A RAW universe workbook. */
/** The workbook's standard classifications: its Industry_Classification (else ProjectType) sheet's first column. */
function classificationsOf(wb) {
  const name = wb.SheetNames.find((n) => /^industry_classification$/i.test(n.trim())) || wb.SheetNames.find((n) => /^projecttype$/i.test(n.trim()));
  if (!name) return [];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
  return [...new Set(grid.slice(1).map((r) => String(r[0] ?? '').trim()).filter((v) => v && !/^column\d*$/i.test(v)))].slice(0, 2000);
}

/**
 * A workbook without an additions log — the 2027 lists (Healthcare, Chemical
 * permits, TSD / TRC, Importers): its additions are the firms whose serial
 * was not on the list at the season's baseline (`baseSerials`), split by
 * source as the provinces' logs split theirs — an online ECC or CNC
 * (ECC-OL-…, CNC-OL-…) came from ECC Online, any other from the ERMS export.
 * Without a baseline (the season's first look) every firm is the baseline.
 */
const ONLINE_PERMIT = /\b(ECC|CNC)-OL-/i;
function baselineMatcher(baseSerials) {
  if (!Array.isArray(baseSerials)) return () => null;
  const base = new Set(baseSerials);
  return ({ key, ecc }) => (base.has(key) ? null : ONLINE_PERMIT.test(String(ecc || '')) ? 'ecconline' : 'erms');
}

function analyzeRaw(wb, { baseSerials = null } = {}) {
  THEME = themeOf(wb);
  const names = wb.SheetNames.filter((n) => !LOOKUP_SHEETS.test(n));
  // The additions log first: the main sheet is read against it.
  const logs = [];
  for (const name of names) {
    const log = readAdditionsLog(wb.Sheets[name], name);
    if (log) logs.push(log);
  }
  // No log: the additions are the firms new since the season's baseline.
  const matchLog = logs.length ? logMatcher(logs) : baselineMatcher(baseSerials);
  const markers = Object.assign({}, ...logs.map((l) => l.markers));
  const own = provinceSheetOf(names);

  const sheets = [];
  for (const name of names) {
    if (logs.some((l) => l.name === name)) continue;
    // A province's workbook: its province sheet is the main list, any other
    // sheet not set aside is for review. The 2027 lists: every list sheet.
    let category = CATEGORY(name);
    if (own && category === 'main' && name !== own.sheet) category = 'review';
    const s = readRawSheet(wb.Sheets[name], name, { category, unit: own?.province || null, matchLog, markers });
    if (s) sheets.push(s);
  }
  const main = sheets.filter((s) => s.category === 'main');
  const sum = (list, k) => list.reduce((a, s) => a + s[k], 0);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const s of sheets) byCategory[s.category] += s.rows;
  const permits = Object.fromEntries(Object.keys(PERMIT_FIELDS).map((k) => [k, main.reduce((a, s) => a + s.permits[k], 0)]));
  const colors = {};
  for (const s of main) for (const [k, n] of Object.entries(s.colors)) colors[k] = (colors[k] || 0) + n;
  const provinces = {};
  for (const s of main) for (const [p, n] of Object.entries(s.provinces)) provinces[p] = (provinces[p] || 0) + n;
  const rowColors = {};
  for (const s of main) for (const [k, n] of Object.entries(s.rowColors)) rowColors[k] = (rowColors[k] || 0) + n;
  const units = mergeUnits(sheets.map((s) => s.units));
  const totals = Object.values(units).reduce((t, u) => addInto(t, u), emptyUnit());
  return {
    kind: 'raw',
    v: ANALYSIS_VERSION,
    mainSheet: own?.sheet || null,
    rows: byCategory.main,
    base: totals.base,
    added: totals.added,
    pending: totals.pending,
    byCategory,
    permits,
    addedPermits: totals.addedPermits,
    addedPermitsByKind: totals.addedPermitsByKind,
    withPermit: sum(main, 'withPermit'),
    colored: sum(main, 'colored'),
    coloredPermit: sum(main, 'coloredPermit'),
    colors,
    rowColors,
    provinces,
    units,
    additionsLog: logs.map(({ entries, ...rest }) => rest),
    sheets: [
      ...sheets.map(({ fingerprints, keys, keySource: _k, keyCells: _c, records: _r, provinces: _p, units: _u, highlights: _h, checks: _ch, ...rest }) => rest),
      ...logs.map(({ entries, markers: _m, ...rest }) => rest),
    ],
    // Not stored with the counts: the comparison material.
    fingerprints: Object.assign({}, ...main.map((s) => s.fingerprints)),
    keys: [...new Set(main.flatMap((s) => s.keys))],
    keySource: Object.assign({}, ...main.map((s) => s.keySource)),
    // Where each permit number sits on the main sheet (memory only).
    keyCells: main.reduce((acc, s) => {
      for (const [k, cells] of Object.entries(s.keyCells)) (acc[k] ||= []).push(...cells);
      return acc;
    }, {}),
    // The main sheets' firms, for the Developer's table and map: kept in the
    // server's memory only, never stored.
    records: main.flatMap((s) => s.records),
    // The standard industry classifications (memory only): the PSIC basis.
    classifications: classificationsOf(wb),
    // The coloured rows' fills, by serial: stored with the baseline (to tell
    // a row coloured since), and the rows the validation check reads (memory).
    highlights: Object.assign({}, ...main.map((s) => s.highlights)),
    checks: main.flatMap((s) => s.checks),
    // The 2026 IIS reference numbers by serial (the register has none yet):
    // stored with the file's reading, small — only the rows that have one.
    iis: Object.fromEntries(main.flatMap((s) => s.records).filter((r) => r.iis2026).map((r) => [r.serial, r.iis2026.slice(0, 200)])),
  };
}

const PERMIT_HEADER = /reference ?no|ref\.? ?no|hw ?gr ?no|registration ?no|certificate ?no|permit ?no|ecc ?no|^id ?no/i;
const PROVINCE_HEADER = /^province$/i;
// "Application Type" (PTO, WWDP: New - Regular / Renewal) or "Sub Type"
// (HWG ID, TSD, TRC: New / Renewal / Amendment).
const TYPE_HEADER = /^(application type|sub ?type)$/i;
const typeOf = (v) => (/renew|amend/i.test(String(v || '')) ? 'renewal' : /new/i.test(String(v || '')) ? 'new' : null);
// The Planning Unit's mark for a firm of the Healthcare / TSD / TRC universe
// (the 2027 lists, not a province's Monitoring Plan): the list's "Healthcare /
// TSD / TRC Firm" column, Yes or blank. Only that column: the row is coloured
// by the workshop's legend like any other.
const HEALTHCARE_HEADER = /healthcare|tsd ?\/ ?trc/i;
const YES = /^(y|yes|oo|true|1|x|✓|✔)$/i;
// Establishments of that universe, by their PSIC description: health care,
// medical laboratories, pharmaceuticals; hazardous waste treatment, storage
// and disposal (TSD) and its transport (TRC). A Yes on anything else is
// doubtful — worth a second look.
const HEALTHCARE_PSIC = /hospital|clinic|health|medical|nursing|dental|laborator|pharma|drug|veterinar|hazardous|treatment and disposal|waste (treatment|collection)|collection of (hazardous|waste)|transport.*waste|funeral|mortuar|crematori/i;
const PSIC_HEADER = /psic|industry ?classification/i;
// A sheet of a newly issued list that holds the healthcare / TSD / TRC firms
// apart from the provinces (the HWG ID list's "Healthcare").
const HEALTHCARE_SHEET = /health|tsd|trc|transporter/i;
// Sanitary landfills on the newly issued lists: a row whose firm, project,
// type or PSIC description names one (not its address). Counted as the
// province sheet counts them, and shown apart ("of which sanitary landfills").
const LANDFILL = /land\s*-?\s*fill/i;
const NOT_WHAT_IT_IS = /address|location|remark|note|barangay|street|assigned/i;
// What a permit is for, and where: for the lists' See more (the Developer's only).
const TITLE_HEADER = /^(project ?(name|title)|establishment( ?name)?|name of (the )?(project|establishment|facility))$/i;
const CITY_HEADER = /^(municipality|city)( ?\/ ?(city|municipality))?$/i;
/** Whether an establishment's PSIC description is of the healthcare / TSD / TRC universe (null: none written). */
const healthcarePsic = (psic) => (psic ? HEALTHCARE_PSIC.test(String(psic)) : null);
// Who a permit was issued to: the project, the proponent or the establishment.
const NAME_HEADER = /^(project ?(name|title)|name of (the )?(project|proponent|firm|establishment|company|facility|generator)|(proponent|establishment|company|firm|facility|applicant|generator)( ?name)?)$/i;

// A newly issued permit's kind, from the shape of its number (as permitKey
// writes it): ECC-OL-R3-2026-564, PTO-OL-R3-2025-8621-R, DP-R3-25-9433,
// OL-G-R3-14-78404 (HW generator ID), OL-T-… (TSD), OL-TP-… / OL-R-… (TRC).
const KIND_OF_KEY = [
  [/^(ECC|CNC)-/, 'ecc'],
  [/^PTO-/, 'pto'],
  [/^(WW)?DP-/, 'wwdp'],
  [/^(OL-)?(G|GR|HW|HWG)-/, 'haz'],
  [/^(PCO|COA)-/, 'pco'],
  [/^(OL-)?(T|TR|TSD)-/, 'tsd'],
  [/^(OL-)?(TP|R|TRC)-/, 'trc'],
  [/^(CCO|PCL|PMPIN)/, 'chemical'],
];
/** The kind of a permit number; the column's heading when the number says nothing. */
function permitKind(key, header = '') {
  const hit = KIND_OF_KEY.find(([re]) => re.test(key));
  if (hit) return hit[1];
  if (/hw ?gr/.test(header)) return 'haz';
  if (/ecc|reference/.test(header)) return 'ecc';
  return 'other';
}

/** A newly issued permits workbook. */
function analyzePermits(wb) {
  THEME = themeOf(wb);
  const keys = new Map(); // key -> province
  const keyKind = {};
  const keyType = {}; // key -> 'new' | 'renewal'
  const keyNames = {}; // key -> the firm's names, compared loosely (textKey)
  const keyLabel = {}; // key -> the firm's name as the list writes it
  // The masterlist holder colours a permit's row on the list as they write it
  // into the RAW data: key -> the row's fill (the first coloured cell), and
  // where the row is. A permit repeated on several sheets is coloured when
  // any of its rows is.
  const highlights = {};
  const keyAt = {};
  // The healthcare mark: key -> true where a row says Yes (or sits on a
  // Healthcare sheet); `keyReviewed`: the permit is on a sheet that carries
  // the mark at all — the rest have not been gone through for it yet.
  const keyHealthcare = {};
  const keyReviewed = {};
  const keyPsic = {};
  // The project or establishment, and the city or municipality, as the list writes them.
  const keyTitle = {};
  const keyCity = {};
  // The sanitary landfills' permits, left out of every count.
  const landfillKeys = new Set();
  const sheets = [];
  // Every row with a permit number, as its own entry: what the tiles count
  // (chosen below, countedEntries).
  const sheetRows = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const at = grid.findIndex((r) => r.filter((c) => !blank(c)).length >= 3 && r.some((c) => PERMIT_HEADER.test(squeeze(c))));
    if (at < 0) continue;
    const header = grid[at].map(squeeze);
    const col = header.findIndex((h) => PERMIT_HEADER.test(h));
    const pcol = header.findIndex((h) => PROVINCE_HEADER.test(h));
    const tcol = header.findIndex((h) => TYPE_HEADER.test(h));
    const ncols = header.map((h, j) => (NAME_HEADER.test(h) ? j : -1)).filter((j) => j >= 0).slice(0, 3);
    // The mark may be repeated (a column copied twice): any of them saying Yes counts.
    const hcols = header.map((h, j) => (HEALTHCARE_HEADER.test(h) ? j : -1)).filter((j) => j >= 0);
    const psicCol = header.findIndex((h) => PSIC_HEADER.test(h));
    const titleCol = header.findIndex((h) => TITLE_HEADER.test(h));
    const cityCol = header.findIndex((h) => CITY_HEADER.test(h));
    // A province's own worksheet ("AURORA (44)", "NUEVA  ECIJA", "Done |
    // BATAAN (292)" once the Planning Unit marks it done), the healthcare
    // firms' own ("Healthcare"), or a summary (CONSOLIDATED, GENERAL, Sheet1…).
    const sheetProvince = sheetProvinceOf(name);
    const sheetHealthcare = !sheetProvince && HEALTHCARE_SHEET.test(name);
    // The columns that say what the firm is, for the landfill check.
    const whatCols = header.map((h, j) => (h && !NOT_WHAT_IT_IS.test(h) && j !== col ? j : -1)).filter((j) => j >= 0);
    const entries = [];
    let rows = 0;
    let colored = 0;
    let landfills = 0;
    for (let i = at + 1; i < grid.length; i++) {
      const r = grid[i];
      const v = r[col];
      if (blank(v)) continue;
      const k = permitKey(v);
      if (!/\d/.test(k)) continue;
      const landfill = whatCols.some((j) => LANDFILL.test(String(r[j] ?? '')));
      if (landfill) {
        landfills += 1;
        landfillKeys.add(k);
      }
      rows += 1;
      const sheetRow = i + range.s.r;
      const fill = rowFillOf(ws, sheetRow, range);
      if (fill) colored += 1;
      if (fill && !highlights[k]) {
        highlights[k] = fill;
        keyAt[k] = { sheet: name, row: sheetRow + 1 };
      }
      keyAt[k] ||= { sheet: name, row: sheetRow + 1 };
      // Marked Yes in the column, or listed on the healthcare firms' own sheet.
      const marked = sheetHealthcare || hcols.some((j) => YES.test(String(r[j] ?? '').trim()));
      if (hcols.length || sheetHealthcare) keyReviewed[k] = true;
      if (marked) keyHealthcare[k] = true;
      if (psicCol >= 0 && !blank(r[psicCol])) keyPsic[k] ||= String(r[psicCol]).trim().slice(0, 120);
      if (titleCol >= 0 && !blank(r[titleCol])) keyTitle[k] ||= String(r[titleCol]).trim().slice(0, 160);
      if (cityCol >= 0 && !blank(r[cityCol])) keyCity[k] ||= String(r[cityCol]).trim().slice(0, 60);
      const rowProvince = pcol >= 0 && !blank(r[pcol]) ? provinceCell(r[pcol]) : null;
      if (!keys.has(k)) keys.set(k, rowProvince);
      keyKind[k] ||= permitKind(k, header[col]);
      if (tcol >= 0 && !keyType[k]) keyType[k] = typeOf(r[tcol]);
      let label = null;
      for (const j of ncols) {
        if (blank(r[j])) continue;
        const nk = textKey(r[j]);
        if (nk.length >= MIN_NAME && !(keyNames[k] ||= []).includes(nk)) keyNames[k].push(nk);
        keyLabel[k] ||= String(r[j]).trim().slice(0, 120);
        label ||= String(r[j]).trim().slice(0, 120);
      }
      const text = (j) => (j >= 0 && !blank(r[j]) ? String(r[j]).trim() : null);
      entries.push({
        k,
        sheet: name,
        row: sheetRow + 1,
        fill,
        // A province sheet's rows are that province's, whatever their own
        // Province cell says: the masterlist counts them as the sheet does.
        province: sheetProvince || rowProvince || null,
        onProvinceSheet: Boolean(sheetProvince),
        landfill,
        healthcare: marked,
        reviewed: hcols.length > 0 || sheetHealthcare,
        firm: label,
        title: text(titleCol)?.slice(0, 160) || null,
        psic: text(psicCol)?.slice(0, 120) || null,
        city: text(cityCol)?.slice(0, 60) || null,
        type: tcol >= 0 ? typeOf(r[tcol]) : null,
      });
    }
    sheets.push({ name, rows, colored, landfills, column: grid[at][col], healthcareMark: hcols.length ? 'column' : sheetHealthcare ? 'sheet' : null, province: sheetProvince || null });
    sheetRows.push({ name, province: sheetProvince || null, healthcare: sheetHealthcare, entries });
  }
  // Each entry's kind, from its permit number.
  const entries = countedEntries(sheetRows, { highlights, keyAt, keyProvince: Object.fromEntries(keys), landfillKeys, keyHealthcare, keyReviewed, keyLabel, keyTitle, keyPsic, keyCity, keyType }).map((e) => ({ ...e, kind: keyKind[e.k] || 'other' }));
  const provinces = {};
  const byKind = {};
  const coloredByKind = {};
  const rowColors = {};
  for (const e of entries) {
    provinces[e.province || '(none)'] = (provinces[e.province || '(none)'] || 0) + 1;
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    if (!e.fill) continue;
    coloredByKind[e.kind] = (coloredByKind[e.kind] || 0) + 1;
    rowColors[e.fill] = (rowColors[e.fill] || 0) + 1;
  }
  return {
    kind: 'permits',
    // The rows counted (see countedEntries), as the worksheets count them.
    rows: entries.length,
    // Distinct permit numbers on the list, for reference.
    permits: keys.size,
    // Of the rows counted, the sanitary landfills' (counted, shown apart).
    landfills: entries.filter((e) => e.landfill).length,
    colored: entries.filter((e) => e.fill).length,
    coloredByKind,
    rowColors,
    provinces,
    byKind,
    sheets,
    keys: [...keys.keys()],
    keyProvince: Object.fromEntries(keys),
    keyKind,
    keyType,
    keyNames,
    keyLabel,
    // The healthcare mark, counted on the rows: marked Yes; on a sheet that carries the mark.
    healthcare: entries.filter((e) => e.healthcare).length,
    healthcareReviewed: entries.filter((e) => e.reviewed).length,
    // Memory: the rows counted, each with its own colour, province and marks.
    entries,
    // Memory, and the baseline: which permits are coloured, and where each sits.
    highlights,
    keyAt,
    keyHealthcare,
    keyReviewed,
    keyPsic,
    keyTitle,
    keyCity,
  };
}

// A province's name inside a sheet's name, however the sheet is labelled
// around it: "AURORA (44)", "NUEVA  ECIJA", "Done | BATAAN (292)".
const PROVINCE_IN_NAME = Object.values(PROVINCE_CODE).map((p) => [p, new RegExp(`(^|[^A-Z])${p.toUpperCase().replace('_', '[\\s_]*')}([^A-Z]|$)`)]);
/** The province a sheet is named after — one province named in it, whatever else it says — or null. */
function sheetProvinceOf(name) {
  const s = String(name ?? '').toUpperCase().replace(/\(.*?\)/g, ' ');
  const hits = PROVINCE_IN_NAME.filter(([, re]) => re.test(s)).map(([p]) => p);
  return hits.length === 1 ? hits[0] : null;
}

/** A province as a list writes it ("NUEVA ECIJA", "Nueva  Ecija") — the tracker's name for it, or null. */
function provinceCell(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, '_');
  if (!s) return null;
  const p = provinceOf(s.replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase()));
  return PROVINCE_NAMES.has(p) ? p : null;
}

/**
 * The rows a newly issued list is counted by — as its worksheets count them
 * (the WWDP list's way, and every list's alike):
 *   province worksheets (AURORA (44), BATAAN (292)…), with the healthcare
 *     firms' own sheet when the list keeps them apart (the HWG ID list's
 *     "Healthcare"), holding at least as many rows as any summary sheet
 *     (CONSOLIDATED, GENERAL, Sheet1…): every row on them, the summary — and
 *     any sheet beside it (OCTOBER 2026) — not counted; a number on two rows
 *     is two entries;
 *   one worksheet only: its rows;
 *   otherwise (the province sheets hold fewer rows than a summary — part of
 *     the list is only on it): each permit number once, as found anywhere.
 */
function countedEntries(sheetRows, by) {
  const provinceSheets = sheetRows.filter((s) => s.province);
  const covered = sheetRows.filter((s) => s.province || s.healthcare);
  const coveredRows = covered.reduce((a, s) => a + s.entries.length, 0);
  const largestOther = Math.max(0, ...sheetRows.filter((s) => !covered.includes(s)).map((s) => s.entries.length));
  if (provinceSheets.length && coveredRows >= largestOther) return covered.flatMap((s) => s.entries);
  if (sheetRows.length === 1) return sheetRows[0].entries;
  // Each number once: coloured if any of its rows is, where that row is.
  return [...new Set(sheetRows.flatMap((s) => s.entries.map((e) => e.k)))].map((k) => ({
    k,
    sheet: by.keyAt[k]?.sheet || null,
    row: by.keyAt[k]?.row || null,
    fill: by.highlights[k] || null,
    province: by.keyProvince[k] || null,
    onProvinceSheet: false,
    landfill: by.landfillKeys.has(k),
    healthcare: Boolean(by.keyHealthcare[k]),
    reviewed: Boolean(by.keyReviewed[k]),
    firm: by.keyLabel[k] || null,
    title: by.keyTitle[k] || null,
    psic: by.keyPsic[k] || null,
    city: by.keyCity[k] || null,
    type: by.keyType[k] || null,
  }));
}

// A name shorter than this ("Store", "Farm") says too little to name one firm.
const MIN_NAME = 8;

// --- the PSIC basis: a list's PSIC Code against the RAW data's classification ---
//
// The RAW data classifies each firm by the standard industry classification
// (its Industry Classification column — Clinic, Hospital, Dental Clinic,
// Animal Production…, the ProjectType sheet's categories with their PSIC
// codes). A classification is a healthcare one when the healthcare
// establishments' RAW lists (Healthcare Industries, TSD / TRC) are where it
// is mostly used. A newly issued list's PSIC Code ("Hospitals, clinics,
// nursing homes…", "Animal production") is matched to the classification it
// names, and is healthcare when that classification is.

// The establishments' lists the "Healthcare / TSD / TRC Firm" mark is about
// (not Chemical permits or Importers: those firms are not health establishments).
const HC_CLASS_UNITS = new Set(['Healthcare Industries', 'TSD / TRC']);
// The standard list's healthcare classifications by name: the health
// establishments (Hospital, Clinic, Medical Clinic, Dental Clinic, Diagnostic
// Center, Dialysis Center, Laboratory, Medical Laboratory, Nursing Home, Blood
// Service Facility, Ultrasound Center) and the treatment and disposal of
// hazardous waste (TSD). Others count too when the healthcare lists' firms
// mostly carry them (Maternity Clinic…).
const HC_CLASS_NAME = /hospital|clinic|medical|dental|diagnostic|dialysis|laborator|nursing home|blood service|ultrasound|maternity|treatment and disposal of hazardous/i;
// A classification is a healthcare one when at least this many of its RAW
// firms, and at least half of them, are on those lists.
const HC_CLASS_MIN = 2;
const HC_CLASS_SHARE = 0.5;
const PSIC_STOP = new Set(['and', 'of', 'the', 'other', 'for', 'in', 'with', 'including', 'or', 'to', 'on', 'its', 'their', 'such', 'as', 'activities', 'activity', 'services', 'service', 'facilities', 'facility', 'not', 'elsewhere', 'classified', 'related', 'nec']);
/** A classification's or a description's significant words, singular: "Hospitals, clinics…" -> hospital, clinic, … ("non-hazardous" is one word). */
const psicWords = (v) => [
  ...new Set(
    String(v ?? '')
      .toLowerCase()
      .replace(/\bnon[\s-]+/g, 'non')
      .replace(/[^a-z]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !PSIC_STOP.has(w))
      .map((w) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  ),
];

/**
 * The RAW data's standard classifications (each workbook's
 * Industry_Classification sheet: Academy … Animal Production … Clinic …
 * Water Treatment), and which are healthcare ones — by where the RAW firms
 * classified so are: a classification no RAW firm carries is not judged.
 * `records`: analyzeRaw's main-sheet firms ({ unit, industry }) of every RAW
 * file; `vocabList`: the workbooks' classification lists (analyzeRaw's
 * `classifications`; without any, the firms' own classifications).
 * Returns classify(psic) -> { label, healthcare } for the classification a
 * PSIC Code names (`healthcare` null: not judged), or null when it names none:
 *   the same words; else the most specific classification whose words are
 *   all in the description ("Hospital" in "Hospitals, clinics, nursing
 *   homes…"); else, for a description of two words or more, the closest
 *   whose words hold all of its ("Treatment and disposal of hazardous" in
 *   "Treatment and disposal of hazardous waste").
 */
function psicClassifier(recordsList, vocabList = []) {
  const keyOf = (words) => [...words].sort().join(' ');
  const classes = new Map(); // words key -> { label, words, rows, hc }
  const vocab = vocabList.flat().filter(Boolean);
  for (const label of vocab.length ? vocab : recordsList.flat().map((r) => r?.industry).filter(Boolean)) {
    const words = psicWords(label);
    if (words.length && !classes.has(keyOf(words))) classes.set(keyOf(words), { label: String(label).trim(), words, rows: 0, hc: 0 });
  }
  for (const records of recordsList) {
    for (const r of records || []) {
      const c = r.industry && classes.get(keyOf(psicWords(r.industry)));
      if (!c) continue;
      c.rows += 1;
      if (HC_CLASS_UNITS.has(r.unit)) c.hc += 1;
    }
  }
  const list = [...classes.values()].map((c) => ({
    ...c,
    // By its name; else by where its RAW firms are (none: not judged).
    healthcare: HC_CLASS_NAME.test(c.label) && !/non[\s-]*hazardous/i.test(c.label) ? true : c.rows ? c.hc >= HC_CLASS_MIN && c.hc >= c.rows * HC_CLASS_SHARE : null,
  }));
  const seen = new Map();
  const classify = (psic) => {
    const key = String(psic ?? '').trim().toLowerCase();
    if (!key) return null;
    if (seen.has(key)) return seen.get(key);
    const d = new Set(psicWords(psic));
    let hit = null;
    if (d.size) {
      const exact = list.find((c) => c.words.length === d.size && c.words.every((w) => d.has(w)));
      const better = (a, b, wantLong) => !b || (wantLong ? a.words.length > b.words.length : a.words.length < b.words.length) || (a.words.length === b.words.length && a.rows > b.rows);
      // A description may name several ("Hospitals, clinics, nursing homes…"):
      // a healthcare one among them decides; else a judged one; else any.
      const rank = (c) => (c.healthcare === true ? 2 : c.healthcare === false ? 1 : 0);
      let within = null;
      let around = null;
      if (!exact) {
        for (const c of list) {
          if (c.words.every((w) => d.has(w))) {
            if (!within || rank(c) > rank(within) || (rank(c) === rank(within) && better(c, within, true))) within = c;
          } else if (d.size >= 2 && [...d].every((w) => c.words.includes(w)) && better(c, around, false)) around = c;
        }
      }
      const c = exact || within || around;
      hit = c ? { label: c.label, healthcare: c.healthcare } : null;
    }
    seen.set(key, hit);
    return hit;
  };
  // The basis, to show: the classifications counted as healthcare ones.
  classify.healthcareClasses = list.filter((c) => c.healthcare).map((c) => c.label).sort((a, b) => a.localeCompare(b));
  return classify;
}

/**
 * The healthcare universe as the RAW data holds it (the Healthcare
 * Industries, Chemical permits, TSD / TRC and Importers lists): their permit
 * numbers and their firms' project titles, each with its list; and the PSIC
 * basis (psicClassifier). `checks`, `records` and `classifications`:
 * analyzeRaw's, of every RAW file.
 */
function healthcareIndex(checksList, recordsList = [], vocabList = []) {
  const byKey = new Map();
  const byName = new Map();
  for (const checks of checksList) {
    for (const c of checks || []) {
      if (groupOfUnit(c.unit) !== 'healthcare') continue;
      for (const k of c.keys || []) if (!byKey.has(k)) byKey.set(k, c.unit);
      const nk = textKey(c.title);
      if (nk.length >= MIN_NAME && !byName.has(nk)) byName.set(nk, c.unit);
    }
  }
  return { byKey, byName, classify: psicClassifier(recordsList, vocabList) };
}

// The kinds of permit that are a healthcare list's of themselves.
const KIND_UNIT = { tsd: 'TSD / TRC', trc: 'TSD / TRC', chemical: 'Chemical permits', importer: 'Importers' };

/**
 * The healthcare list a newly issued permit is counted under — apart from the
 * Monitoring Plan's provinces — or null when it is the Monitoring Plan's:
 *   a TSD, TP/TRC, chemical or importer permit: its own list;
 *   its number already on a healthcare RAW list, or its establishment named
 *     there: that list;
 *   Yes in the list's "Healthcare / TSD / TRC Firm" column, or on the list's
 *     Healthcare sheet: Healthcare Industries.
 * Its PSIC Code is the basis whenever it names a RAW classification
 * (psicClassifier): a non-healthcare one ("Animal production") makes it not
 * healthcare whatever the mark or the name says; a healthcare one
 * ("Hospitals, clinics…") makes it healthcare unmarked.
 * `e`: a counted entry (countedEntries) with its kind; `names`: the list's
 * names for the permit (keyNames).
 */
function healthcareUnitOf(e, index, names = []) {
  if (KIND_UNIT[e.kind]) return KIND_UNIT[e.kind];
  const byPsic = index?.classify?.(e.psic) || null;
  if (byPsic?.healthcare === false) return null;
  const atKey = index?.byKey.get(e.k);
  if (atKey) return atKey;
  for (const nk of [textKey(e.title), ...names]) if (nk.length >= MIN_NAME && index?.byName.has(nk)) return index.byName.get(nk);
  if (e.healthcare || byPsic?.healthcare) return 'Healthcare Industries';
  return null;
}

/**
 * Marked a healthcare / TSD / TRC firm on its list (Yes, or its Healthcare
 * sheet), yet its PSIC Code names a RAW classification that is not a
 * healthcare one — the mark to check. Returns that classification's label,
 * or null.
 */
function notHealthcareByPsic(e, index) {
  if (!e.healthcare || KIND_UNIT[e.kind]) return null;
  const byPsic = index?.classify?.(e.psic) || null;
  return byPsic?.healthcare === false ? byPsic.label : null;
}
// The fill the tracker's Office Script gives the rows of the encoded permits
// (front-end officeScript.js ENCODED_FILL).
const ENCODED_FILL = '9DD9F3';

/**
 * The rows coloured as validated without their newly issued permits.
 *
 * `raws`: per RAW file { id, name, checks, baseHighlights, fingerprints,
 * baseFingerprints } (checks: analyzeRaw's). `lists`: the newly issued
 * permit lists (analyzePermits'; not the reference extracts).
 *
 * A row is flagged when it is coloured, its colouring is not what the
 * baseline had (coloured since), and a permit issued to that firm — the
 * list's project or proponent is the row's title or proponent — is nowhere
 * in the RAW data. A name that several RAW rows carry (a chain's branches)
 * names no row for sure, and is not used; nor is a permit whose province is
 * another. A permit already written on any row is validated.
 *
 * Returns { [file id]: [{ serial, sheet, row, unit, title, name, fill,
 * unchanged, byScript, missing: [{ permit, kind, label }] }] }.
 */
function unvalidatedHighlights(raws, lists) {
  const inRaw = new Set();
  const rowsNamed = new Map();
  for (const r of raws) {
    for (const c of r.checks || []) {
      for (const k of c.keys) inRaw.add(k);
      for (const nk of new Set([textKey(c.title), textKey(c.name)])) if (nk) rowsNamed.set(nk, (rowsNamed.get(nk) || 0) + 1);
    }
  }
  const issuedTo = new Map(); // name -> the permits issued to it not yet in the RAW data
  for (const l of lists) {
    for (const k of l.keys || []) {
      if (inRaw.has(k)) continue;
      for (const nk of l.keyNames?.[k] || []) {
        const at = issuedTo.get(nk) || [];
        if (!at.some((p) => p.permit === k)) at.push({ permit: k, kind: l.keyKind?.[k] || 'other', province: l.keyProvince?.[k] || null, label: l.keyLabel?.[k] || null });
        issuedTo.set(nk, at);
      }
    }
  }
  const out = {};
  if (!issuedTo.size) return out;
  for (const r of raws) {
    for (const c of r.checks || []) {
      if (!c.hl || r.baseHighlights?.[c.serial] === c.hl) continue;
      // Only the universe's lists (the provinces, the healthcare lists): the
      // ECP monitoring list is not part of the updating, as elsewhere in the
      // tracker. Its permits still count as written in (above).
      if (groupOfUnit(c.unit) === 'other') continue;
      const names = [...new Set([textKey(c.title), textKey(c.name)])].filter((nk) => nk.length >= MIN_NAME && rowsNamed.get(nk) === 1);
      const missing = [];
      for (const nk of names) {
        for (const p of issuedTo.get(nk) || []) {
          if (p.province && PROVINCE_NAMES.has(c.unit) && p.province !== c.unit) continue;
          if (!missing.some((m) => m.permit === p.permit)) missing.push({ permit: p.permit, kind: p.kind, label: p.label });
        }
      }
      if (!missing.length) continue;
      (out[r.id] ||= []).push({
        serial: c.serial,
        sheet: c.sheet,
        row: c.row,
        unit: c.unit,
        title: c.title,
        name: c.name,
        fill: c.hl.split(',')[0],
        // Nothing on the row changed since the baseline: coloured, not worked on.
        unchanged: Boolean(r.fingerprints?.[c.serial] && r.fingerprints[c.serial] === r.baseFingerprints?.[c.serial]),
        // Coloured light blue by the tracker's script (another permit of the row was encoded).
        byScript: c.hl === ENCODED_FILL,
        missing: missing.slice(0, 5),
      });
    }
  }
  return out;
}

/**
 * The permits coloured on a newly issued list whose colour the RAW data
 * contradicts (MASTERLIST_LEGEND): green, pink or yellow — written in — yet
 * not in the RAW data (`notEncoded`), or red — not in the universe — yet in
 * it (`redInRaw`). A colour the workshop does not use is not judged.
 *
 * `lists`: per list { id, highlights, baseHighlights, keyAt, keyKind,
 * keyProvince, keyLabel } (analyzePermits', the reference extracts left out);
 * `inRaw`: every permit number on the RAW files. A permit coloured as it was
 * at the baseline is left: only colouring since counts. Returns rows shaped
 * as unvalidatedHighlights' ({ [list id]: [...] }), the permit as `missing`,
 * with the `reason` and the colour's `family`.
 */
function unencodedHighlights(lists, inRaw) {
  const out = {};
  for (const l of lists) {
    for (const [k, fill] of Object.entries(l.highlights || {})) {
      if (l.baseHighlights?.[k] === fill) continue;
      const family = colourFamily(fill);
      const reason = permitStatus(family, inRaw.has(k));
      if (reason !== 'notEncoded' && reason !== 'redInRaw') continue;
      const at = l.keyAt?.[k] || {};
      (out[l.id] ||= []).push({
        reason,
        family,
        serial: null,
        sheet: at.sheet || null,
        row: at.row || null,
        unit: l.keyProvince?.[k] || null,
        title: l.keyLabel?.[k] || null,
        name: null,
        fill,
        unchanged: false,
        byScript: false,
        missing: [{ permit: k, kind: l.keyKind?.[k] || 'other', label: l.keyLabel?.[k] || null }],
      });
    }
  }
  return out;
}

/**
 * The unit a newly issued permit counts under in the masterlist — as the
 * list's own sheets count it:
 *   on a province's sheet: that province — every row of it, the healthcare
 *     firms marked in its column and the sanitary landfills alike (the
 *     healthcare firms are a breakdown within it: healthcareUnitOf);
 *   a healthcare / TSD / TRC firm the list keeps apart (its Healthcare sheet,
 *     the TSD and TP/TRC lists): its healthcare list;
 *   else: its Province cell.
 */
function masterlistUnitOf(e, index, names = []) {
  if (e.onProvinceSheet && e.province) return e.province;
  if (e.healthcare || KIND_UNIT[e.kind]) return healthcareUnitOf(e, index, names) || 'Healthcare Industries';
  return e.province || '(none)';
}

// A list whose permits are this share or more on a larger list is a copy of it.
const COPY_SHARE = 0.9;

/**
 * The newly issued lists that copy another — a working copy of a list's rows
 * set aside for someone to check ("RED HIGHLIGHTED - STEPHEN"), whose permits
 * would otherwise be counted twice. `lists`: [{ id, name, keys }] (the
 * reference extracts left out). A list is a copy when nine in ten of its
 * permit numbers or more are on a larger list (more numbers; the same number
 * and more rows; else the first by id). Returns { [copy id]: the list's name }.
 */
function copiesOf(lists) {
  const sets = lists.map((l) => ({ ...l, set: new Set(l.keys || []) }));
  const larger = (a, b) => b.set.size > a.set.size || (b.set.size === a.set.size && ((b.rows || 0) > (a.rows || 0) || ((b.rows || 0) === (a.rows || 0) && String(b.id) < String(a.id))));
  const out = {};
  for (const a of sets) {
    if (!a.set.size) continue;
    for (const b of sets) {
      if (a === b || !larger(a, b)) continue;
      let shared = 0;
      for (const k of a.set) if (b.set.has(k)) shared += 1;
      if (shared / a.set.size >= COPY_SHARE) {
        out[a.id] = b.name;
        break;
      }
    }
  }
  return out;
}

// One save that colours this many rows or more…
const BULK_MIN_ROWS = 25;
// …faster than this many a minute…
const BULK_PER_MINUTE = 5;
// …and leaves this share of them or more unchanged: a block filled with colour, not rows checked.
const BULK_UNCHANGED = 0.8;

/**
 * The rows a save coloured, against the reading before it: { rows, unchanged,
 * minutes, serials } when they look filled in bulk, else null. The tracker's
 * own light blue (its Office Script) is not counted.
 */
function bulkHighlight(before, now, minutes) {
  if (!before?.highlights || !now?.highlights) return null;
  const coloured = Object.entries(now.highlights).filter(([serial, hl]) => hl !== ENCODED_FILL && before.highlights[serial] !== hl).map(([serial]) => serial);
  if (coloured.length < BULK_MIN_ROWS) return null;
  const unchanged = coloured.filter((s) => before.fingerprints?.[s] && before.fingerprints[s] === now.fingerprints?.[s]).length;
  const mins = Math.max(1, Number(minutes) || 1);
  if (unchanged / coloured.length < BULK_UNCHANGED || coloured.length / mins < BULK_PER_MINUTE) return null;
  return { rows: coloured.length, unchanged, minutes: Math.round(mins), serials: coloured.slice(0, 20) };
}

// A table ends where this many empty rows follow it: whatever lies past such
// a gap is a stray value, not the table's.
const GAP_ROWS = 500;

/**
 * A sheet's range cut to its table. Excel keeps the range down to a stray
 * value far below it — the PAMPANGA sheet reads A1:CD306963 for 6,000 firms,
 * the Central Office's extract A1:L1045656 for 765 rows — and every row of
 * the range would be built (25 million cells: 37 s). The range ends at the
 * last row before a gap of GAP_ROWS empty rows, and at the last column with a
 * value in those rows. Returns the rows cut off, if any.
 */
function trimRange(ws) {
  if (!ws?.['!ref']) return 0;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rowCols = new Map(); // row -> its last column with a value
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const v = ws[key]?.v;
    if (v === undefined || v === null || v === '') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c > (rowCols.get(r) ?? -1)) rowCols.set(r, c);
  }
  if (!rowCols.size) return 0;
  const rows = [...rowCols.keys()].sort((a, b) => a - b);
  let end = rows[0];
  let lastCol = rowCols.get(end);
  for (let i = 1; i < rows.length && rows[i] - end <= GAP_ROWS; i++) {
    end = rows[i];
    lastCol = Math.max(lastCol, rowCols.get(end));
  }
  const cut = range.e.r - end;
  if (cut <= 0 && lastCol >= range.e.c) return 0;
  ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: Math.max(range.s.r, end), c: Math.min(range.e.c, Math.max(range.s.c, lastCol)) } });
  return Math.max(0, cut);
}

/** A workbook's bytes, read as the tracked kind. */
function analyze(buffer, kind, { reference = false, baseSerials = null } = {}) {
  // With their fills, both kinds: the RAW rows coloured as updated, the
  // permits coloured on the newly issued lists as written in. A reference
  // extract (the Central Office's) is not coloured in: read without them.
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: !reference, cellDates: true });
  for (const name of wb.SheetNames) trimRange(wb.Sheets[name]);
  return kind === 'raw' ? analyzeRaw(wb, { baseSerials }) : analyzePermits(wb);
}

module.exports = { ANALYSIS_VERSION, ENCODED_FILL, trimRange, mainSheetsOf, MASTERLIST_LEGEND, colourFamily, permitStatus, healthcarePsic, healthcareIndex, healthcareUnitOf, notHealthcareByPsic, psicClassifier, masterlistUnitOf, copiesOf, analyze, analyzeRaw, analyzePermits, permitKey, permitKeys, permitKind, eccYear, fillOf, mergeUnits, addInto, unitOf, groupOfUnit, sourceOf, unvalidatedHighlights, unencodedHighlights, bulkHighlight };
