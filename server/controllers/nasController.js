const nas = require('../services/nasStorage');
const elevation = require('../services/nasElevation');
const { principalOf } = require('../middleware/auth');
const { isDeveloper } = require('../services/authorization');
const { recordFileEvent } = require('../services/nasAudit');
const activation = require('../services/nasActivation');
const credentials = require('../services/nasCredentials');
const containers = require('../services/nasContainers');
const storageAccess = require('../services/storageAccess');
const reportFiles = require('../services/reportFiles');
const availability = require('../services/nasAvailability');
const bridge = require('../services/nasBridge');

// ---------------------------------------------------------------------------
// NAS (SMB) storage access — administrative surface.
//
// This is shared infrastructure, not a business domain. It reaches the records
// share where scanned documents live; the ERMS domain module consumes it
// through services/nasStorage.js.
//
// Credentials are a server-side service account read from the environment.
// They used to be collected from a login form and written to req.session,
// which connect-mongo then persisted to universe-db.sessions in cleartext for
// up to 14 days. Access is governed by the application's own authentication
// instead, and no SMB password ever leaves the server.
//
// Everything here is developer-only and, for anything that reads or changes
// configuration, additionally gated on an emailed one-time code. Reading a
// document is NOT here — that is record-scoped and lives in the ERMS module,
// so a Records clerk never supplies a path.
//
// See docs/UNIFICATION-PLAN.md, Phases 1, 2 and 7.
// ---------------------------------------------------------------------------

function requireNasConfig(req, res, next) {
  if (!nas.isConfigured()) {
    return res.status(503).json({
      code: 'NAS_NOT_CONFIGURED',
      message:
        'NAS storage is not configured on the server. Set NAS_ROOT (or NAS_SHARE) ' +
        'in the server environment.',
      required: ['NAS_ROOT'],
    });
  }
  next();
}

/**
 * Configuration as the settings screen may see it. Never includes a password —
 * `passwordSet` says whether one exists, and that is all a screen needs.
 */
async function getConfig(req, res, next) {
  try {
    return res.json(await credentials.describe());
  } catch (error) {
    return next(error);
  }
}

/**
 * Save connection details, then make them the ones actually in force.
 *
 * The order matters. Nothing here authenticates to the share — Windows does,
 * from its own credential store — so storing a password without applying it
 * would leave the old one authenticating while the screen reported success.
 *
 * The connection is tested after applying and the result recorded, but a
 * failed test does not roll back: an administrator correcting a host name
 * while the NAS is down would otherwise be unable to save the correction. The
 * response says plainly whether the test passed.
 */
async function saveConfig(req, res, next) {
  try {
    const user = principalOf(req);
    const body = req.body || {};

    const result = await credentials.save(body, user);
    if (!result.ok) {
      await recordFileEvent(req, {
        operation: 'nas-credentials-save',
        success: false,
        detail: result.code,
      });
      return res.status(result.status).json(result);
    }

    // Refresh before anything else reads the configuration, so the next
    // request uses the new share without a restart.
    await nas.refreshConfig();

    const resolved = await credentials.resolve();
    let applied = { ok: false, code: 'SKIPPED' };
    if (body.password) {
      applied = await credentials.applyToWindows(resolved);
    }

    const probe = await nas.testConnection();
    await credentials.recordTest({
      ok: probe.ok,
      detail: probe.ok ? `${probe.entryCount} entries at the root` : `${probe.reason}/${probe.code}`,
    });

    await recordFileEvent(req, {
      operation: 'nas-credentials-save',
      success: true,
      // Never the password, and never the host: the audit trail is readable
      // from the Admin screens.
      detail: `by ${user?.username || 'unknown'}; test ${probe.ok ? 'passed' : 'failed'}`,
    });

    return res.json({
      ok: true,
      config: await credentials.describe(),
      credentialApplied: applied.ok,
      credentialMessage: applied.ok ? null : applied.message,
      test: probe.ok
        ? { ok: true, ms: probe.ms, entryCount: probe.entryCount }
        : { ok: false, reason: probe.reason, message: probe.message },
    });
  } catch (error) {
    return next(error);
  }
}

/** The credential rotation log. Field names only, never any value. */
async function configHistory(req, res, next) {
  try {
    return res.json({ history: await credentials.history() });
  } catch (error) {
    return next(error);
  }
}

/** Discard stored credentials and fall back to the environment. */
async function resetConfig(req, res, next) {
  try {
    await credentials.reset();
    await nas.refreshConfig();
    await recordFileEvent(req, {
      operation: 'nas-credentials-reset',
      success: true,
      detail: 'reverted to environment',
    });
    return res.json({ ok: true, config: await credentials.describe() });
  } catch (error) {
    return next(error);
  }
}

/**
 * Whether the share is configured at all. Deliberately not elevated and
 * deliberately thin: the ERMS screens need to know whether to offer a document
 * viewer, and that answer is not sensitive. It names nothing about the host —
 * and nothing about which containers exist: that list is for the elevated
 * developer routes.
 */
function status(req, res) {
  const cfg = nas.describeConfig();
  return res.json({ configured: cfg.configured === true, enabled: cfg.enabled === true });
}

/** The container a request names, validated against what exists. */
function containerOf(req) {
  const key = String(req.query.container || req.params.key || nas.RECORDS_KEY).trim();
  return containers.KEY_PATTERN.test(key) ? key : nas.RECORDS_KEY;
}

async function testConnection(req, res) {
  const key = containerOf(req);
  const result = await nas.testConnection(key);
  await recordFileEvent(req, {
    operation: 'nas-test-connection',
    success: result.ok === true,
    detail: `${key}: ${result.ok ? `${result.entryCount} entries` : result.reason}`,
  });
  return res.status(result.ok ? 200 : 502).json({ ...result, container: key });
}

// --- who may open what ---------------------------------------------------------

/**
 * Every account with its type and the containers designated on it. For the
 * Developer's Access tab; names only.
 */
async function listAccess(req, res, next) {
  try {
    return res.json(await storageAccess.accessTable());
  } catch (error) {
    return next(error);
  }
}

/** Designate containers on one account. Takes effect on their next request. */
async function setAccess(req, res, next) {
  try {
    const actor = principalOf(req);
    const result = await storageAccess.setGrants(req.params.userId, req.body?.nasContainers, actor);
    if (!result.ok) return res.status(result.status).json(result);
    await recordFileEvent(req, {
      operation: 'nas-access-grant',
      success: true,
      detail: `${req.params.userId}: ${result.nasContainers.join(', ') || '(none)'} by ${actor?.username || 'unknown'}`,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

// --- shared storage (end users) ----------------------------------------------

/** Containers the signed-in user may open right now, by key and label. */
async function myContainers(req, res, next) {
  try {
    const active = await activation.evaluate();
    return res.json({
      active: active.active === true,
      // Why not, in the Developer's own words when it is the schedule, so the
      // Storage screen can say "weekdays only" instead of "off".
      reason: active.reason || null,
      message: active.message || null,
      nextOpensAt: active.nextOpensAt || null,
      containers: await storageAccess.grantedContainers(principalOf(req)),
    });
  } catch (error) {
    return next(error);
  }
}

// --- report files (database -> share) -----------------------------------------

async function reportFilesInventory(req, res, next) {
  try {
    return res.json(await reportFiles.inventory());
  } catch (error) {
    return next(error);
  }
}

async function reportFilesMove(req, res, next) {
  try {
    const r = await reportFiles.moveToShare(principalOf(req));
    await recordFileEvent(req, {
      operation: 'nas-report-files-move',
      containerKey: nas.RECORDS_KEY,
      success: r.ok === true,
      detail: r.results ? `${r.results.filter((x) => x.ok).length}/${r.results.length} copied to ${r.folder}` : r.code || r.message,
    });
    return res.status(r.ok ? 200 : r.status || 502).json(r);
  } catch (error) {
    return next(error);
  }
}

async function reportFilesRemove(req, res, next) {
  try {
    const r = await reportFiles.removeFromDatabase();
    await recordFileEvent(req, {
      operation: 'nas-report-files-remove',
      success: r.ok === true,
      detail: r.ok ? `${r.removed} file(s) removed from the database` : r.code || r.message,
    });
    return res.status(r.ok ? 200 : r.status || 502).json(r);
  } catch (error) {
    return next(error);
  }
}

// --- containers --------------------------------------------------------------

/** Every container, as a screen may see it. Never a password. */
async function listContainers(req, res, next) {
  try {
    // Whether the NAS is offered right now — the master switch, the
    // schedule, the bridge and the activation window together — travels
    // with the list, so the Containers screen can say "off" for all of them
    // at once and why.
    const [list, now] = await Promise.all([containers.list(), activation.evaluate()]);
    const offered = now.active === true;
    return res.json({
      ...list,
      availability: { available: offered, reason: now.reason || null, message: now.message || null, nextOpensAt: now.nextOpensAt || null },
      containers: list.containers.map((c) => ({ ...c, online: offered && c.enabled === true })),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Create or update a container: store, refresh, apply the credential to
 * Windows if one was given, test, record. The same order as saveConfig, for
 * the same reasons — see the note there.
 */
async function persistContainer(req, res, next, key) {
  try {
    const user = principalOf(req);
    const body = req.body || {};

    const result = await containers.save(key, body, user);
    if (!result.ok) {
      await recordFileEvent(req, {
        operation: 'nas-container-save',
        success: false,
        detail: `${key || body.key || '(new)'}: ${result.code}`,
      });
      return res.status(result.status).json(result);
    }

    await nas.refreshConfig();

    const resolved = await containers.resolve(result.key);
    let applied = { ok: false, code: 'SKIPPED' };
    if (body.password && resolved) applied = await containers.applyToWindows(resolved);

    const probe = await nas.testConnection(result.key);
    await containers.recordTest(result.key, {
      ok: probe.ok,
      detail: probe.ok ? `${probe.entryCount} entries at the root` : `${probe.reason}/${probe.code}`,
    });

    await recordFileEvent(req, {
      operation: 'nas-container-save',
      success: true,
      detail: `${result.key} by ${user?.username || 'unknown'}; ${result.changed.join(', ')}; test ${probe.ok ? 'passed' : 'failed'}`,
    });

    return res.status(key ? 200 : 201).json({
      ok: true,
      container: await containers.describe(result.key),
      changed: result.changed,
      conflicts: result.conflicts,
      conflictMessage: result.conflictMessage,
      credentialApplied: applied.ok,
      credentialMessage: applied.ok ? null : applied.message,
      test: probe.ok
        ? { ok: true, ms: probe.ms, entryCount: probe.entryCount }
        : { ok: false, reason: probe.reason, message: probe.message },
    });
  } catch (error) {
    return next(error);
  }
}

const createContainer = (req, res, next) => persistContainer(req, res, next, null);
const updateContainer = (req, res, next) => persistContainer(req, res, next, containerOf(req));

async function setContainerEnabled(req, res, next) {
  try {
    const key = containerOf(req);
    const enabled = req.body?.enabled !== false;
    const result = await containers.setEnabled(key, enabled, principalOf(req));
    if (!result.ok) return res.status(result.status).json(result);
    await nas.refreshConfig();
    await recordFileEvent(req, {
      operation: 'nas-container-save',
      success: true,
      detail: `${key}: ${enabled ? 'enabled' : 'disabled'}`,
    });
    return res.json({ ok: true, container: await containers.describe(key) });
  } catch (error) {
    return next(error);
  }
}

async function deleteContainer(req, res, next) {
  try {
    const key = containerOf(req);
    const result = await containers.remove(key);
    if (!result.ok) return res.status(result.status).json(result);
    await nas.refreshConfig();
    await recordFileEvent(req, { operation: 'nas-container-remove', success: true, detail: key });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function containerHistory(req, res, next) {
  try {
    return res.json({ container: containerOf(req), history: await containers.history(containerOf(req)) });
  } catch (error) {
    return next(error);
  }
}

/**
 * One directory level, for the administrative file explorer.
 *
 * The caller supplies a share-relative path, which is why this is the most
 * sensitive route here: it is the only place a path from a browser reaches the
 * filesystem at all. It goes through the same resolveSharePath() as document
 * reads, so `?path=../../` is rejected, and the response never contains an
 * absolute path — the client navigates by relative path and never learns the
 * host or share name.
 *
 * Developer-only and elevation-gated. Ordinary users reach documents through
 * their record, where province scope applies; this bypasses that, which is
 * precisely why it is not available to them.
 */
async function browse(req, res) {
  const requested = req.query.path || '';
  // req.container is set by requireContainerAccess on the shared storage
  // routes; the developer explorer names the container itself.
  const key = req.container?.key || containerOf(req);
  const result = await nas.listDirectory(requested, key);

  await recordFileEvent(req, {
    operation: req.container ? 'storage-browse' : 'nas-browse',
    containerKey: key,
    fileName: requested || '(root)',
    success: result.ok === true,
    detail: result.ok ? `${result.entries.length} entries` : result.reason,
  });

  if (!result.ok) {
    const statuses = {
      'not-configured': [503, 'NAS_NOT_CONFIGURED', 'That container is not configured.'],
      disabled: [503, 'NAS_DISABLED', 'That container is switched off.'],
      'invalid-path': [400, 'BAD_PATH', 'That path is not inside the container.'],
      missing: [404, 'NOT_FOUND', 'No such folder in the container.'],
      denied: [502, 'NAS_DENIED', 'The server is not permitted to read that folder.'],
      unreachable: [502, 'NAS_UNREACHABLE', 'The container could not be reached.'],
    };
    const [status, code, message] = statuses[result.reason] || [502, 'NAS_ERROR', 'Could not read that folder.'];
    return res.status(status).json({ code, message });
  }

  return res.json(result);
}

/** Search names under a folder of a container, for the explorer's search box. */
async function search(req, res, next) {
  try {
    const requested = req.query.path || '';
    const key = req.container?.key || containerOf(req);
    const result = await nas.searchDirectory(requested, req.query.q || '', key);

    await recordFileEvent(req, {
      operation: req.container ? 'storage-search' : 'nas-search',
      containerKey: key,
      fileName: requested || '(root)',
      success: result.ok === true,
      detail: result.ok ? `"${result.query}": ${result.results.length} match(es) in ${result.scannedFolders} folder(s)${result.truncated ? ', truncated' : ''}` : result.reason,
    });

    if (!result.ok) {
      const statuses = {
        'query-too-short': [400, 'QUERY_TOO_SHORT', 'Type at least two characters.'],
        'not-configured': [503, 'NAS_NOT_CONFIGURED', 'That container is not configured.'],
        disabled: [503, 'NAS_DISABLED', 'That container is switched off.'],
        'invalid-path': [400, 'BAD_PATH', 'That path is not inside the container.'],
        missing: [404, 'NOT_FOUND', 'No such folder in the container.'],
        denied: [502, 'NAS_DENIED', 'The server is not permitted to read that folder.'],
        unreachable: [502, 'NAS_UNREACHABLE', 'The container could not be reached.'],
      };
      const [status, code, message] = statuses[result.reason] || [502, 'NAS_ERROR', 'Could not search that folder.'];
      return res.status(status).json({ code, message });
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

/** Stream one file from the explorer, by share-relative path. */
async function readByPath(req, res, next) {
  try {
    const requested = req.query.path || '';
    const key = req.container?.key || containerOf(req);
    const file = await nas.statFile(requested, key);
    if (!file.ok) {
      await recordFileEvent(req, {
        operation: req.container ? 'storage-file-read' : 'nas-file-read',
        containerKey: key,
        fileName: requested,
        success: false,
        detail: file.reason,
      });
      return res.status(file.reason === 'invalid-path' ? 400 : 404).json({
        code: file.reason === 'invalid-path' ? 'BAD_PATH' : 'NOT_FOUND',
        message: 'That file is not available on the records share.',
      });
    }

    const safeName = file.fileName.replace(/["\\]/g, '_');
    // Staff view, never download: /api/storage/file (req.container set) is
    // inline for everyone but the Developer, who may save a file from
    // Storage as from the elevated explorer. A download is its own entry in
    // the trail.
    const download = req.query.download === '1' && (!req.container || isDeveloper(principalOf(req)));
    const disposition = download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    await recordFileEvent(req, {
      operation: download ? (req.container ? 'storage-file-download' : 'nas-file-download') : req.container ? 'storage-file-read' : 'nas-file-read',
      containerKey: key,
      fileName: file.fileName,
      success: true,
      bytes: file.size,
    });

    const stream = nas.openStream(file.resolved);
    stream.on('error', (err) => {
      console.error('NAS explorer stream failed:', err.code || err.message);
      res.destroy(err);
    });
    return stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

// --- application-wide activation -------------------------------------------

/** Current activation state. Any signed-in user may ask — it names nothing. */
async function activationStatus(req, res, next) {
  try {
    const state = await activation.evaluate();
    return res.json(state);
  } catch (error) {
    return next(error);
  }
}

/** Turn document access on or off for the whole deployment. */
async function setActivation(req, res, next) {
  try {
    const user = principalOf(req);
    const result = await activation.setActivation(req.body || {}, user);
    // The period as stored: the evaluated state leaves out the end date while
    // another rule (an outage, the schedule) is holding access off, which
    // logged a five-day window as "no expiry".
    const stored = result.ok ? await activation.readState() : null;

    await recordFileEvent(req, {
      operation: req.body?.enabled ? 'nas-activate' : 'nas-deactivate',
      success: result.ok === true,
      detail: result.ok
        ? `until ${stored?.endsAt ? new Date(stored.endsAt).toISOString() : 'no expiry'}`
        : result.code,
    });

    if (!result.ok) return res.status(result.status).json(result);

    // Effective now, for everyone: probe the road to the NAS so the answer is
    // not the last 30-second probe's, then push the new state to every open
    // screen rather than leaving them to their next poll.
    await bridge.probe().catch(() => {});
    await bridge.broadcast();
    return res.json(await activation.evaluate());
  } catch (error) {
    return next(error);
  }
}

// --- step-up authentication -------------------------------------------------

async function requestElevation(req, res) {
  const user = principalOf(req);
  const result = await elevation.requestCode(req, user);
  await recordFileEvent(req, {
    operation: 'nas-elevation-request',
    success: result.ok === true,
    detail: result.ok ? 'code sent' : result.code,
  });
  if (!result.ok) return res.status(result.status).json(result);
  return res.json(result);
}

async function confirmElevation(req, res) {
  const user = principalOf(req);
  const result = elevation.verifyCode(req, user, req.body?.code);
  await recordFileEvent(req, {
    operation: 'nas-elevation-verify',
    success: result.ok === true,
    detail: result.ok ? 'elevated' : result.code,
  });
  if (!result.ok) return res.status(result.status).json(result);
  return res.json(result);
}

async function elevationStatus(req, res, next) {
  try {
    const user = principalOf(req);
    const state = elevation.elevationState(req, user);
    // `pin` tells the screen which challenge to offer first. It carries no
    // secret — whether a PIN exists, and whether it is locked out.
    return res.json({ ...state, pin: await elevation.pinState(user) });
  } catch (error) {
    return next(error);
  }
}

/** Set or replace the PIN. Requires an elevation proved by email. */
async function setElevationPin(req, res, next) {
  try {
    const user = principalOf(req);
    const result = await elevation.setPin(req, user, req.body?.pin);
    await recordFileEvent(req, {
      operation: 'nas-pin-set',
      success: result.ok === true,
      detail: result.ok ? 'pin set' : result.code,
    });
    if (!result.ok) return res.status(result.status).json(result);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

/** Exchange a PIN for the same elevation an emailed code grants. */
async function verifyElevationPin(req, res, next) {
  try {
    const user = principalOf(req);
    const result = await elevation.verifyPin(req, user, req.body?.pin);
    await recordFileEvent(req, {
      operation: 'nas-pin-verify',
      success: result.ok === true,
      detail: result.ok ? 'elevated by pin' : result.code,
    });
    if (!result.ok) return res.status(result.status).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function removeElevationPin(req, res, next) {
  try {
    const user = principalOf(req);
    const result = await elevation.clearPin(req, user);
    await recordFileEvent(req, {
      operation: 'nas-pin-remove',
      success: result.ok === true,
      detail: result.ok ? 'pin removed' : result.code,
    });
    if (!result.ok) return res.status(result.status).json(result);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function endElevation(req, res) {
  elevation.clearElevation(req);
  await recordFileEvent(req, { operation: 'nas-elevation-end', success: true, detail: 'verified session ended' });
  return res.json({ elevated: false });
}

// --- audit log -----------------------------------------------------------------

/**
 * The NAS audit trail: every configuration change, activation, verification,
 * connection test, container change, access grant and document read, newest
 * first. Read-only — the entries are written by recordFileEvent and the
 * developer log editor refuses to touch domain 'nas'.
 */
async function auditLog(req, res, next) {
  try {
    const { getDb } = require('../config/db');
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);
    const filter = { domain: 'nas' };
    if (req.query.operation) filter.operation = String(req.query.operation);
    if (req.query.username) filter.username = String(req.query.username);
    if (req.query.success === 'true') filter.success = true;
    if (req.query.success === 'false') filter.success = false;
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
    }
    const q = String(req.query.q || '').trim();
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ username: re }, { detail: re }, { fileName: re }, { serialNo: re }, { container: re }, { operation: re }];
    }
    const col = getDb().collection('app-logs');
    const [total, items, operations] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { method: 0, path: 0 } }).sort({ timestamp: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      col.distinct('operation', { domain: 'nas' }),
    ]);
    return res.json({ total, page, pageSize, items, operations: operations.filter(Boolean).sort() });
  } catch (error) {
    return next(error);
  }
}

// --- availability (master switch + schedule) ---------------------------------

async function getAvailability(req, res, next) {
  try {
    const [config, now] = await Promise.all([availability.read(), availability.evaluate()]);
    return res.json({ ...config, now, scheduleText: availability.describeSchedule(config.schedule) });
  } catch (error) {
    return next(error);
  }
}

async function setAvailability(req, res, next) {
  try {
    const r = await availability.save(req.body || {}, principalOf(req));
    if (!r.ok) return res.status(r.status || 400).json(r);
    await recordFileEvent(req, {
      operation: 'nas-availability-set',
      success: true,
      detail: r.changed.length ? r.changed.join('; ') : 'no change',
    });
    const now = await availability.evaluate();
    // Every open Storage screen hears about it at once.
    bridge.broadcast();
    return res.json({ ...r.config, now, scheduleText: availability.describeSchedule(r.config.schedule), changed: r.changed });
  } catch (error) {
    return next(error);
  }
}

// --- the NAS bridge (the office server the shares are reached through) --------

async function getBridge(req, res, next) {
  try {
    return res.json({ ...(await bridge.read()), status: await bridge.status() });
  } catch (error) {
    return next(error);
  }
}

async function setBridge(req, res, next) {
  try {
    const r = await bridge.save(req.body || {}, principalOf(req));
    if (!r.ok) return res.status(r.status || 400).json(r);
    await recordFileEvent(req, {
      operation: 'nas-bridge-set',
      success: true,
      detail: r.changed.length ? r.changed.join('; ') : 'no change',
    });
    return res.json({ ...r.config, status: await bridge.status(), changed: r.changed });
  } catch (error) {
    return next(error);
  }
}

/** Run one probe now, for the "Check now" button. */
async function probeBridge(req, res, next) {
  try {
    const status = await bridge.probe();
    return res.json({ status, now: await activation.evaluate() });
  } catch (error) {
    return next(error);
  }
}

// --- activity summary (for the charts) ---------------------------------------

/**
 * The audit trail rolled up for the Activity tab: per day, per operation,
 * per container, per person and per hour of day, over the last N days.
 * Counts only — no paths, no hosts, nothing that is not already in the log.
 */
async function auditSummary(req, res, next) {
  try {
    const { getDb } = require('../config/db');
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    const col = getDb().collection('app-logs');
    const match = { domain: 'nas', timestamp: { $gte: since } };
    const tz = availability.TIME_ZONE;
    const group = (idExpr, extra = {}) => [
      { $match: match },
      { $group: { _id: idExpr, total: { $sum: 1 }, failed: { $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] } }, bytes: { $sum: { $ifNull: ['$bytes', 0] } }, ...extra } },
    ];
    const [byDay, byOperation, byContainer, byUser, byHour, totals] = await Promise.all([
      col.aggregate([...group({ $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: tz } }), { $sort: { _id: 1 } }]).toArray(),
      col.aggregate([...group('$operation'), { $sort: { total: -1 } }]).toArray(),
      col.aggregate([...group('$container'), { $sort: { total: -1 } }]).toArray(),
      col.aggregate([...group('$username'), { $sort: { total: -1 } }, { $limit: 10 }]).toArray(),
      col.aggregate([...group({ $hour: { date: '$timestamp', timezone: tz } }), { $sort: { _id: 1 } }]).toArray(),
      col.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: 1 }, failed: { $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] } }, bytes: { $sum: { $ifNull: ['$bytes', 0] } }, users: { $addToSet: '$username' } } }]).toArray(),
    ]);
    const shape = (rows, key = 'key') => rows.map((r) => ({ [key]: r._id ?? null, total: r.total, failed: r.failed, ok: r.total - r.failed, bytes: r.bytes }));
    const t = totals[0] || { total: 0, failed: 0, bytes: 0, users: [] };
    // Every calendar day in the range, in the office time zone, so the chart
    // draws the quiet days too and its keys match the grouped ones exactly.
    const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i -= 1) dayKeys.push(dayOf.format(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
    return res.json({
      days,
      since: since.toISOString(),
      dayKeys,
      timeZone: tz,
      totals: { total: t.total, failed: t.failed, ok: t.total - t.failed, bytes: t.bytes, users: (t.users || []).filter(Boolean).length },
      byDay: shape(byDay, 'day'),
      byOperation: shape(byOperation, 'operation'),
      byContainer: shape(byContainer, 'container'),
      byUser: shape(byUser, 'username'),
      byHour: shape(byHour, 'hour'),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireNasConfig,
  getAvailability,
  setAvailability,
  getBridge,
  setBridge,
  probeBridge,
  auditSummary,
  getConfig,
  saveConfig,
  resetConfig,
  configHistory,
  status,
  testConnection,
  listAccess,
  setAccess,
  myContainers,
  auditLog,
  reportFilesInventory,
  reportFilesMove,
  reportFilesRemove,
  listContainers,
  createContainer,
  updateContainer,
  setContainerEnabled,
  deleteContainer,
  containerHistory,
  browse,
  search,
  readByPath,
  activationStatus,
  setActivation,
  requestElevation,
  confirmElevation,
  elevationStatus,
  setElevationPin,
  verifyElevationPin,
  removeElevationPin,
  endElevation,
};
