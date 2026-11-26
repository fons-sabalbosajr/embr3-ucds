const { connectToMongo, getDb } = require('../config/db');
const euSql = require('./euSql');

// ---------------------------------------------------------------------------
// Sign-in history: who signed in and out, when, and from which address.
//
// The desktop ERMS kept this for every unit (tb_user_history and
// tb_employees_history: "Logged In" / "Logged Out", with the IP address).
// The application only kept login-status — whether someone is signed in now
// — which is overwritten at every sign-in and says nothing about yesterday.
//
// Where it lives (phase B2, server/sql/README.md): MongoDB's sign-in-history
// collection, SQL Server's eu.sign_in_history, or both while moving, as
// app-config/euniverse-sql.stores.signInHistory says ('mongo' | 'dual' |
// 'sql'). Entries expire after SIGN_IN_HISTORY_DAYS (two years by default):
// MongoDB by a TTL index, SQL Server by a daily purge here.
// ---------------------------------------------------------------------------

const COLLECTION = 'sign-in-history';
const STORE = 'signInHistory';
const TABLE = 'eu.sign_in_history';
const RETENTION_DAYS = Math.max(30, Number(process.env.SIGN_IN_HISTORY_DAYS) || 730);

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400, name: 'expire' });
  await collection().createIndex({ username: 1, at: -1 });
}

let writer = null;
const sqlWriter = () =>
  writer ||
  (writer = euSql.createBatchWriter({
    table: TABLE,
    columns: [
      ['mongo_id', euSql.sql.Char(24)],
      ['occurred_at', euSql.sql.DateTime2(3)],
      ['event', euSql.sql.VarChar(16)],
      ['user_id', euSql.sql.NVarChar(64)],
      ['username', euSql.sql.NVarChar(128)],
      ['name', euSql.sql.NVarChar(200)],
      ['ip', euSql.sql.VarChar(64)],
      ['user_agent', euSql.sql.NVarChar(200)],
    ],
  }));

/** The SQL row for an entry (the shape MongoDB stores). */
const toRow = (e, mongoId = null) => ({
  mongo_id: mongoId,
  occurred_at: e.at,
  event: e.event,
  user_id: e.userId,
  username: e.username,
  name: e.name,
  ip: e.ip,
  user_agent: e.userAgent,
});

let lastPurge = 0;
function purgeLater() {
  if (Date.now() - lastPurge < 24 * 3600 * 1000) return;
  lastPurge = Date.now();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000);
  // Small batches, so the purge never holds the table for long.
  euSql
    .query(`DELETE TOP (5000) FROM ${TABLE} WHERE occurred_at < @cutoff`, { cutoff: [euSql.sql.DateTime2(3), cutoff] })
    .catch((error) => console.warn('[SQL] sign-in history purge skipped:', error.message));
}

/**
 * Record a sign-in or sign-out. Never throws: a failure here must not stop
 * anyone signing in, and is logged instead.
 *
 * @param {'sign-in'|'sign-out'} event
 */
async function record(req, user, event) {
  const entry = {
    event,
    userId: user?._id ? String(user._id) : user?.userId ? String(user.userId) : null,
    username: user?.username || null,
    name: user?.name || null,
    ip: req?.ip || null,
    // Enough to tell a browser from a script; the full string is noise.
    userAgent: String(req?.get?.('user-agent') || '').slice(0, 120) || null,
    at: new Date(),
  };
  try {
    const mode = await euSql.storeMode(STORE);
    let mongoId = null;
    if (mode !== 'sql') {
      await connectToMongo();
      mongoId = String((await collection().insertOne(entry)).insertedId);
    }
    if (mode !== 'mongo') {
      sqlWriter().add(toRow(entry, mongoId));
      purgeLater();
    }
  } catch (error) {
    console.error('SIGN-IN HISTORY WRITE FAILED:', event, error.message);
  }
}

/**
 * The history, newest first. `usernames` limits it to those accounts (a
 * unit's staff); `since` to a period.
 */
async function list({ usernames = null, since = null, q = '', limit = 100 } = {}) {
  const top = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  if (Array.isArray(usernames) && !usernames.length) return [];

  if ((await euSql.storeMode(STORE)) === 'sql') {
    await sqlWriter().flush(); // what was just recorded is in the answer
    const params = { top: [euSql.sql.Int, top] };
    const where = [];
    if (Array.isArray(usernames)) {
      const names = usernames.slice(0, 500).map((u, i) => {
        params[`u${i}`] = [euSql.sql.NVarChar(128), String(u)];
        return `@u${i}`;
      });
      where.push(`username IN (${names.join(', ')})`);
    }
    if (since) {
      params.since = [euSql.sql.DateTime2(3), new Date(since)];
      where.push('occurred_at >= @since');
    }
    if (q) {
      params.q = [euSql.sql.NVarChar(200), `%${String(q).replace(/[[%_]/g, '[$&]')}%`];
      where.push('(username LIKE @q OR name LIKE @q OR ip LIKE @q)');
    }
    const rows = (
      await euSql.query(
        `SELECT TOP (@top) event, user_id AS userId, username, name, ip, user_agent AS userAgent, occurred_at AS at
         FROM ${TABLE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at DESC`,
        params
      )
    ).recordset;
    return rows;
  }

  await connectToMongo();
  const filter = {};
  if (Array.isArray(usernames)) filter.username = { $in: usernames };
  if (since) filter.at = { $gte: since };
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ username: rx }, { name: rx }, { ip: rx }];
  }
  return collection().find(filter, { projection: { _id: 0 } }).sort({ at: -1 }).limit(top).toArray();
}

module.exports = { COLLECTION, STORE, TABLE, RETENTION_DAYS, ensureIndexes, record, list, toRow };
