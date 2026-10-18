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
// once however many sheets repeat them, by province.
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
  [/^HCCP-/i, 'Chemical permits'],
  [/^(TSD|TRC)-/i, 'TSD / TRC'],
  [/^IMT-/i, 'Importers'],
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

/** The fill a cell carries, if any, as an RGB string. */
function fillOf(c) {
  const s = c?.s;
  if (!s || !s.patternType || s.patternType === 'none') return null;
  const rgb = s.fgColor?.rgb || s.bgColor?.rgb;
  if (!rgb || /^(FFFFFF|FFFFFFFF)$/i.test(rgb)) return null;
  return rgb.slice(-6).toUpperCase();
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
    source ||= matchLog({ key, title: values.title, name: values.name });
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

/** The province a workbook is about: the one a sheet is named after (BULACAN, NUEVA_ECIJA). */
function provinceSheetOf(names) {
  for (const name of names) {
    const p = provinceOf(name.trim());
    if (PROVINCE_NAMES.has(p)) return { sheet: name, province: p };
  }
  return null;
}

/** A RAW universe workbook. */
function analyzeRaw(wb) {
  const names = wb.SheetNames.filter((n) => !LOOKUP_SHEETS.test(n));
  // The additions log first: the main sheet is read against it.
  const logs = [];
  for (const name of names) {
    const log = readAdditionsLog(wb.Sheets[name], name);
    if (log) logs.push(log);
  }
  const matchLog = logMatcher(logs);
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
      ...sheets.map(({ fingerprints, keys, keySource: _k, keyCells: _c, records: _r, provinces: _p, units: _u, ...rest }) => rest),
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
  const keys = new Map(); // key -> province
  const keyKind = {};
  const keyType = {}; // key -> 'new' | 'renewal'
  const sheets = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
    const at = grid.findIndex((r) => r.filter((c) => !blank(c)).length >= 3 && r.some((c) => PERMIT_HEADER.test(squeeze(c))));
    if (at < 0) continue;
    const header = grid[at].map(squeeze);
    const col = header.findIndex((h) => PERMIT_HEADER.test(h));
    const pcol = header.findIndex((h) => PROVINCE_HEADER.test(h));
    const tcol = header.findIndex((h) => TYPE_HEADER.test(h));
    let rows = 0;
    for (const r of grid.slice(at + 1)) {
      const v = r[col];
      if (blank(v)) continue;
      const k = permitKey(v);
      if (!/\d/.test(k)) continue;
      rows += 1;
      if (!keys.has(k)) keys.set(k, pcol >= 0 && !blank(r[pcol]) ? provinceOf(String(r[pcol]).trim().replace(/\s+/g, '_').replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase())) : null);
      keyKind[k] ||= permitKind(k, header[col]);
      if (tcol >= 0 && !keyType[k]) keyType[k] = typeOf(r[tcol]);
    }
    sheets.push({ name, rows, column: grid[at][col] });
  }
  const provinces = {};
  for (const p of keys.values()) provinces[p || '(none)'] = (provinces[p || '(none)'] || 0) + 1;
  const byKind = {};
  for (const kind of Object.values(keyKind)) byKind[kind] = (byKind[kind] || 0) + 1;
  return { kind: 'permits', rows: keys.size, provinces, byKind, sheets, keys: [...keys.keys()], keyProvince: Object.fromEntries(keys), keyKind, keyType };
}

/** A workbook's bytes, read as the tracked kind. */
function analyze(buffer, kind) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: kind === 'raw', cellDates: true });
  return kind === 'raw' ? analyzeRaw(wb) : analyzePermits(wb);
}

module.exports = { ANALYSIS_VERSION, analyze, analyzeRaw, analyzePermits, permitKey, permitKeys, permitKind, eccYear, fillOf, mergeUnits, addInto, unitOf, groupOfUnit, sourceOf };
