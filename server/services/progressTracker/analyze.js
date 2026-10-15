// ---------------------------------------------------------------------------
// What a tracked workbook holds, in counts the progress tracker compares.
//
// RAW universe workbooks (kind 'raw'): per sheet — the province's main list
// and its DUPLICATE, FOR DELISTING and FOR DELETION sheets — the rows, the
// permits on them by kind, and the rows people have coloured: the Planning
// Unit's convention is to fill the cells they updated, so a coloured row is
// an updated row, and a coloured cell in the permit columns an updated
// permit. Each main-list row also gets a fingerprint per section (profile,
// monitoring, permits, legal), so a later version can say which rows were
// added and which changed, and in what part.
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

const PERMIT_COLUMNS = new Set(GROUPS.permits);
const CATEGORY = (name) =>
  /duplicate/i.test(name) ? 'duplicate' : /delisting/i.test(name) ? 'delisting' : /deletion/i.test(name) ? 'deletion' : 'main';
const blank = (v) => v == null || /^(\s*|n\/?a|-+|none|null|not applicable)$/i.test(String(v).trim());

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
  return { at, fields, serialOf: (r) => (/^\d+$/.test(String(r[col] ?? '').trim()) ? `${prefix}-${Number(r[col])}` : null) };
}

function readRawSheet(ws, name) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const layout = layoutOf(grid, name);
  if (!layout) return null;
  const { at, fields, serialOf } = layout;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const out = {
    name,
    category: CATEGORY(name),
    rows: 0,
    colored: 0,
    coloredPermit: 0,
    colors: {},
    permits: Object.fromEntries(Object.keys(PERMIT_FIELDS).map((k) => [k, 0])),
    withPermit: 0,
    provinces: {},
    fingerprints: {},
    keys: [],
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

    let any = false;
    for (const [kind, field] of Object.entries(PERMIT_FIELDS)) {
      if (!blank(values[field])) {
        out.permits[kind] += 1;
        any = true;
        for (const k of permitKeys(values[field])) out.keys.push(k);
      }
    }
    if (any) out.withPermit += 1;

    // Colours: the cells of this row (the sheet row is i, 0-based, as grid was read from A1).
    let colored = false;
    let coloredPermit = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const rgb = fillOf(ws[XLSX.utils.encode_cell({ r: i + range.s.r, c })]);
      if (!rgb) continue;
      colored = true;
      out.colors[rgb] = (out.colors[rgb] || 0) + 1;
      if (PERMIT_COLUMNS.has(fields[c - range.s.c])) coloredPermit = true;
    }
    if (colored) out.colored += 1;
    if (coloredPermit) out.coloredPermit += 1;

    if (out.category === 'main') {
      const byGroup = { profile: [], monitoring: [], permits: [], legal: [] };
      for (const [f, v] of Object.entries(values)) byGroup[groupOf(f)].push(`${f}=${v ?? ''}`);
      out.fingerprints[key] = ['profile', 'monitoring', 'permits', 'legal'].map((g) => hash(byGroup[g].sort())).join('.');
    }
  }
  return out;
}

/** A RAW universe workbook. */
function analyzeRaw(wb) {
  const sheets = [];
  for (const name of wb.SheetNames) {
    if (LOOKUP_SHEETS.test(name)) continue;
    const s = readRawSheet(wb.Sheets[name], name);
    if (s) sheets.push(s);
  }
  const main = sheets.filter((s) => s.category === 'main');
  const sum = (list, k) => list.reduce((a, s) => a + s[k], 0);
  const byCategory = { main: 0, duplicate: 0, delisting: 0, deletion: 0 };
  for (const s of sheets) byCategory[s.category] += s.rows;
  const permits = Object.fromEntries(Object.keys(PERMIT_FIELDS).map((k) => [k, main.reduce((a, s) => a + s.permits[k], 0)]));
  const colors = {};
  for (const s of sheets) for (const [k, n] of Object.entries(s.colors)) colors[k] = (colors[k] || 0) + n;
  const provinces = {};
  for (const s of main) for (const [p, n] of Object.entries(s.provinces)) provinces[p] = (provinces[p] || 0) + n;
  return {
    kind: 'raw',
    rows: byCategory.main,
    byCategory,
    permits,
    withPermit: sum(main, 'withPermit'),
    colored: sum(sheets, 'colored'),
    coloredPermit: sum(sheets, 'coloredPermit'),
    colors,
    provinces,
    sheets: sheets.map(({ fingerprints, keys, provinces: _p, ...rest }) => rest),
    // Not stored with the counts: the comparison material.
    fingerprints: Object.assign({}, ...main.map((s) => s.fingerprints)),
    keys: [...new Set(main.flatMap((s) => s.keys))],
  };
}

const PERMIT_HEADER = /reference ?no|ref\.? ?no|hw ?gr ?no|registration ?no|permit ?no|ecc ?no|^id ?no/i;
const PROVINCE_HEADER = /^province$/i;

/** A newly issued permits workbook. */
function analyzePermits(wb) {
  const keys = new Map(); // key -> province
  const sheets = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
    const at = grid.findIndex((r) => r.filter((c) => !blank(c)).length >= 3 && r.some((c) => PERMIT_HEADER.test(squeeze(c))));
    if (at < 0) continue;
    const header = grid[at].map(squeeze);
    const col = header.findIndex((h) => PERMIT_HEADER.test(h));
    const pcol = header.findIndex((h) => PROVINCE_HEADER.test(h));
    let rows = 0;
    for (const r of grid.slice(at + 1)) {
      const v = r[col];
      if (blank(v)) continue;
      const k = permitKey(v);
      if (!/\d/.test(k)) continue;
      rows += 1;
      if (!keys.has(k)) keys.set(k, pcol >= 0 && !blank(r[pcol]) ? provinceOf(String(r[pcol]).trim().replace(/\s+/g, '_').replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase())) : null);
    }
    sheets.push({ name, rows, column: grid[at][col] });
  }
  const provinces = {};
  for (const p of keys.values()) provinces[p || '(none)'] = (provinces[p || '(none)'] || 0) + 1;
  return { kind: 'permits', rows: keys.size, provinces, sheets, keys: [...keys.keys()], keyProvince: Object.fromEntries(keys) };
}

/** A workbook's bytes, read as the tracked kind. */
function analyze(buffer, kind) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: kind === 'raw', cellDates: true });
  return kind === 'raw' ? analyzeRaw(wb) : analyzePermits(wb);
}

module.exports = { analyze, analyzeRaw, analyzePermits, permitKey, permitKeys, fillOf };
