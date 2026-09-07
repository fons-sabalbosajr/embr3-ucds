const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { validate, z, trimmed, optionalTrimmed, objectId } = require('../shared/middleware/validate');
const { TYPES } = require('../shared/services/orgUnits');
const ctrl = require('../controllers/orgUnitController');

const adminOnly = [authenticateSession, requireDomain(DOMAINS.ADMIN)];

const createSchema = z.object({
  code: trimmed(60),
  name: optionalTrimmed(200),
  type: z.enum(TYPES).optional(),
  parentCode: optionalTrimmed(60).nullable().optional(),
});

const updateSchema = z
  .object({
    name: optionalTrimmed(200),
    type: z.enum(TYPES).optional(),
    parentCode: optionalTrimmed(60).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

// Read: any signed-in user. Both domains render an office list.
router.get('/api/org-units', authenticateSession, ctrl.listOrgUnits);

// Write: platform administrators only.
router.post('/api/org-units', adminOnly, validate(createSchema), ctrl.createOrgUnit);
router.patch(
  '/api/org-units/:id',
  adminOnly,
  validate(z.object({ id: objectId }), 'params'),
  validate(updateSchema),
  ctrl.updateOrgUnit
);
router.post(
  '/api/org-units/:code/aliases',
  adminOnly,
  validate(z.object({ alias: trimmed(200) })),
  ctrl.addOrgUnitAlias
);

module.exports = router;
