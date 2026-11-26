const { connectToMongo, getDb } = require('../config/db');
const secrets = require('./secrets');

// ---------------------------------------------------------------------------
// Storage containers.
//
// The records share used to be the only share, so its connection details were
// one document and one set of NAS_* variables. The NAS now serves three units
// — Records, Legal Services, Laboratory — each with its own share and its own
// service account, and there will be more. A container is one of those: a
// share root, the account that opens it, and a name people recognise.
//
// The `records` container is special only in that it existed first: ERMS
// documents resolve against it, the NAS_* environment variables describe it
// when nothing is stored, and the older single-share routes and screens edit
// it. Everything else about it is the same as any other container.
//
// One Windows constraint shapes the validation here. The server reads shares
// through Windows, and Windows holds ONE credential per server name — a second
// account for the same host fails with "multiple connections to a server or
// shared resource by the same user, using more than one user name, are not
// allowed" (error 1219). Three units on 10.14.76.167 with three accounts
// therefore need three server *names*: an alias per container in the hosts
// file (legal-nas -> 10.14.76.167), or one account granted read access to
// every share. save() reports the collision instead of letting the second
// container silently authenticate as the first.
//
// The password is never returned. describe() exists precisely so that callers
// have something safe to render.
// ---------------------------------------------------------------------------

const COLLECTION = 'nas-containers';
const RECORDS_KEY = 'records';
const HISTORY_LIMIT = 50;

// Where the single-share configuration lived before containers existed.
const LEGACY_COLLECTION = 'app-config';
const LEGACY_DOC_ID = 'nas-credentials';

const collection = async () => {
  await connectToMongo();
  return getDb().collection(COLLECTION);
};

const clean = (v) => (v == null ? '' : String(v).trim());

/** Normalise a UNC root to exactly two leading backslashes, no trailing one. */
const normalizeRoot = (value) => clean(value).replace(/^\\{1,}/, '\\\\').replace(/[\\/]+$/, '');

const UNC = /^\\\\[^\\]+\\[^\\]+/;
const hostOf = (root) => (String(root || '').split('\\')[2] || '').toLowerCase();
const shareOf = (root) => String(root || '').split('\\')[3] || '';

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

/** A key from a label: "Legal Services Unit" -> "legal-services-unit". */
const slugify = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31);

/** The container the NAS_* environment variables describe, if any. */
function fromEnvironment() {
  const root = normalizeRoot(process.env.NAS_ROOT || process.env.NAS_SHARE);
  if (!UNC.test(root)) return null;
  return {
    key: RECORDS_KEY,
    label: 'Records',
    unit: 'Records Unit',
    root,
    baseDir: clean(process.env.NAS_BASE_DIR).replace(/^[\\/]+|[\\/]+$/g, ''),
    username: clean(process.env.NAS_USERNAME) || null,
    domain: clean(process.env.NAS_DOMAIN),
    password: process.env.NAS_PASSWORD || null,
    passwordReadable: true,
    enabled: true,
    incoming: false,
    note: null,
    source: 'environment',
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
    lastTestAt: null,
    lastTestOk: null,
    lastTestDetail: null,
    history: [],
  };
}

/**
 * Bring the pre-container document across, once.
 *
 * The old document becomes the `records` container with every field intact —
 * the encrypted password included, since the same CONFIG_ENCRYPTION_KEY reads
 * it — and the old document is removed so there is one place to look. Runs on
 * every refresh and does nothing after the first time.
 */
async function ensureMigrated() {
  const col = await collection();
  if (await col.findOne({ _id: RECORDS_KEY })) return;

  await connectToMongo();
  const legacyCol = getDb().collection(LEGACY_COLLECTION);
  const legacy = await legacyCol.findOne({ _id: LEGACY_DOC_ID });
  if (!legacy?.root) return;

  const { _id, ...rest } = legacy;
  await col.insertOne({
    _id: RECORDS_KEY,
    key: RECORDS_KEY,
    label: 'Records',
    unit: 'Records Unit',
    enabled: true,
    createdAt: legacy.updatedAt || new Date(),
    createdBy: legacy.updatedBy || 'migration',
    ...rest,
  });
  await legacyCol.deleteOne({ _id: LEGACY_DOC_ID });
  console.log('[NAS] Moved the stored share configuration into the "records" container.');
}

/** The stored document, or null. */
async function readStored(key) {
  const col = await collection();
  return col.findOne({ _id: clean(key) });
}

function fromStored(doc) {
  const password = doc.password ? secrets.decrypt(doc.password) : null;
  return {
    key: doc._id,
    label: clean(doc.label) || doc._id,
    unit: clean(doc.unit) || null,
    root: normalizeRoot(doc.root),
    baseDir: clean(doc.baseDir),
    username: clean(doc.username) || null,
    domain: clean(doc.domain),
    password,
    // A stored record whose password will not decrypt is a real problem —
    // usually a changed or missing CONFIG_ENCRYPTION_KEY — and the caller
    // needs to be able to say so rather than silently using nothing.
    passwordReadable: !doc.password || password !== null,
    enabled: doc.enabled !== false,
    // An incoming container is registered ahead of its credentials — the
    // unit exists, the share does not answer yet. Listed, never opened.
    incoming: doc.incoming === true,
    note: clean(doc.note) || null,
    source: 'database',
    createdAt: doc.createdAt || null,
    createdBy: doc.createdBy || null,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
    lastTestAt: doc.lastTestAt || null,
    lastTestOk: doc.lastTestOk ?? null,
    lastTestDetail: doc.lastTestDetail || null,
    history: Array.isArray(doc.history) ? doc.history : [],
  };
}

/**
 * One container with its plaintext password, for the SMB layer and the
 * connection test — nothing that reaches a response body. The `records`
 * container falls back to the environment when nothing is stored.
 */
async function resolve(key = RECORDS_KEY) {
  const stored = await readStored(key);
  if (stored?.root) return fromStored(stored);
  if (clean(key) === RECORDS_KEY) return fromEnvironment();
  return null;
}

/** Every container, plaintext included. For refreshConfig() only. */
async function resolveAll() {
  const col = await collection();
  const docs = await col.find({}).sort({ createdAt: 1 }).toArray();
  const out = docs.filter((d) => d.root).map(fromStored);
  if (!out.some((c) => c.key === RECORDS_KEY)) {
    const env = fromEnvironment();
    if (env) out.unshift(env);
  }
  return out;
}

/** What a screen may see. Never the password, in any form. */
function describeOne(c) {
  if (!c) return null;
  return {
    key: c.key,
    label: c.label,
    unit: c.unit,
    isRecords: c.key === RECORDS_KEY,
    configured: UNC.test(c.root),
    source: c.source,
    host: hostOf(c.root) || null,
    share: shareOf(c.root) || null,
    baseDir: c.baseDir || null,
    username: c.username,
    domain: c.domain || null,
    // Whether one is set, never what it is.
    passwordSet: Boolean(c.password),
    passwordReadable: c.passwordReadable,
    enabled: c.enabled && !c.incoming,
    incoming: c.incoming === true,
    note: c.note || null,
    createdAt: c.createdAt,
    createdBy: c.createdBy,
    updatedAt: c.updatedAt,
    updatedBy: c.updatedBy,
    lastTestAt: c.lastTestAt,
    lastTestOk: c.lastTestOk,
    lastTestDetail: c.lastTestDetail,
  };
}

async function describe(key = RECORDS_KEY) {
  const c = await resolve(key);
  if (!c) {
    // The records container always answers, even unconfigured: the settings
    // screen renders "not configured" from this rather than from a 404.
    if (clean(key) === RECORDS_KEY) {
      return { key, isRecords: true, configured: false, source: 'environment', secretsAvailable: secrets.isConfigured() };
    }
    return null;
  }
  const shown = describeOne(c);
  shown.secretsAvailable = secrets.isConfigured();
  return shown;
}

async function list() {
  const all = await resolveAll();
  return {
    secretsAvailable: secrets.isConfigured(),
    containers: all.map(describeOne),
  };
}

/**
 * Other enabled containers that would need a different credential for the
 * same server name. Windows cannot hold both; see the note at the top.
 */
async function credentialConflicts({ key, root, username, domain }) {
  const host = hostOf(root);
  if (!host) return [];
  const account = `${clean(domain)}\\${clean(username)}`.toLowerCase();
  const all = await resolveAll();
  return all
    .filter((c) => c.key !== key && c.enabled && hostOf(c.root) === host)
    .filter((c) => `${clean(c.domain)}\\${clean(c.username)}`.toLowerCase() !== account)
    .map((c) => ({ key: c.key, label: c.label, username: c.username }));
}

/**
 * Create or update a container.
 *
 * An omitted password keeps the stored one, so host or share can be corrected
 * without retyping the secret — and so a screen that never receives the
 * password cannot blank it by saving the form back.
 */
async function save(keyOrNull, input, actor) {
  if (!secrets.isConfigured()) {
    return {
      ok: false,
      status: 503,
      code: 'SECRETS_UNAVAILABLE',
      message:
        'CONFIG_ENCRYPTION_KEY is not set on the server, so a share password ' +
        'cannot be stored securely. Set it and restart.',
    };
  }

  const creating = !keyOrNull;
  const key = creating ? clean(input.key) || slugify(input.label) : clean(keyOrNull);
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_KEY',
      message: 'The container key must be 2–31 characters: lowercase letters, digits and hyphens.',
    };
  }

  const root = normalizeRoot(input.root || input.host);
  if (!UNC.test(root)) {
    return { ok: false, status: 400, code: 'BAD_ROOT', message: 'The share path must look like \\\\host\\share.' };
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

  const existing = await readStored(key);
  if (creating && existing) {
    return { ok: false, status: 409, code: 'KEY_TAKEN', message: `A container named "${key}" already exists.` };
  }
  if (!creating && !existing && key !== RECORDS_KEY) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such container.' };
  }

  const password = clean(input.password);
  const now = new Date();
  const by = actor?.username || 'unknown';

  const doc = {
    key,
    label: clean(input.label) || (existing?.label ?? (key === RECORDS_KEY ? 'Records' : key)),
    unit: clean(input.unit) || existing?.unit || null,
    root,
    baseDir,
    username: clean(input.username) || null,
    domain: clean(input.domain),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled !== false,
    incoming: input.incoming === undefined ? existing?.incoming === true : input.incoming === true,
    note: clean(input.note) || (input.note === undefined ? existing?.note || null : null),
    updatedAt: now,
    updatedBy: by,
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
  if (creating) changed.push('created');
  if (normalizeRoot(before.root || '') !== root) changed.push('share path');
  if (clean(before.baseDir) !== baseDir) changed.push('base directory');
  if (clean(before.username) !== (doc.username || '')) changed.push('username');
  if (clean(before.domain) !== doc.domain) changed.push('domain');
  if (clean(before.label) && clean(before.label) !== doc.label) changed.push('label');
  if ((before.enabled !== false) !== doc.enabled) changed.push(doc.enabled ? 'enabled' : 'disabled');
  if (password) changed.push('password');
  if ((before.incoming === true) !== doc.incoming) changed.push(doc.incoming ? 'marked incoming' : 'no longer incoming');

  const entry = { at: now, by, changed, testOk: null };

  const col = await collection();
  await col.updateOne(
    { _id: key },
    {
      $set: doc,
      $setOnInsert: { createdAt: now, createdBy: by },
      // Newest first, capped — this is a rotation log, not an archive.
      $push: { history: { $each: [entry], $position: 0, $slice: HISTORY_LIMIT } },
    },
    { upsert: true }
  );

  const conflicts = doc.enabled && !doc.incoming ? await credentialConflicts({ key, ...doc }) : [];
  return {
    ok: true,
    key,
    changed,
    // Saved regardless: the developer may be about to add the hosts alias. But
    // said out loud, because nothing else will — the second account simply
    // fails to authenticate, or worse, Windows reuses the first.
    conflicts,
    conflictMessage: conflicts.length
      ? `Windows keeps one credential per server name, and ${conflicts
          .map((c) => `"${c.label}"`)
          .join(', ')} already uses a different account on ${hostOf(root)}. ` +
        `Give this container its own name for the same address — add ` +
        `"${key}-nas" to C:\\Windows\\System32\\drivers\\etc\\hosts pointing at ${hostOf(root)} and use ` +
        `\\\\${key}-nas\\${shareOf(root)} here — or have the NAS grant one account access to both shares.`
      : null,
  };
}

/** Turn a container on or off without touching its details. */
async function setEnabled(key, enabled, actor) {
  const existing = await readStored(key);
  if (!existing) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such container.' };
  const now = new Date();
  const by = actor?.username || 'unknown';
  const col = await collection();
  await col.updateOne(
    { _id: clean(key) },
    {
      $set: { enabled: enabled !== false, updatedAt: now, updatedBy: by },
      $push: {
        history: { $each: [{ at: now, by, changed: [enabled !== false ? 'enabled' : 'disabled'], testOk: null }], $position: 0, $slice: HISTORY_LIMIT },
      },
    }
  );
  return { ok: true };
}

/**
 * Remove a container. The records container cannot be removed — ERMS
 * documents resolve against it — only reset to the environment.
 */
async function remove(key) {
  if (clean(key) === RECORDS_KEY) {
    return { ok: false, status: 400, code: 'RECORDS_CONTAINER', message: 'The records container cannot be removed. Reset it instead.' };
  }
  const col = await collection();
  const result = await col.deleteOne({ _id: clean(key) });
  if (!result.deletedCount) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such container.' };
  return { ok: true };
}

/** Drop the stored records container and fall back to the environment. */
async function reset(key = RECORDS_KEY) {
  const col = await collection();
  await col.deleteOne({ _id: clean(key) });
  return { ok: true };
}

/**
 * The rotation log, safe to render.
 *
 * Field names only — never a value, and never the host, since this is read on
 * a screen and copied into tickets.
 */
async function history(key = RECORDS_KEY) {
  const stored = await readStored(key);
  return (stored?.history || []).map((h) => ({
    at: h.at,
    by: h.by,
    changed: Array.isArray(h.changed) ? h.changed : [],
    testOk: h.testOk ?? null,
    testDetail: h.testDetail || null,
  }));
}

/** Record the outcome of a connection test, for the diagnostics view. */
async function recordTest(key, { ok, detail }) {
  const col = await collection();
  const stored = await readStored(key);
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
  await col.updateOne({ _id: clean(key) }, { $set: update });
}

/**
 * Make a stored credential the one Windows actually uses for that host.
 *
 * Nothing in this codebase authenticates to a share: nasStorage.js reads UNC
 * paths with `fs`, and *Windows* supplies the credential from its own store.
 * Saving a password here changes nothing until the machine's stored credential
 * is updated too.
 *
 * This used to shell out to cmdkey. It cannot be made safe: cmdkey parses its
 * raw command line itself, so a user name with a space arrived as
 * "/user:DOMAIN\First Last" and was rejected with "The command line parameters
 * are incorrect" — while exiting 0, so the screen said the credential was
 * applied when nothing had been stored. A password containing a quote has no
 * representation at all. The credential is therefore written through the
 * Credential Manager API (CredWrite) by services/credWrite.ps1, with the
 * target, account and password handed over in the child's environment: no
 * command line carries any of them, and nothing is parsed.
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
  const path = require('path');
  const script = path.join(__dirname, 'credWrite.ps1');
  const result = await new Promise((done) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      {
        windowsHide: true,
        env: { ...process.env, EU_CRED_TARGET: host, EU_CRED_USER: account, EU_CRED_PASSWORD: password },
      }
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', (err) => done({ code: -1, out: err.message }));
    child.on('close', (code) => done({ code, out }));
  });

  if (result.code !== 0 || !/^OK/m.test(result.out)) {
    // The output never includes the password; it may name the target, which
    // the caller already knows. Logged for the operator, summarised for the UI.
    console.error('NAS credential write failed:', result.out.trim().slice(0, 300));
    return {
      ok: false,
      code: 'CREDENTIAL_WRITE_FAILED',
      message: 'Windows refused the credential. Check the server log for the reason.',
    };
  }
  return { ok: true };
}

/**
 * Put every stored share password back into Windows, at startup.
 *
 * The passwords live here, encrypted; Windows only holds a copy, written when
 * someone presses Save (applyToWindows above). That copy belongs to one
 * machine and one Windows account, and nothing ever wrote it again — so a new
 * server, a different service account, or a cleared Credential Manager left
 * every share failing until each password was typed in again, although the
 * application had them all along. Re-applying at startup makes the stored
 * configuration the source of truth: whatever runs E-Universe gets the
 * credentials it needs, with no one retyping anything.
 *
 * Same rules as Save: enabled containers only, never an incoming one, and one
 * account per server name — Windows holds a single credential per host, so a
 * second container on the same name with a different account is reported,
 * not written over the first. Passwords are never logged; results name the
 * container key and a code.
 *
 * `list` and `apply` are injectable for the tests.
 */
async function syncToWindows({ list = resolveAll, apply = applyToWindows, platform = process.platform } = {}) {
  if (platform !== 'win32') return { skipped: 'NOT_WINDOWS', results: [] };
  if (clean(process.env.NAS_ENABLED || 'true').toLowerCase() === 'false') return { skipped: 'NAS_DISABLED', results: [] };
  if (clean(process.env.NAS_CREDENTIAL_SYNC || 'true').toLowerCase() === 'false') return { skipped: 'SYNC_DISABLED', results: [] };

  const results = [];
  const accountByHost = new Map();
  for (const c of await list()) {
    const skip = (code) => results.push({ key: c.key, ok: false, skipped: true, code });
    if (!c.enabled || c.incoming) continue; // not in use: nothing to restore, nothing to report
    if (!UNC.test(c.root || '')) {
      skip('BAD_ROOT');
      continue;
    }
    if (!c.passwordReadable) {
      // Usually a changed CONFIG_ENCRYPTION_KEY. Re-saving the password fixes it.
      skip('PASSWORD_UNREADABLE');
      continue;
    }
    if (!c.password) {
      skip('NO_PASSWORD');
      continue;
    }
    if (!c.username) {
      skip('NO_USERNAME');
      continue;
    }
    const host = hostOf(c.root);
    const account = `${clean(c.domain).toLowerCase()}\\${clean(c.username).toLowerCase()}`;
    const claimed = accountByHost.get(host);
    if (claimed && claimed.account !== account) {
      results.push({ key: c.key, ok: false, skipped: true, code: 'HOST_CONFLICT', with: claimed.key });
      continue;
    }
    accountByHost.set(host, { key: c.key, account });
    if (claimed) continue; // same host, same account: already written

    const outcome = await apply(c);
    results.push({ key: c.key, ok: Boolean(outcome?.ok), code: outcome?.ok ? 'APPLIED' : outcome?.code || 'UNKNOWN' });
  }
  return { skipped: null, results };
}

module.exports = {
  COLLECTION,
  RECORDS_KEY,
  KEY_PATTERN,
  ensureMigrated,
  resolve,
  resolveAll,
  describe,
  list,
  save,
  setEnabled,
  remove,
  reset,
  history,
  recordTest,
  applyToWindows,
  syncToWindows,
  credentialConflicts,
  slugify,
};
