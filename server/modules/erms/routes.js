const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS } = require('../../services/authorization');
const { validate, z } = require('../../shared/middleware/validate');
const ctrl = require('./controllers/recordController');
const { PERMIT_TYPES } = require('./services/recordService');

// Every route: authenticated, then entitled to the ERMS domain. Composed once
// so a new endpoint cannot be added with the domain check quietly missing.
const ermsAccess = [authenticateSession, requireDomain(DOMAINS.ERMS)];

const SORTABLE = [
  'document.uploadedAt',
  'permit.dateApproved',
  'serialNo',
  'proponentName',
  'projectTitle',
];

const listQuery = z.object({
  search: z.string().trim().max(200).optional(),
  permitType: z.enum(PERMIT_TYPES.map((t) => t.code)).optional(),
  province: z.string().trim().max(40).optional(),
  uploadedBy: z.string().trim().max(120).optional(),
  linked: z.enum(['linked', 'unlinked']).optional(),
  flagged: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(SORTABLE).default('document.uploadedAt'),
  sortDir: z.coerce.number().int().refine((v) => v === 1 || v === -1).default(-1),
});

const serialParam = z.object({
  serialNo: z.string().trim().min(3).max(60),
});

router.get('/api/erms/dashboard', ermsAccess, ctrl.dashboard);
router.get('/api/erms/filter-options', ermsAccess, ctrl.filterOptions);
router.get('/api/erms/records', ermsAccess, validate(listQuery, 'query'), ctrl.listRecords);
router.get(
  '/api/erms/records/:serialNo',
  ermsAccess,
  validate(serialParam, 'params'),
  ctrl.getRecord
);

module.exports = router;
