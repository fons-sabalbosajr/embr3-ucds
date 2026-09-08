const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS } = require('../../services/authorization');
const { validate, z } = require('../../shared/middleware/validate');
const ctrl = require('./controllers/linkController');

// ---------------------------------------------------------------------------
// Cross-domain routes.
//
// The establishment→records panel sits on a UCDS screen, so it requires the
// UCDS domain; whether the caller also holds ERMS is decided inside, and the
// answer degrades rather than 403s.
//
// The register lookups sit on an ERMS screen, so they require the ERMS domain.
// Both are reads. Neither domain gains a write path into the other.
// ---------------------------------------------------------------------------

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];
const ermsAccess = [authenticateSession, requireDomain(DOMAINS.ERMS)];

router.get(
  '/api/ucds/establishments/:sortKey/records',
  ucdsAccess,
  validate(z.object({ sortKey: z.string().trim().min(1).max(60) }), 'params'),
  ctrl.establishmentRecords
);

router.get(
  '/api/erms/register/search',
  ermsAccess,
  validate(
    z.object({
      q: z.string().trim().min(2).max(120),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    'query'
  ),
  ctrl.searchRegister
);

router.get(
  '/api/erms/register/resolve',
  ermsAccess,
  validate(z.object({ number: z.string().trim().min(3).max(120) }), 'query'),
  ctrl.resolvePermit
);

module.exports = router;
