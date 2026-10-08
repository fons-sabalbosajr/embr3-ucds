const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../../middleware/auth');
const { DOMAINS, capabilitiesOf, isErmsEndUser, ermsUnitOf, ERMS_UNIT_VALUES } = require('../../services/authorization');
const { principalOf } = require('../../middleware/auth');
const { validate, z } = require('../../shared/middleware/validate');
const { requireNasActive } = require('../../services/nasActivation');
const ctrl = require('./controllers/recordController');
const unitCtrl = require('./controllers/unitController');
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
  // Filing records is the Records Unit's own work: its ERMS Users write here
  // whether or not they hold the UCDS capability, as they did in the desktop
  // system. Everyone else needs canManageData as before.
  const recordsUnitStaff = isErmsEndUser(user) && ermsUnitOf(user) === 'records';
  if (capabilitiesOf(user).canManageData !== true && !recordsUnitStaff) {
    return res.status(403).json({
      code: 'CAPABILITY_REQUIRED',
      message: 'You do not have permission to modify records.',
    });
  }
  next();
}

const ermsWrite = [...ermsAccess, requireErmsWrite];

// Configuration: the admin domain, held by the Developer and Administrator.
const ermsAdmin = [authenticateSession, requireDomain(DOMAINS.ADMIN)];

// Uploads arrive as multipart and are held in memory until filed on the
// share (streaming to a UNC path through multer's disk storage would mean a
// temp file on the server and a second copy). The hard cap here is the
// ceiling; the configured limit (ERMS Config > Upload) is checked after.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024 * 1024, files: 1 },
});
const uploadOne = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 'FILE_TOO_LARGE', message: 'Files are limited to 256 MB.' });
    return res.status(400).json({ code: 'BAD_UPLOAD', message: err.message || 'The upload could not be read.' });
  });

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
  mailingAddress: optional(500),
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
      // The project folder chosen on the form (see the folder picker).
      folder: optional(120),
      // A folder inside the project folder (replacing the type folder).
      subfolder: optional(120),
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
// Autocomplete on the upload forms: values already on file, within scope.
const suggestQuery = (fields) => z.object({ field: z.enum(fields), q: z.string().trim().max(100).optional() });
router.get('/api/erms/records/suggest', ermsAccess, validate(suggestQuery(['proponentName', 'projectTitle']), 'query'), ctrl.suggest);
// The desktop system's menus (project types, statuses, addresses), for the forms.
router.get(
  '/api/erms/lookups',
  ermsAccess,
  validate(z.object({ province: z.enum(PROVINCE_KEYS).optional() }), 'query'),
  ctrl.getLookups
);

router.get('/api/erms/records', ermsAccess, validate(listQuery, 'query'), ctrl.listRecords);
router.post('/api/erms/records', ermsWrite, validate(createSchema), ctrl.createRecord);

// Create a record and file its scan in one multipart request: `payload`
// (JSON, the createSchema shape) and `file`. The payload is parsed here so
// the same schema checks it.
function validateMultipartPayload(req, res, next) {
  let parsed;
  try {
    parsed = JSON.parse(req.body?.payload || '{}');
  } catch {
    return res.status(400).json({ code: 'BAD_PAYLOAD', message: 'The record could not be read.' });
  }
  const result = createSchema.safeParse(parsed);
  if (!result.success) {
    return res.status(400).json({
      code: 'VALIDATION',
      message: 'Some fields need attention.',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  req.validatedPayload = result.data;
  return next();
}
router.get('/api/erms/records/next-serial', ermsWrite, ctrl.nextSerial);
// The unit's duplicate rules (Settings › ERMS): what the form warns about,
// and the permit numbers filed more than once.
router.get(
  '/api/erms/records/duplicates',
  ermsAccess,
  validate(z.object({ permitNumber: z.string().trim().max(120).optional(), fileName: z.string().trim().max(400).optional(), exclude: z.string().trim().max(60).optional() }), 'query'),
  ctrl.duplicateCheck
);
router.get('/api/erms/records/duplicate-groups', ermsAccess, expensiveLimiter, ctrl.duplicateGroups);
router.post('/api/erms/records/upload', ermsWrite, requireNasActive, uploadOne, validateMultipartPayload, ctrl.uploadRecord);
router.post(
  '/api/erms/records/:serialNo/upload',
  ermsWrite,
  requireNasActive,
  validate(serialParam, 'params'),
  uploadOne,
  ctrl.attachRecordFile
);

// --- the units: Legal Services and Laboratory --------------------------------------

const unitParam = z.object({ unit: z.enum(ERMS_UNIT_VALUES) });
const unitSerialParam = z.object({ unit: z.enum(ERMS_UNIT_VALUES), serialNo: z.string().trim().min(3).max(80) });
const unitListQuery = z.object({
  docType: z.string().trim().max(40).optional(),
  province: z.string().trim().max(40).optional(),
  docketNo: z.string().trim().max(80).optional(),
  missingFile: z.coerce.boolean().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.coerce.number().int().optional(),
});
const unitUpdateSchema = z.object({
  province: z.enum(PROVINCE_KEYS).optional(),
  fields: z.record(z.any()).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

// The folder picker on the upload forms (see unitController): the project
// folders at the filing level for a province and date; make one; remove an
// empty one. `:unit` here includes 'records'.
const folderUnitParam = z.object({ unit: z.enum(ERMS_UNIT_VALUES) });
const folderLevelQuery = z.object({
  province: z.enum(PROVINCE_KEYS).optional(),
  date: z.string().trim().max(40).optional(),
  // With `folder`, the level is that project folder: its subfolders are listed, made, removed.
  folder: z.string().trim().max(120).optional(),
  // What the form would derive the folder from (the project title, the
  // company), so the listing can say what the default folder would be.
  hint: z.string().trim().max(300).optional(),
});
const folderBody = folderLevelQuery.extend({ name: z.string().trim().min(1).max(120) });
router.get('/api/erms/units/:unit/folders', ermsAccess, requireNasActive, validate(folderUnitParam, 'params'), validate(folderLevelQuery, 'query'), unitCtrl.listFolders);
router.post('/api/erms/units/:unit/folders', ermsAccess, requireNasActive, validate(folderUnitParam, 'params'), validate(folderBody), unitCtrl.createFolder);
router.delete('/api/erms/units/:unit/folders', ermsAccess, requireNasActive, validate(folderUnitParam, 'params'), validate(folderBody), unitCtrl.deleteFolder);

// The unit's own settings (Settings › ERMS) and its log history.
router.get('/api/erms/units/:unit/settings', ermsAccess, validate(folderUnitParam, 'params'), unitCtrl.getSettings);
router.put('/api/erms/units/:unit/settings', ermsAccess, validate(folderUnitParam, 'params'), unitCtrl.saveSettings);
router.post('/api/erms/units/:unit/settings/reset', ermsAccess, validate(folderUnitParam, 'params'), unitCtrl.resetSettings);
router.get('/api/erms/units/:unit/duplicate-groups', ermsAccess, validate(folderUnitParam, 'params'), expensiveLimiter, unitCtrl.unitDuplicateGroups);
router.get(
  '/api/erms/units/:unit/duplicates',
  ermsAccess,
  validate(folderUnitParam, 'params'),
  validate(z.object({ fileName: z.string().trim().max(400).optional() }), 'query'),
  unitCtrl.unitDuplicateCheck
);
router.get(
  '/api/erms/units/:unit/activity',
  ermsAccess,
  validate(folderUnitParam, 'params'),
  validate(z.object({ q: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }), 'query'),
  unitCtrl.unitActivity
);

// The unit's own menus (Settings › ERMS › Menus): read by the unit, changed by its staff.
router.get('/api/erms/units/:unit/lookups', ermsAccess, validate(folderUnitParam, 'params'), unitCtrl.unitLookups);
router.put(
  '/api/erms/units/:unit/lookups/:kind',
  ermsAccess,
  validate(z.object({ unit: z.enum(ERMS_UNIT_VALUES), kind: z.string().regex(/^[a-z][a-z-]{1,40}$/) }), 'params'),
  validate(z.object({ items: z.array(z.union([z.string().max(200), z.record(z.any())])).max(5000) })),
  unitCtrl.saveUnitLookup
);

// Docket numbers (Legal): the next one, claiming it, and the register.
const docketScope = z.object({ province: z.enum(PROVINCE_KEYS), year: z.coerce.number().int().min(1990).max(2200).optional() });
router.get('/api/erms/units/:unit/dockets/next', ermsAccess, validate(folderUnitParam, 'params'), validate(docketScope, 'query'), unitCtrl.nextDocket);
router.get(
  '/api/erms/units/:unit/dockets',
  ermsAccess,
  validate(folderUnitParam, 'params'),
  validate(docketScope.partial().extend({ limit: z.coerce.number().int().min(1).max(500).optional() }), 'query'),
  unitCtrl.listDockets
);
router.post('/api/erms/units/:unit/dockets', ermsAccess, validate(folderUnitParam, 'params'), validate(docketScope.extend({ note: optional(300) })), unitCtrl.claimDocket);

// The upload tally: counts per person per day, and the supervisor's check.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
router.get(
  '/api/erms/units/:unit/upload-tally',
  ermsAccess,
  expensiveLimiter,
  validate(folderUnitParam, 'params'),
  validate(z.object({ from: day.optional(), to: day.optional(), format: z.enum(['json', 'csv']).optional() }), 'query'),
  unitCtrl.uploadTally
);
router.post(
  '/api/erms/units/:unit/upload-tally/checks',
  ermsAccess,
  validate(folderUnitParam, 'params'),
  validate(z.object({ entries: z.array(z.object({ date: day, uploader: z.string().max(200) })).min(1).max(200), remarks: optional(500) })),
  unitCtrl.checkUploads
);
router.delete(
  '/api/erms/units/:unit/upload-tally/checks',
  ermsAccess,
  validate(folderUnitParam, 'params'),
  validate(z.object({ date: day, uploader: z.string().max(200) })),
  unitCtrl.uncheckUploads
);

router.get('/api/erms/units', ermsAccess, unitCtrl.myUnits);
router.get('/api/erms/units/:unit/dashboard', ermsAccess, validate(unitParam, 'params'), expensiveLimiter, unitCtrl.unitDashboard);
router.get('/api/erms/units/:unit/documents', ermsAccess, validate(unitParam, 'params'), validate(unitListQuery, 'query'), unitCtrl.listDocuments);
router.get(
  '/api/erms/units/:unit/suggest',
  ermsAccess,
  validate(unitParam, 'params'),
  validate(suggestQuery([...new Set(Object.values(require('./services/unitDocumentService').SUGGESTABLE).flat())]), 'query'),
  unitCtrl.suggest
);
router.post('/api/erms/units/:unit/documents', ermsAccess, requireNasActive, validate(unitParam, 'params'), uploadOne, unitCtrl.createDocument);
router.get('/api/erms/units/:unit/documents/:serialNo', ermsAccess, validate(unitSerialParam, 'params'), unitCtrl.getDocument);
router.patch('/api/erms/units/:unit/documents/:serialNo', ermsAccess, validate(unitSerialParam, 'params'), validate(unitUpdateSchema), unitCtrl.updateDocument);
// File a scan against a document already on file, or replace its scan.
router.post('/api/erms/units/:unit/documents/:serialNo/upload', ermsAccess, requireNasActive, validate(unitSerialParam, 'params'), uploadOne, unitCtrl.attachDocumentFile);
router.get('/api/erms/units/:unit/documents/:serialNo/file', ermsAccess, requireNasActive, validate(unitSerialParam, 'params'), unitCtrl.getDocumentFileInfo);
router.get('/api/erms/units/:unit/documents/:serialNo/file/preview', ermsAccess, requireNasActive, validate(unitSerialParam, 'params'), unitCtrl.viewDocumentFile);
// Ask the administrators for every page of a document the viewer shows only in part.
router.post('/api/erms/units/:unit/documents/:serialNo/full-access-request', ermsAccess, validate(unitSerialParam, 'params'), validate(z.object({ reason: optional(500) })), unitCtrl.requestFullAccess);
router.post('/api/erms/records/:serialNo/full-access-request', ermsAccess, validate(serialParam, 'params'), validate(z.object({ reason: optional(500) })), unitCtrl.requestRecordFullAccess);

// --- configuration (Admin Settings > ERMS Config) ------------------------------------

router.get('/api/erms/config', ermsAdmin, unitCtrl.getConfig);
router.put('/api/erms/config', ermsAdmin, unitCtrl.saveConfig);
router.post('/api/erms/config/reset', ermsAdmin, unitCtrl.resetConfig);
router.get('/api/erms/config/lookups/:kind', ermsAdmin, validate(z.object({ kind: z.string().regex(/^[a-z][a-z-]{1,40}$/) }), 'params'), unitCtrl.getLookup);
router.put('/api/erms/config/lookups/:kind', ermsAdmin, validate(z.object({ kind: z.string().regex(/^[a-z][a-z-]{1,40}$/) }), 'params'), unitCtrl.saveLookup);
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
//
// View only. There is no download route: the office's rule is that scans are
// read in the application, by the Records Unit or by whoever the Records Unit
// has approved for that record (see services/accessRequestService.js). The
// controller enforces the approval; a request that fails it gets 403
// APPROVAL_REQUIRED with the state of the caller's own request.
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

// Asking for, and deciding on, document access. Asking needs only ERMS
// access (and province scope on the record); deciding is refused in the
// service to anyone but the Records Unit.
const accessRequestSchema = z.object({ reason: optional(500), full: z.coerce.boolean().optional() });
const accessDecisionSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  durationHours: z.coerce.number().int().optional(),
  note: optional(500),
  // Every page, rather than the first few the unit's viewing rule allows.
  fullAccess: z.coerce.boolean().optional(),
});
const requestIdParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });

router.post(
  '/api/erms/records/:serialNo/access-request',
  ermsAccess,
  validate(serialParam, 'params'),
  validate(accessRequestSchema),
  ctrl.requestDocumentAccess
);
// Sharing: the Records Unit opens a document for a named person — the same
// approval a request would end in, granted without the asking.
router.get('/api/erms/share/people', ermsAccess, validate(z.object({ q: z.string().trim().max(120).optional() }), 'query'), ctrl.sharePeople);
router.post(
  '/api/erms/records/:serialNo/share',
  ermsAccess,
  validate(serialParam, 'params'),
  validate(z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i), durationHours: z.coerce.number().int().optional(), note: optional(500), fullAccess: z.coerce.boolean().optional() })),
  ctrl.shareDocument
);
router.get('/api/erms/access-requests', ermsAccess, ctrl.listAccessRequests);
router.patch(
  '/api/erms/access-requests/:id',
  ermsAccess,
  validate(requestIdParam, 'params'),
  validate(accessDecisionSchema),
  ctrl.decideAccessRequest
);
router.post(
  '/api/erms/access-requests/:id/revoke',
  ermsAccess,
  validate(requestIdParam, 'params'),
  validate(z.object({ note: optional(500) })),
  ctrl.revokeAccessRequest
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

// --- the Action Center: messages between ERMS users ------------------------------

const messageCtrl = require('./controllers/messageController');
const { PURPOSES } = require('./services/messageService');
const messageId = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });
router.get(
  '/api/erms/messages',
  ermsAccess,
  validate(z.object({ box: z.enum(['inbox', 'sent']).default('inbox'), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }), 'query'),
  messageCtrl.list
);
router.get('/api/erms/messages/unread', ermsAccess, messageCtrl.unread);
router.get('/api/erms/messages/people', ermsAccess, validate(z.object({ q: z.string().trim().max(120).optional() }), 'query'), messageCtrl.people);
router.post(
  '/api/erms/messages',
  ermsAccess,
  validate(z.object({ to: z.string().trim().min(1).max(120), purpose: z.enum(PURPOSES), subject: z.string().trim().min(1).max(200), details: optional(4000) })),
  messageCtrl.send
);
router.patch('/api/erms/messages/:id', ermsAccess, validate(messageId, 'params'), validate(z.object({ read: z.boolean() })), messageCtrl.mark);
router.delete('/api/erms/messages/:id', ermsAccess, validate(messageId, 'params'), messageCtrl.remove);

router.get(
  '/api/erms/reports/:key',
  ermsAccess,
  expensiveLimiter,
  validate(z.object({ key: z.enum(REPORT_KEYS) }), 'params'),
  validate(reportQuery, 'query'),
  ctrl.runReport
);

module.exports = router;
