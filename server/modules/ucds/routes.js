const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain, resolveYearContext } = require('../../middleware/auth');
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
// The documents behind the panel: the Records Unit, the Planning Unit and the
// PEMUs open them here; anyone else asks in the E-Universe Document Portal
// (modules/portal). The two file routes are the ERMS handlers mounted for the
// UCDS domain — same province scope, same check, same audit trail.
// ---------------------------------------------------------------------------

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];
const ermsAccess = [authenticateSession, requireDomain(DOMAINS.ERMS)];
const serialParam = z.object({ serialNo: z.string().trim().min(3).max(60) });

// Asked from an establishment's record: the Planning Unit and the PEMUs may
// open it here (accessRequestService.isEstablishmentViewer); never on the ERMS routes.
const fromEstablishment = (req, _res, next) => {
  req.viaEstablishment = true;
  next();
};
router.get('/api/ucds/records/:serialNo/file', ucdsAccess, requireNasActive, validate(serialParam, 'params'), fromEstablishment, records.getRecordFileInfo);
router.get('/api/ucds/records/:serialNo/file/preview', ucdsAccess, requireNasActive, validate(serialParam, 'params'), fromEstablishment, records.viewRecordFile);

router.get(
  '/api/ucds/establishments/:sortKey/records',
  // The year context: the establishment is looked up in the active year's register.
  ...ucdsAccess,
  resolveYearContext,
  validate(z.object({ sortKey: z.string().trim().min(1).max(60) }), 'params'),
  ctrl.establishmentRecords
);

router.get(
  '/api/ucds/establishments/:sortKey',
  ucdsAccess,
  validate(z.object({ sortKey: z.string().trim().min(1).max(60) }), 'params'),
  ctrl.getEstablishment
);

// The people under each Section in charge, for the record window's
// Inspector / handler box (services/sectionStaff).
router.get('/api/ucds/section-staff', ucdsAccess, async (req, res, next) => {
  try {
    res.json({ sections: await require('./services/sectionStaff').directory() });
  } catch (error) {
    next(error);
  }
});

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
