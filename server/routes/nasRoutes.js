const express = require('express');
const router = express.Router();
const {
  nasLogin,
  listFiles,
  viewPdf,
  requireNasAuth,
  envStatus,
} = require('../controllers/nasController');

// Canonical paths.
router.post('/api/nas/login', nasLogin);
router.get('/api/nas/files', requireNasAuth, listFiles);
router.get('/api/nas/view-pdf', requireNasAuth, viewPdf);
router.get('/api/nas/env-status', envStatus);

// ---------------------------------------------------------------------------
// Deprecated aliases. These paths are being handed over to the ERMS records
// module; they exist only so a client that has not yet been redeployed keeps
// working. Remove after one release — see docs/UNIFICATION-PLAN.md, Phase 1.
// ---------------------------------------------------------------------------
const deprecate = (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/nas>; rel="successor-version"');
  next();
};

router.post('/api/erms/login', deprecate, nasLogin);
router.get('/api/erms/files', deprecate, requireNasAuth, listFiles);
router.get('/api/erms/view-pdf', deprecate, requireNasAuth, viewPdf);
router.get('/api/erms/env-status', deprecate, envStatus);

module.exports = router;
