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
const { canAccessAllYears, isDeveloper, roleOf, ROLE_LABELS, DOMAINS } = require('../../../services/authorization');
const { connectToMongo, ObjectId } = require('../../../config/db');
const { userProvinceKeys, userWritableProvinceKeys } = require('../../../services/provinces');
const { notFoundError } = require('../../../shared/middleware/errorHandler');
const nas = require('../../../services/nasStorage');
const storageAccess = require('../../../services/storageAccess');
const { recordFileEvent } = require('../../../services/nasAudit');
const unitSettings = require('../services/unitSettingsService');
const { PDFDocument } = require('pdf-lib');

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
 * N pages and the rest withheld — for the Records Unit's own staff and for
 * anyone viewing by approval alike. Not limited: the Developer and
 * administrators, someone the Records Unit approved for every page, and the
 * unit's staff when the unit exempted them.
 */
async function viewingRules(user, permission = null) {
  const cfg = await unitSettings.forUnit('records');
  const own = accessRequests.isRecordsUnit(user);
  // An approval the Records Unit marked "every page" lifts the limit for
  // the person it names.
  const fullAccess = permission?.request?.fullAccess === true;
  const limited =
    cfg.pdfViewing.previewPageLimit > 0 && !fullAccess && !canAccessAllYears(user) && !(own && cfg.pdfViewing.exemptUnit);
  return {
    pageLimit: limited ? cfg.pdfViewing.previewPageLimit : 0,
    blurWithheldPages: cfg.pdfViewing.blurWithheldPages,
    hideToolbar: cfg.pdfViewing.hideToolbar,
    watermark: cfg.privacy.watermarkViewer ? `${user?.name || user?.username || 'viewer'} · ${new Date().toLocaleDateString()}` : null,
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

  // Who may open it: the Records Unit, or someone the Records Unit has
  // approved for this record and this period. Everyone else is told how to
  // ask, and the refusal is in the audit trail like any other.
  const permission = await accessRequests.viewPermission(principalOf(req), record.serialNo);
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
      request: permission.request,
      message:
        permission.reason === 'pending'
          ? 'Your request to view this document is waiting for the Records Unit.'
          : 'Viewing this document needs the approval of the Records Unit. Send a request from this record.',
    });
    return null;
  }

  // The Records Unit's approval is the grant for the person it names: a
  // Planning Admin or an Encoder is never designated a container (the NAS is
  // not their job), and the approval opens exactly one record's document
  // for a period. The container designation applies to everyone who views
  // by right rather than by approval.
  const granted = permission.reason === 'approved' ? [{ key: containerKey }] : await storageAccess.grantedContainers(principalOf(req));
  if (!granted.some((c) => c.key === containerKey)) {
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
    const viewing = await viewingRules(principalOf(req), permission);
    return res.json({
      serialNo: record.serialNo,
      fileName: file.fileName,
      size: file.size,
      contentType: file.contentType,
      previewable: file.previewable,
      modifiedAt: file.modifiedAt,
      fileClass: record.document?.fileClass || null,
      // View-only for everyone; the approval, when that is what lets this
      // person in, so the screen can show when it lapses.
      downloadable: false,
      access: { reason: permission.reason, expiresAt: permission.request?.expiresAt || null, fullAccess: permission.request?.fullAccess === true, fullAccessRequested: permission.request?.fullAccessRequested === true && permission.request?.status === 'pending', fullAccessRequestedAt: viewing.pageLimit > 0 ? await require('./unitController').fullRequestAt(principalOf(req), record.serialNo) : null },
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
    const viewing = await viewingRules(principalOf(req), permission);

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
      const whole = await new Promise((resolve, reject) => {
        const chunks = [];
        nas.openStream(file.resolved).on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
      });
      let out = whole;
      let total = null;
      try {
        const src = await PDFDocument.load(whole, { ignoreEncryption: true });
        total = src.getPageCount();
        if (total > viewing.pageLimit) {
          const cut = await PDFDocument.create();
          const pages = await cut.copyPages(src, Array.from({ length: viewing.pageLimit }, (_, i) => i));
          for (const p of pages) cut.addPage(p);
          out = Buffer.from(await cut.save());
        }
      } catch (err) {
        // A PDF pdf-lib cannot read is served whole rather than not at all;
        // the viewer then knows no page count and applies no limit.
        console.warn('PDF page limit not applied:', err.message);
      }
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
    // The project folder (and subfolder) the clerk chose, when they did.
    folder: payload.document?.folder || null,
    subfolder: payload.document?.subfolder || null,
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
  if (!payload.document?.folder && stored) {
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
    const filed = await fileRecordScan({ ...record, document: { ...(record.document || {}), folder, subfolder } }, req.file);
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

// --- document access requests ----------------------------------------------

/** Ask the Records Unit to open one record's document for the caller. */
async function requestDocumentAccess(req, res, next) {
  try {
    // The record must be readable by this person at all — province scope —
    // before they may ask for its document.
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
    const result = await accessRequests.create(record.serialNo, principalOf(req), req.body || {});
    if (result.created) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'access-request',
        label: 'document access requested',
        collection: accessRequests.COLLECTION,
        documentId: result.request.id,
        changes: { serialNo: record.serialNo, reason: result.request.reason },
      });
    }
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Share a record's document with a named person (Records Unit): an approval
 * granted without a request. The recipient is read from the users
 * collection now, so the share names the account as it is today.
 */
async function shareDocument(req, res, next) {
  try {
    const record = await recordService.getRecord(req.params.serialNo, readScope(req));
    if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
    const { collections } = await connectToMongo();
    const target = ObjectId.isValid(String(req.body?.userId || ''))
      ? await collections.users.findOne({ _id: new ObjectId(String(req.body.userId)) }, { projection: { username: 1, name: 1, division: 1, permission: 1 } })
      : null;
    if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'No account with that id.' });
    const result = await accessRequests.share(record.serialNo, principalOf(req), { ...target, userId: String(target._id) }, req.body || {});
    if (result.created && (await unitSettings.forUnit('records')).auditing.logShares) {
      await audit.record(req, {
        domain: DOMAINS.ERMS,
        action: 'access-decision',
        label: 'document shared',
        collection: accessRequests.COLLECTION,
        documentId: result.request.id,
        changes: { serialNo: record.serialNo, with: target.username, expiresAt: result.request.expiresAt },
      });
    }
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    return next(error);
  }
}

/** People a document can be shared with: any account but the caller's own. Records Unit only. */
async function sharePeople(req, res, next) {
  try {
    const user = principalOf(req);
    if (!accessRequests.isRecordsUnit(user)) return res.status(403).json({ code: 'RECORDS_UNIT_ONLY', message: 'Only the Records Unit shares documents.' });
    const q = String(req.query.q || '').trim();
    const { collections } = await connectToMongo();
    const filter = { username: { $ne: user.username } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { username: rx }, { division: rx }, { email: rx }];
    }
    const people = await collections.users
      .find(filter, { projection: { username: 1, name: 1, division: 1, permission: 1 } })
      .sort({ name: 1 })
      .limit(25)
      .toArray();
    res.json({
      people: people.map((p) => ({ userId: String(p._id), username: p.username, name: p.name, division: p.division || null, roleLabel: ROLE_LABELS[roleOf(p)] })),
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

/** The inbox: everything for the Records Unit, one's own for anyone else. */
async function listAccessRequests(req, res, next) {
  try {
    const user = principalOf(req);
    const [requests, pending] = await Promise.all([
      accessRequests.list(user, req.query),
      accessRequests.pendingCount(user),
    ]);
    res.json({
      requests,
      pending,
      canDecide: accessRequests.isRecordsUnit(user),
      durations: accessRequests.DURATION_HOURS,
      defaultDuration: accessRequests.DEFAULT_DURATION_HOURS,
    });
  } catch (error) {
    next(error);
  }
}

/** Approve or decline (Records Unit). */
async function decideAccessRequest(req, res, next) {
  try {
    const request = await accessRequests.decide(req.params.id, principalOf(req), req.body || {});
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'access-decision',
      label: `document access ${request.status}`,
      collection: accessRequests.COLLECTION,
      documentId: request.id,
      changes: { serialNo: request.serialNo, for: request.requestedBy?.username, status: request.status, expiresAt: request.expiresAt },
    });
    res.json({ request });
  } catch (error) {
    next(error);
  }
}

/** Take an approval back early (Records Unit). */
async function revokeAccessRequest(req, res, next) {
  try {
    const request = await accessRequests.revoke(req.params.id, principalOf(req), req.body || {});
    await audit.record(req, {
      domain: DOMAINS.ERMS,
      action: 'access-decision',
      label: 'document access revoked',
      collection: accessRequests.COLLECTION,
      documentId: request.id,
      changes: { serialNo: request.serialNo, for: request.requestedBy?.username, status: request.status },
    });
    res.json({ request });
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
      canShare: accessRequests.isRecordsUnit(principalOf(req)),
    });
  } catch (error) {
    next(error);
  }
}

/** Proponents and project titles already on file, for the upload form. */
async function suggest(req, res, next) {
  try {
    res.json({ items: await recordService.suggest(readScope(req), req.query.field, req.query.q) });
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

module.exports = {
  listRecords,
  getRecord,
  getRecordFileInfo,
  viewRecordFile,
  uploadRecord,
  attachRecordFile,
  nextSerial,
  getLookups,
  requestDocumentAccess,
  shareDocument,
  sharePeople,
  duplicateCheck,
  duplicateGroups,
  listAccessRequests,
  decideAccessRequest,
  revokeAccessRequest,
  createRecord,
  updateRecord,
  nextSerial,
  dashboard,
  filterOptions,
  suggest,
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
