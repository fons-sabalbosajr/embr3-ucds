const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS, capabilitiesOf } = require('../../services/authorization');
const { principalOf } = require('../../middleware/auth');
const { validate, z } = require('../../shared/middleware/validate');
const { requireNasActive } = require('../../services/nasActivation');
const ctrl = require('./controllers/recordController');
const { PERMIT_TYPES } = require('./services/recordService');
const { ACTION_CODES } = require('./services/trackingService');
const { STATUSES } = require('./services/archiveService');
const { REPORT_KEYS } = require('./services/reportService');

// Read: authenticated and entitled to the ERMS domain.
const ermsAccess = [authenticateSession, requireDomain(DOMAINS.ERMS)];
// Whole-collection aggregations: a few a minute per person is normal use.
const { expensiveLimiter } = require('../../config/security');

/**
 * Write: the same, plus the capability that already means "may modify data".
 *
 * Reusing canManageData rather than inventing an ERMS-only flag keeps one
 * capability vocabulary — which is the whole point of Phase 3. Per-province
 * write access is enforced separately in the service, against the record's
 * own province.
 */
function requireErmsWrite(req, res, next) {
  const user = principalOf(req);
  if (!user) return res.status(401).json({ message: 'User not authenticated' });
  if (capabilitiesOf(user).canManageData !== true) {
    return res.status(403).json({
      code: 'CAPABILITY_REQUIRED',
      message: 'You do not have permission to modify records.',
    });
  }
  next();
}

const ermsWrite = [...ermsAccess, requireErmsWrite];

// --- shared field shapes ----------------------------------------------------

const optional = (max) => z.string().trim().max(max).optional().nullable();
const isoDate = z.string().datetime({ offset: true }).or(z.string().date()).optional().nullable();
const PROVINCE_KEYS = [
  'aurora', 'bataan', 'bulacan', 'nuevaEcija', 'pampanga', 'tarlac', 'zambales',
];

const permitShape = z.object({
  type: z.enum(PERMIT_TYPES.map((t) => t.code)),
  number: optional(120),
  processSource: optional(60),
  dateApproved: isoDate,
  dateAmended: isoDate,
});

const locationShape = z.object({
  province: z.enum(PROVINCE_KEYS),
  provinceLabel: optional(60),
  city: optional(120),
  barangay: optional(120),
  street: optional(200),
  lat: z.number().min(-90).max(90).optional().nullable(),
  long: z.number().min(-180).max(180).optional().nullable(),
});

const createSchema = z.object({
  proponentName: z.string().trim().min(1).max(300),
  projectTitle: z.string().trim().min(1).max(500),
  remarks: optional(2000),
  parentSerialNo: optional(60),
  permit: permitShape,
  project: z.object({ type: optional(200), otherType: optional(300) }).optional(),
  location: locationShape,
  document: z
    .object({
      fileName: optional(400),
      filePath: optional(1000),
      sharePath: optional(1000),
      fileClass: optional(40),
    })
    .optional(),
});

// Update is the same shape with everything optional, and must change something.
const updateSchema = z
  .object({
    proponentName: z.string().trim().min(1).max(300).optional(),
    projectTitle: z.string().trim().min(1).max(500).optional(),
    remarks: optional(2000),
    permit: permitShape.partial().optional(),
    project: z.object({ type: optional(200), otherType: optional(300) }).optional(),
    location: locationShape.partial().optional(),
    document: z
      .object({
        fileName: optional(400),
        filePath: optional(1000),
        sharePath: optional(1000),
        fileClass: optional(40),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

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
  linkedTo: z.string().trim().max(60).optional(),
  flagged: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(SORTABLE).default('document.uploadedAt'),
  sortDir: z.coerce.number().int().refine((v) => v === 1 || v === -1).default(-1),
});

const serialParam = z.object({ serialNo: z.string().trim().min(3).max(60) });
const codeParam = z.object({ code: z.string().trim().min(1).max(40) });

const trackingSchema = z.object({
  action: z.enum(ACTION_CODES),
  fromParty: optional(200),
  toParty: optional(200),
  purpose: optional(300),
  remarks: optional(1000),
  dueDate: isoDate,
});

const boxSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: optional(200),
  province: z.enum(PROVINCE_KEYS),
  location: optional(300),
  retentionYears: z.coerce.number().int().min(0).max(200).optional().nullable(),
});

const boxUpdateSchema = z
  .object({
    label: optional(200),
    location: optional(300),
    province: z.enum(PROVINCE_KEYS).optional(),
    retentionYears: z.coerce.number().int().min(0).max(200).optional().nullable(),
    status: z.enum(STATUSES).optional(),
    disposalAuthority: optional(300),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

const reportQuery = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(20000).default(5000),
});

// --- routes ----------------------------------------------------------------

router.get('/api/erms/dashboard', ermsAccess, expensiveLimiter, ctrl.dashboard);
router.get('/api/erms/filter-options', ermsAccess, ctrl.filterOptions);

router.get('/api/erms/records', ermsAccess, validate(listQuery, 'query'), ctrl.listRecords);
router.post('/api/erms/records', ermsWrite, validate(createSchema), ctrl.createRecord);
router.get('/api/erms/records/:serialNo', ermsAccess, validate(serialParam, 'params'), ctrl.getRecord);
router.patch(
  '/api/erms/records/:serialNo',
  ermsWrite,
  validate(serialParam, 'params'),
  validate(updateSchema),
  ctrl.updateRecord
);

// Documents on the records share. Addressed by record, never by path: the
// stored path is looked up server-side, so there is no caller input that could
// name a different file. ermsAccess carries the province scope, so a clerk who
// cannot read the record cannot read its document.
router.get(
  '/api/erms/records/:serialNo/file',
  ermsAccess,
  requireNasActive,
  validate(serialParam, 'params'),
  ctrl.getRecordFileInfo
);
router.get(
  '/api/erms/records/:serialNo/file/preview',
  ermsAccess,
  requireNasActive,
  validate(serialParam, 'params'),
  ctrl.viewRecordFile
);
router.get(
  '/api/erms/records/:serialNo/file/download',
  ermsAccess,
  requireNasActive,
  validate(serialParam, 'params'),
  ctrl.downloadRecordFile
);

// Tracking is append-only: no PATCH, no DELETE. A mistake is corrected by
// recording a correction, not by rewriting the custody trail.
router.get(
  '/api/erms/records/:serialNo/tracking',
  ermsAccess,
  validate(serialParam, 'params'),
  ctrl.listTracking
);
router.post(
  '/api/erms/records/:serialNo/tracking',
  ermsWrite,
  validate(serialParam, 'params'),
  validate(trackingSchema),
  ctrl.addTracking
);
router.get('/api/erms/tracking/overdue', ermsAccess, ctrl.overdueLoans);

router.put(
  '/api/erms/records/:serialNo/box',
  ermsWrite,
  validate(serialParam, 'params'),
  validate(z.object({ boxCode: z.string().trim().max(40).nullable() })),
  ctrl.assignToBox
);

router.get('/api/erms/boxes', ermsAccess, ctrl.listBoxes);
router.post('/api/erms/boxes', ermsWrite, validate(boxSchema), ctrl.createBox);
router.get('/api/erms/boxes/:code', ermsAccess, validate(codeParam, 'params'), ctrl.boxContents);
router.patch(
  '/api/erms/boxes/:code',
  ermsWrite,
  validate(codeParam, 'params'),
  validate(boxUpdateSchema),
  ctrl.updateBox
);
router.get('/api/erms/disposal-due', ermsAccess, ctrl.disposalDue);

router.get(
  '/api/erms/reports/:key',
  ermsAccess,
  expensiveLimiter,
  validate(z.object({ key: z.enum(REPORT_KEYS) }), 'params'),
  validate(reportQuery, 'query'),
  ctrl.runReport
);

module.exports = router;
