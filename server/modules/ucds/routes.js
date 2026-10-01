const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS } = require('../../services/authorization');
const { validate, z } = require('../../shared/middleware/validate');
const { requireNasActive } = require('../../services/nasActivation');
const ctrl = require('./controllers/linkController');
const records = require('../erms/controllers/recordController');

// ---------------------------------------------------------------------------
// Cross-domain routes.
//
// The establishment→records panel sits on a UCDS screen, so it requires the
// UCDS domain; whether the caller also holds ERMS is decided inside, and the
// answer degrades rather than 403s.
//
// The register lookups sit on an ERMS screen, so they require the ERMS domain.
//
// The documents behind the panel follow the Records Unit's rule (see
// erms/services/accessRequestService.js): a Planning Admin or an Encoder
// asks, the Records Unit approves for a period, and the approved person
// views in the browser. Those four routes are the ERMS handlers mounted for
// the UCDS domain — same province scope, same approval check, same audit
// trail — because the people who ask are exactly the ones who do not hold
// ERMS. The request is the one write UCDS has into ERMS, and it creates
// nothing but a request.
// ---------------------------------------------------------------------------

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];
const ermsAccess = [authenticateSession, requireDomain(DOMAINS.ERMS)];
const serialParam = z.object({ serialNo: z.string().trim().min(3).max(60) });

router.get('/api/ucds/records/:serialNo/file', ucdsAccess, requireNasActive, validate(serialParam, 'params'), records.getRecordFileInfo);
router.get('/api/ucds/records/:serialNo/file/preview', ucdsAccess, requireNasActive, validate(serialParam, 'params'), records.viewRecordFile);
router.post(
  '/api/ucds/records/:serialNo/access-request',
  ucdsAccess,
  validate(serialParam, 'params'),
  validate(z.object({ reason: z.string().trim().max(500).optional().nullable(), full: z.coerce.boolean().optional() })),
  records.requestDocumentAccess
);
router.get('/api/ucds/access-requests', ucdsAccess, records.listAccessRequests);

router.get(
  '/api/ucds/establishments/:sortKey/records',
  ucdsAccess,
  validate(z.object({ sortKey: z.string().trim().min(1).max(60) }), 'params'),
  ctrl.establishmentRecords
);

router.get(
  '/api/ucds/establishments/:sortKey',
  ucdsAccess,
  validate(z.object({ sortKey: z.string().trim().min(1).max(60) }), 'params'),
  ctrl.getEstablishment
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
