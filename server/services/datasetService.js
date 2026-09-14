const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { connectToMongo, getDb, ObjectId } = require('../config/db');

// ---------------------------------------------------------------------------
// UCDS datasets: the spreadsheets each year's folder actually holds.
//
// The Bureau keeps its yearly working files under data/ucd <year>/ — the
// monitoring plan per province, the survey, complaints, CNC validation, ESWM
// accomplishment and so on. Which datasets exist for a year is read from that
// folder, not from a list in code, so a new spreadsheet appears in the sidebar
// the next time the folder is scanned and nobody has to invent a menu entry.
//
// The monitoring plan is the register the Province screens already edit
// (ucds-data); its entry links there. Every other spreadsheet is imported by
// the Developer into one generic collection, ucds-dataset-rows, where each row
// is a document {year, dataset, sheet, n, data}. One table screen serves all
// of them with server-side paging, search and sort, so a dataset with eleven
// columns and a dataset with forty use the same code.
//
// Year scoping is the session's active year, applied here to every query —
// never a year from the URL — so a request for another year's rows returns
// nothing rather than something.
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.UCDS_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FOLDER_PATTERN = /^ucd\s+(\d{4})$/i;
const MONITORING_PATTERN = /monitoring/i;
const SKIP_PATTERN = /outdated|^~\$/i;

const ROWS = 'ucds-dataset-rows';
const REGISTRY = 'ucds-dataset-registry';

const MAX_PAGE_SIZE = 200;
const SCAN_TTL_MS = 60 * 1000;

const rows = async () => {
  await connectToMongo();
  return getDb().collection(ROWS);
};
const registry = async () => {
  await connectToMongo();
  return getDb().collection(REGISTRY);
};

/**
 * Indexes the row queries rely on. Idempotent; called at startup.
 *
 * No text index: search is a regex over the _search field within one
 * (year, dataset), which the compound index narrows first. A text index
 * over the same field cost 37 MB for 28,000 rows on a cluster with a 512 MB
 * cap and was never consulted.
 */
async function ensureIndexes() {
  const col = await rows();
  await col.createIndex({ year: 1, dataset: 1, sheet: 1, n: 1 });
  const reg = await registry();
  await reg.createIndex({ year: 1, key: 1 }, { unique: true });
}

// --- the folder -------------------------------------------------------------

/** "2025-CNC VALIDATION.xlsx" -> "cnc-validation"; "Complaints 2024" -> "complaints". */
function keyFor(name, year) {
  return String(name)
    .replace(/\.xlsx?$/i, '')
    // Ranges first, then the bare year; a year glued to an underscore
    // (2026_ECP) has no word boundary, so the check is for non-alphanumerics.
    .replace(/(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}/g, '')
    .replace(new RegExp(`(?<![A-Za-z0-9])${year}(?![A-Za-z0-9])`, 'g'), '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

/** "2025-CNC VALIDATION.xlsx" -> "CNC Validation"; "ESWM UNIVERSE 2026" -> "ESWM Universe". */
function labelFor(name, year) {
  const words = String(name)
    .replace(/\.xlsx?$/i, '')
    .replace(/(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}/g, '')
    .replace(new RegExp(`(?<![A-Za-z0-9])${year}(?![A-Za-z0-9])`, 'g'), '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 4 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()));
  return words.join(' ') || name;
}

let scanCache = { at: 0, value: null };

/**
 * Every year folder and what it holds. Cached briefly: the sidebar asks for
 * this on every load and the folder changes a few times a year.
 */
async function scanFolders() {
  if (scanCache.value && Date.now() - scanCache.at < SCAN_TTL_MS) return scanCache.value;

  const out = {};
  let entries = [];
  try {
    entries = await fsp.readdir(DATA_DIR, { withFileTypes: true });
  } catch {
    scanCache = { at: Date.now(), value: out };
    return out;
  }

  for (const entry of entries) {
    const m = entry.isDirectory() && FOLDER_PATTERN.exec(entry.name);
    if (!m) continue;
    const year = Number(m[1]);
    const dir = path.join(DATA_DIR, entry.name);
    const datasets = [];
    for (const item of await fsp.readdir(dir, { withFileTypes: true })) {
      if (SKIP_PATTERN.test(item.name)) continue;
      if (item.isDirectory()) {
        const files = (await walk(path.join(dir, item.name))).filter((f) => /\.xlsx?$/i.test(f) && !SKIP_PATTERN.test(f));
        if (!files.length) continue;
        const monitoring = MONITORING_PATTERN.test(item.name);
        datasets.push({
          key: monitoring ? 'monitoring-plan' : keyFor(item.name, year),
          label: monitoring ? 'Monitoring Plan' : labelFor(item.name, year),
          kind: monitoring ? 'monitoring-plan' : 'table',
          folder: item.name,
          files: files.map((f) => path.relative(dir, f)),
        });
      } else if (/\.xlsx?$/i.test(item.name)) {
        datasets.push({
          key: keyFor(item.name, year),
          label: labelFor(item.name, year),
          kind: 'table',
          folder: null,
          files: [item.name],
        });
      }
    }
    // Monitoring plan first, then alphabetical: it is the register everything
    // else refers back to.
    datasets.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'monitoring-plan' ? -1 : 1));
    out[year] = { year, dir, datasets };
  }
  scanCache = { at: Date.now(), value: out };
  return out;
}

async function walk(dir) {
  const found = [];
  for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

/**
 * The registry for the sidebar: for each year the caller may enter, the
 * datasets in its folder and whether each has been imported. Names only —
 * no paths.
 */
async function registryFor(years) {
  const scan = await scanFolders();
  const reg = await registry();
  const imported = await reg.find({ year: { $in: years } }, { projection: { year: 1, key: 1, rowCount: 1, importedAt: 1, sheets: 1 } }).toArray();
  const byKey = new Map(imported.map((r) => [`${r.year}:${r.key}`, r]));

  return years.map((year) => ({
    year,
    datasets: (scan[year]?.datasets || []).map((d) => {
      const r = byKey.get(`${year}:${d.key}`);
      return {
        key: d.key,
        label: d.label,
        kind: d.kind,
        fileCount: d.files.length,
        imported: Boolean(r),
        rowCount: r?.rowCount || 0,
        importedAt: r?.importedAt || null,
        sheets: (r?.sheets || []).map((s) => ({ name: s.name, rows: s.rows, columns: s.columns })),
      };
    }),
  }));
}

async function describe(year, key) {
  const [entry] = await registryFor([year]);
  return entry?.datasets.find((d) => d.key === key) || null;
}

// --- import -------------------------------------------------------------------

const cellToValue = (v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v == null) return null;
  return typeof v === 'string' ? v.trim() : v;
};

/**
 * Import one dataset's spreadsheet(s) for a year, replacing what was there.
 *
 * Each sheet becomes rows tagged with the sheet name; the header row is the
 * first row with at least two non-empty cells. Columns are kept exactly as
 * headed — the screen shows the Bureau's own column names — with duplicates
 * suffixed so nothing is silently overwritten. A search field of the row's
 * text is stored alongside so the text index can find it.
 */
async function importDataset(year, key, actor) {
  const scan = await scanFolders();
  const dataset = scan[year]?.datasets.find((d) => d.key === key);
  if (!dataset) return { ok: false, status: 404, message: 'No such dataset in this year\'s folder.' };
  if (dataset.kind !== 'table') {
    return { ok: false, status: 400, message: 'The monitoring plan is edited on the Province screens, not imported here.' };
  }

  const XLSX = require('xlsx');
  const col = await rows();
  const reg = await registry();
  const dir = scan[year].dir;

  const docs = [];
  const sheets = [];
  for (const rel of dataset.files) {
    const wb = XLSX.readFile(path.join(dir, rel), { cellDates: true });
    const prefix = dataset.files.length > 1 ? `${path.basename(rel, path.extname(rel))} / ` : '';
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      const headerAt = grid.findIndex((r) => r.filter((c) => c != null && String(c).trim() !== '').length >= 2);
      if (headerAt < 0) continue;

      const body = grid.slice(headerAt + 1);
      const seen = new Map();
      // A column with no header and nothing under it is spreadsheet padding
      // ("Column 20" and friends): it is not imported at all. A headed column
      // is kept even when empty, because someone named it for a reason.
      const keep = grid[headerAt].map((h, i) => {
        const headed = String(h ?? '').trim() !== '';
        return headed || body.some((r) => r[i] != null && String(r[i]).trim() !== '');
      });
      const columns = grid[headerAt].map((h, i) => {
        if (!keep[i]) return null;
        // Spreadsheet headers wrap; the column name should not.
        let name = String(h ?? '').replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
        const count = (seen.get(name) || 0) + 1;
        seen.set(name, count);
        return count > 1 ? `${name} (${count})` : name;
      });

      const label = `${prefix}${sheetName}`;
      let n = 0;
      for (const r of body) {
        if (!r.some((c) => c != null && String(c).trim() !== '')) continue;
        const data = {};
        columns.forEach((c, i) => {
          if (c) data[c] = cellToValue(r[i]);
        });
        n += 1;
        docs.push({
          year,
          dataset: key,
          sheet: label,
          n,
          data,
          _search: Object.values(data).filter((v) => v != null).join(' ').toLowerCase(),
        });
      }
      if (n) sheets.push({ name: label, columns: columns.filter(Boolean), rows: n });
    }
  }

  if (!docs.length) return { ok: false, status: 422, message: 'No rows were found in the spreadsheet.' };

  await col.deleteMany({ year, dataset: key });
  try {
    for (let i = 0; i < docs.length; i += 1000) await col.insertMany(docs.slice(i, i + 1000), { ordered: false });
  } catch (err) {
    // A half-imported dataset is worse than none: the rows would show with no
    // registry entry and no way to tell they are partial. Undo, then say why.
    await col.deleteMany({ year, dataset: key }).catch(() => {});
    await reg.deleteOne({ year, key }).catch(() => {});
    const message = /space quota|storage/i.test(err.message)
      ? 'The database cluster is out of storage; the import was rolled back. Free space or raise the cluster tier.'
      : `Import failed and was rolled back: ${err.message}`;
    return { ok: false, status: 507, message };
  }

  await reg.updateOne(
    { year, key },
    {
      $set: {
        year,
        key,
        label: dataset.label,
        files: dataset.files,
        sheets,
        rowCount: docs.length,
        importedAt: new Date(),
        importedBy: actor?.username || 'unknown',
      },
    },
    { upsert: true }
  );
  return { ok: true, rowCount: docs.length, sheets };
}

// --- rows -----------------------------------------------------------------------

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One page of rows. `q` uses the text index when it is a word or more;
 * a sort names a column of the sheet. Everything is bounded: page size is
 * capped and the filter always carries the year and dataset.
 */
async function listRows(year, key, { sheet, page = 1, pageSize = 25, q = '', sortBy = null, sortDir = 'asc' } = {}) {
  const col = await rows();
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), MAX_PAGE_SIZE);
  const pageNo = Math.max(parseInt(page, 10) || 1, 1);

  const filter = { year, dataset: key };
  if (sheet) filter.sheet = sheet;
  const term = String(q || '').trim();
  if (term) {
    // Prefix and partial matches matter for permit numbers and names, which
    // the text index does not do; a regex over the search field does, and the
    // year+dataset prefix of the compound index keeps the scan to one dataset.
    filter._search = new RegExp(escapeRegex(term.toLowerCase()));
  }

  const sort = sortBy ? { [`data.${sortBy}`]: sortDir === 'desc' ? -1 : 1, n: 1 } : { sheet: 1, n: 1 };
  const [total, items] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter, { projection: { _search: 0 } }).sort(sort).skip((pageNo - 1) * size).limit(size).toArray(),
  ]);
  return { total, page: pageNo, pageSize: size, items };
}

async function getRow(year, key, id) {
  if (!ObjectId.isValid(String(id))) return null;
  const col = await rows();
  return col.findOne({ _id: new ObjectId(String(id)), year, dataset: key }, { projection: { _search: 0 } });
}

const searchable = (data) => Object.values(data || {}).filter((v) => v != null && v !== '').join(' ').toLowerCase();

async function updateRow(year, key, id, data, actor) {
  if (!ObjectId.isValid(String(id))) return { ok: false, status: 400, message: 'Invalid row id.' };
  const clean = sanitizeData(data);
  const col = await rows();
  const result = await col.updateOne(
    { _id: new ObjectId(String(id)), year, dataset: key },
    { $set: { data: clean, _search: searchable(clean), updatedAt: new Date(), updatedBy: actor?.username || 'unknown' } }
  );
  if (!result.matchedCount) return { ok: false, status: 404, message: 'Row not found in this year\'s dataset.' };
  return { ok: true };
}

async function addRow(year, key, sheet, data, actor) {
  const col = await rows();
  const reg = await registry();
  const entry = await reg.findOne({ year, key });
  if (!entry) return { ok: false, status: 404, message: 'Import the dataset before adding rows.' };
  const target = entry.sheets.find((s) => s.name === sheet) || entry.sheets[0];
  if (!target) return { ok: false, status: 400, message: 'The dataset has no sheet to add to.' };

  const clean = sanitizeData(data);
  const last = await col.find({ year, dataset: key, sheet: target.name }).sort({ n: -1 }).limit(1).next();
  const doc = {
    year,
    dataset: key,
    sheet: target.name,
    n: (last?.n || 0) + 1,
    data: clean,
    _search: searchable(clean),
    createdAt: new Date(),
    createdBy: actor?.username || 'unknown',
  };
  const { insertedId } = await col.insertOne(doc);
  await reg.updateOne({ year, key, 'sheets.name': target.name }, { $inc: { rowCount: 1, 'sheets.$.rows': 1 } });
  return { ok: true, id: insertedId };
}

/**
 * Add a column to a sheet: it appears on every row of that sheet (empty)
 * and on the edit form from then on. Names follow the same rules as headers.
 */
async function addColumn(year, key, sheet, name, actor) {
  const col = await rows();
  const reg = await registry();
  const entry = await reg.findOne({ year, key });
  if (!entry) return { ok: false, status: 404, message: 'Import the dataset before adding columns.' };
  const target = entry.sheets.find((s) => s.name === sheet) || entry.sheets[0];
  if (!target) return { ok: false, status: 400, message: 'The dataset has no sheet to add to.' };
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean || clean.startsWith('$') || clean.includes('.')) {
    return { ok: false, status: 400, message: 'Give the column a name without dots or a leading $.' };
  }
  if (target.columns.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, status: 409, message: 'That column already exists on this sheet.' };
  }
  await reg.updateOne(
    { year, key, 'sheets.name': target.name },
    { $push: { 'sheets.$.columns': clean }, $set: { updatedAt: new Date(), updatedBy: actor?.username || 'unknown' } }
  );
  await col.updateMany({ year, dataset: key, sheet: target.name }, { $set: { [`data.${clean}`]: null } });
  return { ok: true, column: clean };
}

async function deleteRow(year, key, id) {
  if (!ObjectId.isValid(String(id))) return { ok: false, status: 400, message: 'Invalid row id.' };
  const col = await rows();
  const doc = await col.findOneAndDelete({ _id: new ObjectId(String(id)), year, dataset: key });
  const deleted = doc && (doc.value || doc);
  if (!deleted || !deleted.sheet) return { ok: false, status: 404, message: 'Row not found in this year\'s dataset.' };
  const reg = await registry();
  await reg.updateOne({ year, key, 'sheets.name': deleted.sheet }, { $inc: { rowCount: -1, 'sheets.$.rows': -1 } });
  return { ok: true };
}

/** Only plain scalar values, under the column names the sheet already has. */
function sanitizeData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data && typeof data === 'object' ? data : {})) {
    const name = String(k).slice(0, 120);
    if (!name || name.startsWith('$') || name.includes('.')) continue;
    if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[name] = typeof v === 'string' ? v.slice(0, 5000) : v;
  }
  return out;
}

/** Streams the dataset as CSV, one sheet or all, in row order. */
async function* exportCsv(year, key, sheet) {
  const reg = await registry();
  const entry = await reg.findOne({ year, key });
  if (!entry) return;
  const col = await rows();
  const targets = sheet ? entry.sheets.filter((s) => s.name === sheet) : entry.sheets;
  const cell = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  for (const s of targets) {
    if (targets.length > 1) yield `# ${s.name}\r\n`;
    yield `${s.columns.map(cell).join(',')}\r\n`;
    const cursor = col.find({ year, dataset: key, sheet: s.name }, { projection: { data: 1 } }).sort({ n: 1 });
    for await (const doc of cursor) yield `${s.columns.map((c) => cell(doc.data?.[c])).join(',')}\r\n`;
  }
}

module.exports = {
  DATA_DIR,
  ensureIndexes,
  scanFolders,
  registryFor,
  describe,
  importDataset,
  listRows,
  getRow,
  updateRow,
  addRow,
  addColumn,
  deleteRow,
  exportCsv,
  keyFor,
  labelFor,
};
