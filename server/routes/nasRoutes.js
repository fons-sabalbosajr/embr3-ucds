const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const { requireElevation } = require('../services/nasElevation');
const {
  requireNasConfig,
  getConfig,
  status,
  testConnection,
  listRoot,
  requestElevation,
  confirmElevation,
  elevationStatus,
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
// not that it is the right guard. Found by inspection in Phase 7.
//
// Reading a document is not served from here at all. It lives in the ERMS
// module as /api/erms/records/:serialNo/file, which takes a record identifier
// and looks the path up server-side, so no caller ever supplies a path.
// ---------------------------------------------------------------------------

const developerOnly = [authenticateSession, requireDeveloper];
const sensitive = [...developerOnly, requireNasConfig, requireElevation];

// Whether a share is configured at all. Any signed-in user may ask, because
// the ERMS screens need it to decide whether to offer a document viewer, and
// the answer names nothing about the host, share or account.
router.get('/api/nas/status', authenticateSession, status);

// Step-up authentication. Requesting and verifying a code obviously cannot
// themselves require elevation.
router.post('/api/nas/elevation/request', developerOnly, requestElevation);
router.post('/api/nas/elevation/verify', developerOnly, confirmElevation);
router.get('/api/nas/elevation', developerOnly, elevationStatus);
router.delete('/api/nas/elevation', developerOnly, endElevation);

// Configuration and diagnostics — elevated.
router.get('/api/nas/config', sensitive, getConfig);
router.post('/api/nas/test-connection', sensitive, testConnection);
router.get('/api/nas/files', sensitive, listRoot);

// GET /api/nas/view-pdf is gone. It accepted a caller-supplied path, which is
// the one thing a document endpoint must never do; records are served by
// serial from the ERMS module instead.

module.exports = router;
