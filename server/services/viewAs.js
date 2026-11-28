const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../config/db');
const { ROLES, ROLE_LABELS, roleOf, isDeveloper } = require('./authorization');

// ---------------------------------------------------------------------------
// Developer "view as": see E-Universe exactly as a Planning or ERMS officer
// sees it, without their password and without being able to change anything.
// The idea is ESWMP's developer portal context (embr3-eswmp, routes/devPortal.js):
// a PIN of the Developer's own, then the account, then a bounded session.
//
//   1. The Developer sets a 6-digit PIN, confirmed with their own password.
//      It is kept hashed in app-config/developer-view-as. Five wrong PINs lock
//      it for 15 minutes.
//   2. The PIN, entered when starting, lists the accounts that can be viewed
//      (Planning and ERMS) for the next 5 minutes.
//   3. Starting puts the Developer's own session aside and gives the session
//      the account's sign-in snapshot (the same buildSessionPayload a sign-in
//      uses), so every screen, menu, province, year and ERMS unit check sees
//      exactly what that officer would — through the same code, not a copy of
//      it. It ends after 30 minutes, on Exit, or on sign-out, and the
//      Developer's own session comes back as it was.
//
// View only: while it lasts, guard() refuses every request that could change
// something (anything but GET/HEAD/OPTIONS, apart from the few that only read;
// READ_ONLY_WRITES). Nothing can be saved under, or mistaken for, the officer:
// the activity, audit and document logs name the Developer (actorOf), and
// starting and ending are logged in the audit trail under the Developer.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'developer-view-as';
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const PICK_MINUTES = 5;
const SESSION_MINUTES = 30;
const VIEWABLE_ROLES = [ROLES.PLANNING, ROLES.RECORDS];
const BASE = '/api/developer/view-as';

// Not GETs, but they change nothing: choosing the year (session only), the
// duplicate check, and the register exports.
const READ_ONLY_WRITES = [
  ['POST', /^\/api\/years\/select$/],
  ['POST', /^(\/api)?\/check-data$/],
  ['POST', /^\/api\/ucds\/spreadsheet\/export\.xlsx$/],
  ['POST', /^\/api\/ucds\/custom-tables\/[^/]+\/export\.xlsx$/],
];

const config = async () => {
  await connectToMongo();
  return (await getDb().collection(COLLECTION).findOne({ _id: DOC_ID })) || {};
};
const saveConfig = (fields) =>
  getDb().collection(COLLECTION).updateOne({ _id: DOC_ID }, { $set: fields }, { upsert: true });

const viewing = (req) => req.session?.viewAs || null;

/** Who is really acting, for the logs: the Developer while viewing, else the signed-in user. */
function actorOf(req) {
  const va = viewing(req);
  if (va) return { userId: va.by.userId, username: va.by.username, viewingAs: va.target.username };
  const u = req.session?.user;
  return { userId: u?.userId || null, username: u?.username || null };
}

/** The audit trail entry for starting and ending, under the Developer. */
async function audit(req, by, label, target) {
  await require('./activityStore').record({
    userId: by.userId,
    username: by.username,
    domain: 'admin',
    method: req.method,
    path: req.path,
    actionType: 'View as',
    actionLabel: label,
    targetCollection: 'users',
    documentId: target?.userId || null,
    changes: null,
    requestData: null,
    timestamp: new Date(),
  });
}

/** Put the Developer's own session back. */
function restore(req) {
  const va = viewing(req);
  if (!va) return null;
  req.session.user = va.devSession;
  if (va.devActiveYear != null) req.session.activeYear = va.devActiveYear;
  else delete req.session.activeYear;
  delete req.session.viewAs;
  return va;
}

async function end(req, why) {
  const va = restore(req);
  if (va) await audit(req, va.by, `Stopped viewing as ${va.target.name} (${why})`, va.target);
  return va;
}

/** What the shell shows in its banner; null when not viewing. */
function describe(req) {
  const va = viewing(req);
  if (!va) return null;
  return { by: va.by.username, byName: va.by.name, name: va.target.name, username: va.target.username, roleLabel: va.target.roleLabel, startedAt: va.startedAt, expiresAt: va.expiresAt };
}

/**
 * Runs before every route. Ends a view that has run its time, and while one
 * lasts, lets through only what cannot change anything.
 */
function guard(req, res, next) {
  if (!viewing(req)) return next();
  // Express 4 does not catch a rejected promise: hand any failure on.
  guardViewing(req, res, next).catch(next);
}

async function guardViewing(req, res, next) {
  const va = viewing(req);
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (Date.now() > new Date(va.expiresAt).getTime()) {
    await end(req, 'time ran out');
    // A change sent from a screen that still thought it was viewing must not
    // go through under the Developer: the screen reloads instead.
    if (writes) return res.status(409).json({ code: 'VIEW_AS_ENDED', message: 'Viewing as another account has ended. Reload to continue as yourself.' });
    return next();
  }
  if (!writes || req.path.startsWith(`${BASE}/`)) return next();
  // Signing out ends the view first, so the sign-out is the Developer's.
  if (req.method === 'POST' && req.path === '/logout') {
    await end(req, 'signed out');
    return next();
  }
  if (READ_ONLY_WRITES.some(([m, re]) => m === req.method && re.test(req.path))) return next();
  return res.status(403).json({
    code: 'VIEW_ONLY',
    message: `View only: you are seeing E-Universe as ${va.target.name}. Nothing can be changed. Exit "view as" to make changes.`,
  });
}

// --- The Developer's routes -------------------------------------------------

async function status(req) {
  const c = await config();
  const locked = c.lockedUntil && new Date(c.lockedUntil) > new Date();
  return { pinSet: Boolean(c.pinHash), pinSetAt: c.pinSetAt || null, locked: Boolean(locked), lockedUntil: locked ? c.lockedUntil : null, minutes: SESSION_MINUTES };
}

async function developerAccount(req) {
  const id = req.session?.user?.userId;
  if (!id || !ObjectId.isValid(String(id))) return null;
  await connectToMongo();
  const dev = await getDb().collection('users').findOne({ _id: new ObjectId(String(id)) });
  return dev && isDeveloper(dev) ? dev : null;
}

async function setPin(req, { pin, password }) {
  if (!/^\d{6}$/.test(String(pin || ''))) return { status: 400, message: 'The PIN must be exactly 6 digits.' };
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return { status: 400, message: 'Choose a PIN that is not repeated or sequential digits.' };
  }
  const dev = await developerAccount(req);
  if (!dev) return { status: 403, message: 'Developer access required.' };
  if (!(await bcrypt.compare(String(password || ''), dev.password || ''))) return { status: 401, message: 'Your password is not correct.' };
  await saveConfig({ pinHash: await bcrypt.hash(pin, 10), pinSetAt: new Date(), pinSetBy: dev.username, failedAttempts: 0, lockedUntil: null });
  await audit(req, { userId: String(dev._id), username: dev.username }, 'Set the "view as" PIN');
  return { status: 200, message: 'PIN saved.' };
}

/** The PIN, then the accounts that can be viewed (for PICK_MINUTES). */
async function unlock(req, { pin }) {
  const dev = await developerAccount(req);
  if (!dev) return { status: 403, message: 'Developer access required.' };
  const c = await config();
  if (!c.pinHash) return { status: 400, message: 'Set a PIN first.' };
  if (c.lockedUntil && new Date(c.lockedUntil) > new Date()) {
    return { status: 429, message: `Too many wrong PINs. Try again after ${new Date(c.lockedUntil).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}.` };
  }
  if (!(await bcrypt.compare(String(pin || ''), c.pinHash))) {
    const failed = (c.failedAttempts || 0) + 1;
    const lock = failed >= MAX_PIN_ATTEMPTS;
    await saveConfig(lock ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60000) } : { failedAttempts: failed });
    await audit(req, { userId: String(dev._id), username: dev.username }, `Wrong "view as" PIN${lock ? `; locked for ${PIN_LOCK_MINUTES} minutes` : ''}`);
    return { status: 401, message: lock ? `Wrong PIN. Locked for ${PIN_LOCK_MINUTES} minutes.` : `Wrong PIN. ${MAX_PIN_ATTEMPTS - failed} tries left.` };
  }
  await saveConfig({ failedAttempts: 0, lockedUntil: null });
  req.session.viewAsUnlockedUntil = Date.now() + PICK_MINUTES * 60000;
  return { status: 200, accounts: await viewableAccounts() };
}

async function viewableAccounts() {
  const users = await getDb().collection('users').find({}, { projection: { password: 0 } }).toArray();
  return users
    .filter((u) => VIEWABLE_ROLES.includes(roleOf(u)))
    .map((u) => ({ userId: String(u._id), name: u.name, username: u.username, role: roleOf(u), roleLabel: ROLE_LABELS[roleOf(u)], division: u.division || null, designation: u.designation || null, ermsUnit: u.ermsUnit || null }))
    .sort((a, b) => a.role.localeCompare(b.role) || String(a.name).localeCompare(String(b.name)));
}

async function start(req, { userId }) {
  if (viewing(req)) return { status: 409, message: 'Already viewing as another account. Exit first.' };
  const dev = await developerAccount(req);
  if (!dev) return { status: 403, message: 'Developer access required.' };
  if (!(req.session.viewAsUnlockedUntil > Date.now())) return { status: 401, message: 'Enter the PIN again.' };
  if (!ObjectId.isValid(String(userId || ''))) return { status: 400, message: 'Choose an account.' };
  const target = await getDb().collection('users').findOne({ _id: new ObjectId(String(userId)) });
  if (!target || !VIEWABLE_ROLES.includes(roleOf(target))) return { status: 400, message: 'Only Planning and ERMS accounts can be viewed.' };

  const { buildSessionPayload } = require('../controllers/authController');
  const now = Date.now();
  const by = { userId: String(dev._id), username: dev.username, name: dev.name };
  req.session.viewAs = {
    by,
    target: { userId: String(target._id), username: target.username, name: target.name, roleLabel: ROLE_LABELS[roleOf(target)] },
    devSession: req.session.user,
    devActiveYear: req.session.activeYear ?? null,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_MINUTES * 60000).toISOString(),
  };
  delete req.session.viewAsUnlockedUntil;
  // The officer's own year is chosen the way they would choose it.
  delete req.session.activeYear;
  req.session.user = buildSessionPayload(target);
  await audit(req, by, `Started viewing as ${target.name} (${ROLE_LABELS[roleOf(target)]}), view only`, req.session.viewAs.target);
  return { status: 200, viewAs: describe(req) };
}

async function stop(req) {
  const va = await end(req, 'exited');
  return va ? { status: 200, message: 'Back to your own account.' } : { status: 200, message: 'Not viewing as anyone.' };
}

module.exports = { guard, actorOf, describe, status, setPin, unlock, start, stop, viewableAccounts, READ_ONLY_WRITES, SESSION_MINUTES };
