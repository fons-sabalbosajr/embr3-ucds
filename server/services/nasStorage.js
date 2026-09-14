const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// ---------------------------------------------------------------------------
// NAS (records share) storage access.
//
// The records share holds the scanned documents the desktop ERMS reached
// through a drive letter mapped on every workstation. The server reaches it
// over SMB from inside the network instead, so no workstation needs the
// mapping and no credential ever reaches a browser.
//
// Why native `fs` over a UNC path rather than an SMB client library:
//
//   The `smb2` package this used to depend on is unusable on Node 22. It
//   builds an NTLMv1 response, which needs DES, which OpenSSL 3 removed —
//   every call died with ERR_OSSL_EVP_UNSUPPORTED. The package was last
//   published in 2018 and speaks a dialect a current Synology rejects anyway.
//
//   The server is Windows on the same network, so the operating system is
//   already an SMB client and `fs` reads \\host\share\... directly. That gives
//   real streaming and range requests instead of buffering whole files, and
//   removes a dead dependency rather than replacing it with another one.
//
// See docs/UNIFICATION-PLAN.md, Phase 7.
// ---------------------------------------------------------------------------

/**
 * Windows refuses paths over 260 characters through the normal API — and it
 * fails them as "not found" rather than as an error, so they look like missing
 * files. 26.7% of the migrated records are over that limit; without this
 * prefix, one record in four is invisible for a reason that reads like data
 * loss. \\?\UNC\ lifts the limit.
 *
 * It also disables path normalisation, which is why every caller must go
 * through resolveSharePath() first: after this prefix is applied, ".." is a
 * literal directory name and no longer collapses.
 */
const LONG_PATH_PREFIX = '\\\\?\\UNC\\';

const toLongPath = (uncPath) => LONG_PATH_PREFIX + uncPath.replace(/^\\\\/, '');

/** Normalise a UNC root to exactly two leading backslashes, no trailing one. */
const normalizeRoot = (value) =>
  String(value || '')
    .trim()
    .replace(/^\\{1,}/, '\\\\')
    .replace(/[\\/]+$/, '');

/**
 * The configured share, or null when the deployment has not set one up.
 *
 * NAS_ROOT is preferred and explicit. NAS_SHARE is the name this deployment
 * already used, so it is accepted unchanged — the two mean the same thing and
 * requiring a rename would break a working configuration for no benefit.
 */
/**
 * Where the connection details come from, cached.
 *
 * nasConfig() is synchronous and called from resolveSharePath() on every
 * document read, so it cannot await a database lookup. The resolved details
 * are therefore held here and refreshed explicitly — refreshConfig() is called
 * at startup and again whenever the credentials are saved, so a change takes
 * effect on the next request rather than after a restart or a cache timeout.
 *
 * Until the first refresh completes, and whenever nothing is stored, the
 * environment is used. That is the previous behaviour, so a deployment that
 * never opens the settings screen is unaffected.
 */
// Keyed by container. `records` is the ERMS container and the one every
// caller that does not name a container gets — see nasContainers.js.
const RECORDS_KEY = 'records';
let cachedContainers = null;

function fromEnvironment() {
  return {
    key: RECORDS_KEY,
    label: 'Records',
    root: normalizeRoot(process.env.NAS_ROOT || process.env.NAS_SHARE),
    baseDir: String(process.env.NAS_BASE_DIR || '').trim().replace(/^[\\/]+|[\\/]+$/g, ''),
    username: process.env.NAS_USERNAME || null,
    domain: process.env.NAS_DOMAIN || '',
    enabled: true,
    source: 'environment',
  };
}

/** Re-read every stored container. Called at startup and after every save. */
async function refreshConfig() {
  try {
    const containers = require('./nasContainers');
    await containers.ensureMigrated();
    const all = await containers.resolveAll();
    cachedContainers = new Map(
      all.map((c) => [
        c.key,
        {
          key: c.key,
          label: c.label,
          root: c.root,
          baseDir: c.baseDir,
          username: c.username,
          domain: c.domain,
          // An incoming container has no credentials yet; it is listed, not read.
          enabled: c.enabled && !c.incoming,
          source: c.source,
        },
      ])
    );
  } catch (err) {
    console.error('NAS: could not read stored containers, using the environment:', err.message);
    cachedContainers = null;
  }
  return nasConfig();
}

const sourceFor = (key) => {
  const k = String(key || RECORDS_KEY);
  if (cachedContainers?.has(k)) return cachedContainers.get(k);
  return k === RECORDS_KEY ? fromEnvironment() : null;
};

/**
 * The resolved settings for one container, or null when it does not exist
 * or has no usable root. Without a key, the records container.
 */
function nasConfig(key = RECORDS_KEY) {
  const src = sourceFor(key);
  if (!src) return null;
  const root = normalizeRoot(src.root);
  if (!root || !/^\\\\[^\\]+\\[^\\]+/.test(root)) return null;

  // Optional subdirectory below the share root. Empty on this deployment,
  // because the migrated sharePath values already begin at "RECORDS\Database".
  const baseDir = String(src.baseDir || '').trim().replace(/^[\\/]+|[\\/]+$/g, '');

  return {
    key: src.key,
    label: src.label,
    root,
    baseDir,
    // The full path everything resolves against.
    base: baseDir ? `${root}\\${baseDir.replace(/\//g, '\\')}` : root,
    username: src.username || null,
    domain: src.domain || '',
    source: src.source || 'environment',
    // The deployment-level switch stays in the environment: it is how an
    // operator turns every container off without touching stored settings.
    // A container can also be switched off on its own.
    enabled:
      String(process.env.NAS_ENABLED ?? 'true').trim().toLowerCase() !== 'false' &&
      src.enabled !== false,
  };
}

const isConfigured = (key) => nasConfig(key) !== null;

/** The keys of every container this server knows, records first. */
function containerKeys() {
  const keys = cachedContainers ? [...cachedContainers.keys()] : [];
  if (!keys.includes(RECORDS_KEY) && nasConfig(RECORDS_KEY)) keys.unshift(RECORDS_KEY);
  return keys.sort((a, b) => (a === RECORDS_KEY ? -1 : b === RECORDS_KEY ? 1 : a.localeCompare(b)));
}

/**
 * What the Developer Settings screen may see. Never includes the password —
 * not masked, absent, so there is nothing to accidentally render.
 */
function describeConfig(key = RECORDS_KEY) {
  const cfg = nasConfig(key);
  if (!cfg) return { configured: false };

  const [, , host, share] = cfg.root.split('\\');
  return {
    key: cfg.key,
    label: cfg.label,
    configured: true,
    enabled: cfg.enabled,
    host,
    share,
    baseDir: cfg.baseDir || null,
    username: cfg.username,
    domain: cfg.domain || null,
  };
}

/**
 * Drive letters the legacy data may carry. The desktop app mapped Z:, but two
 * of the 18,067 migrated rows say N:, so a hard-coded Z: would silently lose
 * them. Configurable, defaulting to "any drive letter".
 */
function legacyPrefixes() {
  const raw = String(process.env.NAS_LEGACY_PREFIXES || '').trim();
  if (!raw) return null; // any drive letter
  return raw
    .split(',')
    .map((s) => s.trim().replace(/[\\/]+$/, '').toUpperCase())
    .filter(Boolean);
}

/**
 * Strip a legacy mapped-drive or UNC prefix, leaving a share-relative path.
 *
 * Accepts what the CSV actually holds:
 *   Z:\RECORDS\Database\...      -> RECORDS\Database\...
 *   \\host\share\RECORDS\...     -> RECORDS\...
 *   RECORDS\Database\...         -> unchanged (already relative)
 */
function stripLegacyPrefix(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const driveMatch = raw.match(/^([A-Za-z]:)[\\/]+/);
  if (driveMatch) {
    const allowed = legacyPrefixes();
    if (allowed && !allowed.includes(driveMatch[1].toUpperCase())) return null;
    return raw.slice(driveMatch[0].length);
  }

  // A UNC path: drop the \\host\share\ head and keep the remainder.
  const uncMatch = raw.match(/^\\{2}[^\\]+\\[^\\]+[\\/]+/);
  if (uncMatch) return raw.slice(uncMatch[0].length);

  // Anything else absolute is not something we can place inside the share.
  if (/^[\\/]/.test(raw)) return null;

  return raw;
}

/**
 * Reduce a stored path to a share-relative path that cannot escape the root.
 *
 * Returns null rather than throwing: every caller treats "cannot resolve" as
 * a 404/400, never as a server error, so a bad row in the legacy data does not
 * read as an outage.
 */
function safeRelativePath(input) {
  const stripped = stripLegacyPrefix(input);
  if (stripped === null) return null;
  if (stripped.includes('\0')) return null;

  const segments = stripped.split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  // Rejected before the \\?\ prefix is applied, which is the only point at
  // which these still collapse.
  if (segments.some((s) => s === '.' || s === '..')) return null;
  if (segments.some((s) => /^[A-Za-z]:$/.test(s))) return null;

  return segments.join('\\');
}

/**
 * A stored path resolved to an absolute UNC path inside the configured share,
 * or null. Containment is re-checked after resolution rather than trusted from
 * the sanitising above — two independent checks, because this is the boundary
 * that decides whether a caller can read arbitrary files.
 */
function resolveSharePath(input, container = RECORDS_KEY) {
  const cfg = nasConfig(container);
  if (!cfg) return null;

  const relative = safeRelativePath(input);
  if (!relative) return null;

  const full = path.win32.normalize(`${cfg.base}\\${relative}`);

  const base = cfg.base.toLowerCase().replace(/[\\/]+$/, '');
  const check = full.toLowerCase();
  if (check !== base && !check.startsWith(`${base}\\`)) return null;

  return full;
}

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const contentTypeFor = (filePath) =>
  CONTENT_TYPES[path.win32.extname(String(filePath || '')).toLowerCase()] ||
  'application/octet-stream';

/** Only these render inline; everything else downloads. */
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'text/plain; charset=utf-8',
]);

const canPreview = (filePath) => INLINE_TYPES.has(contentTypeFor(filePath));

/**
 * Metadata for a stored path, or a reason it is unavailable.
 * Never throws for a missing file — that is an expected outcome here, given
 * 1.3% of migrated rows point at directories that no longer exist.
 */
async function statFile(storedPath, container = RECORDS_KEY) {
  const cfg = nasConfig(container);
  if (!cfg) return { ok: false, reason: 'not-configured' };
  if (!cfg.enabled) return { ok: false, reason: 'disabled' };

  const resolved = resolveSharePath(storedPath, container);
  if (!resolved) return { ok: false, reason: 'invalid-path' };

  try {
    const stats = await fsp.stat(toLongPath(resolved));
    if (!stats.isFile()) return { ok: false, reason: 'not-a-file' };
    return {
      ok: true,
      resolved,
      size: stats.size,
      modifiedAt: stats.mtime,
      fileName: path.win32.basename(resolved),
      contentType: contentTypeFor(resolved),
      previewable: canPreview(resolved),
    };
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { ok: false, reason: 'missing' };
    if (err.code === 'EACCES' || err.code === 'EPERM') return { ok: false, reason: 'denied' };
    return { ok: false, reason: 'unreachable', detail: err.code || err.message };
  }
}

/**
 * One directory level under the share root, for the administrative explorer.
 *
 * Takes a share-relative path and returns its entries. It goes through the
 * same resolveSharePath() as document reads, so "../.." is rejected before the
 * long-path prefix is applied and containment is re-checked afterwards — there
 * is no second, weaker path implementation to get wrong.
 *
 * Never returns an absolute path. The caller navigates by the relative path it
 * was given, so the internal host and share name stay on the server.
 */
async function listDirectory(relativePath = '', container = RECORDS_KEY) {
  const cfg = nasConfig(container);
  if (!cfg) return { ok: false, reason: 'not-configured' };
  if (!cfg.enabled) return { ok: false, reason: 'disabled' };

  const clean = String(relativePath || '').replace(/^[\\/]+/, '');
  let target;
  if (!clean) {
    target = cfg.base;
  } else {
    target = resolveSharePath(clean, container);
    if (!target) return { ok: false, reason: 'invalid-path' };
  }

  let dirents;
  try {
    dirents = await fsp.readdir(toLongPath(target), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { ok: false, reason: 'missing' };
    if (err.code === 'EACCES' || err.code === 'EPERM') return { ok: false, reason: 'denied' };
    return { ok: false, reason: 'unreachable', detail: err.code };
  }

  const entries = [];
  for (const d of dirents) {
    const isDir = d.isDirectory();
    const childRelative = clean ? `${clean.replace(/[\\/]+$/, '')}\\${d.name}` : d.name;
    const entry = {
      name: d.name,
      type: isDir ? 'directory' : 'file',
      path: childRelative,
    };
    if (!isDir) {
      entry.contentType = contentTypeFor(d.name);
      entry.previewable = canPreview(d.name);
      try {
        const s = await fsp.stat(toLongPath(path.win32.join(target, d.name)));
        entry.size = s.size;
        entry.modifiedAt = s.mtime;
      } catch {
        // A file that disappears between readdir and stat is listed without
        // its size rather than failing the whole listing.
        entry.size = null;
      }
    }
    entries.push(entry);
  }

  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1
  );

  const parent = clean ? clean.split(/[\\/]/).slice(0, -1).join('\\') : null;
  return { ok: true, container: cfg.key, path: clean, parent, entries };
}

/** A read stream for an already-resolved path. Callers must stat() first. */
const openStream = (resolved, options = {}) =>
  fs.createReadStream(toLongPath(resolved), options);

/**
 * Connectivity check for Developer Settings. Lists the share root, which is
 * the cheapest operation that proves credentials and reachability together.
 */
async function testConnection(container = RECORDS_KEY) {
  const cfg = nasConfig(container);
  if (!cfg) {
    return {
      ok: false,
      reason: 'not-configured',
      required: ['NAS_ROOT (or NAS_SHARE)'],
      message: 'NAS storage is not configured on the server.',
    };
  }

  const started = Date.now();
  try {
    const entries = await fsp.readdir(toLongPath(cfg.base));
    return {
      ok: true,
      ms: Date.now() - started,
      base: cfg.base,
      entryCount: entries.length,
      entries: entries.slice(0, 10),
    };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      reason: err.code === 'ENOENT' ? 'missing' : 'unreachable',
      // err.message repeats the full UNC path, which names the internal host.
      // The code is enough to act on and does not leak topology to the client.
      code: err.code || 'UNKNOWN',
      message: 'Could not read the share. Check the host, share name and service account.',
    };
  }
}

/**
 * Startup check for the share configuration.
 *
 * NAS_BASE_DIR is the one setting here that can take the whole feature down
 * silently. It is a subdirectory *below* the share root, and on this
 * deployment it must be empty, because the stored sharePath values already
 * begin at "RECORDS\". Setting it to the legacy prefix instead —
 * "Z:\RECORDS\Database\Records Database", which is a natural reading of the
 * name — produces
 *
 *   \\host\share\Z:\RECORDS\Database\Records Database\RECORDS\Database\...
 *
 * and every document in the system stops opening. Nothing else reports that:
 * each record simply says the file is not on the share, which reads like the
 * NAS lost the data rather than like a typo in one line of .env.
 *
 * So it is checked out loud at boot, the same way the cookie and env-format
 * warnings are.
 */
function warnAboutNasConfig() {
  const raw = String(process.env.NAS_BASE_DIR || '').trim();
  if (!raw) return;

  if (/^[A-Za-z]:/.test(raw) || /^\\{2}/.test(raw)) {
    console.warn(
      '\n[NAS] NAS_BASE_DIR is a drive letter or UNC path:\n' +
        `        ${raw}\n` +
        '      It is a subdirectory below the share root, not the legacy path\n' +
        '      to strip — that is NAS_LEGACY_PREFIXES. Left as is, every\n' +
        '      document will report "not on the share".\n' +
        '      On this deployment it should be empty.\n'
    );
    return;
  }

  // Cheap and decisive: does the configured base actually exist?
  testConnection().then((result) => {
    if (!result.ok) {
      console.warn(
        `\n[NAS] The configured share could not be read (${result.reason}/${result.code}).\n` +
          '      Documents will not open. Check NAS_ROOT and NAS_BASE_DIR, and\n' +
          '      that this account holds a stored credential for the host.\n'
      );
    }
  });
}

module.exports = {
  RECORDS_KEY,
  containerKeys,
  nasConfig,
  refreshConfig,
  warnAboutNasConfig,
  isConfigured,
  describeConfig,
  stripLegacyPrefix,
  safeRelativePath,
  resolveSharePath,
  contentTypeFor,
  canPreview,
  statFile,
  listDirectory,
  openStream,
  testConnection,
  toLongPath,
};
