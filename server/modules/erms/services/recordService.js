const { connectToMongo, getDb } = require('../../../config/db');
const { badRequest, conflict, forbidden, notFoundError } = require('../../../shared/middleware/errorHandler');
const shortCache = require('../../../shared/services/shortCache');

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
  // The desktop system offered these and counted their uploads (DP, PTO,
  // LUC, COA on tb_uploadcounter); none had been filed by the time it was
  // retired, but the Records Unit may still file them.
  { code: 'pto', label: 'Permit to Operate' },
  { code: 'dp', label: 'Discharge Permit' },
  { code: 'luc', label: 'Land Use Conversion' },
  { code: 'coa', label: 'Certificate of Accreditation' },
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
  'permit.dateAmended': 1,
  'permit.refs': 1,
  'permit.processSource': 1,
  'project.type': 1,
  'project.otherType': 1,
  remarks: 1,
  'location.province': 1,
  'location.provinceLabel': 1,
  'location.city': 1,
  // The register shows the full address, and its Edit button opens the
  // form on the row without fetching the record first.
  'location.barangay': 1,
  'location.street': 1,
  'document.fileName': 1,
  'document.fileClass': 1,
  'document.uploadedAt': 1,
  'document.uploadedBy': 1,
  isAttachment: 1,
  parentSerialNo: 1,
  attachmentNo: 1,
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
function buildFilter(
  { search, permitType, province, linked, flagged, uploadedBy, linkedTo },
  allowedProvinces
) {
  const filter = {};

  // Records filed against one establishment. Used by the panel on the UCDS
  // establishment page, which links here rather than duplicating the list.
  if (linkedTo) filter['ucdsRef.sortKey'] = linkedTo;

  if (search) {
    // Text index covers projectTitle + proponentName; serial and permit number
    // are exact-ish lookups people paste in, so they are matched directly.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [
      { serialNo: rx },
      { 'permit.number': rx },
      { 'permit.refs.number': rx },
      { proponentName: rx },
      { projectTitle: rx },
      // The text VERA read from the scan (services/vera/scanText).
      { scanText: rx },
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
  const base = buildFilter(options, allowedProvinces);
  // An attachment stays with its record: unless something is being searched
  // for, it is not a row of its own but listed under the record it belongs
  // to (`attachments`). One whose record is not on file keeps its own row,
  // so nothing drops out of sight.
  const packed = !String(options.search || '').trim();
  const filter = packed ? { $and: [base, { $or: [{ isAttachment: { $ne: true } }, { parentSerialNo: null }] }] } : base;

  const [items, total] = await Promise.all([
    collection()
      .find(filter, { projection: LIST_PROJECTION })
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  if (packed && items.length) {
    const children = await collection()
      .find({ parentSerialNo: { $in: items.map((r) => r.serialNo) } }, { projection: LIST_PROJECTION })
      .sort({ attachmentNo: 1, serialNo: 1 })
      .toArray();
    const byParent = new Map();
    for (const c of children) {
      if (!byParent.has(c.parentSerialNo)) byParent.set(c.parentSerialNo, []);
      byParent.get(c.parentSerialNo).push(c);
    }
    for (const r of items) if (byParent.has(r.serialNo)) r.attachments = byParent.get(r.serialNo);
  }

  return { items, total, page, pageSize, packed };
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

/**
 * The dashboard's figures, kept for 20 seconds per province scope: everyone
 * looking at the dashboard shares one computation (shared/services/shortCache).
 * Record writes clear it (see the exports below).
 */
const DASHBOARD_CACHE = 'erms:records:dashboard:';
function dashboardStats(allowedProvinces) {
  const scopeKey = Array.isArray(allowedProvinces) ? [...allowedProvinces].sort().join(',') : '*';
  return shortCache.cached(DASHBOARD_CACHE + scopeKey, 20 * 1000, () => computeDashboardStats(allowedProvinces));
}

async function computeDashboardStats(allowedProvinces) {
  await connectToMongo();
  const scope = Array.isArray(allowedProvinces)
    ? { 'location.province': { $in: allowedProvinces } }
    : {};

  const months = monthWindow();
  const [total, linked, flagged, byType, byProvince, byYear, recent, byMonth, byProjectType] = await Promise.all([
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
    // Uploads per month and permit type — the desktop system's
    // vwMonthlyUploads / vwTotalUploads.
    collection().aggregate([
      { $match: { ...scope, 'document.uploadedAt': { $gte: months.since } } },
      { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$document.uploadedAt', timezone: '+08:00' } }, type: '$permit.type' }, count: { $sum: 1 } } },
    ]).toArray(),
    // The most filed project types — the desktop system's pie chart
    // (vw_PieChartUpload, vw_TotalUploadProjType). Fifty: the card shows ten, its See more the rest.
    collection().aggregate([
      { $match: { ...scope, 'project.type': { $nin: [null, ''] } } },
      { $group: { _id: '$project.type', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 50 },
    ]).toArray(),
  ]);

  return {
    total,
    linked,
    unlinked: total - linked,
    flagged,
    byType,
    byProvince,
    byYear,
    recent,
    byMonth: months.fill(byMonth.map((r) => ({ month: r._id.month, kind: r._id.type || 'other', count: r.count }))),
    byProjectType: byProjectType.map((r) => ({ label: r._id, count: r.count })),
  };
}

/**
 * The last twelve months, this one included, in Philippine time: where to
 * start counting, and a filler that gives every month a row so a quiet
 * month shows as zero rather than vanishing from the chart.
 */
function monthWindow(count = 12) {
  const now = new Date(Date.now() + 8 * 3600000);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return {
    since: new Date(`${keys[0]}-01T00:00:00+08:00`),
    keys,
    /** [{ month, kind, count }] -> [{ month, total, kinds: { <kind>: n } }] for every month. */
    fill: (rows) =>
      keys.map((month) => {
        const kinds = {};
        for (const r of rows) if (r.month === month) kinds[r.kind] = (kinds[r.kind] || 0) + r.count;
        return { month, total: Object.values(kinds).reduce((s, n) => s + n, 0), kinds };
      }),
  };
}

/**
 * Values already on file for the upload form — proponents and project
 * titles, within the caller's provinces — so a second permit for the same
 * proponent is typed the way the first was. Starting matches first, then the
 * most used. A proponent carries the project title it was last filed with.
 */
// specificProjectType is the desktop system's "specific project type"
// (project.otherType: "Poultry Farm", "Gasoline Filling Station"); choosing
// one brings the project type it is usually filed under.
// permitNumber is the ECC Ref No: the numbers already filed (an amendment
// carries its original's number) and the register's own, each bringing the
// proponent and project it belongs to.
const SUGGESTABLE = { proponentName: 'proponentName', projectTitle: 'projectTitle', specificProjectType: 'project.otherType', permitNumber: 'permit.number' };

async function suggest(allowedProvinces, field, q = '', { projectType } = {}) {
  const path = SUGGESTABLE[field];
  if (!path) return [];
  await connectToMongo();
  const text = String(q || '').trim().slice(0, 100);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (field === 'permitNumber') return suggestPermitNumbers(allowedProvinces, text, escaped);
  const scope = Array.isArray(allowedProvinces) ? { 'location.province': { $in: allowedProvinces } } : {};
  // A specific type within the project type already chosen on the form.
  const within = field === 'specificProjectType' && projectType ? { 'project.type': String(projectType).slice(0, 200) } : {};
  const groups = await collection()
    .aggregate([
      { $match: { ...scope, ...within, [path]: text ? new RegExp(escaped, 'i') : { $nin: [null, ''] } } },
      { $sort: { 'document.uploadedAt': -1 } },
      {
        $group: {
          _id: `$${path}`,
          count: { $sum: 1 },
          ...(field === 'proponentName' ? { projectTitle: { $first: '$projectTitle' } } : {}),
          ...(field === 'specificProjectType' ? { projectTypes: { $push: '$project.type' } } : {}),
        },
      },
      { $addFields: { starts: text ? { $regexMatch: { input: { $toString: '$_id' }, regex: `^${escaped}`, options: 'i' } } : true } },
      { $sort: { starts: -1, count: -1, _id: 1 } },
      { $limit: 15 },
    ])
    .toArray();
  // The project type a specific type is filed under most often.
  const mostCommon = (list = []) => {
    const n = new Map();
    for (const t of list) if (t) n.set(t, (n.get(t) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };
  return groups
    .filter((g) => g._id && String(g._id).trim())
    .map((g) => {
      const fill = g.projectTitle ? { projectTitle: g.projectTitle } : g.projectTypes ? { projectType: mostCommon(g.projectTypes) } : null;
      return { value: String(g._id), count: g.count, ...(fill && Object.values(fill).some(Boolean) ? { fill } : {}) };
    });
}

/**
 * ECC Ref Nos as typed: those already in the library first (with the
 * proponent, project and date approved they were filed with), then the
 * register's — dashes, spaces and capitals ignored in the comparison.
 */
async function suggestPermitNumbers(allowedProvinces, text, escaped) {
  if (text.length < 2) return [];
  // "ECC OL R03 2019" finds "ECC-OL-R03-2019-0573": any run of separators matches any other.
  const loose = new RegExp(escaped.replace(/(\\[-.\s]|[\s\-–—_./])+/g, '[\\s\\-–—_./]*'), 'i');
  const scope = Array.isArray(allowedProvinces) ? { 'location.province': { $in: allowedProvinces } } : {};
  const filed = await collection()
    .aggregate([
      { $match: { ...scope, 'permit.number': loose } },
      { $sort: { 'document.uploadedAt': -1 } },
      { $group: { _id: '$permit.number', count: { $sum: 1 }, proponentName: { $first: '$proponentName' }, projectTitle: { $first: '$projectTitle' }, dateApproved: { $first: '$permit.dateApproved' } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ])
    .toArray();
  const seen = new Set(filed.map((g) => String(g._id).toUpperCase()));
  let fromRegister = [];
  try {
    const rows = await getDb().collection('ucds-data').find({ ecc_cnc: loose }, { projection: { ecc_cnc: 1, name: 1, title: 1 } }).limit(8).toArray();
    const pm = require('../../ucds/services/permitMatch');
    fromRegister = rows.flatMap((r) =>
      pm.tokensOf(r.ecc_cnc).filter((t) => loose.test(t) && !seen.has(t.toUpperCase())).map((t) => {
        seen.add(t.toUpperCase());
        return { value: t, count: 0, source: 'register', fill: { proponentName: r.name || null, projectTitle: r.title || null } };
      })
    );
  } catch {
    /* the register is a convenience here */
  }
  return [
    ...filed.map((g) => ({
      value: String(g._id),
      count: g.count,
      source: 'library',
      fill: { proponentName: g.proponentName || null, projectTitle: g.projectTitle || null, dateApproved: g.dateApproved || null },
    })),
    ...fromRegister,
  ].slice(0, 15);
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

/**
 * The serial the next record will get, without taking it. Shown on the
 * upload form, as the desktop system showed the next FSN; the number is
 * only claimed when the record is saved, so two people looking at the form
 * see the same next number and only the first to save gets it.
 */
async function peekSerialNo() {
  await connectToMongo();
  const counter = await sequences().findOne({ _id: 'serialNo' });
  let seq;
  if (counter && typeof counter.seq === 'number') {
    seq = counter.seq;
  } else {
    const [highest] = await collection().find({ serialNo: /^FSN-\d+$/ }).sort({ serialNo: -1 }).limit(1).toArray();
    seq = highest ? Number(String(highest.serialNo).replace(/\D/g, '')) : 0;
  }
  return `FSN-${String(seq + 1).padStart(7, '0')}`;
}

/**
 * The highest attachment number the desktop system issued. Its register
 * (tb_maindata_attachment_IDs) runs to Att-00098, but only 37 of those
 * reached tb_maindata with a record's serial; the other 61 were never
 * linked to a record and so are not in erms-records. Their numbers are
 * still theirs.
 */
const LEGACY_ATTACHMENT_HIGH = 98;

/**
 * The next attachment number, Att-00099 after Att-00098.
 *
 * The desktop system numbered attachments from one sequence across all
 * records and wrote the record's serial before it: "FSN-0000206 Att-00012"
 * is the twelfth attachment filed, and it belongs to FSN-0000206. Seeded
 * from the attachments already on file — and never below the desktop
 * register's last number — then an atomic $inc.
 */
async function nextAttachmentNo() {
  await connectToMongo();
  const existing = await sequences().findOne({ _id: 'attachmentNo' });
  if (!existing || typeof existing.seq !== 'number' || existing.seq < LEGACY_ATTACHMENT_HIGH) {
    const rows = await collection().find({ serialNo: / Att-\d+$/ }, { projection: { serialNo: 1 } }).toArray();
    const seed = rows.reduce((max, r) => Math.max(max, Number(/Att-(\d+)$/.exec(r.serialNo)?.[1]) || 0), LEGACY_ATTACHMENT_HIGH);
    // $max: a concurrent attach may have seeded and moved it already.
    await sequences().updateOne({ _id: 'attachmentNo' }, { $max: { seq: seed } }, { upsert: true });
  }
  const result = await sequences().findOneAndUpdate(
    { _id: 'attachmentNo' },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', includeResultMetadata: false }
  );
  const seq = (result && typeof result.seq === 'number' ? result : result?.value)?.seq;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) throw new Error('Could not allocate an attachment number.');
  return `Att-${String(seq).padStart(5, '0')}`;
}

/**
 * The record an attachment is filed against, or null. An attachment belongs
 * to a record, not to another attachment.
 */
async function parentFor(serialNo) {
  if (!serialNo) return null;
  const parent = await collection().findOne({ serialNo });
  if (!parent) throw badRequest('The record to attach to does not exist.', 'PARENT_NOT_FOUND');
  if (parent.isAttachment) {
    throw badRequest(`${serialNo} is itself an attachment. Attach to ${parent.parentSerialNo || 'the record it belongs to'} instead.`, 'PARENT_IS_ATTACHMENT');
  }
  return parent;
}

/**
 * Another record already carrying this permit number, or null.
 *
 * An attachment carries its record's permit number — the desktop system
 * filed amendments and certified copies that way — so the record and its
 * other attachments (`family`, the parent's serial) are not a clash.
 */
async function permitClash(number, { exclude = null, family = null } = {}) {
  const filter = { 'permit.number': number };
  const not = [exclude, family].filter(Boolean);
  if (not.length) filter.serialNo = { $nin: not };
  if (family) filter.parentSerialNo = { $ne: family };
  return collection().findOne(filter, { projection: { serialNo: 1 } });
}

/**
 * Resolve a permit number to an establishment and build the stored reference.
 *
 * Reads UCDS through its exported service, never by querying ucds-data. The
 * snapshot is the point: if the register is later edited or the establishment
 * removed, the record still renders with a stale label rather than breaking.
 *
 * A failure here is not a failure of the write — a records clerk filing a
 * document should not be blocked because the register is momentarily
 * unavailable, so the record is saved unlinked and can be relinked later.
 */
async function resolveUcdsRef(permitNumber, provinceKey) {
  if (!permitNumber) return null;
  try {
    const ucds = require('../../ucds');
    const hit = await ucds.read.resolveByPermitNumber(permitNumber);
    if (!hit) return null;
    return {
      sortKey: hit.sortKey,
      nameSnapshot: hit.name,
      provinceKey: provinceKey || null,
      matchedOn: hit.matchedOn,
      capturedAt: new Date(),
      unmatched: false,
    };
  } catch (error) {
    console.error('Could not resolve the register link:', error.message);
    return null;
  }
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

  // An attachment lives where its record does: same province, same place,
  // same register entry. Its own form may not move it.
  const parent = await parentFor(input.parentSerialNo);
  const location = parent ? { ...(parent.location || {}) } : input.location;
  assertWritable(location?.province, writableProvinces);

  if (input.permit?.number) {
    const clash = await permitClash(input.permit.number, { family: parent?.serialNo });
    if (clash) {
      throw conflict(
        `Permit number ${input.permit.number} is already on record ${clash.serialNo}.`,
        'PERMIT_NUMBER_EXISTS'
      );
    }
  }

  const attachmentNo = parent ? await nextAttachmentNo() : null;
  const serialNo = parent ? `${parent.serialNo} ${attachmentNo}` : await nextSerialNo();
  const doc = {
    serialNo,
    parentSerialNo: parent ? parent.serialNo : null,
    attachmentNo,
    isAttachment: Boolean(parent),

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
      refs: refsOf(input.permit.refs),
    },

    project: { type: input.project?.type || null, otherType: input.project?.otherType || null },

    location: {
      province: location.province,
      provinceLabel: location.provinceLabel || null,
      city: location.city || null,
      barangay: location.barangay || null,
      street: location.street || null,
      mailingAddress: location.mailingAddress || null,
      lat: location.lat ?? null,
      long: location.long ?? null,
    },

    document: {
      fileName: input.document?.fileName || null,
      filePath: input.document?.filePath || null,
      sharePath: input.document?.sharePath || null,
      fileClass: input.document?.fileClass || 'Public',
      uploadedAt: new Date(),
      uploadedBy: username,
    },

    ucdsRef: parent && (!input.permit?.number || input.permit.number === parent.permit?.number)
      ? parent.ucdsRef || null
      : await resolveUcdsRef(input.permit?.number, location.province),

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

/**
 * The record's other ECC Ref Nos — an amendment's, a re-issue's — each with
 * the date it was approved. The first number stays in permit.number and
 * permit.dateApproved, where the register link and every list read it.
 */
function refsOf(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => ({ number: String(r?.number || '').trim() || null, dateApproved: r?.dateApproved ? new Date(r.dateApproved) : null, label: String(r?.label || '').trim() || null }))
    .filter((r) => r.number || r.dateApproved)
    .slice(0, 20);
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
    // A record and its attachments share a permit number (see permitClash).
    const clash = await permitClash(changes.permit.number, {
      exclude: serialNo,
      family: before.parentSerialNo || (before.isAttachment ? null : serialNo),
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
      if (changes.permit.refs !== undefined) set.permit.refs = refsOf(changes.permit.refs);
      // Correcting a date clears the preserved raw value it replaces.
      if (changes.permit.dateApproved) set.permit.dateApprovedRaw = null;
      if (changes.permit.dateAmended) set.permit.dateAmendedRaw = null;
    } else if (typeof changes[key] === 'object' && changes[key] !== null) {
      set[key] = { ...before[key], ...changes[key] };
    } else {
      set[key] = changes[key];
    }
  }

  // A changed permit number points at a different establishment, so the link
  // is recomputed rather than left stale.
  if (changes.permit?.number !== undefined && changes.permit.number !== before.permit?.number) {
    set.ucdsRef = await resolveUcdsRef(
      changes.permit.number,
      set.location?.province || before.location?.province
    );
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

// A write changes the dashboard's counts: clear them, so the person who just
// filed sees their record counted rather than waiting out the cache.
const clearingDashboard = (fn) => async (...args) => {
  const result = await fn(...args);
  shortCache.invalidate(DASHBOARD_CACHE);
  return result;
};

// ---------------------------------------------------------------------------
// Moving a scan to the record it belongs to.
//
// A scan is sometimes filed against the wrong record — a neighbouring FSN, the
// amendment instead of the original. The Developer or an administrator moves
// it: the record that held it lets it go, the one it belongs to takes it. The
// file itself stays where it is on the share; only which record points at it
// changes, so nothing on the NAS can be lost by a move. Both records remember
// the move (document.movedTo / movedFrom), and it is in both their histories.
// ---------------------------------------------------------------------------

const DOCUMENT_FIELDS = ['fileName', 'filePath', 'sharePath'];

async function moveDocument(fromSerial, toSerial, { username }) {
  await connectToMongo();
  if (fromSerial === toSerial) throw badRequest('Choose a different record to move the scan to.', 'SAME_RECORD');
  const [from, to] = await Promise.all([collection().findOne({ serialNo: fromSerial }), collection().findOne({ serialNo: toSerial })]);
  if (!from) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
  if (!to) throw notFoundError(`There is no record ${toSerial}.`, 'TARGET_NOT_FOUND');
  if (!from.document?.fileName && !from.document?.sharePath) throw badRequest('This record has no scan to move.', 'NO_DOCUMENT');
  if (to.document?.fileName || to.document?.sharePath) {
    throw conflict(`${toSerial} already has a scan (${to.document.fileName || 'on the share'}). Move that one away first.`, 'TARGET_HAS_DOCUMENT');
  }
  const now = new Date();
  const moved = Object.fromEntries(DOCUMENT_FIELDS.map((k) => [`document.${k}`, from.document?.[k] ?? null]));
  await collection().updateOne(
    { _id: to._id },
    { $set: { ...moved, 'document.fileClass': to.document?.fileClass || from.document?.fileClass || null, 'document.movedFrom': fromSerial, 'document.movedAt': now, 'document.movedBy': username, updatedAt: now, updatedBy: username } }
  );
  await collection().updateOne(
    { _id: from._id },
    { $set: { ...Object.fromEntries(DOCUMENT_FIELDS.map((k) => [`document.${k}`, null])), 'document.movedTo': toSerial, 'document.movedAt': now, 'document.movedBy': username, updatedAt: now, updatedBy: username } }
  );
  return { from: fromSerial, to: toSerial, fileName: from.document?.fileName || null };
}

/**
 * Where a scan probably belongs — VERA's suggestion when moving one: records
 * whose permit number appears in the file's name, or whose proponent and
 * project share its words. Records without a scan of their own come first,
 * since only those can take it.
 */
async function moveSuggestions(serialNo, allowedProvinces) {
  await connectToMongo();
  const from = await collection().findOne({ serialNo }, { projection: { document: 1, proponentName: 1, projectTitle: 1, permit: 1 } });
  if (!from) throw notFoundError('Record not found.', 'RECORD_NOT_FOUND');
  const pm = require('../../ucds/services/permitMatch');
  const name = String(from.document?.fileName || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const STOP = new Set(['pdf', 'ecc', 'cnc', 'the', 'and', 'of', 'inc', 'corp', 'corporation', 'co', 'amended', 'amendment', 'original', 'pages', 'from', 'scan', 'copy']);
  const words = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)));
  const nameWords = words(name);
  const numbers = pm.numbersIn(name).map((n) => pm.loosen(n));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const longest = [...nameWords].sort((a, b) => b.length - a.length).slice(0, 4);
  const or = [
    ...longest.flatMap((w) => [{ proponentName: new RegExp(escape(w), 'i') }, { projectTitle: new RegExp(escape(w), 'i') }]),
    ...pm.numbersIn(name).map((n) => ({ 'permit.number': new RegExp(escape(n).replace(/[-\s]+/g, '[-\\s]*'), 'i') })),
  ];
  if (!or.length) return { fileName: from.document?.fileName || null, suggestions: [] };
  const scope = Array.isArray(allowedProvinces) ? { 'location.province': { $in: allowedProvinces } } : {};
  const rows = await collection()
    .find({ ...scope, serialNo: { $ne: serialNo }, $or: or }, { projection: { serialNo: 1, proponentName: 1, projectTitle: 1, permit: 1, location: 1, document: 1 } })
    .limit(300)
    .toArray();
  const scored = rows
    .map((r) => {
      const theirs = new Set([...words(r.proponentName), ...words(r.projectTitle)]);
      const shared = [...nameWords].filter((w) => theirs.has(w)).length;
      const numberHit = r.permit?.number && numbers.includes(pm.loosen(r.permit.number));
      const score = Math.min(100, Math.round((nameWords.size ? (shared / nameWords.size) * 70 : 0) + (numberHit ? 60 : 0)));
      const hasDocument = Boolean(r.document?.fileName || r.document?.sharePath);
      return {
        serialNo: r.serialNo,
        permitNumber: r.permit?.number || null,
        proponentName: r.proponentName || null,
        projectTitle: r.projectTitle || null,
        province: r.location?.province || null,
        hasDocument,
        score,
        why: [numberHit ? 'its permit number is in the file name' : null, shared ? `${shared} word${shared === 1 ? '' : 's'} of the file name in its proponent or project` : null].filter(Boolean).join('; '),
      };
    })
    .filter((s) => s.score >= 25)
    .sort((a, b) => Number(a.hasDocument) - Number(b.hasDocument) || b.score - a.score)
    .slice(0, 6);
  return { fileName: from.document?.fileName || null, suggestions: scored };
}

module.exports = {
  RECORDS,
  SEQUENCES,
  moveDocument: clearingDashboard(moveDocument),
  moveSuggestions,
  PERMIT_TYPES,
  buildFilter,
  monthWindow,
  listRecords,
  getRecord,
  listAttachments,
  dashboardStats,
  filterOptions,
  suggest,
  // writes
  nextSerialNo,
  nextAttachmentNo,
  peekSerialNo,
  parentFor,
  createRecord: clearingDashboard(createRecord),
  updateRecord: clearingDashboard(updateRecord),
  resolveUcdsRef,
  // cross-domain read API
  countForFirm,
  listForFirm,
};
