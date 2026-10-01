const { connectToMongo, collections, ObjectId } = require('../config/db');
const nas = require('./nasStorage');
const { nasContainersOf, roleOf, ROLE_LABELS } = require('./authorization');
const { principalOf } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Which storage containers a signed-in user may open.
//
// Read from the user's document on every request, not from the session: the
// Developer designates containers from the Access tab and expects that to take
// effect now, not after the person signs out and back in. Revocation for the
// same reason.
//
// A container is only offered if it exists, is enabled, and is on the
// account. The Developer sees every enabled container.
// ---------------------------------------------------------------------------

/** The stored account for the principal, or null. */
async function accountOf(user) {
  if (!user?.userId || !ObjectId.isValid(String(user.userId))) return null;
  await connectToMongo();
  return collections.users.findOne(
    { _id: new ObjectId(String(user.userId)) },
    { projection: { permission: 1, nasContainers: 1, ermsUnit: 1, username: 1, name: 1 } }
  );
}

/** Enabled containers, described by key and label only. */
function enabledContainers() {
  return nas
    .containerKeys()
    .map((key) => nas.describeConfig(key))
    .filter((c) => c.configured && c.enabled)
    .map((c) => ({ key: c.key, label: c.label || c.key }));
}

/**
 * The principal with the account's current type, unit and containers laid
 * over the session snapshot — for checks that must follow a change the
 * Developer made a moment ago rather than wait for the next sign-in.
 */
async function freshPrincipal(user) {
  const account = await accountOf(user);
  if (!account) return user;
  return {
    ...user,
    permission: account.permission ?? user?.permission,
    ermsUnit: account.ermsUnit ?? null,
    nasContainers: account.nasContainers ?? user?.nasContainers,
  };
}

/** Containers this user may open right now. */
async function grantedContainers(user) {
  const account = (await accountOf(user)) || user;
  const enabled = enabledContainers();
  const keys = nasContainersOf(account, enabled.map((c) => c.key));
  return enabled.filter((c) => keys.includes(c.key));
}

/**
 * Gate for the shared storage routes: the container named in the request must
 * be one the user has been given. 403 with a code the client can explain.
 */
async function requireContainerAccess(req, res, next) {
  try {
    const user = principalOf(req);
    if (!user) return res.status(401).json({ message: 'User not authenticated' });
    const key = String(req.query.container || req.params.key || '').trim().toLowerCase();
    if (!key) return res.status(400).json({ code: 'NO_CONTAINER', message: 'Name a container.' });

    const granted = await grantedContainers(user);
    if (!granted.some((c) => c.key === key)) {
      return res.status(403).json({
        code: 'CONTAINER_FORBIDDEN',
        message: 'That storage container has not been shared with your account.',
      });
    }
    req.container = granted.find((c) => c.key === key);
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Everyone with an account, with their type and the containers on it — for
 * the Developer's Access tab. Names only: no host, no share, no credential.
 */
async function accessTable() {
  await connectToMongo();
  const users = await collections.users
    .find({}, { projection: { username: 1, name: 1, division: 1, permission: 1, nasContainers: 1, status: 1 } })
    .sort({ name: 1 })
    .toArray();
  const enabled = enabledContainers();
  const all = enabled.map((c) => c.key);
  return {
    containers: enabled,
    users: users.map((u) => ({
      userId: String(u._id),
      username: u.username,
      name: u.name,
      division: u.division || null,
      role: roleOf(u),
      roleLabel: ROLE_LABELS[roleOf(u)],
      // What is stored on the account, and what that resolves to right now —
      // the two differ for a Developer (everything) and for a legacy Records
      // account (records by default).
      stored: Array.isArray(u.nasContainers) ? u.nasContainers : null,
      effective: nasContainersOf(u, all),
      implicit: roleOf(u) === 'developer',
    })),
  };
}

/** Designate containers on an account. Keys that do not exist are dropped. */
async function setGrants(userId, keys, actor) {
  if (!ObjectId.isValid(String(userId))) return { ok: false, status: 400, message: 'Invalid user id.' };
  const known = new Set(nas.containerKeys());
  const clean = [...new Set((Array.isArray(keys) ? keys : []).map((k) => String(k).trim().toLowerCase()))].filter(
    (k) => known.has(k)
  );
  await connectToMongo();
  const result = await collections.users.updateOne(
    { _id: new ObjectId(String(userId)) },
    {
      $set: {
        nasContainers: clean,
        nasContainersUpdatedAt: new Date(),
        nasContainersUpdatedBy: actor?.username || 'unknown',
      },
    }
  );
  if (!result.matchedCount) return { ok: false, status: 404, message: 'User not found.' };
  return { ok: true, nasContainers: clean };
}

module.exports = { grantedContainers, requireContainerAccess, accessTable, setGrants, enabledContainers, freshPrincipal };
