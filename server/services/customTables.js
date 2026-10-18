const crypto = require('crypto');
const XLSX = require('xlsx');
const { connectToMongo, getDb, ObjectId } = require('../config/db');
const { badRequest, notFoundError } = require('../shared/middleware/errorHandler');
const menuItems = require('./menuItems');

// ---------------------------------------------------------------------------
// The Planning Unit's own tables (a `table` item in the year's menu,
// services/menuItems.js): the columns they design and the rows they fill.
//
// Columns live on the item — { key, name, type, options, formula, total,
// width } — and rows in their own collection, one document per row, its
// values keyed by column key (a renamed column keeps its values).
//
// Formula columns store no value: the page works them out from the row's
// other columns (front-end modules/ucds/custom/formula.js), and the Excel
// export is built from what the page shows. Writing needs canManageData, as
// for the rest of the register; reading is any UCDS account in that year.
// ---------------------------------------------------------------------------

const ROWS = 'ucds-custom-rows';
const TYPES = ['text', 'number', 'date', 'select', 'checkbox', 'formula'];
const TOTALS = ['sum', 'avg', 'count', 'min', 'max'];
const MAX_COLUMNS = 100;
const MAX_ROWS = 10000;
const MAX_VALUE = 4000;

const rows = () => getDb().collection(ROWS);
const items = () => getDb().collection(menuItems.COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await rows().createIndex({ year: 1, tableId: 1, order: 1 });
}

/** The table item of the year, or a 404. */
async function tableOf(year, id) {
  await connectToMongo();
  if (!ObjectId.isValid(id)) throw notFoundError('No such table.', 'TABLE_NOT_FOUND');
  const doc = await items().findOne({ _id: new ObjectId(id), year });
  if (!doc || doc.kind !== 'table') throw notFoundError('No such table in this year.', 'TABLE_NOT_FOUND');
  return doc;
}

const clean = (v, n = 60) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** A column as the editor sent it, checked. */
function cleanColumn(c, seen) {
  const name = clean(c?.name);
  if (!name) throw badRequest('Every column needs a name.', 'COLUMN_NAME_REQUIRED');
  if (/[[\]]/.test(name)) throw badRequest(`"${name}": a column name cannot hold [ or ].`, 'COLUMN_NAME_BAD');
  const lower = name.toLowerCase();
  if (seen.has(lower)) throw badRequest(`Two columns are named "${name}".`, 'COLUMN_NAME_TWICE');
  seen.add(lower);
  const type = TYPES.includes(c?.type) ? c.type : 'text';
  const key = /^[a-z0-9]{4,24}$/i.test(String(c?.key || '')) ? String(c.key) : `c${crypto.randomBytes(5).toString('hex')}`;
  const column = { key, name, type };
  if (type === 'select') {
    column.options = [...new Set((Array.isArray(c.options) ? c.options : []).map((o) => clean(o, 80)).filter(Boolean))].slice(0, 60);
  }
  if (type === 'formula') {
    column.formula = String(c.formula ?? '').trim().slice(0, 500);
    if (!column.formula) throw badRequest(`"${name}": write its formula, e.g. =[Target] - [Done].`, 'FORMULA_REQUIRED');
  }
  if (TOTALS.includes(c?.total)) column.total = c.total;
  const width = Number(c?.width);
  if (Number.isFinite(width) && width >= 60 && width <= 600) column.width = Math.round(width);
  return column;
}

/** The table's design and every row, in order. */
async function read(year, id) {
  const table = await tableOf(year, id);
  const list = await rows()
    .find({ year, tableId: String(table._id) }, { projection: { year: 0, tableId: 0 } })
    .sort({ order: 1, _id: 1 })
    .limit(MAX_ROWS)
    .toArray();
  return {
    columns: table.table?.columns || [],
    rows: list.map(({ _id, ...r }) => ({ id: String(_id), ...r })),
  };
}

async function saveColumns(year, id, columns, actor) {
  const table = await tableOf(year, id);
  if (!Array.isArray(columns)) throw badRequest('Send the table\'s columns.', 'COLUMNS_REQUIRED');
  if (columns.length > MAX_COLUMNS) throw badRequest(`A table holds up to ${MAX_COLUMNS} columns.`, 'TOO_MANY_COLUMNS');
  const seen = new Set();
  const next = columns.map((c) => cleanColumn(c, seen));
  await items().updateOne(
    { _id: table._id },
    { $set: { 'table.columns': next, updatedAt: new Date(), updatedBy: actor?.username || 'unknown' } }
  );
  return next;
}

/** A row's values, only for the table's own non-formula columns. */
function cleanValues(columns, values) {
  const keys = new Map(columns.filter((c) => c.type !== 'formula').map((c) => [c.key, c]));
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    const col = keys.get(k);
    if (!col) continue;
    if (v === null || v === undefined || v === '') out[k] = '';
    else if (col.type === 'checkbox') out[k] = v === true || /^(true|yes|1|✔)$/i.test(String(v));
    else if (col.type === 'number') {
      const n = Number(String(v).replace(/,/g, '').trim());
      out[k] = Number.isFinite(n) ? n : String(v).slice(0, MAX_VALUE);
    } else out[k] = String(v).slice(0, MAX_VALUE);
  }
  return out;
}

async function countRows(year, tableId) {
  const n = await rows().countDocuments({ year, tableId });
  await items().updateOne({ _id: new ObjectId(tableId) }, { $set: { 'table.rowCount': n } });
  return n;
}

/** Add rows at the end (one for "Add row", many for a paste). */
async function addRows(year, id, list, actor) {
  const table = await tableOf(year, id);
  const tableId = String(table._id);
  const input = Array.isArray(list) ? list.slice(0, 2000) : [];
  if (!input.length) throw badRequest('No rows to add.', 'ROWS_REQUIRED');
  const have = await rows().countDocuments({ year, tableId });
  if (have + input.length > MAX_ROWS) throw badRequest(`A table holds up to ${MAX_ROWS} rows.`, 'TOO_MANY_ROWS');
  const last = await rows().find({ year, tableId }).sort({ order: -1 }).limit(1).toArray();
  let order = last.length ? last[0].order || 0 : 0;
  const now = new Date();
  const who = actor?.username || 'unknown';
  const docs = input.map((r) => ({ year, tableId, order: (order += 1), values: cleanValues(table.table?.columns || [], r?.values), createdAt: now, createdBy: who, updatedAt: null, updatedBy: null }));
  const { insertedIds } = await rows().insertMany(docs);
  const rowCount = await countRows(year, tableId);
  return { rows: docs.map((d, i) => { const { year: _y, tableId: _t, ...r } = d; return { id: String(insertedIds[i]), ...r }; }), rowCount };
}

/** Change some values of one row. */
async function updateRow(year, id, rowId, values, actor) {
  const table = await tableOf(year, id);
  if (!ObjectId.isValid(rowId)) throw notFoundError('No such row.', 'ROW_NOT_FOUND');
  const clean = cleanValues(table.table?.columns || [], values);
  if (!Object.keys(clean).length) throw badRequest('Nothing to change.', 'NOTHING_TO_CHANGE');
  const set = { updatedAt: new Date(), updatedBy: actor?.username || 'unknown' };
  for (const [k, v] of Object.entries(clean)) set[`values.${k}`] = v;
  const r = await rows().findOneAndUpdate({ _id: new ObjectId(rowId), year, tableId: String(table._id) }, { $set: set }, { returnDocument: 'after' });
  const doc = r?.value !== undefined ? r.value : r;
  if (!doc) throw notFoundError('No such row.', 'ROW_NOT_FOUND');
  const { _id, year: _y, tableId: _t, ...rest } = doc;
  return { id: String(_id), ...rest };
}

async function deleteRows(year, id, ids) {
  const table = await tableOf(year, id);
  const tableId = String(table._id);
  const list = (Array.isArray(ids) ? ids : []).filter((x) => ObjectId.isValid(x)).map((x) => new ObjectId(x));
  if (!list.length) throw badRequest('Choose the rows to delete.', 'ROWS_REQUIRED');
  const { deletedCount } = await rows().deleteMany({ _id: { $in: list }, year, tableId });
  return { deleted: deletedCount, rowCount: await countRows(year, tableId) };
}

/** A removed table's rows go with it (menuItems.remove). */
async function removeRowsOf(year, tableIds) {
  await connectToMongo();
  if (!tableIds.length) return 0;
  const { deletedCount } = await rows().deleteMany({ year, tableId: { $in: tableIds.map(String) } });
  return deletedCount;
}

/**
 * The table as the page shows it — filtered, sorted, formulas worked out —
 * as an Excel workbook: a header row, the rows, and the totals row.
 */
function workbookOf({ title, headers, rows: grid, totals }) {
  const head = (Array.isArray(headers) ? headers : []).slice(0, MAX_COLUMNS).map((h) => clean(h, 120));
  if (!head.length) throw badRequest('Nothing to export.', 'NOTHING_TO_EXPORT');
  const cell = (v) => (typeof v === 'number' || typeof v === 'boolean' ? v : String(v ?? '').slice(0, MAX_VALUE));
  const body = (Array.isArray(grid) ? grid : []).slice(0, MAX_ROWS).map((r) => head.map((_, i) => cell(Array.isArray(r) ? r[i] : '')));
  const aoa = [head, ...body];
  if (Array.isArray(totals) && totals.some((t) => t !== '' && t !== null && t !== undefined)) aoa.push(head.map((_, i) => cell(totals[i])));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = head.map((h, i) => ({ wch: Math.min(60, Math.max(10, h.length + 2, ...body.slice(0, 200).map((r) => String(r[i] ?? '').length + 1))) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: head.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, clean(title, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Table');
  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), rows: body.length };
}

module.exports = { ROWS, TYPES, TOTALS, ensureIndexes, read, saveColumns, addRows, updateRow, deleteRows, removeRowsOf, workbookOf };
