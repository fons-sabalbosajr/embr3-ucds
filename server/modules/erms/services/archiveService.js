const { connectToMongo, getDb } = require('../../../config/db');
const { conflict, notFoundError, badRequest } = require('../../../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Archiving — physical storage and retention.
//
// A box is where a record physically sits. Retention is how long it must stay
// there. Disposal is never performed by this code: it marks a box as due and
// records that a disposal happened, because destroying public records is an
// authorised act that belongs to a person, not a scheduled job.
// ---------------------------------------------------------------------------

const BOXES = 'erms-archive-boxes';
const RECORDS = 'erms-records';

const boxes = () => getDb().collection(BOXES);
const records = () => getDb().collection(RECORDS);
// Legal Services and Laboratory keep boxes too: their documents carry the
// same archive.boxCode, and a box belongs to one unit. Boxes from before
// carry no unit and are the Records Unit's.
const documents = () => getDb().collection('erms-documents');
const isRecords = (unit) => !unit || unit === 'records';
const unitFilter = (unit) => (isRecords(unit) ? { unit: { $in: [null, 'records'] } } : { unit });
const itemsOf = (unit) => (isRecords(unit) ? records() : documents());

const STATUSES = ['open', 'sealed', 'due-for-disposal', 'disposed'];

async function ensureIndexes() {
  await connectToMongo();
  await boxes().createIndex({ code: 1 }, { unique: true });
  await boxes().createIndex({ status: 1 });
  await boxes().createIndex({ province: 1 });
  await records().createIndex({ 'archive.boxCode': 1 }, { sparse: true });
  await documents().createIndex({ 'archive.boxCode': 1 }, { sparse: true });
}

async function listBoxes({ status, province, unit } = {}, allowedProvinces) {
  await connectToMongo();
  const filter = { ...unitFilter(unit) };
  if (status) filter.status = status;
  if (Array.isArray(allowedProvinces)) {
    const chosen = province && allowedProvinces.includes(province) ? [province] : allowedProvinces;
    filter.province = { $in: chosen };
  } else if (province) {
    filter.province = province;
  }

  const list = await boxes().find(filter).sort({ code: 1 }).toArray();

  // Counts come from the records themselves rather than a stored counter, so
  // the number cannot drift away from reality.
  const counts = await itemsOf(unit)
    .aggregate([
      { $match: { 'archive.boxCode': { $in: list.map((b) => b.code) }, ...(isRecords(unit) ? {} : { unit }) } },
      { $group: { _id: '$archive.boxCode', count: { $sum: 1 } } },
    ])
    .toArray();
  const byCode = new Map(counts.map((c) => [c._id, c.count]));

  return list.map((b) => ({ ...b, recordCount: byCode.get(b.code) || 0 }));
}

async function createBox(input, { username }) {
  await connectToMongo();
  const code = String(input.code).trim().toUpperCase();
  if (await boxes().findOne({ code })) {
    throw conflict(`Box ${code} already exists.`, 'BOX_EXISTS');
  }

  const doc = {
    code,
    unit: input.unit || 'records',
    label: input.label || code,
    province: input.province,
    location: input.location || null,
    status: 'open',
    // Years to retain after the box is sealed, per the agency's schedule.
    retentionYears: input.retentionYears ?? null,
    sealedAt: null,
    disposeAfter: null,
    disposedAt: null,
    disposedBy: null,
    disposalAuthority: null,
    createdAt: new Date(),
    createdBy: username,
  };
  await boxes().insertOne(doc);
  return doc;
}

async function updateBox(code, changes, { username }) {
  await connectToMongo();
  const box = await boxes().findOne({ code });
  if (!box) throw notFoundError('Box not found.', 'BOX_NOT_FOUND');
  if (box.status === 'disposed') {
    throw badRequest('A disposed box cannot be changed.', 'BOX_DISPOSED');
  }

  const set = { updatedAt: new Date(), updatedBy: username };
  for (const key of ['label', 'location', 'province', 'retentionYears']) {
    if (changes[key] !== undefined) set[key] = changes[key];
  }

  if (changes.status && changes.status !== box.status) {
    if (!STATUSES.includes(changes.status)) throw badRequest('Unknown box status.');
    set.status = changes.status;

    if (changes.status === 'sealed') {
      set.sealedAt = new Date();
      const years = changes.retentionYears ?? box.retentionYears;
      if (years) {
        const due = new Date();
        due.setFullYear(due.getFullYear() + Number(years));
        set.disposeAfter = due;
      }
    }

    // Disposal is recorded, never performed. The records stay in the database
    // with the box marked disposed, so the trail survives the paper.
    if (changes.status === 'disposed') {
      if (!changes.disposalAuthority) {
        throw badRequest(
          'Recording a disposal requires the authority that approved it.',
          'DISPOSAL_AUTHORITY_REQUIRED'
        );
      }
      set.disposedAt = new Date();
      set.disposedBy = username;
      set.disposalAuthority = changes.disposalAuthority;
    }
  }

  await boxes().updateOne({ code }, { $set: set });
  return { before: box, after: await boxes().findOne({ code }) };
}

/** File a record into a box, or take it out when boxCode is null. */
async function assignRecord(serialNo, boxCode, { username }, { unit } = {}) {
  await connectToMongo();
  const items = itemsOf(unit);
  const itemFilter = isRecords(unit) ? { serialNo } : { unit, serialNo };
  const record = await items.findOne(itemFilter, { projection: { serialNo: 1, archive: 1 } });
  if (!record) throw notFoundError(isRecords(unit) ? 'Record not found.' : 'Document not found.', isRecords(unit) ? 'RECORD_NOT_FOUND' : 'DOCUMENT_NOT_FOUND');

  if (boxCode === null) {
    await items.updateOne(itemFilter, { $set: { archive: null } });
    return { serialNo, archive: null };
  }

  const code = String(boxCode).trim().toUpperCase();
  // A unit's documents go into that unit's boxes only.
  const box = await boxes().findOne({ code, ...unitFilter(unit) });
  if (!box) throw badRequest(`Box ${code} does not exist.`, 'BOX_NOT_FOUND');
  if (box.status !== 'open') {
    throw badRequest(`Box ${code} is ${box.status} and cannot take new records.`, 'BOX_NOT_OPEN');
  }

  const archive = { boxCode: code, filedAt: new Date(), filedBy: username };
  await items.updateOne(itemFilter, { $set: { archive } });
  return { serialNo, archive };
}

async function boxContents(code, allowedProvinces, { unit } = {}) {
  await connectToMongo();
  if (!isRecords(unit)) {
    return documents()
      .find({ unit, 'archive.boxCode': String(code).toUpperCase() }, { projection: { serialNo: 1, title: 1, docType: 1, docTypeLabel: 1, province: 1, provinceLabel: 1, archive: 1, 'fields.docketNo': 1, 'fields.cocNo': 1 } })
      .sort({ serialNo: 1 })
      .toArray();
  }
  const filter = { 'archive.boxCode': String(code).toUpperCase() };
  if (Array.isArray(allowedProvinces)) filter['location.province'] = { $in: allowedProvinces };
  return records()
    .find(filter, {
      projection: {
        serialNo: 1, proponentName: 1, projectTitle: 1, permit: 1, location: 1, archive: 1,
      },
    })
    .sort({ serialNo: 1 })
    .toArray();
}

/** Boxes whose retention period has elapsed. Reported, never acted upon. */
async function dueForDisposal(allowedProvinces, { unit } = {}) {
  await connectToMongo();
  const filter = {
    ...(unit ? unitFilter(unit) : {}),
    status: { $in: ['sealed', 'due-for-disposal'] },
    disposeAfter: { $ne: null, $lte: new Date() },
  };
  if (Array.isArray(allowedProvinces)) filter.province = { $in: allowedProvinces };
  return boxes().find(filter).sort({ disposeAfter: 1 }).toArray();
}

module.exports = {
  BOXES,
  STATUSES,
  ensureIndexes,
  listBoxes,
  createBox,
  updateBox,
  assignRecord,
  boxContents,
  dueForDisposal,
};
