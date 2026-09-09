const nas = require('../services/nasStorage');
const elevation = require('../services/nasElevation');
const { principalOf } = require('../middleware/auth');
const { recordFileEvent } = require('../services/nasAudit');

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

/** Configuration as the settings screen may see it. Never includes a password. */
function getConfig(req, res) {
  return res.json(nas.describeConfig());
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
 * List the share root only — one level, no path parameter.
 *
 * There is deliberately no way to walk into subdirectories from here. Browsing
 * the share is not a feature anyone needs: documents are reached through their
 * record, and an arbitrary directory walker would be the exact "browse the NAS
 * freely" capability the design forbids.
 */
async function listRoot(req, res) {
  const result = await nas.testConnection();
  if (!result.ok) {
    return res.status(502).json({ code: 'NAS_UNREACHABLE', message: result.message, reason: result.reason });
  }
  return res.json({ entries: result.entries, entryCount: result.entryCount });
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

function elevationStatus(req, res) {
  return res.json(elevation.elevationState(req, principalOf(req)));
}

function endElevation(req, res) {
  elevation.clearElevation(req);
  return res.json({ elevated: false });
}

module.exports = {
  requireNasConfig,
  getConfig,
  status,
  testConnection,
  listRoot,
  requestElevation,
  confirmElevation,
  elevationStatus,
  endElevation,
};
