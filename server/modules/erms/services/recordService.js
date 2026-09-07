const { connectToMongo, getDb, ObjectId } = require('../../../config/db');

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

const collection = () => getDb().collection(RECORDS);

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
  PERMIT_TYPES,
  buildFilter,
  listRecords,
  getRecord,
  listAttachments,
  dashboardStats,
  filterOptions,
  // cross-domain read API
  countForFirm,
  listForFirm,
};
