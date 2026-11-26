const { connectToMongo, getDb } = require('../../config/db');
const euSql = require('../euSql');

// ---------------------------------------------------------------------------
// The Progress Tracker's event history: each save noticed in a working file,
// each validation warning, each re-baseline.
//
// Where it lives (phase B2, server/sql/README.md): MongoDB's progress-events,
// SQL Server's eu.progress_events, or both while moving, as
// app-config/euniverse-sql.stores.progressEvents says. The columns hold what
// is searched and sorted on; the rest of an event (its delta, sample,
// counts) is kept whole as JSON, so a read gives back exactly what was written.
// ---------------------------------------------------------------------------

const COLLECTION = 'progress-events';
const STORE = 'progressEvents';
const TABLE = 'eu.progress_events';
const COLUMNS = new Set(['_id', 'season', 'at', 'kind', 'name', 'source', 'modifiedBy']);

let writer = null;
const sqlWriter = () =>
  writer ||
  (writer = euSql.createBatchWriter({
    table: TABLE,
    columns: [
      ['mongo_id', euSql.sql.Char(24)],
      ['season', euSql.sql.VarChar(64)],
      ['occurred_at', euSql.sql.DateTime2(3)],
      ['kind', euSql.sql.VarChar(32)],
      ['file_name', euSql.sql.NVarChar(400)],
      ['source', euSql.sql.NVarChar(64)],
      ['modified_by', euSql.sql.NVarChar(200)],
      ['payload', euSql.sql.NVarChar(euSql.sql.MAX)],
    ],
  }));

/** The SQL row for an event (the shape MongoDB stores). */
function toRow(e, mongoId = null) {
  const rest = Object.fromEntries(Object.entries(e).filter(([k]) => !COLUMNS.has(k)));
  return {
    mongo_id: mongoId,
    season: String(e.season),
    occurred_at: e.at instanceof Date ? e.at : new Date(e.at || Date.now()),
    kind: e.kind || 'save',
    file_name: e.name ?? null,
    source: e.source ?? null,
    modified_by: e.modifiedBy ?? null,
    payload: Object.keys(rest).length ? JSON.stringify(rest) : null,
  };
}

/** The event as the screens expect it, from a SQL row. */
function fromRow(r) {
  const rest = r.payload ? JSON.parse(r.payload) : {};
  // Dates inside the payload come back as strings; the ones the screens read as dates are restored.
  for (const k of ['seenAt']) if (typeof rest[k] === 'string') rest[k] = new Date(rest[k]);
  return {
    _id: r.mongo_id || `sql-${r.id}`,
    season: r.season,
    at: r.occurred_at,
    kind: r.kind,
    ...(r.file_name != null ? { name: r.file_name } : {}),
    ...(r.source != null ? { source: r.source } : {}),
    ...(r.modified_by != null ? { modifiedBy: r.modified_by } : {}),
    ...rest,
  };
}

/** Record events (one or many). Never throws past the tracker: a lost note must not stop a look at the files. */
async function record(events) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!list.length) return;
  const mode = await euSql.storeMode(STORE);
  let ids = [];
  if (mode !== 'sql') {
    await connectToMongo();
    const res = await getDb().collection(COLLECTION).insertMany(list);
    ids = list.map((_, i) => String(res.insertedIds[i]));
  }
  if (mode !== 'mongo') {
    for (let i = 0; i < list.length; i++) sqlWriter().add(toRow(list[i], ids[i] || null));
  }
}

/** A season's latest events, newest first. */
async function latest(season, limit = 80) {
  const n = Math.min(Math.max(Number(limit) || 80, 1), 500);
  if ((await euSql.storeMode(STORE)) === 'sql') {
    await sqlWriter().flush();
    const rows = (
      await euSql.query(
        `SELECT TOP (@n) id, mongo_id, season, occurred_at, kind, file_name, source, modified_by, payload
         FROM ${TABLE} WHERE season = @season ORDER BY occurred_at DESC`,
        { n: [euSql.sql.Int, n], season: [euSql.sql.VarChar(64), String(season)] }
      )
    ).recordset;
    return rows.map(fromRow);
  }
  await connectToMongo();
  return getDb().collection(COLLECTION).find({ season: String(season) }).sort({ at: -1 }).limit(n).toArray();
}

module.exports = { COLLECTION, STORE, TABLE, record, latest, toRow, fromRow };
