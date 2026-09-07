const { connectToMongo, getDb } = require('../../../config/db');
const { badRequest, conflict, forbidden, notFoundError } = require('../../../shared/middleware/errorHandler');

// ---------------------------------------------------------------------------
// The ERMS records register.
//
// This is the ONLY writer of erms-* collections. UCDS reads what it needs
// through the read functions exported at the bottom of this file, never by
// querying these collections directly.
//
// Records are deliberately NOT year-scoped: a record has its own lifecycle and
// is retrieved across years, so forcing it into a year container would make
// "find this document" depend on guessing the right year first. The datasets
// are registered as SHARED in yearScope.
// ---------------------------------------------------------------------------

const RECORDS = 'erms-records';
const SEQUENCES = 'erms-sequences';

const collection = () => getDb().collection(RECORDS);
const sequences = () => getDb().collection(SEQUENCES);

const PERMIT_TYPES = [
  { code: 'ecc-original', label: 'ECC (Original)' },
  { code: 'ecc-amended', label: 'ECC (Amended)' },
  { code: 'cnc', label: 'Certificate of Non-Coverage' },
  { code: 'hw-generator', label: 'HW Generator Registration' },
  { code: 'other', label: 'Other' },
];

/** Projection for list views — excludes the bulky nested detail. */
const LIST_PROJECTION = {
  serialNo: 1,
  proponentName: 1,
  projectTitle: 1,
  'permit.type': 1,
  'permit.label': 1,
  'permit.number': 1,
  'permit.dateApproved': 1,
  'location.province': 1,
  'location.provinceLabel': 1,
  'location.city': 1,
  'document.fileName': 1,
  'document.uploadedAt': 1,
  'document.uploadedBy': 1,
  isAttachment: 1,
  'ucdsRef.sortKey': 1,
  'ucdsRef.nameSnapshot': 1,
  'dataQuality.clean': 1,
};

/**
 * Build the query filter from validated request options.
 *
 * A caller's province choice is intersected with the province scope their
 * account allows, so a filter can narrow the result but never widen it.
 */
function buildFilter({ search, permitType, province, linked, flagged, uploadedBy }, allowedProvinces) {
  const filter = {};

  if (search) {
    // Text index covers projectTitle + proponentName; serial and permit number
    // are exact-ish lookups people paste in, so they are matched directly.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [
      { serialNo: rx },
      { 'permit.number': rx },
      { proponentName: rx },
      { projectTitle: rx },
    ];
  }

  if (permitType) filter['permit.type'] = permitType;
  if (linked === 'linked') filter.ucdsRef = { $ne: null };
  if (linked === 'unlinked') filter.ucdsRef = null;
  if (flagged === true) filter['dataQuality.clean'] = false;
  if (uploadedBy) filter['document.uploadedBy'] = uploadedBy;

  // Province scope. `allowedProvinces` of null means unrestricted.
  if (Array.isArray(allowedProvinces)) {
    const chosen = province && allowedProvinces.includes(province) ? [province] : allowedProvinces;
    filter['location.province'] = { $in: chosen };
  } else if (province) {
    filter['location.province'] = province;
  }

  return filter;
}

async function listRecords(options, allowedProvinces) {
  await connectToMongo();
  const { page = 1, pageSize = 25, sortBy = 'document.uploadedAt', sortDir = -1 } = options;
  const filter = buildFilter(options, allowedProvinces);

  const [items, total] = await Promise.all([
    collection()
      .find(filter, { projection: LIST_PROJECTION })
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  return { items, total, page, pageSize };
}

async function getRecord(serialNo, allowedProvinces) {
  await connectToMongo();
  const filter = { serialNo };
  if (Array.isArray(allowedProvinces)) filter['location.province'] = { $in: allowedProvinces };
  return collection().findOne(filter);
}

/** Documents filed against a parent record. */
async function listAttachments(serialNo) {
  await connectToMongo();
  return collection()
    .find({ parentSerialNo: serialNo }, { projection: LIST_PROJECTION })
    .sort({ attachmentNo: 1 })
    .toArray();
}

async function dashboardStats(allowedProvinces) {
  await connectToMongo();
  const scope = Array.isArray(allowedProvinces)
    ? { 'location.province': { $in: allowedProvinces } }
    : {};

  const [total, linked, flagged, byType, byProvince, byYear, recent] = await Promise.all([
    collection().countDocuments(scope),
    collection().countDocuments({ ...scope, ucdsRef: { $ne: null } }),
    collection().countDocuments({ ...scope, 'dataQuality.clean': false }),
    collection().aggregate([
      { $match: scope },
      { $group: { _id: '$permit.type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    collection().aggregate([
      { $match: scope },
      { $group: { _id: '$location.province', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    collection().aggregate([
      { $match: { ...scope, 'permit.dateApproved': { $ne: null } } },
      { $group: { _id: { $year: '$permit.dateApproved' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    collection()
      .find(scope, { projection: LIST_PROJECTION })
      .sort({ 'document.uploadedAt': -1 })
      .limit(8)
      .toArray(),
  ]);

  return { total, linked, unlinked: total - linked, flagged, byType, byProvince, byYear, recent };
}

/** Distinct values for the filter controls, within the caller's scope. */
async function filterOptions(allowedProvinces) {
  await connectToMongo();
  const scope = Array.isArray(allowedProvinces)
    ? { 'location.province': { $in: allowedProvinces } }
    : {};
  const [uploaders, provinces] = await Promise.all([
    collection().distinct('document.uploadedBy', scope),
    collection().distinct('location.province', scope),
  ]);
  return {
    permitTypes: PERMIT_TYPES,
    uploaders: uploaders.filter(Boolean).sort(),
    provinces: provinces.filter(Boolean).sort(),
  };
}

// ---------------------------------------------------------------------------
// Writes.
//
// Province scope is applied again here, on the record's own province, using
// the caller's *writable* provinces. A user granted 'view' on a province can
// read its records and cannot change them.
// ---------------------------------------------------------------------------

/**
 * The next serial in the FSN sequence.
 *
 * Uses an atomic $inc on a counter document rather than max()+1, which would
 * hand the same number to two concurrent creates. Seeded from the highest
 * serial already present, so it continues the desktop application's numbering
 * instead of restarting it.
 */
async function nextSerialNo() {
  await connectToMongo();

  // The counter field is `seq`, not `value`: the driver's legacy result shape
  // is { value: doc }, so a field called `value` makes unwrapping ambiguous —
  // doc.value is both "the document" and "the number", and the wrong one wins.
  const existing = await sequences().findOne({ _id: 'serialNo' });
  if (!existing || typeof existing.seq !== 'number') {
    const [highest] = await collection()
      .find({ serialNo: /^FSN-\d+$/ })
      .sort({ serialNo: -1 })
      .limit(1)
      .toArray();
    const seed = highest ? Number(String(highest.serialNo).replace(/\D/g, '')) : 0;
    // upsert rather than insert: a concurrent create may have seeded it first.
    await sequences().updateOne(
      { _id: 'serialNo' },
      { $set: { seq: seed } },
      { upsert: true }
    );
  }

  const result = await sequences().findOneAndUpdate(
    { _id: 'serialNo' },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', includeResultMetadata: false }
  );

  // Tolerate both driver result shapes rather than assuming one.
  const doc = result && typeof result.seq === 'number' ? result : result?.value;
  const seq = doc?.seq;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) {
    throw new Error('Could not allocate a serial number.');
  }
  return `FSN-${String(seq).padStart(7, '0')}`;
}

function assertWritable(province, writableProvinces) {
  if (!Array.isArray(writableProvinces)) return; // unrestricted
  if (!province || !writableProvinces.includes(province)) {
    throw forbidden(
      `You do not have write access to records in ${province || 'that province'}.`,
      'PROVINCE_FORBIDDEN'
    );
  }
}

async function createRecord(input, { username, writableProvinces }) {
  await connectToMongo();
  assertWritable(input.location?.province, writableProvinces);

  if (input.permit?.number) {
    const clash = await collection().findOne({ 'permit.number': input.permit.number });
    if (clash) {
      throw conflict(
        `Permit number ${input.permit.number} is already on record ${clash.serialNo}.`,
        'PERMIT_NUMBER_EXISTS'
      );
    }
  }

  let parent = null;
  if (input.parentSerialNo) {
    parent = await collection().findOne({ serialNo: input.parentSerialNo });
    if (!parent) throw badRequest('The parent record does not exist.', 'PARENT_NOT_FOUND');
  }

  const serialNo = await nextSerialNo();
  const doc = {
    serialNo,
    parentSerialNo: input.parentSerialNo || null,
    attachmentNo: input.parentSerialNo ? `Att-${serialNo.slice(-5)}` : null,
    isAttachment: Boolean(input.parentSerialNo),

    proponentName: input.proponentName,
    projectTitle: input.projectTitle,
    remarks: input.remarks || null,

    permit: {
      type: input.permit.type,
      label: (PERMIT_TYPES.find((t) => t.code === input.permit.type) || {}).label || null,
      typeRaw: null,
      number: input.permit.number || null,
      processSource: input.permit.processSource || null,
      dateApproved: input.permit.dateApproved ? new Date(input.permit.dateApproved) : null,
      dateApprovedRaw: null,
      dateAmended: input.permit.dateAmended ? new Date(input.permit.dateAmended) : null,
      dateAmendedRaw: null,
    },

    project: { type: input.project?.type || null, otherType: input.project?.otherType || null },

    location: {
      province: input.location.province,
      provinceLabel: input.location.provinceLabel || null,
      city: input.location.city || null,
      barangay: input.location.barangay || null,
      street: input.location.street || null,
      lat: input.location.lat ?? null,
      long: input.location.long ?? null,
    },

    document: {
      fileName: input.document?.fileName || null,
      filePath: input.document?.filePath || null,
      sharePath: input.document?.sharePath || null,
      fileClass: input.document?.fileClass || 'Public',
      uploadedAt: new Date(),
      uploadedBy: username,
    },

    ucdsRef: null,

    // Provenance. A record created here has no legacy id; the field exists so
    // migrated and native records have the same shape.
    legacyId: null,
    legacyLogId: null,
    legacySource: 'ucds-erms',
    sourceRow: null,
    migratedAt: null,

    createdAt: new Date(),
    createdBy: username,
    updatedAt: null,
    updatedBy: null,

    dataQuality: { clean: true, issues: [] },
  };

  await collection().insertOne(doc);
  return doc;
}

/** Fields a user may change. Identity and provenance are not among them. */
const MUTABLE = [
  'proponentName',
  'projectTitle',
  'remarks',
  'permit',
  'project',
  'location',
  'document',
];

async function updateRecord(serialNo, changes, { username, writableProvinces }) {
  await connectToMongo();

  const before = await collection().findOne({ serialNo });
  if (!before) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');

  // Writable in the province it is in now, and in the one it would move to.
  assertWritable(before.location?.province, writableProvinces);
  if (changes.location?.province) assertWritable(changes.location.province, writableProvinces);

  if (changes.permit?.number && changes.permit.number !== before.permit?.number) {
    const clash = await collection().findOne({
      'permit.number': changes.permit.number,
      serialNo: { $ne: serialNo },
    });
    if (clash) {
      throw conflict(
        `Permit number ${changes.permit.number} is already on record ${clash.serialNo}.`,
        'PERMIT_NUMBER_EXISTS'
      );
    }
  }

  const set = { updatedAt: new Date(), updatedBy: username };
  for (const key of MUTABLE) {
    if (changes[key] === undefined) continue;
    if (key === 'permit') {
      set.permit = {
        ...before.permit,
        ...changes.permit,
        label:
          (PERMIT_TYPES.find((t) => t.code === (changes.permit.type || before.permit?.type)) || {})
            .label || before.permit?.label || null,
        dateApproved:
          changes.permit.dateApproved !== undefined
            ? changes.permit.dateApproved
              ? new Date(changes.permit.dateApproved)
              : null
            : before.permit?.dateApproved ?? null,
        dateAmended:
          changes.permit.dateAmended !== undefined
            ? changes.permit.dateAmended
              ? new Date(changes.permit.dateAmended)
              : null
            : before.permit?.dateAmended ?? null,
      };
      // Correcting a date clears the preserved raw value it replaces.
      if (changes.permit.dateApproved) set.permit.dateApprovedRaw = null;
      if (changes.permit.dateAmended) set.permit.dateAmendedRaw = null;
    } else if (typeof changes[key] === 'object' && changes[key] !== null) {
      set[key] = { ...before[key], ...changes[key] };
    } else {
      set[key] = changes[key];
    }
  }

  // A record whose flagged values have all been resolved is clean again.
  if (set.permit && !set.permit.dateApprovedRaw && !set.permit.dateAmendedRaw) {
    const remaining = (before.dataQuality?.issues || []).filter(
      (i) => !['Date_Approved', 'Date_Amended'].includes(i.field)
    );
    set.dataQuality = { clean: remaining.length === 0, issues: remaining };
  }

  await collection().updateOne({ serialNo }, { $set: set });
  const after = await collection().findOne({ serialNo });
  return { before, after };
}

// ---------------------------------------------------------------------------
// The read API other domains may call. UCDS uses this instead of querying
// erms-* directly; see docs/UNIFICATION-PLAN.md.
// ---------------------------------------------------------------------------

/** How many records reference a given establishment. */
async function countForFirm(sortKey) {
  await connectToMongo();
  if (!sortKey) return 0;
  return collection().countDocuments({ 'ucdsRef.sortKey': sortKey });
}

/** The records referencing a given establishment, newest first. */
async function listForFirm(sortKey, limit = 20) {
  await connectToMongo();
  if (!sortKey) return [];
  return collection()
    .find({ 'ucdsRef.sortKey': sortKey }, { projection: LIST_PROJECTION })
    .sort({ 'document.uploadedAt': -1 })
    .limit(limit)
    .toArray();
}

module.exports = {
  RECORDS,
  SEQUENCES,
  PERMIT_TYPES,
  buildFilter,
  listRecords,
  getRecord,
  listAttachments,
  dashboardStats,
  filterOptions,
  // writes
  nextSerialNo,
  createRecord,
  updateRecord,
  // cross-domain read API
  countForFirm,
  listForFirm,
};
