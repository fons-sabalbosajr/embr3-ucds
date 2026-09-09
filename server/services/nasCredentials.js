const { connectToMongo, getDb } = require('../config/db');
const secrets = require('./secrets');

// ---------------------------------------------------------------------------
// Where the NAS connection details live.
//
// The share password is rotated periodically, and editing .env and redeploying
// for that is not a workflow anyone will follow reliably. So the connection
// details can be set from Admin Settings and are stored here, with the
// password encrypted at rest.
//
// The environment remains the fallback, deliberately:
//
//   - a deployment that has never opened the settings screen keeps working
//   - if CONFIG_ENCRYPTION_KEY is missing, stored credentials cannot be read
//     and the environment is what is left
//
// So this is "database first, environment second", not a migration that
// strips the old path away.
//
// The password is never returned. describe() exists precisely so that callers
// have something safe to render, and there is no function that hands the
// plaintext to anything but the SMB layer.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'nas-credentials';

const collection = async () => {
  await connectToMongo();
  return getDb().collection(COLLECTION);
};

const clean = (v) => (v == null ? '' : String(v).trim());

/** Normalise a UNC root to exactly two leading backslashes, no trailing one. */
const normalizeRoot = (value) =>
  clean(value).replace(/^\\{1,}/, '\\\\').replace(/[\\/]+$/, '');

/** The stored record, or null when nothing has been saved. */
async function readStored() {
  const col = await collection();
  return col.findOne({ _id: DOC_ID });
}

/**
 * The effective connection details, from the database if present, otherwise
 * from the environment. Includes the plaintext password, so this is for the
 * SMB layer and the connection test — nothing that reaches a response body.
 */
async function resolve() {
  const stored = await readStored();

  if (stored?.root) {
    const password = stored.password ? secrets.decrypt(stored.password) : null;
    return {
      source: 'database',
      root: normalizeRoot(stored.root),
      baseDir: clean(stored.baseDir),
      username: clean(stored.username) || null,
      domain: clean(stored.domain),
      password,
      // A stored record whose password will not decrypt is a real problem —
      // usually a changed or missing CONFIG_ENCRYPTION_KEY — and the caller
      // needs to be able to say so rather than silently using nothing.
      passwordReadable: !stored.password || password !== null,
      updatedAt: stored.updatedAt || null,
      updatedBy: stored.updatedBy || null,
      lastTestAt: stored.lastTestAt || null,
      lastTestOk: stored.lastTestOk ?? null,
      lastTestDetail: stored.lastTestDetail || null,
    };
  }

  const root = normalizeRoot(process.env.NAS_ROOT || process.env.NAS_SHARE);
  return {
    source: 'environment',
    root,
    baseDir: clean(process.env.NAS_BASE_DIR),
    username: clean(process.env.NAS_USERNAME) || null,
    domain: clean(process.env.NAS_DOMAIN),
    password: process.env.NAS_PASSWORD || null,
    passwordReadable: true,
    updatedAt: null,
    updatedBy: null,
    lastTestAt: null,
    lastTestOk: null,
    lastTestDetail: null,
  };
}

/** What a screen may see. Never the password, in any form. */
async function describe() {
  const c = await resolve();
  if (!c.root || !/^\\\\[^\\]+\\[^\\]+/.test(c.root)) {
    return { configured: false, source: c.source, secretsAvailable: secrets.isConfigured() };
  }
  const [, , host, share] = c.root.split('\\');
  return {
    configured: true,
    source: c.source,
    host,
    share,
    baseDir: c.baseDir || null,
    username: c.username,
    domain: c.domain || null,
    // Whether one is set, never what it is.
    passwordSet: Boolean(c.password),
    passwordReadable: c.passwordReadable,
    secretsAvailable: secrets.isConfigured(),
    updatedAt: c.updatedAt,
    updatedBy: c.updatedBy,
    lastTestAt: c.lastTestAt,
    lastTestOk: c.lastTestOk,
    lastTestDetail: c.lastTestDetail,
  };
}

/**
 * Save new connection details.
 *
 * An omitted password keeps the stored one, so host or share can be corrected
 * without retyping the secret — and so a screen that never receives the
 * password cannot blank it by saving the form back.
 */
async function save(input, actor) {
  if (!secrets.isConfigured()) {
    return {
      ok: false,
      status: 503,
      code: 'SECRETS_UNAVAILABLE',
      message:
        'CONFIG_ENCRYPTION_KEY is not set on the server, so the share password ' +
        'cannot be stored securely. Set it and restart, or keep using the NAS_* ' +
        'environment variables.',
    };
  }

  const root = normalizeRoot(input.root || input.host);
  if (!/^\\\\[^\\]+\\[^\\]+/.test(root)) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_ROOT',
      message: 'The share path must look like \\\\host\\share.',
    };
  }

  const baseDir = clean(input.baseDir).replace(/^[\\/]+|[\\/]+$/g, '');
  if (/^[A-Za-z]:/.test(baseDir) || /^\\{2}/.test(baseDir)) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_BASE_DIR',
      message:
        'The base directory is a folder inside the share, not a drive letter ' +
        'or UNC path. Leave it empty unless documents live in a subfolder.',
    };
  }

  const existing = await readStored();
  const password = clean(input.password);

  const doc = {
    root,
    baseDir,
    username: clean(input.username) || null,
    domain: clean(input.domain),
    updatedAt: new Date(),
    updatedBy: actor?.username || 'unknown',
  };

  if (password) doc.password = secrets.encrypt(password);
  else if (existing?.password) doc.password = existing.password;
  else doc.password = null;

  // What changed, by name only. A rotation record has to answer "when was the
  // password last changed and by whom" months later, and it must be safe to
  // read on screen — so it records that the password changed, never any part
  // of the value, not even its length.
  const changed = [];
  const before = existing || {};
  if (normalizeRoot(before.root || '') !== root) changed.push('share path');
  if (clean(before.baseDir) !== baseDir) changed.push('base directory');
  if (clean(before.username) !== (doc.username || '')) changed.push('username');
  if (clean(before.domain) !== doc.domain) changed.push('domain');
  if (password) changed.push('password');

  const entry = {
    at: doc.updatedAt,
    by: doc.updatedBy,
    changed,
    // Recorded separately by recordTest() once the connection has been tried.
    testOk: null,
  };

  const col = await collection();
  await col.updateOne(
    { _id: DOC_ID },
    {
      $set: doc,
      // Newest first, capped — this is a rotation log, not an archive, and an
      // unbounded array inside one document grows without anyone noticing.
      $push: { history: { $each: [entry], $position: 0, $slice: HISTORY_LIMIT } },
    },
    { upsert: true }
  );
  return { ok: true, changed };
}

const HISTORY_LIMIT = 50;

/**
 * The rotation log, safe to render.
 *
 * Field names only — never a value, and never the host, since this is read on
 * a screen and copied into tickets.
 */
async function history() {
  const stored = await readStored();
  return (stored?.history || []).map((h) => ({
    at: h.at,
    by: h.by,
    changed: Array.isArray(h.changed) ? h.changed : [],
    testOk: h.testOk ?? null,
    testDetail: h.testDetail || null,
  }));
}

/**
 * Make the stored credential the one Windows actually uses.
 *
 * This matters more than it looks. Nothing in this codebase authenticates to
 * the share: services/nasStorage.js reads UNC paths with `fs`, and *Windows*
 * supplies the credential from its own store. So saving a new password here
 * would change nothing at all unless the machine's stored credential is
 * updated too — the feature would look finished and authenticate with the old
 * password until someone ran cmdkey by hand.
 *
 * Arguments are passed as an array rather than a shell string, so nothing is
 * interpreted by a shell and a password containing quotes or ampersands is
 * safe. The residual exposure is that the arguments are briefly visible in the
 * process list to anyone already able to read it on this machine; there is no
 * stdin form of cmdkey to avoid that.
 *
 * Non-Windows hosts get a clear refusal rather than a silent no-op: there the
 * share is mounted by the operating system and the credential is not ours to
 * set.
 */
async function applyToWindows({ root, username, domain, password }) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      code: 'NOT_WINDOWS',
      message:
        'This server is not Windows, so the share credential is managed by the ' +
        'system mount rather than by the application.',
    };
  }
  if (!password) return { ok: false, code: 'NO_PASSWORD', message: 'No password to apply.' };

  const host = String(root).split('\\')[2];
  if (!host) return { ok: false, code: 'BAD_ROOT', message: 'Could not read the host from the share path.' };

  const account = domain ? `${domain}\\${username}` : username;
  if (!account) return { ok: false, code: 'NO_USERNAME', message: 'No username to apply.' };

  const { spawn } = require('child_process');
  const run = (args) =>
    new Promise((resolve) => {
      const child = spawn('cmdkey', args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
      child.on('close', (code) => resolve({ code, stderr }));
    });

  // Replace rather than add: cmdkey keeps the first entry for a target, so
  // adding over an existing one leaves the old password in force.
  await run([`/delete:${host}`]);
  const added = await run([`/add:${host}`, `/user:${account}`, `/pass:${password}`]);

  if (added.code !== 0) {
    return {
      ok: false,
      code: 'CMDKEY_FAILED',
      // The stderr can echo the account; the exit code is enough to act on.
      message: `Windows refused the credential (cmdkey exit ${added.code}).`,
    };
  }
  return { ok: true };
}

/** Record the outcome of a connection test, for the diagnostics view. */
async function recordTest({ ok, detail }) {
  const col = await collection();
  const stored = await readStored();
  if (!stored) return; // environment-sourced config has nowhere to record it

  const update = {
    lastTestAt: new Date(),
    lastTestOk: ok === true,
    lastTestDetail: detail || null,
  };
  // Attach the outcome to the change it followed, so the log reads "password
  // rotated, connection passed" rather than leaving the two unconnected.
  if (Array.isArray(stored.history) && stored.history.length) {
    update['history.0.testOk'] = ok === true;
    update['history.0.testDetail'] = detail || null;
  }
  await col.updateOne({ _id: DOC_ID }, { $set: update });
}

/** Drop the stored record and fall back to the environment. */
async function reset() {
  const col = await collection();
  await col.deleteOne({ _id: DOC_ID });
  return { ok: true };
}

module.exports = {
  resolve,
  describe,
  save,
  applyToWindows,
  history,
  recordTest,
  reset,
  COLLECTION,
  DOC_ID,
};
