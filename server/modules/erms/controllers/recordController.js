const recordService = require('../services/recordService');
const trackingService = require('../services/trackingService');
const archiveService = require('../services/archiveService');
const reportService = require('../services/reportService');
const audit = require('../../../shared/services/audit');
const { principalOf } = require('../../../middleware/auth');
const { canAccessAllYears, DOMAINS } = require('../../../services/authorization');
const { userProvinceKeys, userWritableProvinceKeys } = require('../../../services/provinces');
const { notFoundError } = require('../../../shared/middleware/errorHandler');

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

    res.json({ record, attachments, tracking, custody });
  } catch (error) {
    next(error);
  }
}

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
