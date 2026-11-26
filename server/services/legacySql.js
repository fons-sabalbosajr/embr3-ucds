const sql = require('mssql');
const { connectToMongo, getDb } = require('../config/db');
const secrets = require('./secrets');

// ---------------------------------------------------------------------------
// The legacy ERMS SQL Server, read-only.
//
// The desktop ERMS kept its data in three SQL Server databases on the office
// network (dbmain_records, dbmain_ermssublegal, dbmain_ermssublaboratory; see
// scripts/migrate-erms/legacy-sql/export.ps1). E-Universe reads them live
// from the office server, over the LAN, the same way it reads the NAS:
// nothing is forwarded to the Internet, and people reach the data through
// E-Universe from wherever they are.
//
// Read-only by construction. Nothing here accepts SQL from a caller: every
// statement is fixed, values go in as parameters, and every database, schema
// and table name is first looked up in the server's own catalogue and then
// bracket-quoted. The connection test also reports what the login is allowed
// to do, because the real guarantee belongs on the server: the login should
// hold db_datareader and nothing more.
//
// Settings live in app-config/legacy-sql. The password is encrypted with
// CONFIG_ENCRYPTION_KEY, as the NAS passwords are, and never leaves this
// module: describe() says whether one is set, never what it is.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'legacy-sql';
// The live server's names (seen 26 Nov 2026), which differ from the .bacpac
// exports export.ps1 was written for (dbmain_ermsrecords and so on).
const DEFAULT_DATABASES = ['dbmain_records', 'dbmain_ermssublegal', 'dbmain_ermssublaboratory'];

const IDENT = /^[A-Za-z0-9_$#@ .-]{1,128}$/;
const HOST = /^[A-Za-z0-9.-]{1,253}(\\[A-Za-z0-9_$-]{1,64})?$/;

const clean = (v) => (v == null ? '' : String(v).trim());
const quote = (name) => `[${String(name).replace(/]/g, ']]')}]`;

/** "10.14.77.248, 1433" or "10.14.77.248:1433", as SSMS and people write it. */
function parseServer(raw, port) {
  const text = clean(raw);
  const m = /^([^,:\s]+)\s*[,:]\s*(\d{1,5})$/.exec(text);
  if (m) return { host: m[1], port: Number(m[2]) };
  return { host: text, port: Number(port) || 1433 };
}

async function readStored() {
  await connectToMongo();
  return getDb().collection(COLLECTION).findOne({ _id: DOC_ID });
}

function fromStored(doc) {
  if (!doc?.host) return null;
  const password = doc.password ? secrets.decrypt(doc.password) : null;
  return {
    host: doc.host,
    port: doc.port || 1433,
    username: doc.username || '',
    password,
    passwordReadable: !doc.password || password !== null,
    encrypt: doc.encrypt !== false,
    trustServerCertificate: doc.trustServerCertificate !== false,
    databases: Array.isArray(doc.databases) && doc.databases.length ? doc.databases : DEFAULT_DATABASES,
  };
}

/** What a screen may see. Never the password, in any form. */
async function describe() {
  const doc = await readStored();
  const cfg = fromStored(doc);
  return {
    configured: Boolean(cfg && cfg.username && cfg.password),
    host: cfg?.host || null,
    port: cfg?.port || 1433,
    username: cfg?.username || null,
    passwordSet: Boolean(doc?.password),
    passwordReadable: cfg ? cfg.passwordReadable : true,
    encrypt: cfg ? cfg.encrypt : true,
    trustServerCertificate: cfg ? cfg.trustServerCertificate : true,
    databases: cfg?.databases || DEFAULT_DATABASES,
    secretsAvailable: secrets.isConfigured(),
    lastTestAt: doc?.lastTestAt || null,
    lastTestOk: doc?.lastTestOk ?? null,
    lastTestDetail: doc?.lastTestDetail || null,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

// One pool for the current settings; replaced when they change.
let pool = null;
let poolKey = null;

function poolConfig(cfg) {
  const [server, instanceName] = cfg.host.split('\\');
  return {
    server,
    ...(instanceName ? {} : { port: cfg.port }),
    user: cfg.username,
    password: cfg.password,
    database: 'master',
    connectionTimeout: 10000,
    requestTimeout: 30000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 60000 },
    options: {
      encrypt: cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      ...(instanceName ? { instanceName } : {}),
      appName: 'E-Universe (read-only)',
      // Reads only; also lets a server with an availability group route us to a readable secondary.
      readOnlyIntent: true,
    },
  };
}

async function getPool() {
  const cfg = fromStored(await readStored());
  if (!cfg) throw Object.assign(new Error('The SQL Server connection is not set up.'), { code: 'NOT_CONFIGURED' });
  if (!cfg.passwordReadable) {
    throw Object.assign(new Error('The saved password cannot be read (CONFIG_ENCRYPTION_KEY changed). Save it again.'), { code: 'PASSWORD_UNREADABLE' });
  }
  if (!cfg.username || !cfg.password) throw Object.assign(new Error('No SQL Server login is saved.'), { code: 'NO_LOGIN' });
  const key = JSON.stringify([cfg.host, cfg.port, cfg.username, cfg.password, cfg.encrypt, cfg.trustServerCertificate]);
  if (pool && poolKey === key && pool.connected) return { pool, cfg };
  await close();
  pool = new sql.ConnectionPool(poolConfig(cfg));
  poolKey = key;
  await pool.connect();
  return { pool, cfg };
}

async function close() {
  const old = pool;
  pool = null;
  poolKey = null;
  if (old) await old.close().catch(() => {});
}

/** Save the settings. A blank password keeps the saved one. */
async function save(input, actor) {
  if (!secrets.isConfigured()) {
    return { ok: false, status: 409, message: 'CONFIG_ENCRYPTION_KEY is not set on the server, so a password cannot be stored safely.' };
  }
  const { host, port } = parseServer(input?.host, input?.port);
  if (!HOST.test(host)) return { ok: false, status: 400, message: 'Enter the server as an address or name, e.g. 10.14.77.248 or 10.14.77.248, 1433.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, status: 400, message: 'The port must be between 1 and 65535.' };
  const username = clean(input?.username);
  if (!username || username.length > 128) return { ok: false, status: 400, message: 'Enter the SQL Server login.' };
  const databases = (Array.isArray(input?.databases) ? input.databases : DEFAULT_DATABASES).map(clean).filter(Boolean);
  if (!databases.length || databases.some((d) => !IDENT.test(d))) return { ok: false, status: 400, message: 'List the databases to read, e.g. dbmain_records.' };

  const current = await readStored();
  const set = {
    host,
    port,
    username,
    encrypt: input?.encrypt !== false,
    trustServerCertificate: input?.trustServerCertificate !== false,
    databases,
    updatedAt: new Date(),
    updatedBy: actor?.username || 'unknown',
  };
  const password = typeof input?.password === 'string' ? input.password : '';
  if (password) set.password = secrets.encrypt(password);
  else if (!current?.password) return { ok: false, status: 400, message: 'Enter the password for this login.' };

  await getDb().collection(COLLECTION).updateOne({ _id: DOC_ID }, { $set: set }, { upsert: true });
  await close();
  return { ok: true, config: await describe() };
}

async function recordTest(ok, detail) {
  await getDb().collection(COLLECTION).updateOne({ _id: DOC_ID }, { $set: { lastTestAt: new Date(), lastTestOk: ok, lastTestDetail: detail } });
}

/** Connect, and report the server, the login's rights and each database. */
async function test() {
  const started = Date.now();
  try {
    const { pool: p, cfg } = await getPool();
    const who = (
      await p.request().query(`SELECT SUSER_SNAME() AS login, CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) AS version,
        CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition, IS_SRVROLEMEMBER('sysadmin') AS sysadmin`)
    ).recordset[0];
    const present = new Set((await p.request().query('SELECT name FROM sys.databases')).recordset.map((r) => r.name.toLowerCase()));
    const databases = [];
    for (const db of cfg.databases) {
      if (!present.has(db.toLowerCase())) {
        databases.push({ name: db, exists: false });
        continue;
      }
      const r = (
        await p
          .request()
          .input('db', sql.NVarChar(128), db)
          .query(`SELECT HAS_DBACCESS(@db) AS access, HAS_PERMS_BY_NAME(@db, 'DATABASE', 'INSERT') AS canInsert,
            HAS_PERMS_BY_NAME(@db, 'DATABASE', 'UPDATE') AS canUpdate, HAS_PERMS_BY_NAME(@db, 'DATABASE', 'DELETE') AS canDelete`)
      ).recordset[0];
      databases.push({
        name: db,
        exists: true,
        access: r.access === 1,
        canWrite: r.canInsert === 1 || r.canUpdate === 1 || r.canDelete === 1,
      });
    }
    const canWrite = who.sysadmin === 1 || databases.some((d) => d.canWrite);
    const detail = `${who.edition} ${who.version}; ${databases.filter((d) => d.access).length}/${databases.length} databases readable${canWrite ? '; login can write' : ''}`;
    await recordTest(true, detail);
    return { ok: true, ms: Date.now() - started, login: who.login, version: who.version, edition: who.edition, sysadmin: who.sysadmin === 1, canWrite, databases };
  } catch (error) {
    await close();
    // tedious names the login and server in its messages, never the password.
    const message = String(error.message || error).slice(0, 300);
    await recordTest(false, `${error.code || 'ERROR'}: ${message}`).catch(() => {});
    return { ok: false, ms: Date.now() - started, code: error.code || 'ERROR', message };
  }
}

/** A database name the server has and the settings list, or null. */
async function knownDatabase(p, cfg, db) {
  const wanted = clean(db).toLowerCase();
  if (!cfg.databases.some((d) => d.toLowerCase() === wanted)) return null;
  const r = await p.request().input('db', sql.NVarChar(128), clean(db)).query('SELECT name FROM sys.databases WHERE name = @db');
  return r.recordset[0]?.name || null;
}

/** Tables in one database, with approximate row counts. */
async function listTables(db) {
  const { pool: p, cfg } = await getPool();
  const name = await knownDatabase(p, cfg, db);
  if (!name) throw Object.assign(new Error('Not one of the configured databases.'), { code: 'UNKNOWN_DATABASE' });
  const r = await p.request().query(
    // sys.partitions, not sys.dm_db_partition_stats: the latter needs VIEW
    // DATABASE STATE, which a read-only (db_datareader) login does not have.
    `SELECT s.name AS [schema], t.name AS [table], SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END) AS [rows]
     FROM ${quote(name)}.sys.tables t
     JOIN ${quote(name)}.sys.schemas s ON s.schema_id = t.schema_id
     LEFT JOIN ${quote(name)}.sys.partitions p ON p.object_id = t.object_id
     GROUP BY s.name, t.name ORDER BY s.name, t.name`
  );
  return r.recordset.map((t) => ({ schema: t.schema, table: t.table, rows: t.rows == null ? null : Number(t.rows) }));
}

/** The real names of a table, if it exists in that database. */
async function resolveTable(p, cfg, db, schema, table) {
  const name = await knownDatabase(p, cfg, db);
  if (!name) return null;
  const r = await p
    .request()
    .input('schema', sql.NVarChar(128), clean(schema) || 'dbo')
    .input('table', sql.NVarChar(128), clean(table))
    .query(`SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t FROM ${quote(name)}.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table AND TABLE_TYPE = 'BASE TABLE'`);
  const hit = r.recordset[0];
  return hit ? { db: name, schema: hit.s, table: hit.t } : null;
}

// Columns never shown or copied, as in the original export.
const EXCLUDED_COLUMNS = new Set(['password', 'photo']);
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !EXCLUDED_COLUMNS.has(k.toLowerCase())));


// ---------------------------------------------------------------------------
// The data explorer: columns, a filtered and sorted page, and exports.
//
// Same rule as everything above: no caller-supplied SQL. A filter names a
// column (checked against the table's real columns), an operator (from the
// list below) and a value (always a parameter). Sorting names a checked
// column. Paging uses ROW_NUMBER, which every SQL Server since 2005 has, so
// an old desktop-era server works as well as a new one.
// ---------------------------------------------------------------------------

// Types that cannot be compared as text or shown as a value.
const BINARY_TYPES = new Set(['binary', 'varbinary', 'image', 'timestamp', 'rowversion', 'geography', 'geometry', 'hierarchyid', 'sql_variant', 'xml']);

/** The table's columns, password and photo columns left out. */
async function columnsOf(p, t) {
  const r = await p
    .request()
    .input('schema', sql.NVarChar(128), t.schema)
    .input('table', sql.NVarChar(128), t.table)
    .query(`SELECT COLUMN_NAME AS name, DATA_TYPE AS type, CHARACTER_MAXIMUM_LENGTH AS maxLength, IS_NULLABLE AS nullable
            FROM ${quote(t.db)}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table ORDER BY ORDINAL_POSITION`);
  return r.recordset
    .filter((c) => !EXCLUDED_COLUMNS.has(c.name.toLowerCase()))
    .map((c) => ({ name: c.name, type: c.type, maxLength: c.maxLength, nullable: c.nullable === 'YES', binary: BINARY_TYPES.has(String(c.type).toLowerCase()) }));
}

async function describeTable(db, schema, table) {
  const { pool: p, cfg } = await getPool();
  const t = await resolveTable(p, cfg, db, schema, table);
  if (!t) throw Object.assign(new Error('No such table in the configured databases.'), { code: 'UNKNOWN_TABLE' });
  return { ...t, columns: await columnsOf(p, t) };
}

const OPERATORS = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'gt', 'lt'];
/** A value for LIKE, with its wildcards made literal. */
const likeLiteral = (v) => String(v).replace(/[[%_]/g, '[$&]');

/**
 * The WHERE clause, ORDER BY and the request carrying the values, for a
 * spec of { filters, search, sort } against checked columns.
 */
function buildQuery(request, columns, spec = {}) {
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c]));
  const textOf = (c) => `CAST(${quote(c.name)} AS nvarchar(4000))`;
  const where = [];
  let n = 0;
  const param = (value) => {
    const name = `p${n++}`;
    request.input(name, sql.NVarChar(4000), String(value).slice(0, 4000));
    return `@${name}`;
  };

  for (const f of Array.isArray(spec.filters) ? spec.filters.slice(0, 20) : []) {
    const col = byName.get(String(f?.column || '').toLowerCase());
    if (!col || col.binary || !OPERATORS.includes(f.op)) continue;
    const c = textOf(col);
    const v = f.value == null ? '' : String(f.value);
    switch (f.op) {
      case 'contains': where.push(`${c} LIKE ${param(`%${likeLiteral(v)}%`)}`); break;
      case 'notContains': where.push(`(${c} IS NULL OR ${c} NOT LIKE ${param(`%${likeLiteral(v)}%`)})`); break;
      case 'equals': where.push(`${c} = ${param(v)}`); break;
      case 'notEquals': where.push(`(${c} IS NULL OR ${c} <> ${param(v)})`); break;
      case 'startsWith': where.push(`${c} LIKE ${param(`${likeLiteral(v)}%`)}`); break;
      case 'endsWith': where.push(`${c} LIKE ${param(`%${likeLiteral(v)}`)}`); break;
      case 'empty': where.push(`(${quote(col.name)} IS NULL OR LTRIM(RTRIM(${c})) = '')`); break;
      case 'notEmpty': where.push(`(${quote(col.name)} IS NOT NULL AND LTRIM(RTRIM(${c})) <> '')`); break;
      case 'gt': where.push(`${c} > ${param(v)}`); break;
      case 'lt': where.push(`${c} < ${param(v)}`); break;
      default: break;
    }
  }

  const search = String(spec.search || '').trim();
  if (search) {
    const searchable = columns.filter((c) => !c.binary).slice(0, 60);
    if (searchable.length) {
      const p = param(`%${likeLiteral(search)}%`);
      where.push(`(${searchable.map((c) => `${textOf(c)} LIKE ${p}`).join(' OR ')})`);
    }
  }

  const sortCol = byName.get(String(spec.sort?.column || '').toLowerCase());
  // text and ntext (common in desktop-era tables) cannot be sorted directly.
  const sortExpr = sortCol && /^n?text$/i.test(sortCol.type || '') ? textOf(sortCol) : sortCol && quote(sortCol.name);
  const orderBy = sortCol && !sortCol.binary ? `${sortExpr} ${spec.sort.dir === 'desc' ? 'DESC' : 'ASC'}` : '(SELECT NULL)';
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', orderBy };
}

/** The columns to return: the chosen ones that exist, or all. */
function chosen(columns, names) {
  if (!Array.isArray(names) || !names.length) return columns;
  const wanted = new Set(names.map((s) => String(s).toLowerCase()));
  const picked = columns.filter((c) => wanted.has(c.name.toLowerCase()));
  return picked.length ? picked : columns;
}

const selectList = (cols) => cols.map((c) => (c.binary ? `NULL AS ${quote(c.name)}` : quote(c.name))).join(', ');

/** One page of a table, filtered and sorted. */
async function queryTable(spec = {}) {
  const { pool: p, cfg } = await getPool();
  const t = await resolveTable(p, cfg, spec.db, spec.schema, spec.table);
  if (!t) throw Object.assign(new Error('No such table in the configured databases.'), { code: 'UNKNOWN_TABLE' });
  const columns = await columnsOf(p, t);
  const cols = chosen(columns, spec.columns);
  const pageSize = Math.min(Math.max(Number(spec.pageSize) || 50, 1), 500);
  const page = Math.max(Number(spec.page) || 1, 1);
  const from = `${quote(t.db)}.${quote(t.schema)}.${quote(t.table)}`;

  const countReq = p.request();
  const counted = buildQuery(countReq, columns, spec);
  const total = Number((await countReq.query(`SELECT COUNT_BIG(*) AS n FROM ${from} ${counted.where}`)).recordset[0].n);

  const req = p.request();
  const q = buildQuery(req, columns, spec);
  req.input('first', sql.BigInt, (page - 1) * pageSize + 1);
  req.input('last', sql.BigInt, page * pageSize);
  const rows = (
    await req.query(`SELECT ${selectList(cols)} FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY ${q.orderBy}) AS [__eu_row], * FROM ${from} ${q.where}
      ) AS paged WHERE [__eu_row] BETWEEN @first AND @last ORDER BY [__eu_row]`)
  ).recordset;
  return { ...t, total, page, pageSize, columns: cols.map((c) => c.name), allColumns: columns, rows };
}

// A spreadsheet treats a cell beginning with these as a formula; a leading
// quote keeps such text as text (CSV injection).
const FORMULA = /^[=+@\t\r]|^-(?![\d.])/;
const csvCell = (v) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const EXPORT_LIMIT = { csv: 500000, json: 500000, xlsx: 100000 };

/**
 * Stream a filtered table to `out` (an HTTP response) as CSV, JSON or XLSX.
 * Resolves with { rows, truncated }. Rows are streamed from SQL Server with
 * back-pressure, so a large table is never held in memory (XLSX excepted:
 * the workbook is assembled whole, hence its lower limit).
 */
async function exportTable(spec, format, out) {
  const fmt = ['csv', 'json', 'xlsx'].includes(format) ? format : 'csv';
  const { pool: p, cfg } = await getPool();
  const t = await resolveTable(p, cfg, spec.db, spec.schema, spec.table);
  if (!t) throw Object.assign(new Error('No such table in the configured databases.'), { code: 'UNKNOWN_TABLE' });
  const columns = await columnsOf(p, t);
  const cols = chosen(columns, spec.columns).filter((c) => !c.binary);
  const limit = EXPORT_LIMIT[fmt];
  const from = `${quote(t.db)}.${quote(t.schema)}.${quote(t.table)}`;

  const req = p.request();
  const q = buildQuery(req, columns, spec);
  req.input('limit', sql.BigInt, limit + 1);
  req.timeout = 300000;
  const text = `SELECT TOP (@limit) ${selectList(cols)} FROM ${from} ${q.where} ORDER BY ${q.orderBy}`;
  const names = cols.map((c) => c.name);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${t.db}_${t.table}_${stamp}.${fmt}`.replace(/[^\w.-]+/g, '_');

  if (fmt === 'xlsx') {
    const XLSX = require('xlsx');
    const rows = (await req.query(text)).recordset;
    const truncated = rows.length > limit;
    const body = rows.slice(0, limit).map((r) => names.map((n) => (r[n] instanceof Date ? r[n].toISOString() : r[n])));
    const sheet = XLSX.utils.aoa_to_sheet([names, ...body]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t.table.slice(0, 31));
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    out.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    out.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    out.end(buffer);
    return { ...t, rows: Math.min(rows.length, limit), truncated, fileName };
  }

  out.setHeader('Content-Type', fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  out.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  // A byte-order mark so Excel opens the CSV as UTF-8.
  out.write(fmt === 'csv' ? `﻿${names.map(csvCell).join(',')}\r\n` : '[\n');

  return new Promise((resolve, reject) => {
    let count = 0;
    let truncated = false;
    req.stream = true;
    req.on('row', (row) => {
      if (count >= limit) {
        truncated = true;
        return;
      }
      const line =
        fmt === 'csv'
          ? `${names.map((n) => csvCell(row[n])).join(',')}\r\n`
          : `${count ? ',\n' : ''}${JSON.stringify(Object.fromEntries(names.map((n) => [n, row[n] instanceof Date ? row[n].toISOString() : row[n]])))}`;
      count += 1;
      if (!out.write(line)) {
        req.pause();
        out.once('drain', () => req.resume());
      }
    });
    req.on('error', (error) => {
      out.end();
      reject(error);
    });
    req.on('done', () => {
      if (fmt === 'json') out.write('\n]\n');
      out.end();
      resolve({ ...t, rows: count, truncated, fileName });
    });
    // Errors arrive on the 'error' event above; the promise mssql may also
    // return would otherwise be reported as an unhandled rejection.
    const pending = req.query(text);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  });
}

/**
 * A whole table, for scripts (the divergence check). Values come back as
 * strings with null as '', so the rows look like the CSV export they replace.
 */
async function readTable(db, schema, table) {
  const { pool: p, cfg } = await getPool();
  const t = await resolveTable(p, cfg, db, schema, table);
  if (!t) throw Object.assign(new Error(`No table ${db}.${schema}.${table} in the configured databases.`), { code: 'UNKNOWN_TABLE' });
  const req = p.request();
  req.timeout = 120000;
  const r = await req.query(`SELECT * FROM ${quote(t.db)}.${quote(t.schema)}.${quote(t.table)}`);
  return r.recordset.map((row) =>
    Object.fromEntries(Object.entries(strip(row)).map(([k, v]) => [k, v == null ? '' : v instanceof Date ? v.toISOString() : String(v)]))
  );
}

module.exports = {
  describe,
  save,
  test,
  listTables,

  describeTable,
  queryTable,
  exportTable,
  readTable,
  close,
  parseServer,
  quote,
  buildQuery,
  csvCell,
  OPERATORS,
  EXPORT_LIMIT,
  DEFAULT_DATABASES,
  DOC_ID,
};
