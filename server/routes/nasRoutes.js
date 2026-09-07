const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const {
  listFiles,
  viewPdf,
  envStatus,
  requireNasConfig,
} = require('../controllers/nasController');

// Reading the records share now requires an authenticated application session:
// the server holds the SMB service account, so route access *is* share access.
router.get('/api/nas/files', authenticateSession, requireNasConfig, listFiles);
router.get('/api/nas/view-pdf', authenticateSession, requireNasConfig, viewPdf);
router.get('/api/nas/env-status', authenticateSession, envStatus);

// ---------------------------------------------------------------------------
// Deprecated aliases. These paths are being handed over to the ERMS records
// module; they exist only so a client that has not yet been redeployed keeps
// working. Remove after one release — see docs/UNIFICATION-PLAN.md, Phase 1.
//
// POST /api/erms/login is intentionally absent: the SMB login form was removed
// in Phase 2. A client still calling it receives 404 rather than a route that
// silently stores its password.
// ---------------------------------------------------------------------------
const deprecate = (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/nas>; rel="successor-version"');
  next();
};

router.get('/api/erms/files', deprecate, authenticateSession, requireNasConfig, listFiles);
router.get('/api/erms/view-pdf', deprecate, authenticateSession, requireNasConfig, viewPdf);
router.get('/api/erms/env-status', deprecate, authenticateSession, envStatus);

module.exports = router;
