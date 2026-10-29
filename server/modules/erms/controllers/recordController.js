const recordService = require('../services/recordService');
const trackingService = require('../services/trackingService');
const archiveService = require('../services/archiveService');
const reportService = require('../services/reportService');
const accessRequests = require('../services/accessRequestService');
const lookups = require('../services/lookupService');
const filing = require('../services/filingService');
const config = require('../services/configService');
const audit = require('../../../shared/services/audit');
const { principalOf } = require('../../../middleware/auth');
const { canAccessAllYears, isDeveloper, DOMAINS } = require('../../../services/authorization');
const { userProvinceKeys, userWritableProvinceKeys } = require('../../../services/provinces');
const { forbidden, notFoundError } = require('../../../shared/middleware/errorHandler');
const nas = require('../../../services/nasStorage');
const storageAccess = require('../../../services/storageAccess');
const { recordFileEvent } = require('../../../services/nasAudit');
const unitSettings = require('../services/unitSettingsService');

// --- the Records Unit's own settings, where the API enforces them -----------------
//
// See services/unitSettingsService.js. The record form reads the same
// settings to warn early; these checks are what actually refuse.

/** Records on file that share this permit number or file name (excluding one serial). */
async function findDuplicates({ permitNumber, fileName, exclude }, scope) {
  const { getDb } = require('../../../config/db');
  const or = [];
  if (permitNumber) or.push({ 'permit.number': permitNumber });
  if (fileName) or.push({ 'document.fileName': fileName });
  if (!or.length) return [];
  const filter = { $or: or };
  if (exclude) filter.serialNo = { $ne: exclude };
  if (Array.isArray(scope)) filter['location.province'] = { $in: scope };
  return getDb()
    .collection('erms-records')
    .find(filter, { projection: { serialNo: 1, proponentName: 1, projectTitle: 1, 'permit.number': 1, 'permit.type': 1, 'permit.label': 1, 'document.fileName': 1, 'document.uploadedAt': 1, 'location.province': 1 } })
    .limit(20)
    .toArray();
}

/**
 * What the unit's settings say about a record about to be saved: required
 * fields missing, and a permit number the unit refuses to file twice.
 * Returns null when the record may go ahead, else a 4xx body.
 */
async function checkAgainstSettings(payload, { exclude } = {}) {
  // An attachment is filed against a record that already passed these
  // rules, and carries its permit number by design (recordService.permitClash).
  if (payload.parentSerialNo) return null;
  const cfg = await unitSettings.forUnit('records');
  const errors = [];
  if (cfg.dataQuality.requirePermitNumber && !payload.permit?.number) errors.push({ field: 'permit.number', message: 'The permit number is required.' });
  if (cfg.dataQuality.requireDateApproved && !payload.permit?.dateApproved) errors.push({ field: 'permit.dateApproved', message: 'The date approved is required.' });
  if (cfg.dataQuality.requireProjectType && !payload.project?.type) errors.push({ field: 'project.type', message: 'The project type is required.' });
  if (errors.length) return { status: 400, body: { code: 'VALIDATION', message: 'Some fields need attention.', errors } };

  if (cfg.duplicates.blockOnPermitNumber && payload.permit?.number) {
    const dupes = await findDuplicates({ permitNumber: payload.permit.number, exclude }, null);
    if (dupes.length) {
      return {
        status: 409,
        body: { code: 'DUPLICATE_PERMIT', message: `Permit number ${payload.permit.number} is already filed as ${dupes.map((d) => d.serialNo).join(', ')}.`, duplicates: dupes },
      };
    }
  }
  return null;
}

/** The classification an upload gets when the form named none. */
async function withDefaultClassification(payload) {
  if (payload.document?.fileClass) return payload;
  const cfg = await unitSettings.forUnit('records');
  return { ...payload, document: { ...(payload.document || {}), fileClass: cfg.privacy.defaultClassification } };
}

/**
 * How much of a document this viewer sees: with a page limit set, the first
 * N pages and the rest withheld. Not limited: the Developer and
 * administrators, and the unit's staff when the unit exempted them.
 */
async function viewingRules(user) {
  const cfg = await unitSettings.forUnit('records');
  const own = accessRequests.isRecordsUnit(user);
  const limited = cfg.pdfViewing.previewPageLimit > 0 && !canAccessAllYears(user) && !(own && cfg.pdfViewing.exemptUnit);
  return {
    pageLimit: limited ? cfg.pdfViewing.previewPageLimit : 0,
    blurWithheldPages: cfg.pdfViewing.blurWithheldPages,
    hideToolbar: cfg.pdfViewing.hideToolbar,
    watermark: cfg.privacy.watermarkViewer ? require('../services/watermark').watermarkText() : null,
    logViews: cfg.auditing.logViews,
  };
}

// ---------------------------------------------------------------------------
// Province scope for the acting user, or null when unrestricted.
//
// ERMS routes are not year-scoped, so resolveYearContext never runs and
// req.provinceKeys is never set. Scope is derived from the account with the
// same helpers and the same fail-closed rule the UCDS side uses.
//
// Read scope and write scope differ: a 'view' grant reads a province, a
// 'readWrite' grant also changes it.
// ---------------------------------------------------------------------------
function readScope(req) {
  const user = principalOf(req);
  if (!user || canAccessAllYears(user)) return null;
  return userProvinceKeys(user);
}

function writeScope(req) {
  const user = principalOf(req);
  if (!user || canAccessAllYears(user)) return null;
  return userWritableProvinceKeys(user);
}

const actor = (req) => ({
  username: principalOf(req)?.username || 'unknown',
  writableProvinces: writeScope(req),
});

/**
 * Strip the stored share paths unless the caller is a developer.
 *
 * They describe the internal layout of the records share, and nobody filing a
 * record needs them — the document is opened from the record itself. They stay
 * for whoever has to diagnose a path that will not resolve.
 *
 * Read-side only. The update path merges the document object over the stored
 * one, so a redacted read cannot write the paths back as null.
 */
function withoutInternalPaths(record, user) {
  if (!record || isDeveloper(user)) return record;
  const { filePath, sharePath, ...document } = record.document || {};
  return { ...record, document };
}

// --- records ---------------------------------------------------------------

async function listRecords(req, res, next) {
  try {
    const result = await recordService.listRecords(req.query, readScope(req));
    // Searches are written to the trail only when the unit asked for it.
    if (req.query.search && (await unitSettings.forUnit('records')).auditing.logSearches) {
      await audit.record(req, { domain: DOMAINS.ERMS, action: 'search', label: 'library searched', collection: recordService.RECORDS, changes: { search: req.query.search, hits: result.total }, includeBody: false });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getRecord(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

    const [attachments, tracking, custody] = await Promise.all([
      record.isAttachment ? [] : recordService.listAttachments(record.serialNo),
      // With the record: the desktop system's own log entries are read in.
      trackingService.listForRecord(record.serialNo, record),
      trackingService.currentCustody(record.serialNo),
    ]);

    res.json({ record: withoutInternalPaths(record, principalOf(req)), attachments, tracking, custody });
  } catch (error) {
    next(error);
  }
}

// --- documents on the records share ----------------------------------------
//
// The caller names a record, never a path. The stored path is looked up here
// and resolved server-side, so there is no input a caller could shape into a
// different file — and province scope is inherited from getRecord(), so a
// clerk who cannot read a record cannot read its document either.

/** The record plus its resolved file, or a response already sent. */
async function resolveRecordFile(req, res) {
  const record = await recordService.getRecord(req.params.serialNo, readScope(req));
  if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

  const stored = record.document?.sharePath || record.document?.filePath;
  if (!stored) {
    res.status(404).json({
      code: 'NO_DOCUMENT',
      message: 'This record has no document filed against it.',
    });
    return null;
  }

  // The container this document lives in must be on the account. The Developer
  // designates containers per user from the storage Access tab; a Records
  // Admin from before that field existed keeps the records container. Checked
  // against the account document, so revoking it takes effect at once.
  const containerKey = String(record.document?.container || nas.RECORDS_KEY).toLowerCase();

  // Who may open it: the Records Unit. Everyone else is pointed to the
  // Document Portal, and the refusal is in the audit trail like any other.
  // From an establishment's record (the UCDS routes set req.viaEstablishment),
  // the Planning Unit and the PEMUs open it too.
  const permission = await accessRequests.viewPermission(principalOf(req), record.serialNo, { establishment: req.viaEstablishment === true });
  if (!permission.allowed) {
    await recordFileEvent(req, {
      operation: 'document-read',
      serialNo: record.serialNo,
      containerKey,
      fileName: record.document?.fileName,
      success: false,
      detail: `approval-${permission.reason}`,
    });
    res.status(403).json({
      code: 'APPROVAL_REQUIRED',
      reason: permission.reason,
      portalUrl: accessRequests.PORTAL_URL,
      message: 'Only the Records Unit opens this document here. Ask for it in the E-Universe Document Portal.',
    });
    return null;
  }

  // The container must be designated to the account (storage Access tab).
  // Opened from an establishment's record, the records container itself is
  // the grant: the Planning Unit and the PEMUs hold no storage designation.
  const viaRecord = permission.reason === 'establishment' && containerKey === String(nas.RECORDS_KEY).toLowerCase();
  const granted = viaRecord ? [] : await storageAccess.grantedContainers(principalOf(req));
  if (!viaRecord && !granted.some((c) => c.key === containerKey)) {
    await recordFileEvent(req, {
      operation: 'document-read',
      serialNo: record.serialNo,
      containerKey,
      fileName: record.document?.fileName,
      success: false,
      detail: 'container-not-granted',
    });
    res.status(403).json({
      code: 'CONTAINER_FORBIDDEN',
      message: 'Document access has not been shared with your account. Ask the system developer.',
    });
    return null;
  }

  const file = await nas.statFile(stored, containerKey);
  if (!file.ok) {
    // Each reason is a different thing for the user to do, so they are not
    // collapsed into one "unavailable".
    const responses = {
      'not-configured': [503, 'NAS_NOT_CONFIGURED', 'The records share is not configured on the server.'],
      disabled: [503, 'NAS_DISABLED', 'Document access is turned off.'],
      'invalid-path': [422, 'BAD_STORED_PATH', 'The stored file path for this record cannot be resolved.'],
      missing: [404, 'FILE_MISSING', 'The document is recorded but is not on the records share.'],
      'not-a-file': [404, 'FILE_MISSING', 'The document is recorded but is not on the records share.'],
      denied: [502, 'NAS_DENIED', 'The server is not permitted to read this document.'],
      unreachable: [502, 'NAS_UNREACHABLE', 'The records share could not be reached.'],
    };
    const [status, code, message] = responses[file.reason] || [502, 'NAS_ERROR', 'The document could not be read.'];

    await recordFileEvent(req, {
      operation: 'document-read',
      serialNo: record.serialNo,
      fileName: record.document?.fileName,
      success: false,
      detail: file.reason,
    });
    res.status(status).json({ code, message });
    return null;
  }

  return { record, file, permission };
}

/** Metadata only — lets the UI show size and type without fetching the file. */
async function getRecordFileInfo(req, res, next) {
  try {
    const resolved = await resolveRecordFile(req, res);
    if (!resolved) return undefined;
    const { record, file, permission } = resolved;
    const viewing = await viewingRules(principalOf(req));
    return res.json({
      serialNo: record.serialNo,
      fileName: file.fileName,
      size: file.size,
      contentType: file.contentType,
      previewable: file.previewable,
      modifiedAt: file.modifiedAt,
      fileClass: record.document?.fileClass || null,
      // View-only for everyone.
      downloadable: false,
      access: { reason: permission.reason, expiresAt: null },
      // How the viewer shows it: a page limit for people outside the unit,
      // blurred placeholders for the withheld pages, a watermark.
      viewing: { pageLimit: viewing.pageLimit, blurWithheldPages: viewing.blurWithheldPages, hideToolbar: viewing.hideToolbar, watermark: viewing.watermark },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Stream the document, inline only.
 *
 * There is no download: the office's rule is that scans are viewed in the
 * application and not handed over as files. The response is always
 * `inline`, and the viewer is asked not to offer a save button. A browser
 * cannot be prevented from saving what it shows; what this does is remove
 * the invitation and keep every view in the audit trail.
 *
 * Streamed rather than read into memory: these are scans, some are large, and
 * buffering them would put the whole file in the server's heap per concurrent
 * reader. Range requests are honoured so a PDF viewer can page through a large
 * document without pulling all of it.
 */
async function viewRecordFile(req, res, next) {
  try {
    const resolved = await resolveRecordFile(req, res);
    if (!resolved) return undefined;
    const { record, file, permission } = resolved;
    const viewing = await viewingRules(principalOf(req));

    // The stored name can contain commas, quotes and non-ASCII; both forms are
    // sent so every browser gets one it can parse.
    const safeName = file.fileName.replace(/["\\]/g, '_');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    // Documents are not public and must not be cached by an intermediary.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // A page limit for this viewer: the PDF is cut to its first N pages
    // here, so the withheld pages never leave the server. The page counts
    // travel in headers so the viewer can show what was withheld, blurred.
    if (viewing.pageLimit > 0 && file.contentType === 'application/pdf') {
      // Cut once and kept a while (see streamFile.pageLimitedPdf).
      const { out, total } = await require('../services/streamFile').pageLimitedPdf(file, viewing.pageLimit);
      res.setHeader('Access-Control-Expose-Headers', 'X-Document-Pages, X-Document-Pages-Shown');
      if (total !== null) {
        res.setHeader('X-Document-Pages', String(total));
        res.setHeader('X-Document-Pages-Shown', String(Math.min(total, viewing.pageLimit)));
      }
      res.setHeader('Content-Length', out.length);
      if (viewing.logViews) {
        await recordFileEvent(req, { operation: 'document-view', serialNo: record.serialNo, fileName: file.fileName, success: true, bytes: out.length, detail: total !== null && total > viewing.pageLimit ? `limited to ${viewing.pageLimit} of ${total} pages` : null });
      }
      return res.end(out);
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length, X-Session-Token');
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let options;
    if (range && file.size > 0) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= file.size) {
        res.setHeader('Content-Range', `bytes */${file.size}`);
        return res.status(416).end();
      }
      options = { start, end };
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
      res.setHeader('Content-Length', end - start + 1);
    } else {
      res.setHeader('Content-Length', file.size);
    }

    // A range request is one read of the same document by the same viewer,
    // paged through: only the first request (no range, or from byte 0) is
    // written to the trail, and only when the unit logs views at all.
    if (viewing.logViews && (!range || range[1] === '' || range[1] === '0')) {
      await recordFileEvent(req, {
        operation: 'document-view',
        serialNo: record.serialNo,
        fileName: file.fileName,
        success: true,
        bytes: file.size,
      });
    }

    const stream = nas.openStream(file.resolved, options);
    stream.on('error', (err) => {
      console.error('NAS stream failed:', err.code || err.message);
      // Headers are already sent by the time a stream fails, so the only
      // honest thing left is to break the response rather than append an
      // error body to a partial file.
      res.destroy(err);
    });
    return stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

/** The serial the next record will get — shown on the upload form, claimed on save. */
async function nextSerial(req, res, next) {
  try {
    res.json({ serialNo: await recordService.peekSerialNo() });
  } catch (error) {
    next(error);
  }
}

// --- uploads -------------------------------------------------------------------------
//
// The desktop system's upload: fill in the record, choose the scan, and the
// file is filed on the Records share under province / years / project /
// permit-type folder (see filingService), the record is numbered and saved.
// Here it is one multipart request: `payload` (the record, as JSON — the
// same shape POST /api/erms/records takes) and `file`.

/** The Records unit's filing rules and the permit type's folder. */
async function fileRecordScan(payload, upload) {
  const unitCfg = await config.unit('records');
  const docType = unitCfg?.docTypes.find((t) => t.code === payload.permit?.type) || unitCfg?.docTypes.find((t) => t.code === 'other') || null;
  return filing.file('records', docType, {
    province: payload.location?.province,
    projectTitle: payload.projectTitle,
    proponentName: payload.proponentName,
    permit: payload.permit || {},
    // The project folder (and subfolder) the clerk chose, when they did —
    // or a folder they browsed to anywhere on the Records share.
    folder: payload.document?.folder || null,
    subfolder: payload.document?.subfolder || null,
    targetPath: payload.document?.targetPath || null,
  }, upload);
}

const uploadFailure = (res, filed) =>
  res.status(['NO_FILE', 'FILE_TYPE', 'FILE_TOO_LARGE'].includes(filed.code) ? 400 : 502).json({ code: filed.code, message: filed.message });

/**
 * An attachment's scan: in the folder the clerk chose, else beside the
 * record's own document (where the desktop system put attachments), else
 * where the record's own scan would have been filed.
 */
async function fileAttachmentScan(parent, payload, upload) {
  const asParent = {
    ...payload,
    location: parent.location,
    projectTitle: parent.projectTitle,
    proponentName: parent.proponentName,
    permit: { ...(payload.permit || {}), dateApproved: parent.permit?.dateApproved || payload.permit?.dateApproved || null },
  };
  const stored = parent.document?.sharePath || parent.document?.filePath;
  // Beside the record's own scan unless the clerk chose a folder (by the
  // project-folder picker or by browsing the share).
  if (!payload.document?.folder && !payload.document?.targetPath && stored) {
    const unitCfg = await config.unit('records');
    const docType = unitCfg?.docTypes.find((t) => t.code === payload.permit?.type) || unitCfg?.docTypes.find((t) => t.code === 'other') || null;
    const beside = await filing.fileBeside('records', docType, stored, upload);
    if (beside.ok || beside.code !== 'NO_FOLDER') return beside;
  }
  return fileRecordScan(asParent, upload);
}

/**
 * The record an upload is to be attached to, within the caller's provinces,
 * or a response already sent. Null (and nothing sent) for a record of its own.
 */
async function parentInScope(req, res, payload) {
  if (!payload.parentSerialNo) return { parent: null };
  const parent = await recordService.getRecord(payload.parentSerialNo, readScope(req));
  if (!parent) {
    res.status(404).json({ code: 'PARENT_NOT_FOUND', message: 'The record to attach to was not found, or is outside your provinces.' });
    return null;
  }
  if (parent.isAttachment) {
    res.status(400).json({ code: 'PARENT_IS_ATTACHMENT', message: `${parent.serialNo} is itself an attachment. Attach to ${parent.parentSerialNo || 'the record it belongs to'} instead.` });
    return null;
  }
  return { parent };
}

/** Create a record and file its scan in one go — or, with `parentSerialNo`, an attachment to one. */
async function uploadRecord(req, res, next) {
  try {
    const payload = await withDefaultClassification(req.validatedPayload);
    const scoped = await parentInScope(req, res, payload);
    if (!scoped) return undefined;
    const { parent } = scoped;
    const refused = await checkAgainstSettings(payload);
    if (refused) return res.status(refused.status).json(refused.body);
    const filed = parent ? await fileAttachmentScan(parent, payload, req.file) : await fileRecordScan(payload, req.file);
    if (!filed.ok) return uploadFailure(res, filed);

    const doc = await recordService.createRecord(
      { ...payload, document: { ...(payload.document || {}), ...filed.document } },
      actor(req)
    );
    await recordFileEvent(req, {
      operation: 'document-upload',
      serialNo: doc.serialNo,
      containerKey: 'records',
      fileName: filed.document.fileName,
      success: true,
      bytes: filed.document.size,
      detail: `records/${doc.permit?.type}`,
    });
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'create',
      label: parent ? `attachment filed against ${parent.serialNo}` : 'record created with scan',
      collection: 'erms-records',
      documentId: doc.serialNo,
      changes: { fileName: filed.document.fileName, sharePath: filed.document.sharePath },
      includeBody: false,
    });
    return res.status(201).json({ record: withoutInternalPaths(doc, principalOf(req)) });
  } catch (error) {
    return next(error);
  }
}

/**
 * File a scan against a record. Three cases, chosen by `replace`:
 *
 *   (absent)    the record has no scan yet — or its scan is not on the share
 *   'missing'   the same, said explicitly
 *   'keep'      re-upload: the new scan replaces the record's document; the
 *               old file stays on the share
 *   'delete'    re-upload, and the old file is removed from the share once
 *               the new one is safely written
 *
 * A record that has a scan on the share is not silently overwritten: without
 * `replace` the answer is 409, and the form asks which of the two the clerk
 * wants. Either way the old file is written to the audit trail by name.
 */
async function attachRecordFile(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

    const replace = String(req.body?.replace || '');
    const container = String(record.document?.container || nas.RECORDS_KEY);
    const stored = record.document?.sharePath || record.document?.filePath;
    let existing = null;
    if (stored) {
      const found = await nas.statFile(stored, container);
      if (found.ok) {
        if (!['keep', 'delete'].includes(replace)) {
          return res.status(409).json({ code: 'HAS_DOCUMENT', message: 'This record already has a scan on the share. Choose whether to keep or delete it when re-uploading.' });
        }
        existing = found;
      }
    }

    // The folder picker's choice, if the clerk made one for the re-upload.
    const folder = nas.safeName(req.body?.folder, 120) || null;
    const subfolder = nas.safeName(req.body?.subfolder, 120) || null;
    const targetPath = nas.safeRelativePath(req.body?.targetPath) || null;
    const filed = await fileRecordScan({ ...record, document: { ...(record.document || {}), folder, subfolder, targetPath } }, req.file);
    if (!filed.ok) return uploadFailure(res, filed);

    const { after: updated } = await recordService.updateRecord(
      record.serialNo,
      { document: { ...filed.document, uploadedAt: new Date(), uploadedBy: principalOf(req)?.username || 'unknown' } },
      actor(req)
    );
    await recordFileEvent(req, {
      operation: 'document-upload',
      serialNo: record.serialNo,
      containerKey: container,
      fileName: filed.document.fileName,
      success: true,
      bytes: filed.document.size,
      detail: existing ? `records/${record.permit?.type} (re-uploaded, replacing ${existing.fileName})` : `records/${record.permit?.type} (attached)`,
    });

    // The old file goes only after the new one is written and the record
    // points at it, so a failure part-way leaves the record whole.
    let oldFile = null;
    if (existing && replace === 'delete') {
      const removed = await nas.removeFile(container, stored);
      oldFile = { fileName: existing.fileName, deleted: removed.ok, reason: removed.ok ? null : removed.reason };
      await recordFileEvent(req, {
        operation: 'document-delete',
        serialNo: record.serialNo,
        containerKey: container,
        fileName: existing.fileName,
        success: removed.ok,
        bytes: removed.size,
        detail: removed.ok ? 'replaced by re-upload' : `could not delete: ${removed.reason}`,
      });
    } else if (existing) {
      oldFile = { fileName: existing.fileName, deleted: false, reason: 'kept' };
    }

    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'update',
      label: existing ? 'scan re-uploaded' : 'scan filed against record',
      collection: 'erms-records',
      documentId: record.serialNo,
      changes: { fileName: filed.document.fileName, sharePath: filed.document.sharePath, previous: oldFile },
      includeBody: false,
    });
    return res.json({ record: withoutInternalPaths(updated, principalOf(req)), previous: oldFile });
  } catch (error) {
    return next(error);
  }
}

// --- lookups (the desktop system's menus) -------------------------------------

/**
 * The menus the forms offer. The address tables are large (3,218 barangays),
 * so they are served per province when one is asked for; the rest come whole.
 */
async function getLookups(req, res, next) {
  try {
    const lists = await lookups.all();
    const province = String(req.query.province || '').trim() || null;
    const { cities, barangays } = await lookups.addresses(province);
    const pick = (kind) => lists[kind]?.items || [];
    res.json({
      projectTypes: pick('project-types'),
      documentStatuses: pick('document-statuses'),
      documentTypes: pick('document-types'),
      legalStatuses: pick('legal-statuses'),
      legalOfficers: pick('legal-officers'),
      caseHandlers: pick('case-handlers'),
      natureOfBusiness: pick('nature-of-business'),
      labParameters: pick('lab-parameters'),
      provinces: pick('provinces'),
      cities,
      barangays,
      importedAt: lists['project-types']?.importedAt || null,
    });
  } catch (error) {
    next(error);
  }
}

/** Records already filed with this permit number or file name — for the form's warning. */
async function duplicateCheck(req, res, next) {
  try {
    const cfg = await unitSettings.forUnit('records');
    const { permitNumber, fileName, exclude } = req.query;
    const duplicates = await findDuplicates(
      { permitNumber: cfg.duplicates.warnOnPermitNumber || cfg.duplicates.blockOnPermitNumber ? permitNumber : null, fileName: cfg.duplicates.warnOnFileName ? fileName : null, exclude },
      readScope(req)
    );
    res.json({ duplicates, blocks: cfg.duplicates.blockOnPermitNumber && duplicates.some((d) => permitNumber && d.permit?.number === permitNumber) });
  } catch (error) {
    next(error);
  }
}

/** Permit numbers filed more than once, for the settings screen's duplicates tab. */
async function duplicateGroups(req, res, next) {
  try {
    const { getDb } = require('../../../config/db');
    const scope = readScope(req);
    const match = { 'permit.number': { $nin: [null, '', 'n/a', 'N/A'] } };
    if (Array.isArray(scope)) match['location.province'] = { $in: scope };
    const groups = await getDb()
      .collection('erms-records')
      .aggregate([
        { $match: match },
        { $group: { _id: '$permit.number', count: { $sum: 1 }, serials: { $push: '$serialNo' }, proponents: { $addToSet: '$proponentName' }, types: { $addToSet: '$permit.type' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 300 },
      ])
      .toArray();
    res.json({ groups: groups.map((g) => ({ permitNumber: g._id, count: g.count, serials: g.serials, proponents: g.proponents, types: g.types })) });
  } catch (error) {
    next(error);
  }
}

async function createRecord(req, res, next) {
  try {
    const payload = await withDefaultClassification(req.body);
    if (!(await parentInScope(req, res, payload))) return undefined;
    const refused = await checkAgainstSettings(payload);
    if (refused) return res.status(refused.status).json(refused.body);
    const doc = await recordService.createRecord(payload, actor(req));
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'Create Record',
      collection: recordService.RECORDS,
      documentId: doc.serialNo,
      label: `Created record ${doc.serialNo}`,
    });
    res.status(201).json({ record: doc });
  } catch (error) {
    next(error);
  }
}

async function updateRecord(req, res, next) {
  try {
    // Only the duplicate rule applies to an edit: a required field left
    // empty on a migrated record is fixed from here, not refused.
    if (req.body?.permit?.number) {
      const cfg = await unitSettings.forUnit('records');
      if (cfg.duplicates.blockOnPermitNumber) {
        const dupes = await findDuplicates({ permitNumber: req.body.permit.number, exclude: req.params.serialNo }, null);
        if (dupes.length) {
          return res.status(409).json({ code: 'DUPLICATE_PERMIT', message: `Permit number ${req.body.permit.number} is already filed as ${dupes.map((d) => d.serialNo).join(', ')}.`, duplicates: dupes });
        }
      }
    }
    const { before, after } = await recordService.updateRecord(
      req.params.serialNo,
      req.body,
      actor(req)
    );
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'Update Record',
      collection: recordService.RECORDS,
      documentId: after.serialNo,
      label: `Updated record ${after.serialNo}`,
      changes: audit.diff(before, req.body),
    });
    res.json({ record: after });
  } catch (error) {
    next(error);
  }
}

async function nextSerial(req, res, next) {
  try {
    // Peeked, not consumed: the real serial is allocated atomically on create.
    res.json({ preview: true, hint: 'The serial is allocated when the record is saved.' });
  } catch (error) {
    next(error);
  }
}

/** Take a record off "Needs review": what is left has been looked at and stands. */
async function markReviewed(req, res, next) {
  try {
    const { before, after } = await recordService.markReviewed(req.params.serialNo, { ...actor(req), note: req.body?.note || null });
    if (before.dataQuality?.clean === false) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'Review Record',
        collection: recordService.RECORDS,
        documentId: after.serialNo,
        label: `Marked record ${after.serialNo} as reviewed`,
        changes: { dataQuality: { from: before.dataQuality.issues || [], to: [] } },
      });
    }
    res.json({ record: withoutInternalPaths(after, principalOf(req)) });
  } catch (error) {
    next(error);
  }
}

// --- the Ref. No. against the scan (services/vera/refNoCheck) ---------------
//
// Seen by whoever may read the record; read, applied or kept by whoever may
// edit it — the same province scope as the edit form, since applying is an
// edit of the record's Ref. No. Reading the scan is one AI model call.

const refNoCheck = require('../../../services/vera/refNoCheck');

/** The record within the caller's read scope (404 otherwise); with `write`, refused outside the write scope too. */
async function recordInScope(req, { write = false } = {}) {
  const record = await recordService.getRecord(req.params.serialNo, readScope(req));
  if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
  const writable = writeScope(req);
  if (write && Array.isArray(writable) && !writable.includes(record.location?.province)) {
    throw forbidden(`You do not have write access to records in ${record.location?.province || 'that province'}.`, 'PROVINCE_FORBIDDEN');
  }
  return record;
}

async function getRefCheck(req, res, next) {
  try {
    await recordInScope(req);
    res.json({ check: await refNoCheck.forRecord(req.params.serialNo) });
  } catch (error) {
    next(error);
  }
}

async function runRefCheck(req, res, next) {
  try {
    await recordInScope(req, { write: true });
    const vera = require('../../../controllers/veraController');
    const result = await refNoCheck.checkOne(await vera.loadConfig(), req.params.serialNo, actor(req).username, { force: req.body?.force === true });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    if (!result.cached) await vera.log(req, 'vera:ref-check', { serialNo: req.params.serialNo, status: result.check.status });
    res.json({ check: result.check });
  } catch (error) {
    next(error);
  }
}

async function settleRefCheck(req, res, next) {
  try {
    await recordInScope(req, { write: true });
    const action = req.params.action;
    const serialNo = req.params.serialNo;
    const result = action === 'apply' ? await refNoCheck.apply(serialNo, actor(req)) : await refNoCheck.settle(serialNo, action, actor(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    if (result.after) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'Update Record',
        collection: recordService.RECORDS,
        documentId: serialNo,
        label: action === 'undo' ? `Ref. No. on ${serialNo} put back (VERA check undone)` : `Ref. No. on ${serialNo} corrected from the scan (VERA)`,
        // The shape audit.diff gives an edit of the permit, so the history reads it alike.
        changes: { permit: { from: { number: result.from || null }, to: { number: result.to || null } } },
      });
    }
    await require('../../../controllers/veraController').log(req, `vera:ref-check:${action}`, { serialNo, from: result.from, to: result.to });
    res.json({ check: await refNoCheck.forRecord(serialNo), record: result.after ? withoutInternalPaths(result.after, principalOf(req)) : undefined });
  } catch (error) {
    next(error);
  }
}

async function dashboard(req, res, next) {
  try {
    res.json(await recordService.dashboardStats(readScope(req)));
  } catch (error) {
    next(error);
  }
}

async function filterOptions(req, res, next) {
  try {
    const options = await recordService.filterOptions(readScope(req));
    res.json({
      ...options,
      trackingActions: trackingService.ACTIONS,
      boxStatuses: archiveService.STATUSES,
      reports: reportService.REPORT_KEYS.map((k) => ({
        key: k,
        label: reportService.REPORTS[k].label,
        description: reportService.REPORTS[k].description,
      })),
      // What this user may do, so the UI does not offer actions the API refuses.
      writableProvinces: writeScope(req),
    });
  } catch (error) {
    next(error);
  }
}

/** Proponents and project titles already on file, for the upload form. */
async function suggest(req, res, next) {
  try {
    res.json({ items: await recordService.suggest(readScope(req), req.query.field, req.query.q, { projectType: req.query.projectType }) });
  } catch (error) {
    next(error);
  }
}

// --- VERA's upload guide (services/vera/uploadGuide) ------------------------
const uploadGuide = require('../../../services/vera/uploadGuide');

/** POST /api/erms/records/vera/guide — VERA's suggestions for the form as it stands. By rule: no model. */
async function veraGuide(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.json({ tips: await uploadGuide.review(body, { allowedProvinces: readScope(req) }) });
  } catch (error) {
    next(error);
  }
}

/** POST /api/erms/records/vera/read-scan — VERA's model reads the scan chosen in the form and suggests the fields. */
async function veraReadScan(req, res, next) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: 'Choose the scan for VERA to read.' });
    const vera = require('../../../controllers/veraController');
    const cfg = await vera.loadConfig();
    // RBAC: an administrator may keep a role on rules alone (VERA settings › roles).
    const { roleOf } = require('../../../services/authorization');
    if (require('../../../services/vera/policy').accessFor(cfg, roleOf(principalOf(req))).model === false) {
      return res.status(403).json({ message: "VERA's AI model is not open to your account type. Her checks above still apply." });
    }
    const result = await uploadGuide.readScan(cfg, req.file.buffer);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await vera.log(req, 'vera:upload-guide:read', { fields: result.suggestions.length, model: result.model, cached: result.cached, bytes: req.file.size });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// --- tracking --------------------------------------------------------------

async function listTracking(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
    res.json({
      tracking: await trackingService.listForRecord(req.params.serialNo, record),
      custody: await trackingService.currentCustody(req.params.serialNo),
    });
  } catch (error) {
    next(error);
  }
}

async function addTracking(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

    const entry = await trackingService.addEntry(req.params.serialNo, req.body, actor(req));
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'Track Record',
      collection: trackingService.TRACKING,
      documentId: req.params.serialNo,
      label: `${entry.actionLabel} — ${req.params.serialNo}`,
    });
    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
}

async function overdueLoans(req, res, next) {
  try {
    res.json({ overdue: await trackingService.overdue(readScope(req)) });
  } catch (error) {
    next(error);
  }
}

// --- archive ---------------------------------------------------------------

async function listBoxes(req, res, next) {
  try {
    res.json({ boxes: await archiveService.listBoxes(req.query, readScope(req)) });
  } catch (error) {
    next(error);
  }
}

async function createBox(req, res, next) {
  try {
    const box = await archiveService.createBox(req.body, actor(req));
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'Create Archive Box',
      collection: archiveService.BOXES,
      documentId: box.code,
      label: `Created box ${box.code}`,
    });
    res.status(201).json({ box });
  } catch (error) {
    next(error);
  }
}

async function updateBox(req, res, next) {
  try {
    const { before, after } = await archiveService.updateBox(
      req.params.code.toUpperCase(),
      req.body,
      actor(req)
    );
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: after.status === 'disposed' ? 'Record Box Disposal' : 'Update Archive Box',
      collection: archiveService.BOXES,
      documentId: after.code,
      label: `${after.status === 'disposed' ? 'Recorded disposal of' : 'Updated'} box ${after.code}`,
      changes: audit.diff(before, req.body),
    });
    res.json({ box: after });
  } catch (error) {
    next(error);
  }
}

async function boxContents(req, res, next) {
  try {
    res.json({
      contents: await archiveService.boxContents(req.params.code, readScope(req)),
    });
  } catch (error) {
    next(error);
  }
}

async function assignToBox(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

    const result = await archiveService.assignRecord(
      req.params.serialNo,
      req.body.boxCode ?? null,
      actor(req)
    );
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'File Record',
      collection: recordService.RECORDS,
      documentId: req.params.serialNo,
      label: result.archive
        ? `Filed ${req.params.serialNo} into box ${result.archive.boxCode}`
        : `Removed ${req.params.serialNo} from its box`,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function disposalDue(req, res, next) {
  try {
    res.json({ boxes: await archiveService.dueForDisposal(readScope(req)) });
  } catch (error) {
    next(error);
  }
}

// --- reports ---------------------------------------------------------------

async function runReport(req, res, next) {
  try {
    const result = await reportService.run(req.params.key, req.query, readScope(req));

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="erms-${result.key}-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(reportService.toCsv(result));
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Move a record's scan to another record — the Developer's or an
 * administrator's. Only which record points at the file changes; the file
 * stays where it is on the share. Recorded against both records.
 */
async function moveRecordFile(req, res, next) {
  try {
    const user = principalOf(req);
    if (!canAccessAllYears(user)) {
      return res.status(403).json({ code: 'MOVE_FORBIDDEN', message: 'Only the Developer or an administrator moves a scan to another record.' });
    }
    const toSerialNo = String(req.body.toSerialNo || '').trim();
    const result = await recordService.moveDocument(req.params.serialNo, toSerialNo, { username: user?.username || 'unknown' });
    for (const [serialNo, label] of [
      [result.from, `scan moved to ${result.to}`],
      [result.to, `scan moved here from ${result.from}`],
    ]) {
      await audit.record(req, { domain: DOMAINS.ERMS, action: 'file-moved', label, collection: recordService.RECORDS, documentId: serialNo, changes: { fileName: result.fileName, from: result.from, to: result.to }, includeBody: false });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/** VERA's suggestions for where a record's scan belongs. */
async function moveRecordFileSuggestions(req, res, next) {
  try {
    if (!canAccessAllYears(principalOf(req))) return res.status(403).json({ code: 'MOVE_FORBIDDEN', message: 'Only the Developer or an administrator moves a scan to another record.' });
    res.json(await recordService.moveSuggestions(req.params.serialNo, readScope(req)));
  } catch (error) {
    next(error);
  }
}

/** The Document Library as an Excel workbook: the list's filters, every field. */
async function exportRecords(req, res, next) {
  try {
    const user = principalOf(req);
    const { buffer, count, truncated } = await require('../services/exportService').recordsWorkbook(req.query, readScope(req), { developer: isDeveloper(user) });
    await audit.record(req, { domain: DOMAINS.ERMS, action: 'export', label: `Document Library exported (${count} records)`, collection: recordService.RECORDS, changes: { filters: req.query, count }, includeBody: false });
    const name = `ERMS-Records-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('X-Export-Rows', String(count));
    res.setHeader('X-Export-Truncated', truncated ? '1' : '0');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Rows, X-Export-Truncated');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(buffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  exportRecords,
  moveRecordFile,
  moveRecordFileSuggestions,
  listRecords,
  getRecord,
  getRecordFileInfo,
  viewRecordFile,
  uploadRecord,
  attachRecordFile,
  markReviewed,
  getRefCheck,
  runRefCheck,
  settleRefCheck,
  nextSerial,
  getLookups,
  duplicateCheck,
  duplicateGroups,
  createRecord,
  updateRecord,
  nextSerial,
  dashboard,
  filterOptions,
  suggest,
  veraGuide,
  veraReadScan,
  listTracking,
  addTracking,
  overdueLoans,
  listBoxes,
  createBox,
  updateBox,
  boxContents,
  assignToBox,
  disposalDue,
  runReport,
};
