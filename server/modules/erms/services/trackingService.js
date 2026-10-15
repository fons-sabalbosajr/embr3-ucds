const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest } = require('../../../shared/middleware/errorHandler');
const shareTrail = require('./shareTrail');

// ---------------------------------------------------------------------------
// Records tracking — where a record went and who holds it.
//
// Append-only by design. A custody trail that can be edited is not a custody
// trail; a mistake is corrected by recording the correction, not by rewriting
// history. There is deliberately no update or delete here.
//
// Distinct from the audit trail in shared/services/audit.js, which records
// which fields a request changed. This is business history.
// ---------------------------------------------------------------------------

const TRACKING = 'erms-tracking';
const RECORDS = 'erms-records';

const collection = () => getDb().collection(TRACKING);

/**
 * The movements a record can undergo. `holds` says whether the actor ends up
 * in possession, which is what drives the current-custody calculation.
 */
const ACTIONS = [
  { code: 'received', label: 'Received', holds: true },
  { code: 'released', label: 'Released', holds: false },
  { code: 'forwarded', label: 'Forwarded', holds: false },
  { code: 'returned', label: 'Returned', holds: true },
  { code: 'borrowed', label: 'Borrowed', holds: false },
  { code: 'retrieved', label: 'Retrieved from archive', holds: true },
  { code: 'archived', label: 'Archived', holds: true },
  { code: 'corrected', label: 'Correction note', holds: null },
];

const ACTION_CODES = ACTIONS.map((a) => a.code);
const byCode = new Map(ACTIONS.map((a) => [a.code, a]));

// The desktop system's own trail, loaded from its SQL tables by
// scripts/migrate-erms/legacy-sql/load.js: tb_filelogs (who viewed, modified,
// requested or replaced a file — keyed by permit number and file name) and
// tb_file_history (each upload, with its classification and size — keyed by
// file name). They are read alongside the custody trail kept here, so a
// record's history does not begin on the day it was migrated.
const LEGACY_LOGS = 'legacy-erms-records-filelogs';
const LEGACY_HISTORY = 'legacy-erms-records-file-history';

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ recordSerialNo: 1, createdAt: -1 });
  await collection().createIndex({ createdAt: -1 });
  await collection().createIndex({ action: 1 });
  // The legacy tables are looked up per record; without these each open of
  // a record scans 16,000 rows twice.
  await getDb().collection(LEGACY_LOGS).createIndex({ Permit_Number: 1 });
  await getDb().collection(LEGACY_LOGS).createIndex({ File_Modified: 1 });
  await getDb().collection(LEGACY_HISTORY).createIndex({ File_Name: 1 });
}

/**
 * A date as the desktop system wrote it: "3/1/2022 2:03:34 PM",
 * "Sep 30 2022 10:23AM", "Dec 09 2021 1:04:49 PM". Null when unreadable.
 */
function legacyDate(raw) {
  const text = String(raw || '').trim().replace(/(\d)(AM|PM)$/i, '$1 $2');
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** What the desktop system called the action, as a custody-style entry. */
function legacyAction(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (/^view/i.test(t)) return { action: 'legacy-viewed', actionLabel: 'Viewed' };
  if (/^requested/i.test(t)) return { action: 'legacy-requested', actionLabel: 'Requested' };
  if (/^replace/i.test(t)) return { action: 'legacy-replaced', actionLabel: 'File replaced' };
  if (/^add attachment/i.test(t)) return { action: 'legacy-attached', actionLabel: 'Attachment added' };
  if (/^modified/i.test(t)) return { action: 'legacy-modified', actionLabel: 'Modified' };
  return { action: 'legacy-other', actionLabel: t.slice(0, 60) || 'Activity' };
}

/**
 * The desktop system's events for a record: file-log rows for its permit
 * number or its file name, and the upload history for its file name.
 */
async function legacyEvents(record) {
  await connectToMongo();
  const permitNumber = record?.permit?.number || null;
  const fileName = record?.document?.fileName || null;
  if (!permitNumber && !fileName) return [];

  const logFilter = { $or: [] };
  if (permitNumber) logFilter.$or.push({ Permit_Number: permitNumber });
  if (fileName) logFilter.$or.push({ File_Modified: fileName });
  const [logs, history] = await Promise.all([
    getDb().collection(LEGACY_LOGS).find(logFilter).limit(500).toArray(),
    fileName ? getDb().collection(LEGACY_HISTORY).find({ File_Name: fileName }).limit(200).toArray() : [],
  ]);

  const events = [];
  for (const row of logs) {
    const { action, actionLabel } = legacyAction(row.Function_Performed);
    events.push({
      source: 'legacy',
      action,
      actionLabel,
      fromParty: null,
      toParty: null,
      purpose: String(row.Function_Performed || '').replace(/\s+/g, ' ').trim() || null,
      remarks: row.File_Modified ? `File: ${row.File_Modified}` : null,
      dueDate: null,
      createdAt: legacyDate(row.Date),
      createdAtRaw: row.Date || null,
      createdBy: row.Name || row.User_No || 'desktop system',
      loginAs: row.Login_as || null,
      ipAddress: row.IP_Address || null,
    });
  }
  for (const row of history) {
    events.push({
      source: 'legacy',
      action: 'legacy-uploaded',
      actionLabel: 'Uploaded',
      fromParty: null,
      toParty: null,
      purpose: [row.Classification ? `Classified ${row.Classification}` : null, row.File_Size ? `${row.File_Size}` : null].filter(Boolean).join(' · ') || null,
      remarks: row.File_Name ? `File: ${row.File_Name}` : null,
      dueDate: null,
      createdAt: legacyDate(row.Date_Uploaded),
      createdAtRaw: row.Date_Uploaded || null,
      createdBy: row.User_Name || row.Accessed_by || 'desktop system',
      loginAs: null,
      ipAddress: null,
    });
  }
  return events;
}

/**
 * How the record was shared through the Document Portal (shareTrail), as
 * entries on its trail: who asked, who approved or declined it and for how
 * long, access changed or withdrawn, every time the requester opened it.
 */
async function shareEntries(serialNo) {
  const events = await shareTrail.shareEvents('records', serialNo);
  return events.map((e) => ({
    _id: e.id,
    source: 'portal',
    action: e.action,
    actionLabel: e.label,
    fromParty: null,
    toParty: null,
    purpose: e.detail,
    remarks: null,
    dueDate: null,
    createdAt: e.at instanceof Date ? e.at : new Date(e.at),
    createdBy: e.who,
  }));
}

/**
 * Everything that happened to a record, newest first: the custody trail kept
 * here, how it was shared, and, when `record` is given, the desktop system's
 * events for it.
 */
// What happened to the record and its scan in E-Universe, from the activity
// log: filed, edited, the scan uploaded, replaced, viewed, refused, moved.
// The custody trail ("Track Record") is already here in full, and the
// Document Portal's events come with the sharing entries.
const FILE_LABELS = {
  'document-view': 'Scan viewed',
  'document-read': 'Scan view refused',
  'document-upload': 'Scan uploaded',
  'document-delete': 'Scan deleted from the share',
  'Create Record': 'Record created',
  'File Record': 'Record filed with its scan',
  'Update Record': 'Record edited',
  create: 'Record created',
  update: 'Record edited',
  'file-moved': 'Scan moved',
  'attachment-filed': 'Attachment filed',
};

async function fileEntries(serialNo) {
  const rows = await getDb()
    .collection('app-logs')
    .find(
      {
        $or: [
          { domain: 'nas', serialNo, operation: { $nin: ['portal-view', 'portal-download'] } },
          { domain: 'erms', documentId: serialNo, actionType: { $nin: ['Track Record', 'search'] } },
        ],
      },
      { projection: { requestData: 0, userAgent: 0 } }
    )
    .sort({ timestamp: -1 })
    .limit(300)
    .toArray();
  return rows.map((r) => {
    const code = r.domain === 'nas' ? r.operation : r.actionType;
    const detail = [r.fileName, r.detail, r.actionLabel && !FILE_LABELS[code] ? r.actionLabel : null, r.success === false ? 'failed' : null].filter(Boolean).join(' · ');
    return {
      _id: String(r._id),
      source: 'activity',
      action: code,
      actionLabel: r.domain === 'erms' && code === 'file-moved' ? r.actionLabel || FILE_LABELS[code] : FILE_LABELS[code] || r.actionLabel || code,
      fromParty: null,
      toParty: null,
      purpose: detail || null,
      remarks: null,
      dueDate: null,
      createdAt: r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp),
      createdBy: r.username || null,
    };
  });
}

async function listForRecord(serialNo, record = null) {
  await connectToMongo();
  const [own, shared, activity] = await Promise.all([
    collection().find({ recordSerialNo: serialNo }).sort({ createdAt: -1 }).toArray(),
    shareEntries(serialNo),
    fileEntries(serialNo),
  ]);
  const native = own.map((e) => ({ ...e, source: 'custody' }));
  const legacy = record ? await legacyEvents(record) : [];
  const time = (e) => (e.createdAt instanceof Date ? e.createdAt.getTime() : 0);
  return [...native, ...shared, ...activity, ...legacy].sort((a, b) => time(b) - time(a));
}

/**
 * Who currently holds the record: the most recent entry whose action implies
 * possession. A correction note carries no custody meaning and is skipped.
 */
async function currentCustody(serialNo) {
  await connectToMongo();
  const entries = await collection()
    .find({ recordSerialNo: serialNo })
    .sort({ createdAt: -1 })
    .toArray();

  for (const entry of entries) {
    const action = byCode.get(entry.action);
    if (!action || action.holds === null) continue;
    return action.holds
      ? { heldBy: entry.toParty || entry.createdBy, since: entry.createdAt, action: entry.action }
      : { heldBy: entry.toParty || null, since: entry.createdAt, action: entry.action, released: true };
  }
  return null;
}

/**
 * `unit`: a Legal Services or Laboratory document's trail rather than a
 * record's — the same movements, in the same collection, marked with the
 * unit (their serials never collide with the Records Unit's FSNs).
 */
async function addEntry(serialNo, input, { username }, { unit } = {}) {
  await connectToMongo();

  const record = unit
    ? await getDb().collection('erms-documents').findOne({ unit, serialNo }, { projection: { serialNo: 1 } })
    : await getDb().collection(RECORDS).findOne({ serialNo }, { projection: { serialNo: 1 } });
  if (!record) throw notFoundError(unit ? 'Document not found.' : 'Record not found.', unit ? 'DOCUMENT_NOT_FOUND' : 'RECORD_NOT_FOUND');
  if (!ACTION_CODES.includes(input.action)) throw badRequest('Unknown tracking action.');

  const entry = {
    recordSerialNo: serialNo,
    ...(unit ? { unit } : {}),
    action: input.action,
    actionLabel: byCode.get(input.action).label,
    fromParty: input.fromParty || null,
    toParty: input.toParty || null,
    purpose: input.purpose || null,
    remarks: input.remarks || null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    createdAt: new Date(),
    createdBy: username,
  };

  await collection().insertOne(entry);
  return entry;
}

/** Records out on loan past their due date. */
async function overdue(allowedProvinces) {
  await connectToMongo();
  const loans = await collection()
    .find({ action: 'borrowed', dueDate: { $ne: null, $lt: new Date() } })
    .sort({ dueDate: 1 })
    .toArray();
  if (!loans.length) return [];

  // A loan is only outstanding if nothing later brought the record back.
  const results = [];
  for (const loan of loans) {
    const later = await collection().findOne({
      recordSerialNo: loan.recordSerialNo,
      createdAt: { $gt: loan.createdAt },
      action: { $in: ['returned', 'received', 'retrieved', 'archived'] },
    });
    if (later) continue;

    const filter = { serialNo: loan.recordSerialNo };
    if (Array.isArray(allowedProvinces)) filter['location.province'] = { $in: allowedProvinces };
    const record = await getDb()
      .collection(RECORDS)
      .findOne(filter, { projection: { serialNo: 1, proponentName: 1, projectTitle: 1, location: 1 } });
    if (record) results.push({ ...loan, record });
  }
  return results;
}

/** A Legal or Laboratory document's custody trail, newest first. */
async function listForUnitDocument(serialNo) {
  await connectToMongo();
  return (await collection().find({ recordSerialNo: serialNo }).sort({ createdAt: -1 }).toArray()).map((e) => ({ ...e, source: 'custody' }));
}

module.exports = {
  listForUnitDocument,
  TRACKING,
  ACTIONS,
  ACTION_CODES,
  ensureIndexes,
  listForRecord,
  legacyEvents,
  currentCustody,
  addEntry,
  overdue,
};
