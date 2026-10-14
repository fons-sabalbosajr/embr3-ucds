const { connectToMongo, getDb } = require('../../../config/db');
const { notFoundError, badRequest, conflict, forbidden } = require('../../../shared/middleware/errorHandler');
const nas = require('../../../services/nasStorage');
const { ERMS_UNITS, ERMS_UNIT_VALUES, canSeeErmsUnit, ermsUnitOf, isErmsEndUser, canAccessAllYears } = require('../../../services/authorization');
const { PROVINCE_KEYS, PROVINCES } = require('../../../services/provinces');
const config = require('./configService');
const filing = require('./filingService');
const shortCache = require('../../../shared/services/shortCache');
const { monthWindow } = require('./recordService');
const shareTrail = require('./shareTrail');

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
const LOGS = 'app-logs';

const collection = () => getDb().collection(COLLECTION);
const sequences = () => getDb().collection(SEQUENCES);

const PROVINCE_LABEL = Object.fromEntries(PROVINCES.map((p) => [p.key, p.label]));

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ serialNo: 1 }, { unique: true });
  await collection().createIndex({ unit: 1, docType: 1, createdAt: -1 });
  await collection().createIndex({ unit: 1, province: 1 });
  await collection().createIndex({ unit: 1, 'fields.docketNo': 1 });
  // A case's attachments, read with every page of the list.
  await collection().createIndex({ unit: 1, parentSerialNo: 1 });
  await collection().createIndex({ unit: 1, searchText: 'text' });
  // A document's history is read from the audit trail by its serial. Partial,
  // so only the rows that name a document are indexed, not every log line.
  await getDb().collection(LOGS).createIndex({ documentId: 1, timestamp: -1 }, { partialFilterExpression: { documentId: { $type: 'string' } } });
  await getDb().collection(LOGS).createIndex({ serialNo: 1, timestamp: -1 }, { partialFilterExpression: { serialNo: { $type: 'string' } } });
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

  // Packed: a case's attachments are listed inside it, not as rows of their
  // own — unless the person is looking for something (a type, a docket, a
  // search, the files missing), when every match is a row.
  const packed = !query.docType && !query.search && !query.docketNo && !query.missingFile;
  if (packed) filter.parentSerialNo = { $in: [null] };

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const sortBy = ['createdAt', 'serialNo', 'title', 'document.uploadedAt'].includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortDir = Number(query.sortDir) === 1 ? 1 : -1;

  const [items, total] = await Promise.all([
    collection().find(filter).sort({ [sortBy]: sortDir, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection().countDocuments(filter),
  ]);
  const rows = items.map(publicView);
  if (packed && rows.length) {
    const children = await attachmentsOf(unit, rows.map((r) => r.serialNo));
    for (const r of rows) r.attachments = children.get(r.serialNo) || [];
  }
  return { items: rows, total, page, pageSize, packed };
}

/** The attachments of these documents, by parent serial, oldest first. */
async function attachmentsOf(unit, serials) {
  const children = await collection()
    .find({ unit, parentSerialNo: { $in: serials } }, { projection: { searchText: 0 } })
    .sort({ serialNo: 1 })
    .toArray();
  const byParent = new Map();
  for (const c of children) {
    if (!byParent.has(c.parentSerialNo)) byParent.set(c.parentSerialNo, []);
    byParent.get(c.parentSerialNo).push(publicView(c));
  }
  return byParent;
}

async function get(user, unitKey, serialNo) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const doc = await collection().findOne({ unit, serialNo });
  if (!doc) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  // Its own attachments apart; the rest of the docket (other documents of
  // the case, and their attachments) as "Same docket".
  const [related, attachments] = await Promise.all([
    doc.fields?.docketNo
      ? collection().find({ unit, 'fields.docketNo': doc.fields.docketNo, serialNo: { $ne: serialNo }, parentSerialNo: { $ne: serialNo } }).sort({ createdAt: -1 }).limit(50).toArray()
      : [],
    doc.parentSerialNo ? new Map() : attachmentsOf(unit, [serialNo]),
  ]);
  return { document: publicView(doc), related: related.map(publicView), attachments: attachments.get(serialNo) || [] };
}

/** Counts for the unit's dashboard. */
// The unit's dashboard, computed once per unit every 20 seconds however many
// people have it open (shared/services/shortCache). Filing clears it.
const DASHBOARD_CACHE = 'erms:units:dashboard:';

async function dashboard(user, unitKey) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  return shortCache.cached(DASHBOARD_CACHE + unit, 20 * 1000, () => computeDashboard(unit));
}

async function computeDashboard(unit) {
  await connectToMongo();
  const since = new Date(Date.now() - 30 * 86400000);
  const thisYear = new Date(new Date().getFullYear(), 0, 1);
  const months = monthWindow();
  const [byType, byProvince, byYear, recent, total, lastMonth, filedThisYear, withoutFile, fromDesktop, byMonth] = await Promise.all([
    collection().aggregate([{ $match: { unit } }, { $group: { _id: '$docType', count: { $sum: 1 } } }]).toArray(),
    collection().aggregate([{ $match: { unit } }, { $group: { _id: '$province', count: { $sum: 1 } } }]).toArray(),
    collection().aggregate([{ $match: { unit, createdAt: { $ne: null } } }, { $group: { _id: { $year: '$createdAt' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    collection().find({ unit }).sort({ createdAt: -1 }).limit(8).toArray(),
    collection().countDocuments({ unit }),
    collection().countDocuments({ unit, createdAt: { $gte: since }, legacy: null }),
    collection().countDocuments({ unit, createdAt: { $gte: thisYear } }),
    collection().countDocuments({ unit, $or: [{ 'document.fileName': null }, { 'document.fileName': '' }, { 'document.sharePath': null }] }),
    collection().countDocuments({ unit, legacy: { $ne: null } }),
    // Uploads per month and document type — the desktop units' monthly
    // upload views (vwTotUploadLegal, the Laboratory's vwMonthlyUploads).
    collection().aggregate([
      { $match: { unit, 'document.uploadedAt': { $gte: months.since } } },
      { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$document.uploadedAt', timezone: '+08:00' } }, type: '$docType' }, count: { $sum: 1 } } },
    ]).toArray(),
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
    byMonth: months.fill(byMonth.map((r) => ({ month: r._id.month, kind: r._id.type, count: r.count }))),
    kindLabels: Object.fromEntries((unitCfg?.docTypes || []).map((t) => [t.code, t.label])),
    recent: recent.map(publicView),
  };
}

// --- attachments ---------------------------------------------------------------------
//
// A Legal attachment (an inspection report, a complaint letter, an ECC copy)
// belongs to a case: the desktop system filed each one against a Notice of
// Violation and numbered it after it — "FSN-NOV00432 Att-00239" — in the
// case's own folder (…\<company>\Attachments). All 554 migrated ones carry
// their NOV as parentSerialNo. One filed here is kept the same way, so the
// case and its attachments are always found, listed and opened together.

const ATTACHMENT_TYPE = 'attachment';
const isAttachmentType = (docType) => docType?.code === ATTACHMENT_TYPE;

/**
 * The case an attachment belongs to: the document named, else the latest
 * case-opening document (unitCfg.docket.issueOn — the NOV) on its docket.
 * Null when neither is found: the attachment is then filed on its own.
 */
async function attachmentParent(unit, input) {
  const named = clean(input.parentSerialNo, 80);
  let parent = null;
  if (named) {
    parent = await collection().findOne({ unit, serialNo: named });
    if (!parent) throw notFoundError('The document to attach to was not found.', 'PARENT_NOT_FOUND');
  } else if (input.fields?.docketNo) {
    const opens = (await config.unit(unit))?.docket?.issueOn || [];
    if (!opens.length) return null;
    parent = await collection()
      .find({ unit, docType: { $in: opens }, 'fields.docketNo': String(input.fields.docketNo).trim(), parentSerialNo: { $in: [null] } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
  }
  if (parent?.parentSerialNo) {
    throw badRequest(`${parent.serialNo} is itself an attachment. Attach to ${parent.parentSerialNo} instead.`, 'PARENT_IS_ATTACHMENT');
  }
  return parent;
}

/**
 * The next attachment number in a unit, Att-00240 after Att-00239 — one
 * sequence across the unit's cases, as the desktop system kept it. Seeded
 * from the attachments already on file, then an atomic $inc.
 */
async function nextAttachmentNo(unit) {
  const id = `unit:${unit}:attachmentNo`;
  const existing = await sequences().findOne({ _id: id });
  if (!existing || typeof existing.seq !== 'number') {
    const rows = await collection().find({ unit, serialNo: / Att-\d+$/ }, { projection: { serialNo: 1 } }).toArray();
    const seed = rows.reduce((max, r) => Math.max(max, Number(/Att-(\d+)$/.exec(r.serialNo)?.[1]) || 0), 0);
    await sequences().updateOne({ _id: id }, { $max: { seq: seed } }, { upsert: true });
  }
  const result = await sequences().findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
  const seq = (result && typeof result.seq === 'number' ? result : result?.value)?.seq;
  if (typeof seq !== 'number') throw new Error('Could not allocate an attachment number.');
  return `Att-${String(seq).padStart(5, '0')}`;
}

/**
 * Where an attachment goes when nobody chose a folder: beside its case, in
 * the case folder's own Attachments folder — the folder the case's document
 * sits in, less its type folder (NOV), plus the attachment type's folder.
 * Null when the case has no usable path; the layout then decides.
 */
async function besideCase(unit, parent, docType) {
  const unitCfg = await config.unit(unit);
  const root = String(unitCfg?.folder?.root || '').split(/[\\/]+/).filter(Boolean);
  const segments = String(parent.document?.sharePath || '').split(/[\\/]+/).filter(Boolean);
  const under = root.every((s, i) => String(segments[i] || '').toLowerCase() === s.toLowerCase());
  if (!under || segments.length < root.length + 2) return null;
  let dirs = segments.slice(root.length, -1);
  const parentType = await config.docType(unit, parent.docType);
  if (parentType?.folder && dirs.length && dirs[dirs.length - 1].toLowerCase() === String(parentType.folder).toLowerCase()) dirs = dirs.slice(0, -1);
  if (!dirs.length) return null;
  return [...dirs, ...(docType.folder ? [docType.folder] : [])].join('\\');
}

// --- writes --------------------------------------------------------------------------

/**
 * File a document: check the values against the type's form, write the
 * file to the unit's share, number it, store it. An attachment is filed
 * against its case (see above): numbered after it, in its folder, and
 * carrying its docket and company where the form left them out.
 */
async function create(user, unitKey, input, upload) {
  const unit = assertUnit(unitKey);
  assertCanFile(user, unit);
  const docType = await config.docType(unit, input.docType);
  if (!docType) throw badRequest('Choose a document type.', 'DOCTYPE_UNKNOWN');
  const province = PROVINCE_KEYS.includes(input.province) ? input.province : null;
  if (!province) throw badRequest('Choose the province.', 'PROVINCE_REQUIRED');

  await connectToMongo();
  const parent = isAttachmentType(docType) ? await attachmentParent(unit, input) : null;
  // The case's own values, under whatever the form filled in.
  const given = Object.fromEntries(Object.entries(input.fields || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const inherited = parent
    ? Object.fromEntries(['docketNo', 'pabCaseNo', 'companyName', 'companyAddress', 'natureOfBusiness'].filter((k) => parent.fields?.[k]).map((k) => [k, parent.fields[k]]))
    : {};
  const { fields, errors } = validateFields(docType, { ...inherited, ...given });
  if (errors.length) {
    const err = badRequest('Some fields need attention.', 'VALIDATION');
    err.errors = errors;
    throw err;
  }

  // `folder`: the project/company folder the person picked on the form, if any.
  const chosen = clean(input.folder, 120) || clean(input.subfolder, 120) || input.targetPath;
  const targetPath = input.targetPath || (parent && !chosen ? await besideCase(unit, parent, docType) : null);
  const filed = await filing.file(unit, docType, { province, fields, folder: clean(input.folder, 120), subfolder: clean(input.subfolder, 120), targetPath }, upload);
  if (!filed.ok) {
    const err = new Error(filed.message);
    err.status = filed.code === 'NO_FILE' || filed.code === 'FILE_TYPE' || filed.code === 'FILE_TOO_LARGE' ? 400 : 502;
    err.code = filed.code;
    throw err;
  }

  const serialNo = parent ? `${parent.serialNo} ${await nextAttachmentNo(unit)}` : await nextSerialNo(unit, docType);
  const now = new Date();
  const doc = {
    unit,
    docType: docType.code,
    docTypeLabel: docType.label,
    serialNo,
    parentSerialNo: parent ? parent.serialNo : clean(input.parentSerialNo, 60),
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
  // What changed, field by field, for the document's history: a case moving
  // from FOR TECHNICAL CONFERENCE to RESOLUTION ISSUED is the point of it.
  const changes = {};
  for (const key of new Set([...Object.keys(before.fields || {}), ...Object.keys(fields)])) {
    const from = before.fields?.[key] ?? null;
    const to = fields[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  if (set.province && set.province !== before.province) changes.province = { from: before.province || null, to: set.province };
  return { document: publicView({ ...before, ...set }), changes };
}

/**
 * Everything that happened to a document, newest first: its filing (in the
 * desktop system or here), then what the audit trail holds for it — edits
 * with their changes, scans filed or replaced, views, failed reads — and how
 * it was shared through the Document Portal (shareTrail). The NAS events are
 * matched on the unit's container as well as the serial, since a Legal
 * serial (FSN-0000002) can read like a Records one.
 */
async function history(user, unitKey, serialNo) {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  await connectToMongo();
  const doc = await collection().findOne({ unit, serialNo });
  if (!doc) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  const unitCfg = await config.unit(unit);

  const [rows, shared] = await Promise.all([
    getDb()
      .collection(LOGS)
      .find(
        {
          $or: [
            { domain: 'erms', targetCollection: COLLECTION, documentId: serialNo },
            // A requester's opens come with their request, from shareTrail.
            { domain: 'nas', serialNo, container: { $in: [...new Set([unitCfg?.container, doc.document?.container].filter(Boolean))] }, operation: { $nin: ['portal-view', 'portal-download'] } },
          ],
        },
        { projection: { requestData: 0, userAgent: 0 } }
      )
      .sort({ timestamp: -1 })
      .limit(300)
      .toArray(),
    shareTrail.shareEvents(unit, serialNo),
  ]);

  // The audit trail writes an upload twice — the file event and the record
  // event — so the file event stands for both.
  const events = rows
    .filter((r) => !(r.domain === 'erms' && r.actionType === 'document-upload'))
    .map((r) => ({
      id: String(r._id),
      at: r.timestamp,
      who: r.username || null,
      action: r.operation || r.actionType || null,
      label: r.actionLabel || r.operation || r.actionType || null,
      fileName: r.fileName || r.changes?.fileName || null,
      success: r.success !== false,
      detail: r.detail || (r.actionType === 'attachment-filed' ? r.changes?.attachment : null) || null,
      // Field by field, for an edit; the other entries say what they did in `detail`.
      changes: r.actionType === 'document-update' ? r.changes || null : null,
      ip: r.ip || null,
    }));
  for (const s of shared) events.push({ ...s, fileName: null, changes: null, ip: null, shared: true });

  // The filing itself. One filed here has its upload event above already,
  // unless the trail has since been trimmed.
  // The migration wrote createdAt as the epoch where the desktop gave no date.
  const uploadedAt = doc.document?.uploadedAt || (doc.createdAt?.getTime?.() ? doc.createdAt : null);
  const fromDesktop = Boolean(doc.legacy);
  if (fromDesktop || !events.some((e) => e.action === 'document-upload')) {
    events.push({
      id: `filed-${serialNo}`,
      at: uploadedAt,
      who: doc.document?.uploadedBy || doc.createdBy || null,
      action: fromDesktop ? 'legacy-filed' : 'filed',
      label: fromDesktop ? 'Filed in the desktop ERMS' : 'Filed',
      fileName: doc.document?.fileName || null,
      success: true,
      detail: fromDesktop && doc.legacy?.table ? `from ${doc.legacy.table}` : null,
      changes: null,
      ip: null,
    });
  }
  const time = (e) => (e.at ? new Date(e.at).getTime() : 0);
  return { serialNo, events: events.sort((a, b) => time(b) - time(a)) };
}

/**
 * File a scan against a document already on file — one the desktop system
 * kept without a scan, or one whose scan is being replaced. The same rule as
 * a Records re-upload (recordController.attachRecordFile): a scan that is
 * on the share is never silently replaced, so `replace` must say what
 * becomes of it —
 *
 *   'keep'    the document points at the new scan; the old file stays
 *   'delete'  the old file is removed once the new one is written
 *
 * — and without it the answer is 409 HAS_DOCUMENT. A stored path that no
 * longer resolves on the share counts as no scan.
 *
 * Returns { document, previous, existing } for the controller's trail.
 */
async function attachFile(user, unitKey, serialNo, upload, { replace = '', folder = null, subfolder = null, targetPath = null } = {}) {
  const unit = assertUnit(unitKey);
  assertCanFile(user, unit);
  await connectToMongo();
  const before = await collection().findOne({ unit, serialNo });
  if (!before) throw notFoundError('Document not found.', 'DOCUMENT_NOT_FOUND');
  const docType = await config.docType(unit, before.docType);
  if (!docType) throw badRequest('This document\'s type is no longer configured.', 'DOCTYPE_UNKNOWN');

  const container = String(before.document?.container || unit).toLowerCase();
  const stored = before.document?.sharePath || before.document?.filePath;
  let existing = null;
  if (stored) {
    const found = await nas.statFile(stored, container);
    if (found.ok) {
      if (!['keep', 'delete'].includes(replace)) {
        throw conflict('This document already has a scan on the share. Choose whether to keep or delete it when re-uploading.', 'HAS_DOCUMENT');
      }
      existing = found;
    }
  }

  const filed = await filing.file(unit, docType, { province: before.province, fields: before.fields || {}, folder: clean(folder, 120), subfolder: clean(subfolder, 120), targetPath }, upload);
  if (!filed.ok) {
    const err = new Error(filed.message);
    err.status = ['NO_FILE', 'FILE_TYPE', 'FILE_TOO_LARGE'].includes(filed.code) ? 400 : 502;
    err.code = filed.code;
    throw err;
  }

  const now = new Date();
  const set = {
    document: { ...filed.document, uploadedAt: now, uploadedBy: user?.username || 'unknown' },
    updatedAt: now,
    updatedBy: user?.username || 'unknown',
  };
  set.searchText = searchTextOf({ ...before, ...set });
  await collection().updateOne({ _id: before._id }, { $set: set });

  // The old file goes only after the new one is written and the document
  // points at it, so a failure part-way leaves the document whole.
  let previous = null;
  if (existing && replace === 'delete') {
    const removed = await nas.removeFile(container, stored);
    previous = { fileName: existing.fileName, deleted: removed.ok, reason: removed.ok ? null : removed.reason, size: removed.size };
  } else if (existing) {
    previous = { fileName: existing.fileName, deleted: false, reason: 'kept' };
  }
  return { document: publicView({ ...before, ...set }), previous, existing: Boolean(existing), container };
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

// ---------------------------------------------------------------------------
// Suggestions for the upload form: values already on file in the unit, so a
// clerk filing the third document on a case picks the docket and company
// rather than typing them a third time — and types them the same way.
//
// A key field (the docket, the COC number) also carries the fields that go
// with it, from the latest document filed under it, for the form to fill in.
// ---------------------------------------------------------------------------

const SUGGESTABLE = {
  legal: ['docketNo', 'pabCaseNo', 'companyName', 'companyAddress', 'documentType'],
  laboratory: ['cocNo', 'firmName', 'address', 'receivedBy', 'unitUnderTest', 'subject'],
};
// What a chosen key value fills in, when the form left it empty.
const FILLS = {
  docketNo: ['pabCaseNo', 'companyName', 'companyAddress', 'natureOfBusiness'],
  cocNo: ['firmName', 'address'],
  firmName: ['address'],
  companyName: ['companyAddress'],
};
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function suggest(user, unitKey, field, q = '') {
  const unit = assertUnit(unitKey);
  assertCanSee(user, unit);
  if (!(SUGGESTABLE[unit] || []).includes(field)) return [];
  await connectToMongo();

  const path = `fields.${field}`;
  const text = String(q || '').trim().slice(0, 100);
  const match = { unit, [path]: text ? new RegExp(escapeRe(text), 'i') : { $nin: [null, ''] } };
  const fills = FILLS[field] || [];
  const groups = await collection()
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: `$${path}`,
          count: { $sum: 1 },
          // The latest document's companion values, for the form to fill.
          ...Object.fromEntries(fills.map((f) => [f, { $first: `$fields.${f}` }])),
        },
      },
      // Values starting with what was typed first, then the most used.
      { $addFields: { starts: text ? { $regexMatch: { input: { $toString: '$_id' }, regex: `^${escapeRe(text)}`, options: 'i' } } : true } },
      { $sort: { starts: -1, count: -1, _id: 1 } },
      { $limit: 15 },
    ])
    .toArray();

  return groups
    .filter((g) => g._id !== null && String(g._id).trim() !== '')
    .map((g) => {
      const fill = Object.fromEntries(fills.map((f) => [f, g[f]]).filter(([, v]) => v !== null && v !== undefined && v !== ''));
      return { value: String(g._id), count: g.count, ...(Object.keys(fill).length ? { fill } : {}) };
    });
}

function publicView(doc) {
  if (!doc) return null;
  const { _id, searchText, ...rest } = doc;
  return { id: String(_id), ...rest };
}

// Filing or editing changes the counts: clear them for the unit at once.
const clearingDashboard = (fn) => async (user, unitKey, ...rest) => {
  const result = await fn(user, unitKey, ...rest);
  shortCache.invalidate(DASHBOARD_CACHE + unitKey);
  return result;
};

module.exports = {
  COLLECTION,
  ensureIndexes,
  list,
  get,
  history,
  dashboard,
  create: clearingDashboard(create),
  update: clearingDashboard(update),
  attachFile: clearingDashboard(attachFile),
  forFile,
  validateFields,
  nextSerialNo,
  titleOf,
  searchTextOf,
  duplicateGroups,
  duplicatesByFileName,
  suggest,
  SUGGESTABLE,
};
