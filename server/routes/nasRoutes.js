const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const { requireElevation } = require('../services/nasElevation');
const { requireNasActive } = require('../services/nasActivation');
const { requireContainerAccess } = require('../services/storageAccess');
const { logActivity } = require('../middleware/activityLog');
const { expensiveLimiter } = require('../config/security');
const {
  requireNasConfig,
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
  auditSummary,
  getAvailability,
  setAvailability,
  getBridge,
  setBridge,
  probeBridge,
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
} = require('../controllers/nasController');

// ---------------------------------------------------------------------------
// Administrative NAS routes. Developer-only, and everything that reads or
// changes the share configuration additionally needs an emailed one-time code.
//
// These used to require only authenticateSession. That is authentication with
// no authorization: any signed-in user — Planning, Viewer, anyone — could call
// /api/nas/view-pdf with a path and read any file on the records share. The
// Phase 9 route sweep passed it because the sweep checks that a guard exists,
// not that it is the right guard.
//
// Reading a document is not served from here at all. It lives in the ERMS
// module as /api/erms/records/:serialNo/file, which takes a record identifier
// and looks the path up server-side, so no ordinary caller supplies a path.
// The one exception is the file explorer below, which is why it is the most
// heavily guarded thing in this file.
// ---------------------------------------------------------------------------

const developerOnly = [authenticateSession, requireDeveloper];
const sensitive = [...developerOnly, requireNasConfig, requireElevation];

// Whether a share is configured, and whether document access is currently
// active. Any signed-in user may ask: the Monitoring Plan screens need it to
// decide whether to offer documents, and the answer names nothing about the
// host, share or account.
router.get('/api/nas/status', authenticateSession, status);
router.get('/api/nas/activation', authenticateSession, activationStatus);

// Step-up authentication. Requesting and verifying a code obviously cannot
// themselves require elevation.
router.post('/api/nas/elevation/request', developerOnly, requestElevation);
router.post('/api/nas/elevation/verify', developerOnly, confirmElevation);
router.get('/api/nas/elevation', developerOnly, elevationStatus);
router.delete('/api/nas/elevation', developerOnly, endElevation);

// A PIN re-opens a step-up the person has already proved by email. Verifying
// one therefore cannot itself require elevation — that is the whole point —
// but setting or removing one can, and does: otherwise a stolen session could
// turn a temporary hold on the account into a durable one.
router.post('/api/nas/elevation/pin/verify', developerOnly, verifyElevationPin);
router.post('/api/nas/elevation/pin', developerOnly, requireElevation, setElevationPin);
router.delete('/api/nas/elevation/pin', developerOnly, requireElevation, removeElevationPin);

// Configuration and diagnostics — elevated.
router.get('/api/nas/config', sensitive, getConfig);
router.post('/api/nas/test-connection', sensitive, testConnection);

// Rotating the share password is an operational routine, not a redeploy. The
// password is encrypted at rest, never returned by GET, and applied to the
// machine's own credential store so the change actually takes effect.
//
// Deliberately not behind requireNasConfig: the first save is how a
// deployment with no configuration gets one.
router.put('/api/nas/config', developerOnly, requireElevation, saveConfig);
router.delete('/api/nas/config', developerOnly, requireElevation, resetConfig);
router.get('/api/nas/config/history', developerOnly, requireElevation, configHistory);

// Containers: one share and one service account each — Records, Legal,
// Laboratory, and whatever comes next. The single-share routes above edit
// the `records` container; these edit any. Creating one is deliberately not
// behind requireNasConfig, for the same reason as PUT /api/nas/config.
router.get('/api/nas/containers', developerOnly, requireElevation, listContainers);
router.post('/api/nas/containers', developerOnly, requireElevation, createContainer);
router.put('/api/nas/containers/:key', developerOnly, requireElevation, updateContainer);
router.patch('/api/nas/containers/:key/enabled', developerOnly, requireElevation, setContainerEnabled);
router.delete('/api/nas/containers/:key', developerOnly, requireElevation, deleteContainer);
router.get('/api/nas/containers/:key/history', developerOnly, requireElevation, containerHistory);
router.post('/api/nas/containers/:key/test', developerOnly, requireElevation, testConnection);

// Turning document access on or off for the whole deployment, with an
// expiry window the server evaluates. Elevated: it changes what every user
// of the application can do.
router.put('/api/nas/activation', sensitive, setActivation);

// Generated reports: from the database to a folder on the Records share.
// Writes to the share and drops a collection, so elevated.
router.get('/api/nas/report-files', sensitive, reportFilesInventory);
router.post('/api/nas/report-files/move', sensitive, reportFilesMove);
router.delete('/api/nas/report-files/database', sensitive, reportFilesRemove);

// Who may open which container. The Developer designates containers per
// account here and from the Accounts screen. Developer-only, like setting an
// account's type; it names containers by key and label, never a host.
// The audit trail. Elevated, like the configuration it records changes to.
router.get('/api/nas/audit', developerOnly, requireElevation, auditLog);
// The same trail rolled up into counts for the Activity charts.
router.get('/api/nas/audit/summary', developerOnly, requireElevation, auditSummary);

// Availability: the master switch and the weekday schedule. Reading needs a
// developer; changing it is as sensitive as the configuration it gates.
router.get('/api/nas/availability', developerOnly, requireElevation, getAvailability);
router.put('/api/nas/availability', developerOnly, requireElevation, logActivity, setAvailability);

// The bridge server the shares are reached through: its address, and whether
// it answers right now. Same sensitivity as the availability settings.
router.get('/api/nas/bridge', developerOnly, requireElevation, getBridge);
router.put('/api/nas/bridge', developerOnly, requireElevation, logActivity, setBridge);
router.post('/api/nas/bridge/probe', developerOnly, requireElevation, probeBridge);

router.get('/api/nas/access', developerOnly, listAccess);
router.put('/api/nas/access/:userId', developerOnly, setAccess);

// The developer's file explorer. Accepts a path from a browser, so it carries
// every guard available: a session, the developer role, a configured share,
// and an emailed code.
router.get('/api/nas/browse', sensitive, browse);
router.get('/api/nas/search', sensitive, expensiveLimiter, search);
router.get('/api/nas/file', sensitive, readByPath);

// Shared storage, for everyone the Developer has designated a container to.
//
// This is how the NAS reaches Planning and Records staff: not a drive
// letter, not a credential, but a container the Developer put on their
// account. Three guards: a session; document access switched on for the
// deployment (the activation window); and the named container being on
// this account — checked against the account document on every request, so
// a revocation takes effect at once. Every read is audited with the
// container and the user.
const shared = [authenticateSession, requireNasActive];
router.get('/api/storage/containers', authenticateSession, myContainers);
router.get('/api/storage/browse', shared, requireContainerAccess, browse);
router.get('/api/storage/search', shared, requireContainerAccess, expensiveLimiter, search);
router.get('/api/storage/file', shared, requireContainerAccess, readByPath);

// GET /api/nas/view-pdf is gone. It accepted a caller-supplied path with only
// a session check, which is the one thing a document endpoint must never do.
// GET /api/nas/files was the share-root listing; /api/nas/browse replaces it.

module.exports = router;
