const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const { requireElevation } = require('../services/nasElevation');
const {
  requireNasConfig,
  getConfig,
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

// Turning document access on or off for the whole deployment, with an
// expiry window the server evaluates. Elevated: it changes what every user
// of the application can do.
router.put('/api/nas/activation', sensitive, setActivation);

// The file explorer. The only route that accepts a path from a browser, so it
// carries every guard available: a session, the developer role, a configured
// share, and an emailed code.
router.get('/api/nas/browse', sensitive, browse);
router.get('/api/nas/file', sensitive, readByPath);

// GET /api/nas/view-pdf is gone. It accepted a caller-supplied path with only
// a session check, which is the one thing a document endpoint must never do.
// GET /api/nas/files was the share-root listing; /api/nas/browse replaces it.

module.exports = router;
