const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../config/db');
const euSql = require('./euSql');

// ---------------------------------------------------------------------------
// Where an audit-trail entry is written, and how the moved part is read.
//
// One rule (phase B2.2, server/sql/README.md):
//   - ERMS, Document Portal and NAS entries are the ERMS records' history:
//     they stay in MongoDB's app-logs, where the tracking screens read them;
//   - UCDS and Admin entries go to SQL Server's eu.activity_log, as
//     app-config/euniverse-sql.stores.auditTrail says ('mongo' | 'dual' | 'sql').
//   - VERA stays in MongoDB until its own step (its limits read its entries).
//
// categoryOf() is the same rule services/auditLog.js applies to MongoDB with
// a query; the tests check the two agree.
//
// Writes go through the batch writer: the request that caused an entry never
// waits for SQL Server. Request bodies are stored redacted.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-logs';
const STORE = 'auditTrail';
const TABLE = 'eu.activity_log';
const SQL_CATEGORIES = new Set(['ucds', 'admin']);

const ADMIN_PATH = /^\/api\/(users|profile|org-units|admin)(\/|$)/;
const PORTAL_TYPE = /^portal-/;
const PORTAL_PATH = /^\/api\/(erms\/)?portal(\/|$)/;

/** The Audit Logs tab an entry belongs to. */
function categoryOf(e = {}) {
  if (e.domain === 'nas') return 'nas';
  if (PORTAL_TYPE.test(e.actionType || '') || PORTAL_PATH.test(e.path || '')) return 'portal';
  if (e.domain === 'erms') return 'erms';
  if (e.domain === 'vera') return 'vera';
  if (e.domain === 'admin') return 'admin';
  if (e.domain == null && ADMIN_PATH.test(e.path || '')) return 'admin';
  return 'ucds';
}

const COLUMNS = [
  ['mongo_id', () => euSql.sql.Char(24)],
  ['occurred_at', () => euSql.sql.DateTime2(3)],
  ['category', () => euSql.sql.VarChar(16)],
  ['domain', () => euSql.sql.VarChar(16)],
  ['user_id', () => euSql.sql.NVarChar(64)],
  ['username', () => euSql.sql.NVarChar(128)],
  ['action_type', () => euSql.sql.NVarChar(100)],
  ['action_label', () => euSql.sql.NVarChar(euSql.sql.MAX)],
  ['message', () => euSql.sql.NVarChar(1000)],
  ['detail', () => euSql.sql.NVarChar(2000)],
  ['method', () => euSql.sql.VarChar(10)],
  ['path', () => euSql.sql.NVarChar(400)],
  ['success', () => euSql.sql.Bit],
  ['serial_no', () => euSql.sql.NVarChar(64)],
  ['document_id', () => euSql.sql.NVarChar(64)],
  ['ip', () => euSql.sql.VarChar(64)],
  ['user_agent', () => euSql.sql.NVarChar(300)],
  ['request_data', () => euSql.sql.NVarChar(euSql.sql.MAX)],
  ['details', () => euSql.sql.NVarChar(euSql.sql.MAX)],
  ['extra', () => euSql.sql.NVarChar(euSql.sql.MAX)],
];
const MAPPED = new Set(['_id', 'timestamp', 'createdAt', 'domain', 'userId', 'username', 'actionType', 'actionLabel', 'message', 'detail', 'method', 'path', 'success', 'serialNo', 'documentId', 'ip', 'userAgent', 'requestData', 'details']);

const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
const json = (v) => (v == null ? null : JSON.stringify(v));

/** The SQL row for an entry. requestData is redacted on the way in. */
function toRow(e, mongoId = null) {
  const { redact } = require('./auditLog');
  const extra = Object.fromEntries(Object.entries(e).filter(([k, v]) => !MAPPED.has(k) && v !== undefined));
  const when = e.timestamp || e.createdAt || new Date();
  return {
    mongo_id: mongoId,
    occurred_at: when instanceof Date ? when : new Date(when),
    category: categoryOf(e),
    domain: cut(e.domain, 16),
    user_id: e.userId != null ? cut(e.userId, 64) : null,
    username: cut(e.username, 128),
    action_type: cut(e.actionType, 100),
    action_label: e.actionLabel != null ? String(e.actionLabel) : null,
    message: cut(e.message, 1000),
    detail: cut(e.detail, 2000),
    method: cut(e.method, 10),
    path: cut(e.path, 400),
    success: e.success === true ? true : e.success === false ? false : null,
    serial_no: cut(e.serialNo, 64),
    document_id: e.documentId != null ? cut(e.documentId, 64) : null,
    ip: cut(e.ip, 64),
    user_agent: cut(e.userAgent, 300),
    request_data: e.requestData != null ? json(redact(e.requestData)) : null,
    details: e.details != null ? json(e.details) : null,
    extra: Object.keys(extra).length ? json(extra) : null,
  };
}

/** What a screen receives, the same shape services/auditLog.js presents. */
function present(r) {
  const label = r.action_label || '';
  return {
    _id: `sql-${r.id}`,
    timestamp: r.occurred_at,
    username: r.username || null,
    actionType: r.action_type || null,
    actionLabel: label.length > 600 ? `${label.slice(0, 600)}…` : label,
    message: r.message || null,
    detail: r.detail || null,
    method: r.method || null,
    path: r.path || null,
    success: r.success === true ? true : r.success === false ? false : null,
    serialNo: r.serial_no || null,
    container: null,
    fileName: null,
    unit: null,
    ip: r.ip || null,
    requestData: r.request_data ? JSON.parse(r.request_data) : null,
  };
}

let writer = null;
const sqlWriter = () =>
  writer || (writer = euSql.createBatchWriter({ table: TABLE, columns: COLUMNS.map(([name, type]) => [name, type()]) }));

/** Write an entry where the rule says. Never throws: an audit failure must not fail the request. */
async function record(entry) {
  try {
    const sqlCategory = SQL_CATEGORIES.has(categoryOf(entry));
    const mode = sqlCategory ? await euSql.storeMode(STORE) : 'mongo';
    let mongoId = null;
    if (mode !== 'sql') {
      await connectToMongo();
      mongoId = String((await getDb().collection(COLLECTION).insertOne(entry)).insertedId);
    }
    if (mode !== 'mongo') sqlWriter().add(toRow(entry, mongoId));
  } catch (error) {
    console.error('Audit write failed:', error.message);
  }
}

/** Whether a category is read from SQL Server right now. */
async function readsSql(category) {
  return SQL_CATEGORIES.has(category) && (await euSql.storeMode(STORE)) === 'sql';
}

const likeText = (v) => `%${String(v).replace(/[[%_]/g, '[$&]').slice(0, 100)}%`;

/** The WHERE clause and parameters for a tab's filters. */
function where(category, { q, username, start, end, outcome } = {}) {
  const params = {};
  const and = [];
  if (category) {
    params.category = [euSql.sql.VarChar(16), category];
    and.push('category = @category');
  }
  if (username) {
    params.username = [euSql.sql.NVarChar(128), String(username)];
    and.push('username = @username');
  }
  if (q) {
    params.q = [euSql.sql.NVarChar(200), likeText(q)];
    and.push('(action_label LIKE @q OR detail LIKE @q OR message LIKE @q OR username LIKE @q OR path LIKE @q OR serial_no LIKE @q OR action_type LIKE @q)');
  }
  if (start && !Number.isNaN(Date.parse(start))) {
    params.start = [euSql.sql.DateTime2(3), new Date(start)];
    and.push('occurred_at >= @start');
  }
  if (end && !Number.isNaN(Date.parse(end))) {
    params.end = [euSql.sql.DateTime2(3), new Date(end)];
    and.push('occurred_at <= @end');
  }
  if (outcome === 'failed') and.push('success = 0');
  if (outcome === 'ok') and.push('(success IS NULL OR success = 1)');
  return { sqlWhere: and.length ? `WHERE ${and.join(' AND ')}` : '', params };
}

/** One page of a tab, newest first. */
async function list(category, { page = 1, pageSize = 50, ...criteria } = {}) {
  await sqlWriter().flush(); // what was just recorded is in the answer
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const { sqlWhere, params } = where(category, criteria);
  const [count, rows] = await Promise.all([
    euSql.query(`SELECT COUNT_BIG(*) AS n FROM ${TABLE} ${sqlWhere}`, params),
    euSql.query(
      `SELECT id, occurred_at, username, action_type, action_label, message, detail, method, path, success, serial_no, ip, request_data
       FROM ${TABLE} ${sqlWhere} ORDER BY occurred_at DESC, id DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,
      { ...params, offset: [euSql.sql.Int, offset], size: [euSql.sql.Int, size] }
    ),
  ]);
  return { total: Number(count.recordset[0].n), items: rows.recordset.map(present) };
}

/** Entries per category: all time and in the last seven days. */
async function summary(now = new Date()) {
  await sqlWriter().flush();
  const r = await euSql.query(
    `SELECT category, COUNT_BIG(*) AS total, SUM(CASE WHEN occurred_at >= @week THEN 1 ELSE 0 END) AS week FROM ${TABLE} GROUP BY category`,
    { week: [euSql.sql.DateTime2(3), new Date(now.getTime() - 7 * 86400000)] }
  );
  return Object.fromEntries(r.recordset.map((x) => [x.category, { total: Number(x.total), week: Number(x.week) }]));
}

const sqlIdOf = (id) => {
  const m = /^sql-(\d+)$/.exec(String(id || ''));
  return m ? Number(m[1]) : null;
};

/** A Developer's note on an entry, or deleting one: SQL Server for sql- ids, and the SQL copy of a MongoDB entry too. */
async function updateNote(id, message) {
  const note = cut(message, 1000);
  const sqlId = sqlIdOf(id);
  if (sqlId != null) {
    const r = await euSql.query(`UPDATE ${TABLE} SET message = @m WHERE id = @id`, { m: [euSql.sql.NVarChar(1000), note], id: [euSql.sql.BigInt, sqlId] });
    return r.rowsAffected[0] > 0;
  }
  if (ObjectId.isValid(id) && (await euSql.isConfigured())) {
    await euSql.query(`UPDATE ${TABLE} SET message = @m WHERE mongo_id = @mid`, { m: [euSql.sql.NVarChar(1000), note], mid: [euSql.sql.Char(24), String(id)] }).catch(() => {});
  }
  return null; // not a SQL id: the caller updates MongoDB
}

async function remove(id) {
  const sqlId = sqlIdOf(id);
  if (sqlId != null) {
    const r = await euSql.query(`DELETE FROM ${TABLE} WHERE id = @id`, { id: [euSql.sql.BigInt, sqlId] });
    return r.rowsAffected[0] > 0;
  }
  if (ObjectId.isValid(id) && (await euSql.isConfigured())) {
    await euSql.query(`DELETE FROM ${TABLE} WHERE mongo_id = @mid`, { mid: [euSql.sql.Char(24), String(id)] }).catch(() => {});
  }
  return null;
}

module.exports = { COLLECTION, STORE, TABLE, SQL_CATEGORIES, categoryOf, toRow, present, record, readsSql, where, list, summary, updateNote, remove, sqlIdOf, COLUMNS };
