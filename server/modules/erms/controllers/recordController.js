const recordService = require('../services/recordService');
const trackingService = require('../services/trackingService');
const archiveService = require('../services/archiveService');
const reportService = require('../services/reportService');
const audit = require('../../../shared/services/audit');
const { principalOf } = require('../../../middleware/auth');
const { canAccessAllYears, isDeveloper, DOMAINS } = require('../../../services/authorization');
const { userProvinceKeys, userWritableProvinceKeys } = require('../../../services/provinces');
const { notFoundError } = require('../../../shared/middleware/errorHandler');
const nas = require('../../../services/nasStorage');
const storageAccess = require('../../../services/storageAccess');
const { recordFileEvent } = require('../../../services/nasAudit');

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
    res.json(await recordService.listRecords(req.query, readScope(req)));
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
      trackingService.listForRecord(record.serialNo),
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
  const granted = await storageAccess.grantedContainers(principalOf(req));
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

  return { record, file };
}

/** Metadata only — lets the UI show size and type without fetching the file. */
async function getRecordFileInfo(req, res, next) {
  try {
    const resolved = await resolveRecordFile(req, res);
    if (!resolved) return undefined;
    const { record, file } = resolved;
    return res.json({
      serialNo: record.serialNo,
      fileName: file.fileName,
      size: file.size,
      contentType: file.contentType,
      previewable: file.previewable,
      modifiedAt: file.modifiedAt,
      fileClass: record.document?.fileClass || null,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Stream the document.
 *
 * Streamed rather than read into memory: these are scans, some are large, and
 * buffering them would put the whole file in the server's heap per concurrent
 * reader. Range requests are honoured so a PDF viewer can page through a large
 * document without pulling all of it.
 */
async function streamRecordFile(req, res, next, { disposition }) {
  try {
    const resolved = await resolveRecordFile(req, res);
    if (!resolved) return undefined;
    const { record, file } = resolved;

    // The stored name can contain commas, quotes and non-ASCII; both forms are
    // sent so every browser gets one it can parse.
    const safeName = file.fileName.replace(/["\\]/g, '_');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    );
    res.setHeader('Accept-Ranges', 'bytes');
    // Documents are not public and must not be cached by an intermediary.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

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

    await recordFileEvent(req, {
      operation: disposition === 'attachment' ? 'document-download' : 'document-view',
      serialNo: record.serialNo,
      fileName: file.fileName,
      success: true,
      bytes: file.size,
    });

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

const viewRecordFile = (req, res, next) => streamRecordFile(req, res, next, { disposition: 'inline' });
const downloadRecordFile = (req, res, next) =>
  streamRecordFile(req, res, next, { disposition: 'attachment' });

async function createRecord(req, res, next) {
  try {
    const doc = await recordService.createRecord(req.body, actor(req));
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
    });
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
      tracking: await trackingService.listForRecord(req.params.serialNo),
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
  downloadRecordFile,
  createRecord,
  updateRecord,
  nextSerial,
  dashboard,
  filterOptions,
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
