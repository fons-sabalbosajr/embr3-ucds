const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest, forbidden } = require('../../../shared/middleware/errorHandler');
const { roleOf, ROLES, isDeveloper } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// Who may open a scanned document, and the approvals that let others.
//
// The rule, set by the office:
//
//   * Nobody downloads. Documents are viewed in the browser and never handed
//     over as a file — the download endpoint is gone, and the viewer is told
//     to hide its save button. (A browser cannot be stopped from saving what
//     it displays; the rule removes the invitation, and every view is in the
//     audit trail with the account.)
//   * The Records Unit views. A Records Admin, or the Developer, opens any
//     document whose record they can read.
//   * Everyone else asks. A Planning Admin or any other ERMS user sends a
//     request against the record; a Records Admin approves it for a period,
//     or declines it. An approval opens that one record's document for that
//     one person until it expires. Nothing is granted by default.
//
// The approval is a document in its own collection rather than a flag on the
// record, so the record does not change hands when it is looked at, the
// history of who asked and who allowed is kept, and an approval can lapse on
// a clock without anyone remembering to take it back.
// ---------------------------------------------------------------------------

const COLLECTION = 'erms-access-requests';
const RECORDS = 'erms-records';

const STATUSES = ['pending', 'approved', 'denied', 'revoked'];
// What a Records Admin may grant, in hours. The default is a working day.
const DURATION_HOURS = [4, 8, 24, 72, 168];
const DEFAULT_DURATION_HOURS = 8;

const collection = () => getDb().collection(COLLECTION);

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ serialNo: 1, 'requestedBy.userId': 1, status: 1 });
  await collection().createIndex({ status: 1, requestedAt: -1 });
  await collection().createIndex({ 'requestedBy.userId': 1, requestedAt: -1 });
  await collection().createIndex({ expiresAt: 1 });
}

/** The Records Unit: the people who view without asking and decide for others. */
const isRecordsUnit = (user) => isDeveloper(user) || roleOf(user) === ROLES.RECORDS;

const who = (user) => ({
  userId: user?.userId ? String(user.userId) : null,
  username: user?.username || null,
  name: user?.name || null,
  division: user?.division || null,
  role: roleOf(user),
});

/**
 * Whether `user` may open the document filed against `serialNo` right now.
 *
 * Returns { allowed, reason, request } — `request` is the person's latest
 * request on the record when there is one, so a refusal can say "pending
 * since Tuesday" rather than "no".
 */
async function viewPermission(user, serialNo) {
  if (isRecordsUnit(user)) return { allowed: true, reason: 'records-unit', request: null };

  await connectToMongo();
  const now = new Date();
  const mine = await collection()
    .find({ serialNo, 'requestedBy.userId': who(user).userId })
    .sort({ requestedAt: -1 })
    .limit(5)
    .toArray();

  const approved = mine.find((r) => r.status === 'approved' && r.expiresAt && r.expiresAt > now);
  if (approved) return { allowed: true, reason: 'approved', request: publicView(approved) };

  const pending = mine.find((r) => r.status === 'pending');
  if (pending) return { allowed: false, reason: 'pending', request: publicView(pending) };

  const latest = mine[0] ? publicView(mine[0]) : null;
  return { allowed: false, reason: latest ? latest.status : 'none', request: latest };
}

/**
 * Ask for access to one record's document. One open request per person per
 * record: asking twice returns the request already waiting.
 */
async function create(serialNo, user, { reason, full } = {}) {
  await connectToMongo();
  if (isRecordsUnit(user)) throw badRequest('The Records Unit does not need to request access.', 'NOT_NEEDED');
  const wantsFull = full === true || full === 'true';

  const record = await getDb().collection(RECORDS).findOne({ serialNo }, { projection: { serialNo: 1, proponentName: 1, 'document.fileName': 1, 'document.container': 1 } });
  if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

  const requester = who(user);
  const now = new Date();
  // One open request per person per record — except that someone holding a
  // limited approval may still ask for the whole document.
  const existing = await collection().findOne({
    serialNo,
    'requestedBy.userId': requester.userId,
    $or: [{ status: 'pending' }, { status: 'approved', expiresAt: { $gt: now } }],
  });
  if (existing && !(wantsFull && existing.status === 'approved' && !existing.fullAccess)) return { request: publicView(existing), created: false };

  const doc = {
    serialNo,
    proponentName: record.proponentName || null,
    fileName: record.document?.fileName || null,
    container: record.document?.container || 'records',
    requestedBy: requester,
    reason: String(reason || '').trim().slice(0, 500) || (wantsFull ? 'The whole document.' : null),
    // Asked to see every page, not the first few the unit's rule allows.
    fullAccessRequested: wantsFull,
    fullAccess: false,
    requestedAt: now,
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    expiresAt: null,
  };
  const { insertedId } = await collection().insertOne(doc);
  return { request: publicView({ ...doc, _id: insertedId }), created: true };
}

/**
 * Share: the Records Unit opens a record's document for a named person
 * without waiting to be asked. The same thing as a request approved on the
 * spot — one document in the same collection, the same clock, revocable the
 * same way, listed in the same inbox — so sharing and requesting are one
 * process seen from either end. A person who already holds an open approval
 * for the record is not given a second one.
 */
async function share(serialNo, user, target, { durationHours, note, fullAccess } = {}) {
  await connectToMongo();
  if (!isRecordsUnit(user)) throw forbidden('Only the Records Unit shares documents.', 'RECORDS_UNIT_ONLY');
  if (!target?.userId) throw badRequest('Choose who to share with.', 'TARGET_REQUIRED');
  if (String(target.userId) === String(user.userId)) throw badRequest('You already hold this document.', 'NOT_NEEDED');

  const record = await getDb().collection(RECORDS).findOne({ serialNo }, { projection: { serialNo: 1, proponentName: 1, 'document.fileName': 1, 'document.container': 1 } });
  if (!record) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

  const hours = Number(durationHours || DEFAULT_DURATION_HOURS);
  if (!DURATION_HOURS.includes(hours)) throw badRequest(`Duration must be one of ${DURATION_HOURS.join(', ')} hours.`);

  const now = new Date();
  const recipient = who(target);
  const existing = await collection().findOne({ serialNo, 'requestedBy.userId': recipient.userId, status: 'approved', expiresAt: { $gt: now } });
  if (existing) return { request: publicView(existing), created: false };

  // A pending request from the same person is answered by the share.
  await collection().updateMany(
    { serialNo, 'requestedBy.userId': recipient.userId, status: 'pending' },
    { $set: { status: 'approved', decidedBy: who(user), decidedAt: now, decisionNote: 'Shared by the Records Unit.', expiresAt: new Date(now.getTime() + hours * 3600000), fullAccess: fullAccess === true } }
  );
  const answered = await collection().findOne({ serialNo, 'requestedBy.userId': recipient.userId, status: 'approved', expiresAt: { $gt: now } });
  if (answered) return { request: publicView(answered), created: false };

  const doc = {
    serialNo,
    proponentName: record.proponentName || null,
    fileName: record.document?.fileName || null,
    container: record.document?.container || 'records',
    requestedBy: recipient,
    reason: null,
    requestedAt: now,
    status: 'approved',
    shared: true,
    // Every page, or the first few the unit's rule allows.
    fullAccess: fullAccess === true,
    decidedBy: who(user),
    decidedAt: now,
    decisionNote: String(note || '').trim().slice(0, 500) || 'Shared by the Records Unit.',
    expiresAt: new Date(now.getTime() + hours * 3600000),
  };
  const { insertedId } = await collection().insertOne(doc);
  return { request: publicView({ ...doc, _id: insertedId }), created: true };
}

/**
 * Approve or decline. Only the Records Unit; only a pending request. An
 * approval runs from now for `durationHours`, computed here so the client
 * cannot stretch it.
 */
async function decide(id, user, { decision, durationHours, note, fullAccess } = {}) {
  await connectToMongo();
  if (!isRecordsUnit(user)) throw forbidden('Only the Records Unit decides document access.', 'RECORDS_UNIT_ONLY');
  if (!ObjectId.isValid(id)) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
  if (!['approved', 'denied'].includes(decision)) throw badRequest('Decision must be approved or denied.');

  const hours = Number(durationHours || DEFAULT_DURATION_HOURS);
  if (decision === 'approved' && !DURATION_HOURS.includes(hours)) {
    throw badRequest(`Duration must be one of ${DURATION_HOURS.join(', ')} hours.`);
  }

  const now = new Date();
  const update = {
    status: decision,
    decidedBy: who(user),
    decidedAt: now,
    decisionNote: String(note || '').trim().slice(0, 500) || null,
    expiresAt: decision === 'approved' ? new Date(now.getTime() + hours * 3600000) : null,
    // Every page (the Records Unit's choice), or the first few the unit's rule allows.
    fullAccess: decision === 'approved' && fullAccess === true,
  };
  const result = await collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: 'pending' },
    { $set: update },
    { returnDocument: 'after' }
  );
  const doc = result?.value ?? result;
  if (!doc || !doc._id) throw notFoundError('No pending request with that id.', 'REQUEST_NOT_FOUND');
  return publicView(doc);
}

/** Take back an approval before it expires. Records Unit only. */
async function revoke(id, user, { note } = {}) {
  await connectToMongo();
  if (!isRecordsUnit(user)) throw forbidden('Only the Records Unit decides document access.', 'RECORDS_UNIT_ONLY');
  if (!ObjectId.isValid(id)) throw notFoundError('Request not found.', 'REQUEST_NOT_FOUND');
  const result = await collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: 'approved' },
    { $set: { status: 'revoked', decidedBy: who(user), decidedAt: new Date(), decisionNote: String(note || '').trim().slice(0, 500) || null, expiresAt: null } },
    { returnDocument: 'after' }
  );
  const doc = result?.value ?? result;
  if (!doc || !doc._id) throw notFoundError('No approved request with that id.', 'REQUEST_NOT_FOUND');
  return publicView(doc);
}

/**
 * The inbox. The Records Unit sees everyone's requests (pending first);
 * everyone else sees only their own.
 */
async function list(user, { status, limit = 100 } = {}) {
  await connectToMongo();
  const filter = {};
  if (!isRecordsUnit(user)) filter['requestedBy.userId'] = who(user).userId;
  if (status && STATUSES.includes(status)) filter.status = status;
  const docs = await collection()
    .find(filter)
    .sort({ status: 1, requestedAt: -1 }) // 'approved' < 'denied' < 'pending' alphabetically; re-sorted below
    .limit(Math.min(Number(limit) || 100, 500))
    .toArray();
  const rank = { pending: 0, approved: 1, denied: 2, revoked: 3 };
  docs.sort((a, b) => rank[a.status] - rank[b.status] || b.requestedAt - a.requestedAt);
  return docs.map(publicView);
}

/** Pending count for a badge. Records Unit only; others get their own. */
async function pendingCount(user) {
  await connectToMongo();
  const filter = { status: 'pending' };
  if (!isRecordsUnit(user)) filter['requestedBy.userId'] = who(user).userId;
  return collection().countDocuments(filter);
}

function publicView(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return {
    id: String(_id),
    ...rest,
    expired: rest.status === 'approved' && rest.expiresAt ? rest.expiresAt <= new Date() : false,
  };
}

module.exports = {
  COLLECTION,
  STATUSES,
  DURATION_HOURS,
  DEFAULT_DURATION_HOURS,
  ensureIndexes,
  isRecordsUnit,
  viewPermission,
  create,
  share,
  decide,
  revoke,
  list,
  pendingCount,
};
