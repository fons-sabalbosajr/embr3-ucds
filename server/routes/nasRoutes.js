const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const {
  listFiles,
  viewPdf,
  envStatus,
  requireNasConfig,
} = require('../controllers/nasController');

// Reading the records share requires an authenticated application session: the
// server holds the SMB service account, so route access *is* share access.
router.get('/api/nas/files', authenticateSession, requireNasConfig, listFiles);
router.get('/api/nas/view-pdf', authenticateSession, requireNasConfig, viewPdf);
router.get('/api/nas/env-status', authenticateSession, envStatus);

// The /api/erms/* aliases added in Phase 1 are gone. They were kept for one
// release so an un-redeployed client would keep working; the front end has
// called /api/nas/* since that same change.
//
// Leaving them would also have undermined the domain boundary: they sit under
// the ERMS namespace but are NAS routes, so they answered a Planning user who
// should see nothing under /api/erms/. The Phase 9 route sweep found exactly
// that.

module.exports = router;
