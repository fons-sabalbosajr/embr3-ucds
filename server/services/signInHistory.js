const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// Sign-in history: who signed in and out, when, and from which address.
//
// The desktop ERMS kept this for every unit (tb_user_history and
// tb_employees_history: "Logged In" / "Logged Out", with the IP address).
// The application only kept login-status — whether someone is signed in now
// — which is overwritten at every sign-in and says nothing about yesterday.
//
// Its own collection rather than app-logs, for two reasons. A TTL index on
// app-logs would expire every log in it, not just these. And the production
// cluster is near its size cap, so an append-only history has to end
// somewhere: entries expire after SIGN_IN_HISTORY_DAYS (two years by
// default), which still reads back further than anyone has asked.
// ---------------------------------------------------------------------------

const COLLECTION = 'sign-in-history';
const RETENTION_DAYS = Math.max(30, Number(process.env.SIGN_IN_HISTORY_DAYS) || 730);

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400, name: 'expire' });
  await collection().createIndex({ username: 1, at: -1 });
}

/**
 * Record a sign-in or sign-out. Never throws: a failure here must not stop
 * anyone signing in, and is logged instead.
 *
 * @param {'sign-in'|'sign-out'} event
 */
async function record(req, user, event) {
  try {
    await connectToMongo();
    await collection().insertOne({
      event,
      userId: user?._id ? String(user._id) : user?.userId ? String(user.userId) : null,
      username: user?.username || null,
      name: user?.name || null,
      ip: req?.ip || null,
      // Enough to tell a browser from a script; the full string is noise.
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 120) || null,
      at: new Date(),
    });
  } catch (error) {
    console.error('SIGN-IN HISTORY WRITE FAILED:', event, error.message);
  }
}

/**
 * The history, newest first. `usernames` limits it to those accounts (a
 * unit's staff); `since` to a period.
 */
async function list({ usernames = null, since = null, q = '', limit = 100 } = {}) {
  await connectToMongo();
  const filter = {};
  if (Array.isArray(usernames)) filter.username = { $in: usernames };
  if (since) filter.at = { $gte: since };
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ username: rx }, { name: rx }, { ip: rx }];
  }
  return collection()
    .find(filter, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 1000))
    .toArray();
}

module.exports = { COLLECTION, RETENTION_DAYS, ensureIndexes, record, list };
