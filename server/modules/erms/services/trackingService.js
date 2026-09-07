const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest } = require('../../../shared/middleware/errorHandler');

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

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ recordSerialNo: 1, createdAt: -1 });
  await collection().createIndex({ createdAt: -1 });
  await collection().createIndex({ action: 1 });
}

async function listForRecord(serialNo) {
  await connectToMongo();
  return collection().find({ recordSerialNo: serialNo }).sort({ createdAt: -1 }).toArray();
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

async function addEntry(serialNo, input, { username }) {
  await connectToMongo();

  const record = await getDb().collection(RECORDS).findOne({ serialNo }, { projection: { serialNo: 1 } });
  if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
  if (!ACTION_CODES.includes(input.action)) throw badRequest('Unknown tracking action.');

  const entry = {
    recordSerialNo: serialNo,
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

module.exports = {
  TRACKING,
  ACTIONS,
  ACTION_CODES,
  ensureIndexes,
  listForRecord,
  currentCustody,
  addEntry,
  overdue,
};
