const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest, forbidden } = require('../../../shared/middleware/errorHandler');
const { ERMS_UNITS, ERMS_UNIT_VALUES, canSeeErmsUnit, ermsUnitOf, isErmsEndUser, canAccessAllYears } = require('../../../services/authorization');
const { PROVINCE_KEYS, PROVINCES } = require('../../../services/provinces');
const config = require('./configService');
const filing = require('./filingService');

// ---------------------------------------------------------------------------
// Unit documents: what the Legal Services and Laboratory units file.
//
// One collection, erms-documents, for both. A document is one scanned file
// with the metadata its unit's form asked for — a Notice of Violation with
// its docket, company, laws and status; a lab test result with its firm,
// sampling date and parameter group. The shape of `fields` is decided by
// the document type's definition in the ERMS configuration, and checked
// against it here, so a new field added in Admin Settings needs no code.
//
// The Records Unit's documents are erms-records, not these: the register
// link, tracking and archive boxes are built around that collection and
// there was no reason to move 18,000 records to gain a shape they already
// have. Records only gained the upload (see recordController).
//
// Scope is the unit. An ERMS User sees their own unit; the Developer sees
// all three. Nobody outside a unit sees its documents at all — not even
// through an approval, which is a Records Unit mechanism.
// ---------------------------------------------------------------------------

const COLLECTION = 'erms-documents';
const SEQUENCES = 'erms-sequences';

const collection = () => getDb().collection(COLLECTION);
const sequences = () => getDb().collection(SEQUENCES);

const PROVINCE_LABEL = Object.fromEntries(PROVINCES.map((p) => [p.key, p.label]));

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ serialNo: 1 }, { unique: true });
  await collection().createIndex({ unit: 1, docType: 1, createdAt: -1 });
  await collection().createIndex({ unit: 1, province: 1 });
  await collection().createIndex({ unit: 1, 'fields.docketNo': 1 });
  await collection().createIndex({ unit: 1, searchText: 'text' });
}

// --- who may do what ----------------------------------------------------------

function assertUnit(unit) {
  const key = String(unit || '').toLowerCase();
  if (!ERMS_UNIT_VALUES.includes(key) || key === ERMS_UNITS.RECORDS) throw notFoundError('Unknown unit.', 'UNIT_UNKNOWN');
  return key;
}

function assertCanSee(user, unit) {
  if (!canSeeErmsUnit(user, unit)) throw forbidden('This unit\'s documents are not part of your account.', 'UNIT_FORBIDDEN');
}

/** Filing is the unit's own work: its ERMS Users, and the Developer. */
function assertCanFile(user, unit) {
  assertCanSee(user, unit);
  if (canAccessAllYears(user)) return;
  if (isErmsEndUser(user) && ermsUnitOf(user) === unit) return;
  throw forbidden('Only the unit\'s own staff file its documents.', 'UNIT_WRITE_FORBIDDEN');
}

// --- values ----------------------------------------------------------------------

const clean = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};

/**
 * Check submitted values against the document type's field definitions.
 * Unknown keys are dropped, required ones enforced, dates and numbers
 * parsed. Returns { fields, errors }.
 */
function validateFields(docType, input = {}) {
  const fields = {};
  const errors = [];
  for (const def of docType.fields || []) {
    const raw = input[def.key];
    const empty = raw === undefined || raw === null || raw === '' || (def.type === 'checkbox' && raw === false);
    if (empty) {
      if (def.required) errors.push({ field: def.key, message: `${def.label} is required.` });
      fields[def.key] = def.type === 'checkbox' ? false : null;
      continue;
    }
    switch (def.type) {
      case 'date': {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) errors.push({ field: def.key, message: `${def.label} is not a date.` });
        else fields[def.key] = d;
        break;
      }
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) errors.push({ field: def.key, message: `${def.label} is not a number.` });
        else fields[def.key] = n;
        break;
      }
      case 'checkbox':
        fields[def.key] = raw === true || raw === 'true';
        break;
      case 'textarea':
        fields[def.key] = clean(raw, 4000);
        break;
      default:
        fields[def.key] = clean(raw, 500);
    }
  }
  return { fields, errors };
}

/** The line the lists show: company, firm, subject, or the serial. */
function titleOf(fields, serialNo) {
  return fields.companyName || fields.firmName || fields.subject || fields.referenceNo || fields.orNumber || serialNo;
}

function searchTextOf(doc) {
  return [doc.serialNo, doc.title, doc.document?.fileName, ...Object.values(doc.fields || {}).filter((v) => typeof v === 'string')]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);
}

// --- serials ---------------------------------------------------------------------

/**
 * The next serial for a document type, continuing the desktop system's
 * numbering (FSN-NOV00433 after FSN-NOV00432). Seeded from the highest
 * serial already stored under that prefix, then an atomic $inc.
 */
async function nextSerialNo(unit, docType) {
  await connectToMongo();
  const id = `unit:${unit}:${docType.code}`;
  const { prefix, pad } = docType.serial;
  const existing = await sequences().findOne({ _id: id });
  if (!existing || typeof existing.seq !== 'number') {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [highest] = await collection()
      .find({ serialNo: new RegExp(`^${escaped}\\d+$`) })
      .sort({ serialNo: -1 })
      .limit(1)
      .toArray();
    const seed = highest ? Number(String(highest.serialNo).slice(prefix.length).replace(/\D/g, '')) || 0 : 0;
    await sequences().updateOne({ _id: id }, { $set: { seq: seed } }, { upsert: true });
  }
  const result = await sequences().findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
  const doc = result && typeof result.seq === 'number' ? result : result?.value;
  if (typeof doc?.seq !== 'number') throw new Error('Could not allocate a serial number.');
  return `${prefix}${String(doc.seq).padStart(pad, '0')}`;
}

// --- reads ---------------------------------------------------------------------------

async function list(user, unitKey, query = {}) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();

  const filter = { unit };
  if (query.docType) filter.docType = String(query.docType).toLowerCase();
  if (query.province && PROVINCE_KEYS.includes(query.province)) filter.province = query.province;
  if (query.docketNo) filter['fields.docketNo'] = String(query.docketNo).trim();
  // Documents that name no file on the share — the unit's data-quality list.
  if (query.missingFile) filter.$and = [{ $or: [{ 'document.fileName': null }, { 'document.fileName': '' }, { 'document.sharePath': null }] }];
  if (query.search) {
    const re = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ serialNo: re }, { title: re }, { 'document.fileName': re }, { 'fields.docketNo': re }, { 'fields.cocNo': re }];
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const sortBy = ['createdAt', 'serialNo', 'title', 'document.uploadedAt'].includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortDir = Number(query.sortDir) === 1 ? 1 : -1;

  const [items, total] = await Promise.all([
    collection().find(filter).sort({ [sortBy]: sortDir, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection().countDocuments(filter),
  ]);
  return { items: items.map(publicView), total, page, pageSize };
}

async function get(user, unitKey, serialNo) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const doc = await collection().findOne({ unit, serialNo });
  if (!doc) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  const related = doc.fields?.docketNo
    ? await collection().find({ unit, 'fields.docketNo': doc.fields.docketNo, serialNo: { $ne: serialNo } }).sort({ createdAt: -1 }).limit(50).toArray()
    : [];
  return { document: publicView(doc), related: related.map(publicView) };
}

/** Counts for the unit's dashboard. */
async function dashboard(user, unitKey) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const since = new Date(Date.now() - 30 * 86400000);
  const thisYear = new Date(new Date().getFullYear(), 0, 1);
  const [byType, byProvince, byYear, recent, total, lastMonth, filedThisYear, withoutFile, fromDesktop] = await Promise.all([
    collection().aggregate([{ $match: { unit } }, { $group: { _id: '$docType', count: { $sum: 1 } } }]).toArray(),
    collection().aggregate([{ $match: { unit } }, { $group: { _id: '$province', count: { $sum: 1 } } }]).toArray(),
    collection().aggregate([{ $match: { unit, createdAt: { $ne: null } } }, { $group: { _id: { $year: '$createdAt' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    collection().find({ unit }).sort({ createdAt: -1 }).limit(8).toArray(),
    collection().countDocuments({ unit }),
    collection().countDocuments({ unit, createdAt: { $gte: since }, legacy: null }),
    collection().countDocuments({ unit, createdAt: { $gte: thisYear } }),
    collection().countDocuments({ unit, $or: [{ 'document.fileName': null }, { 'document.fileName': '' }, { 'document.sharePath': null }] }),
    collection().countDocuments({ unit, legacy: { $ne: null } }),
  ]);
  const unitCfg = await config.unit(unit);
  const label = (code) => unitCfg?.docTypes.find((t) => t.code === code)?.label || code;
  // Every configured type is listed, including one with nothing filed yet,
  // so the dashboard shows the count for each kind of document the unit keeps.
  const configured = (unitCfg?.docTypes || []).map((t) => t.code);
  const counts = new Map(byType.map((x) => [x._id, x.count]));
  const allTypes = [...new Set([...configured, ...byType.map((x) => x._id)])].map((code) => ({ docType: code, label: label(code), count: counts.get(code) || 0 }));
  return {
    unit,
    total,
    uploadedLast30Days: lastMonth,
    filedThisYear,
    withoutFile,
    fromDesktop,
    byType: allTypes.sort((a, b) => b.count - a.count),
    byProvince: byProvince.map((x) => ({ province: x._id, label: PROVINCE_LABEL[x._id] || x._id || 'Unfiled', count: x.count })).sort((a, b) => b.count - a.count),
    byYear: byYear.map((x) => ({ year: x._id, count: x.count })),
    recent: recent.map(publicView),
  };
}

// --- writes --------------------------------------------------------------------------

/**
 * File a document: check the values against the type's form, write the
 * file to the unit's share, number it, store it.
 */
async function create(user, unitKey, input, upload) {
  const unit = assertUnit(unitKey);
  assertCanFile(user, unit);
  const docType = await config.docType(unit, input.docType);
  if (!docType) throw badRequest('Choose a document type.', 'DOCTYPE_UNKNOWN');
  const province = PROVINCE_KEYS.includes(input.province) ? input.province : null;
  if (!province) throw badRequest('Choose the province.', 'PROVINCE_REQUIRED');

  const { fields, errors } = validateFields(docType, input.fields || {});
  if (errors.length) {
    const err = badRequest('Some fields need attention.', 'VALIDATION');
    err.errors = errors;
    throw err;
  }

  // `folder`: the project/company folder the person picked on the form, if any.
  const filed = await filing.file(unit, docType, { province, fields, folder: clean(input.folder, 120), subfolder: clean(input.subfolder, 120) }, upload);
  if (!filed.ok) {
    const err = new Error(filed.message);
    err.status = filed.code === 'NO_FILE' || filed.code === 'FILE_TYPE' || filed.code === 'FILE_TOO_LARGE' ? 400 : 502;
    err.code = filed.code;
    throw err;
  }

  await connectToMongo();
  const serialNo = await nextSerialNo(unit, docType);
  const now = new Date();
  const doc = {
    unit,
    docType: docType.code,
    docTypeLabel: docType.label,
    serialNo,
    parentSerialNo: clean(input.parentSerialNo, 60),
    province,
    provinceLabel: PROVINCE_LABEL[province],
    title: titleOf(fields, serialNo),
    fields,
    document: { ...filed.document, uploadedAt: now, uploadedBy: user?.username || 'unknown' },
    legacy: null,
    createdAt: now,
    createdBy: user?.username || 'unknown',
    updatedAt: null,
    updatedBy: null,
  };
  doc.searchText = searchTextOf(doc);
  await collection().insertOne(doc);
  return publicView(doc);
}

/** Change the metadata. The file stays where it was filed. */
async function update(user, unitKey, serialNo, input) {
  const unit = assertUnit(unitKey);
  assertCanFile(user, unit);
  await connectToMongo();
  const before = await collection().findOne({ unit, serialNo });
  if (!before) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  const docType = await config.docType(unit, before.docType);
  if (!docType) throw badRequest('This document\'s type is no longer configured.', 'DOCTYPE_UNKNOWN');

  const { fields, errors } = validateFields(docType, { ...before.fields, ...(input.fields || {}) });
  if (errors.length) {
    const err = badRequest('Some fields need attention.', 'VALIDATION');
    err.errors = errors;
    throw err;
  }
  const set = { fields, title: titleOf(fields, serialNo), updatedAt: new Date(), updatedBy: user?.username || 'unknown' };
  if (input.province && PROVINCE_KEYS.includes(input.province)) {
    set.province = input.province;
    set.provinceLabel = PROVINCE_LABEL[input.province];
  }
  set.searchText = searchTextOf({ ...before, ...set });
  await collection().updateOne({ _id: before._id }, { $set: set });
  return publicView({ ...before, ...set });
}

/** The stored document, for streaming its file. Unit scope applies. */
async function forFile(user, unitKey, serialNo) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const doc = await collection().findOne({ unit, serialNo });
  if (!doc) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  return doc;
}

/** File names filed more than once in a unit — the same scan filed twice, or a name reused. */
async function duplicateGroups(user, unitKey) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const groups = await collection()
    .aggregate([
      { $match: { unit, 'document.fileName': { $nin: [null, ''] } } },
      { $group: { _id: '$document.fileName', count: { $sum: 1 }, serials: { $push: '$serialNo' }, titles: { $addToSet: '$title' }, types: { $addToSet: '$docType' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 300 },
    ])
    .toArray();
  return groups.map((g) => ({ fileName: g._id, count: g.count, serials: g.serials, titles: g.titles.filter(Boolean), types: g.types }));
}

/** Documents in a unit already carrying this file name — for the upload form's warning. */
async function duplicatesByFileName(user, unitKey, fileName) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  if (!fileName) return [];
  await connectToMongo();
  const docs = await collection()
    .find({ unit, 'document.fileName': fileName }, { projection: { serialNo: 1, title: 1, docType: 1, docTypeLabel: 1, province: 1, createdAt: 1 } })
    .limit(20)
    .toArray();
  return docs.map(publicView);
}

function publicView(doc) {
  if (!doc) return null;
  const { _id, searchText, ...rest } = doc;
  return { id: String(_id), ...rest };
}

module.exports = { COLLECTION, ensureIndexes, list, get, dashboard, create, update, forFile, validateFields, nextSerialNo, titleOf, searchTextOf, duplicateGroups, duplicatesByFileName };
