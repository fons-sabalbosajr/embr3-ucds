const signature = require('cookie-signature');
const webpush = require('web-push');
const { connectToMongo, getDb } = require('../config/db');
const secrets = require('./secrets');
const { roleOf, ROLES, DOMAINS, hasDomain, ermsUnitOf } = require('./authorization');

// ---------------------------------------------------------------------------
// Notices that reach a person the moment something needs them — a document
// request to decide, a message, a decision on their own request — on every
// screen they have open and, once they allow it, on their PC or phone even
// with E-Universe closed.
//
// Two channels, one call (notify):
//
//   Socket.IO  Each socket says who it is with the same session token its tab
//              sends to the API (the cookie for a tab without one), and joins
//              that account's room. A notice goes to the room, so it reaches
//              every tab of that account and nobody else's. Sockets that are
//              not signed in still connect — the sign-in page listens for the
//              NAS — but never join a room.
//
//   Web Push   A browser that allowed notifications registers a push
//              subscription (POST /api/notifications/push/subscribe). The
//              notice is sent through the browser vendor's push service to the
//              service worker (front-end public/sw.js), which shows it as an
//              operating-system notification when no E-Universe window is in
//              front. Works on Windows, macOS, Android; on an iPhone only once
//              E-Universe is added to the Home Screen (iOS 16.4+). Needs
//              HTTPS (localhost excepted).
//
// The VAPID keys that sign the pushes come from VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY when set; otherwise a pair is made once and kept in
// app-config with the private half encrypted (services/secrets), so nothing
// has to be added to .env for this to work.
//
// A notice carries a title, a line of text and the screen to open — never the
// document itself.
// ---------------------------------------------------------------------------

const SUBSCRIPTIONS = 'push-subscriptions';
const CONFIG_ID = 'web-push';
const EVENT = 'notify';
const roomOf = (username) => `user:${username}`;
// Every socket that is signed in, whoever it is: for broadcasts (see broadcast()).
const SIGNED_IN = 'signed-in';

let io = null;
let sessionStore = null;
let vapid = null; // { publicKey, privateKey, subject } once loaded

// ── Who a socket is ──────────────────────────────────────────────────────────

const TOKEN_RE = /^s:[A-Za-z0-9_-]+\.[A-Za-z0-9+/=]+$/;

function cookieToken(cookieHeader) {
  const pair = String(cookieHeader || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('connect.sid='));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice('connect.sid='.length));
  } catch {
    return null;
  }
}

/** The signed-in username behind a session token, or null. */
function usernameFor(token) {
  return new Promise((resolve) => {
    if (!sessionStore || !token || !TOKEN_RE.test(token)) return resolve(null);
    const sid = signature.unsign(token.slice(2), process.env.SESSION_SECRET || '');
    if (!sid) return resolve(null);
    sessionStore.get(sid, (err, session) => resolve(!err && session?.user?.username ? session.user.username : null));
  });
}

async function identify(socket, token) {
  // A tab that keeps its own sign-in says so (perTab): with no token it is
  // signed out, and must not hear the notices of whoever signed in last on
  // the browser's cookie. Older clients still fall back to the cookie.
  const perTab = socket.handshake.auth?.perTab === true;
  const username = await usernameFor(token || (perTab ? null : cookieToken(socket.handshake.headers.cookie)));
  if (socket.data.username && socket.data.username !== username) socket.leave(roomOf(socket.data.username));
  socket.data.username = username;
  if (username) {
    socket.join(roomOf(username));
    socket.join(SIGNED_IN);
  } else {
    socket.leave(SIGNED_IN);
  }
  return username;
}

// Other modules' handlers for every connection (the Document Portal's page
// says it is watching the room). Registered at load time, run per socket.
const socketHandlers = [];
function onSocket(handler) {
  socketHandlers.push(handler);
}

/** Called once from server.js with the Socket.IO server and the session store. */
function attach(ioServer, store) {
  io = ioServer;
  sessionStore = store;
  io.on('connection', (socket) => {
    for (const handler of socketHandlers) {
      try {
        handler(socket);
      } catch (err) {
        console.warn('[notifier] socket handler:', err.message);
      }
    }
    identify(socket, socket.handshake.auth?.token).catch(() => {});
    // A tab that signs in (or switches account) without reconnecting.
    socket.on('notify:identify', (payload, ack) => {
      identify(socket, payload?.token)
        .then((username) => typeof ack === 'function' && ack({ ok: Boolean(username) }))
        .catch(() => typeof ack === 'function' && ack({ ok: false }));
    });
  });
}

// ── Web Push keys ────────────────────────────────────────────────────────────

function subjectOf() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (process.env.EMAIL_USER) return `mailto:${process.env.EMAIL_USER}`;
  const origin = String(process.env.CLIENT_URL || process.env.SERVER_URL || '');
  return /^https:\/\//.test(origin) ? origin : 'mailto:e-universe@localhost';
}

/** The key pair, made once when the environment has none. Null when push cannot be set up. */
async function keys() {
  if (vapid) return vapid;
  const subject = subjectOf();
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  } else {
    if (!secrets.isConfigured()) return null; // nowhere safe to keep a generated private key
    await connectToMongo();
    const configs = getDb().collection('app-config');
    let doc = await configs.findOne({ _id: CONFIG_ID });
    let privateKey = doc ? secrets.decrypt(doc.privateKey) : null;
    if (!doc || !privateKey) {
      const made = webpush.generateVAPIDKeys();
      await configs.updateOne(
        { _id: CONFIG_ID },
        { $set: { publicKey: made.publicKey, privateKey: secrets.encrypt(made.privateKey), createdAt: new Date() } },
        { upsert: true }
      );
      doc = { publicKey: made.publicKey };
      privateKey = made.privateKey;
    }
    vapid = { publicKey: doc.publicKey, privateKey, subject };
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

async function publicKey() {
  const k = await keys();
  return k ? k.publicKey : null;
}

// ── Subscriptions ────────────────────────────────────────────────────────────
//
// One document per browser AND account. A browser has a single push
// endpoint, but each tab can be a different account (shared/sessionToken on
// the front end), so five people signed in on five tabs of one PC each turn
// notices on for themselves and each gets their own. A notice for one of them
// then says whom it is for, so nobody mistakes another account's request for
// their own.
//
// Signing out pauses that account on that browser (no notices while nobody is
// signed in as them there); signing back in as the same account resumes it.
// Signing in as someone else never turns notices on for them by itself.

const subscriptions = () => getDb().collection(SUBSCRIPTIONS);

function validSubscription(s) {
  return (
    s &&
    typeof s.endpoint === 'string' &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 1024 &&
    typeof s.keys?.p256dh === 'string' &&
    typeof s.keys?.auth === 'string' &&
    s.keys.p256dh.length < 256 &&
    s.keys.auth.length < 64
  );
}

/** Notices on this browser for this account (others on the same browser keep theirs). */
async function subscribe(username, subscription, userAgent) {
  if (!validSubscription(subscription)) return false;
  await connectToMongo();
  const keysOf = { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth };
  await subscriptions().updateOne(
    { endpoint: subscription.endpoint, username },
    {
      $set: { keys: keysOf, paused: false, userAgent: String(userAgent || '').slice(0, 200), updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  // The browser's keys are the browser's: every account on it uses the latest.
  await subscriptions().updateMany({ endpoint: subscription.endpoint, username: { $ne: username } }, { $set: { keys: keysOf } });
  return true;
}

/** This account off on this browser. Returns how many accounts the browser still serves. */
async function unsubscribe(username, endpoint) {
  await connectToMongo();
  await subscriptions().deleteOne({ username, endpoint: String(endpoint || '') });
  return subscriptions().countDocuments({ endpoint: String(endpoint || '') });
}

/** Sign-out (paused) and sign-in again (resumed) — only for an account already on. */
async function setPaused(username, endpoint, paused) {
  await connectToMongo();
  const res = await subscriptions().updateOne({ username, endpoint: String(endpoint || '') }, { $set: { paused, updatedAt: new Date() } });
  return res.matchedCount > 0;
}

/** Whether this account takes notices on this browser, and how many accounts the browser serves. */
async function statusOf(username, endpoint) {
  await connectToMongo();
  const [mine, accounts, devices] = await Promise.all([
    endpoint ? subscriptions().findOne({ username, endpoint: String(endpoint) }, { projection: { paused: 1 } }) : null,
    endpoint ? subscriptions().countDocuments({ endpoint: String(endpoint), paused: { $ne: true } }) : 0,
    subscriptions().countDocuments({ username, paused: { $ne: true } }),
  ]);
  return { on: Boolean(mine && !mine.paused), accounts, devices };
}

async function devicesOf(username) {
  await connectToMongo();
  return subscriptions().countDocuments({ username, paused: { $ne: true } });
}

async function ensureIndexes() {
  await connectToMongo();
  // The first version kept one account per browser; that index goes.
  const existing = await subscriptions().indexes().catch(() => []);
  if (existing.some((i) => i.name === 'endpoint_1' && i.unique)) await subscriptions().dropIndex('endpoint_1').catch(() => {});
  await subscriptions().createIndex({ endpoint: 1, username: 1 }, { unique: true });
  await subscriptions().createIndex({ username: 1 });
}

// ── Sending ──────────────────────────────────────────────────────────────────

async function pushTo(usernames, notice) {
  const k = await keys().catch(() => null);
  if (!k) return 0;
  await connectToMongo();
  const subs = await subscriptions().find({ username: { $in: usernames }, paused: { $ne: true } }).limit(500).toArray();
  if (!subs.length) return 0;
  // Browsers that serve several accounts: their notices say whom they are for.
  const shared = new Set(
    (
      await subscriptions()
        .aggregate([
          { $match: { endpoint: { $in: [...new Set(subs.map((s) => s.endpoint))] }, paused: { $ne: true } } },
          { $group: { _id: '$endpoint', n: { $sum: 1 } } },
          { $match: { n: { $gt: 1 } } },
        ])
        .toArray()
    ).map((r) => r._id)
  );
  const names = new Map(
    (await getDb().collection('users').find({ username: { $in: usernames } }, { projection: { username: 1, name: 1 } }).toArray()).map((u) => [u.username, u.name || u.username])
  );
  const topic = notice.tag ? String(notice.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined : undefined;
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const body = JSON.stringify({ ...notice, to: s.username, forName: names.get(s.username) || s.username, shared: shared.has(s.endpoint) });
      try {
        // No topic on a shared browser: two accounts' notices with one tag must not replace each other.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 24 * 60 * 60, urgency: 'high', topic: shared.has(s.endpoint) ? undefined : topic });
        sent += 1;
      } catch (err) {
        // Gone: the browser dropped it, or the person turned notifications off.
        if (err?.statusCode === 404 || err?.statusCode === 410) await subscriptions().deleteMany({ endpoint: s.endpoint }).catch(() => {});
        else console.warn('[notifier] push failed:', err?.statusCode || err?.message);
      }
    })
  );
  return sent;
}

/**
 * Tell these people, now, on every screen and device they have.
 *
 * @param {string[]} usernames
 * @param {{title: string, body?: string, url?: string, tag?: string, kind?: string}} notice
 *   url is a path in the application ("/e-universe/erms/portal").
 * Never throws: a notice that cannot be delivered must not fail the request
 * that caused it.
 */
async function notify(usernames, notice) {
  const to = [...new Set((usernames || []).filter(Boolean))];
  if (!to.length) return { sockets: 0, pushes: 0 };
  const payload = {
    title: String(notice.title || 'E-Universe').slice(0, 120),
    body: String(notice.body || '').slice(0, 300),
    url: typeof notice.url === 'string' && notice.url.startsWith('/') ? notice.url : '/e-universe/home',
    tag: notice.tag || notice.kind || 'e-universe',
    kind: notice.kind || 'general',
    at: new Date().toISOString(),
  };
  // A room per account, so each socket learns the notice is for its own tab.
  if (io) for (const u of to) io.to(roomOf(u)).emit(EVENT, { ...payload, to: u });
  const pushes = await pushTo(to, payload).catch((err) => {
    console.warn('[notifier] push skipped:', err?.message);
    return 0;
  });
  return { sockets: to.length, pushes };
}

/**
 * Something everyone signed in may want to look at again — the Document
 * Portal's room changed. To signed-in sockets only (never the sign-in page's),
 * and it should carry no data: each screen asks the API again with its own
 * session, which decides what that person may see.
 */
function broadcast(event, payload = {}, extraRooms = []) {
  if (io) io.to([SIGNED_IN, ...extraRooms]).emit(event, payload);
}

/** One named room's sockets, signed in or not — e.g. a portal requester's own page. */
function emitTo(room, event, payload = {}) {
  if (io && room) io.to(room).emit(event, payload);
}

/** notify(), not awaited — for a request that should answer straight away. */
const notifyLater = (usernames, notice) =>
  setImmediate(() => {
    Promise.resolve(typeof usernames === 'function' ? usernames() : usernames)
      .then((list) => notify(list, notice))
      .catch((err) => console.warn('[notifier]', err?.message));
  });

/**
 * The people told of a new ERMS document request: the Developer, the
 * Administrators with ERMS, and the Records Unit's own staff (not Legal or
 * Laboratory staff, who hold the same ERMS User role).
 */
async function documentDeciders(exceptUsername) {
  await connectToMongo();
  const rows = await getDb()
    .collection('users')
    .find(
      { username: { $ne: exceptUsername || null }, permission: { $in: [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.RECORDS] } },
      { projection: { username: 1, permission: 1, domains: 1, ermsUnit: 1 } }
    )
    .toArray();
  return rows
    .filter(
      (u) =>
        roleOf(u) === ROLES.DEVELOPER ||
        (roleOf(u) === ROLES.ADMIN && hasDomain(u, DOMAINS.ERMS)) ||
        (roleOf(u) === ROLES.RECORDS && ermsUnitOf(u) === 'records')
    )
    .map((u) => u.username);
}

module.exports = {
  attach,
  notify,
  notifyLater,
  broadcast,
  emitTo,
  onSocket,
  documentDeciders,
  publicKey,
  subscribe,
  unsubscribe,
  setPaused,
  statusOf,
  devicesOf,
  ensureIndexes,
  usernameFor,
  SUBSCRIPTIONS,
  EVENT,
};
