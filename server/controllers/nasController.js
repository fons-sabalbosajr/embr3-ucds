const nas = require('../services/nasStorage');
const elevation = require('../services/nasElevation');
const { principalOf } = require('../middleware/auth');
const { recordFileEvent } = require('../services/nasAudit');
const activation = require('../services/nasActivation');
const credentials = require('../services/nasCredentials');

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
 * viewer, and that answer is not sensitive. It names nothing about the host.
 */
function status(req, res) {
  const cfg = nas.describeConfig();
  return res.json({ configured: cfg.configured === true, enabled: cfg.enabled === true });
}

async function testConnection(req, res) {
  const result = await nas.testConnection();
  await recordFileEvent(req, {
    operation: 'nas-test-connection',
    success: result.ok === true,
    detail: result.ok ? `${result.entryCount} entries` : result.reason,
  });
  return res.status(result.ok ? 200 : 502).json(result);
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
  const result = await nas.listDirectory(requested);

  await recordFileEvent(req, {
    operation: 'nas-browse',
    fileName: requested || '(root)',
    success: result.ok === true,
    detail: result.ok ? `${result.entries.length} entries` : result.reason,
  });

  if (!result.ok) {
    const statuses = {
      'not-configured': [503, 'NAS_NOT_CONFIGURED', 'The records share is not configured.'],
      'invalid-path': [400, 'BAD_PATH', 'That path is not inside the records share.'],
      missing: [404, 'NOT_FOUND', 'No such folder on the records share.'],
      denied: [502, 'NAS_DENIED', 'The server is not permitted to read that folder.'],
      unreachable: [502, 'NAS_UNREACHABLE', 'The records share could not be reached.'],
    };
    const [status, code, message] = statuses[result.reason] || [502, 'NAS_ERROR', 'Could not read that folder.'];
    return res.status(status).json({ code, message });
  }

  return res.json(result);
}

/** Stream one file from the explorer, by share-relative path. */
async function readByPath(req, res, next) {
  try {
    const requested = req.query.path || '';
    const file = await nas.statFile(requested);
    if (!file.ok) {
      await recordFileEvent(req, {
        operation: 'nas-file-read',
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
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    await recordFileEvent(req, {
      operation: 'nas-file-read',
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

    await recordFileEvent(req, {
      operation: req.body?.enabled ? 'nas-activate' : 'nas-deactivate',
      success: result.ok === true,
      detail: result.ok
        ? `until ${result.state.endsAt ? new Date(result.state.endsAt).toISOString() : 'no expiry'}`
        : result.code,
    });

    if (!result.ok) return res.status(result.status).json(result);
    return res.json(result.state);
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

function endElevation(req, res) {
  elevation.clearElevation(req);
  return res.json({ elevated: false });
}

module.exports = {
  requireNasConfig,
  getConfig,
  saveConfig,
  resetConfig,
  configHistory,
  status,
  testConnection,
  browse,
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
