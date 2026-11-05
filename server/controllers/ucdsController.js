const dayjs = require('dayjs');
const { connectToMongo, collections, client, ObjectId } = require('../config/db');
const { withYear, stampYear, registerOf } = require('../services/yearScope');
const { PROVINCES, provinceScoped, requestAllowsProvince, provinceFilter: provinceFilterOf, userWritableProvinceKeys } = require('../services/provinces');
const { canAccessAllYears } = require('../services/authorization');
const { principalOf } = require('../middleware/auth');
const shortCache = require('../shared/services/shortCache');
const healthcareList = require('../modules/ucds/services/healthcare');
const { unitOf, groupOfUnit } = require('../services/progressTracker/analyze');

// The establishment register of the active year, confined to the provinces
// this request may touch.
const ucdsFor = (req) => provinceScoped(registerOf(req), req);

/**
 * The provinces this request may CHANGE, as a register filter (null: all).
 * Seeing a province ("view") is not changing it: the account needs
 * "readWrite" on it — the Developer and the Administrators keep every
 * province of the container, as they see them. Reads use ucdsFor; every
 * write to an existing establishment also passes this.
 */
function writableFilter(req) {
  const user = principalOf(req);
  const keys = Array.isArray(req.provinceKeys) ? req.provinceKeys : [];
  const writable = canAccessAllYears(user) ? keys : keys.filter((k) => userWritableProvinceKeys(user).includes(k));
  return provinceFilterOf(writable);
}

// Wraps a log collection so inserts are stamped and reads/deletes are filtered
// by the active year, without touching each call site individually.
function yearBoundLogs(collection, year) {
  return {
    insertOne: (doc, ...rest) => collection.insertOne(stampYear('ucdsLog', year, doc), ...rest),
    insertMany: (docs, ...rest) =>
      collection.insertMany(docs.map((d) => stampYear('ucdsLog', year, d)), ...rest),
    find: (filter = {}, ...rest) => collection.find(withYear('ucdsLog', year, filter), ...rest),
    findOne: (filter = {}, ...rest) => collection.findOne(withYear('ucdsLog', year, filter), ...rest),
    updateOne: (filter = {}, ...rest) => collection.updateOne(withYear('ucdsLog', year, filter), ...rest),
    deleteOne: (filter = {}, ...rest) => collection.deleteOne(withYear('ucdsLog', year, filter), ...rest),
    countDocuments: (filter = {}, ...rest) =>
      collection.countDocuments(withYear('ucdsLog', year, filter), ...rest),
  };
}
const { buildSortKeyQuery } = require('../utils/query');

function isMissingOrPlaceholder(value) {
  const placeholders = ['---', 'n/a', 'test', 'null', 'none', 'undefined'];
  return value === undefined || value === null || placeholders.includes(String(value).toLowerCase());
}

// The register's completeness check — the bell in the header.
//
// It used to send one sentence per missing field ("BA-00001 - Missing
// 'Street'") for every establishment: about 700,000 strings, 17.7 MB, built
// and serialised on every page load of every Planning user, after reading
// the whole register from Atlas. With a hundred people that alone was more
// than the server, the office network and the database could carry.
//
// Now: the field labels once, then each record's id with the numbers of the
// fields it lacks — the same information, about a tenth of the size — read
// with only the fields it checks, and computed once per province scope every
// five minutes however many people are signed in. A register edit made
// through the application clears it (see clearRegisterChecks).
const REGISTER_CHECKS = [
  ['industry_type', 'Industry Type'],
  ['industry_subtype', 'Industry Sub-type'],
  ['industry_class', 'Industry Class'],
  ['psic_code', 'PSIC Code'],
  ['mbu_area', 'MBU Area'],
  ['waterbody', 'Waterbody'],
  ['long', 'Longitude'],
  ['lat', 'Latitude'],
  ['cong_district', 'Congressional District'],
  ['street', 'Street'],
  ['brgy', 'Barangay'],
  ['city', 'City'],
  ['province', 'Province'],
  ['emp_total', 'Total Employees'],
  ['wwtf_type', 'WWTF Type'],
  ['section_incharged', 'Section In-Charge'],
  ['handler', 'Handler'],
  ['monitoring_sched', 'Monitoring Schedule'],
  ['insp_type', 'Inspection Type'],
  ['pismu_tracking', 'PISMU Tracking'],
  ['title_status', 'Title Status'],
  ['with_nov', 'With NOV'],
  ['pismu_count_month', 'PISMU Count Month'],
  ['permit_process', 'Permit Process'],
  ['denr_pab_case_no', 'DENR PAB Case No.'],
  ['legal_officer', 'Legal Officer'],
  ['tc_commitment', 'TC Commitment'],
  ['ecc_cnc', 'ECC/CNC'],
  ['pco_no', 'PCO Number'],
  ['pto_code', 'PTO Code'],
  ['wwdp_code', 'WWDP Code'],
  ['haz_id', 'HAZ ID'],
  ['pco_name', 'PCO Name'],
  ['docket_no', 'Docket No.'],
  ['v_pd1586', 'PD 1586'],
  ['v_ra9275', 'RA 9275'],
  ['v_ra8749', 'RA 8749'],
  ['v_ra6969_haz', 'RA 6969 (Hazardous)'],
  ['v_ra6969_chem', 'RA 6969 (Chemical)'],
  ['tc_date_actual', 'Actual TC Date'],
  ['speaker_name', 'Speaker Name'],
];
// Every cached answer derived from the register starts with this, so one
// invalidate() after an edit clears them all (clearRegisterChecks).
const REGISTER_CACHE = 'ucds:register-';
const REGISTER_CHECKS_CACHE = `${REGISTER_CACHE}checks:`;

/** The cache key for a request's province scope: one entry per distinct scope. */
function registerScopeKey(req, prefix = REGISTER_CHECKS_CACHE) {
  // Which register (2027 onward has its own) and which provinces.
  const scope = `${prefix}${req.yearContainer?.register || 'shared'}:`;
  const list = req.provinceFilter?.province?.$in;
  if (!req.provinceFilter) return scope + 'all';
  return scope + (Array.isArray(list) ? list.map((r) => String(r)).sort().join('|') : JSON.stringify(req.provinceFilter));
}

// How long a register answer still serves while the next is worked out behind
// it (shortCache). Only a write changes these, and a write through the
// application drops them at once; a reload by script is seen on the next ask.
const REGISTER_STALE_MS = 24 * 60 * 60 * 1000;

async function computeRegisterChecks(req) {
  await connectToMongo();
  const projection = { _id: 0, sort_key: 1, id_no: 1, ...Object.fromEntries(REGISTER_CHECKS.map(([key]) => [key, 1])) };
  const records = [];
  let issueCount = 0;
  const cursor = ucdsFor(req).find({}, { projection });
  for await (const record of cursor) {
    const missing = [];
    REGISTER_CHECKS.forEach(([key], i) => {
      if (isMissingOrPlaceholder(record[key])) missing.push(i);
    });
    if (missing.length) {
      records.push([record.sort_key || record.id_no || '[unknown]', missing]);
      issueCount += missing.length;
    }
  }
  return { fields: REGISTER_CHECKS.map(([, label]) => label), records, issueCount };
}

async function checkData(req, res) {
  try {
    const result = await shortCache.cached(registerScopeKey(req), 5 * 60 * 1000, () => computeRegisterChecks(req), { staleMs: REGISTER_STALE_MS });
    return res.json(result);
  } catch (error) {
    console.error('Error fetching or validating data:', error);
    return res.status(500).json({ error: 'Error occurred while validating data. Please try again later.' });
  }
}

/** A register edit changes what is missing, monitored, due: recompute on the next ask. */
const clearRegisterChecks = () => {
  shortCache.invalidate(REGISTER_CACHE);
  warmSoon();
};

// A grouping over the whole register, asked by every Planning page load
// (the bell): shared per scope for two minutes, cleared by any edit.
const registerDuplicates = (req) =>
  shortCache.cached(
    registerScopeKey(req, `${REGISTER_CACHE}duplicates:`),
    2 * 60 * 1000,
    async () => {
      await connectToMongo();
      return ucdsFor(req).aggregate([
        { $match: { ecc_cnc: { $exists: true, $ne: null } } },
        { $group: { _id: '$ecc_cnc', idNos: { $push: '$sort_key' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $project: { _id: 0, ecc_cnc: '$_id', idNos: 1, count: 1 } },
      ], { allowDiskUse: true }).toArray();
    },
    { staleMs: REGISTER_STALE_MS }
  );

async function getDuplicates(req, res) {
  try {
    return res.status(200).json({ duplicates: await registerDuplicates(req) });
  } catch (error) {
    console.error('Error detecting duplicate ECC/CNC values:', error);
    return res.status(500).json({ error: 'An error occurred while detecting duplicate ECC/CNC values.' });
  }
}

async function updateDuplicates(req, res) {
  try {
    await connectToMongo();
    const updates = req.body.updates;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Invalid updates format.' });

    const updateOps = updates.map((update) => {
      const { id_no, ...rest } = update;
      if (!id_no) return null;
      return { updateOne: { filter: { id_no }, update: { $set: rest } } };
    }).filter(Boolean);

    if (updateOps.length === 0) return res.status(400).json({ error: 'No valid updates provided.' });

    const result = await ucdsFor(req).bulkWrite(updateOps);
    return res.status(200).json({ message: 'Records updated successfully', result });
  } catch (error) {
    console.error('Error updating duplicates:', error);
    return res.status(500).json({ error: 'Failed to update records.' });
  }
}

async function archiveData(req, res) {
  const { id_no } = req.body;
  if (id_no === undefined || id_no === null || id_no === '') return res.status(400).json({ message: 'Invalid or missing id_no in the request body.' });
  const idNoNumber = Number(id_no);
  if (isNaN(idNoNumber)) return res.status(400).json({ message: 'id_no must be a valid number.' });

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const record = await ucdsFor(req).findOne({ id_no: idNoNumber }, { session });
      if (!record) throw new Error(`Record with id_no: ${idNoNumber} not found in ucds-data.`);

      const archiveResult = await collections.archive.insertOne(record, { session });
      if (!archiveResult.acknowledged) throw new Error('Failed to archive the record.');

      const deleteResult = await ucdsFor(req).deleteOne({ _id: record._id }, { session });
      if (deleteResult.deletedCount === 0) throw new Error('Failed to delete the record from ucds-data after archiving.');
    });
    res.status(201).json({ message: 'Record successfully transferred to archive-data.' });
  } catch (error) {
    console.error('Error transferring record:', error);
    res.status(500).json({ message: error.message || 'Failed to transfer the record.' });
  } finally {
    await session.endSession();
  }
}

async function getByIdentifier(req, res) {
  const { identifier } = req.params;
  try {
    await connectToMongo();
    const query = buildSortKeyQuery(String(identifier).trim());
    let record = await ucdsFor(req).findOne(query);
    if (!record) {
      record = await collections.archive.findOne(query);
      if (!record) return res.status(404).json({ message: `Record with identifier (sort_key): ${identifier} not found.` });
      record.archived = true;
    }
    res.status(200).json(record);
  } catch (error) {
    console.error('Error fetching record by identifier (sort_key):', error);
    res.status(500).json({ message: 'Error fetching record.' });
  }
}

async function getDistinctValues(req, res) {
  const { field } = req.query;
  if (!field) return res.status(400).json({ error: 'Field query parameter is required.' });

  const monthTypeFilterFieldsForServer = [
    'date_monitored','date_routed','date_signed','date_amended','date_approved','pto_issued','pto_expiration','wwdp_issued','wwdp_expiration','haz_issued','nov_issued','penalty_date','resolution_issued'
  ];
  const yearTypeFilterFieldsForServer = ['pco_validity'];

  const allowedFields = [
    'industry_type','industry_subtype','industry_class','psic_code','mbu_area','waterbody','emp_total','wwtf_type','cong_district','street','brgy','city','section_incharged','handler','monitoring_sched','insp_type','pismu_tracking','title_status','with_nov','pismu_count_month','permit_process','denr_pab_case_no','legal_officer','tc_commitment','province',
    ...monthTypeFilterFieldsForServer,
    ...yearTypeFilterFieldsForServer,
  ];
  if (!allowedFields.includes(field)) return res.status(400).json({ error: `Field '${field}' not allowed for distinct value query.` });

  try {
    await connectToMongo();
    const distinctRawValues = await ucdsFor(req).distinct(field, { [field]: { $exists: true, $ne: null, $ne: '' } });

    let processedValues = [];
    if (monthTypeFilterFieldsForServer.includes(field)) {
      const uniqueMonths = new Set();
      distinctRawValues.forEach((val) => {
        let dateVal = dayjs(val);
        if (dateVal.isValid()) uniqueMonths.add(dateVal.format('MMMM YYYY'));
      });
      processedValues = Array.from(uniqueMonths).sort((a, b) => dayjs(a, 'MMMM YYYY').valueOf() - dayjs(b, 'MMMM YYYY').valueOf());
    } else if (yearTypeFilterFieldsForServer.includes(field)) {
      const uniqueYears = new Set();
      distinctRawValues.forEach((val) => {
        let dateVal = dayjs(val);
        if (dateVal.isValid()) uniqueYears.add(dateVal.format('YYYY'));
      });
      processedValues = Array.from(uniqueYears).sort((a, b) => parseInt(a) - parseInt(b));
    } else {
      processedValues = distinctRawValues.map((val) => String(val)).sort((a, b) => String(a).localeCompare(String(b)));
    }
    res.status(200).json(processedValues);
  } catch (error) {
    console.error(`Error fetching distinct values for field ${field}:`, error);
    res.status(500).send('Internal Server Error');
  }
}

async function bulkUpdateUcds(req, res) {
  try {
    await connectToMongo();
    const updatesArray = req.body.updates;
    if (!Array.isArray(updatesArray) || updatesArray.length === 0) return res.status(400).json({ error: 'Invalid or empty updates array.' });

    const logsToInsert = [];
    const now = new Date();
    const transactionDate = now.toLocaleString('en-US', { hour12: true });
    const updatedBy = req.session && req.session.user ? req.session.user.username : 'Unknown User';

    const latestLog = await collections.ucdsLog.find(withYear('ucdsLog', req.activeYear, {})).sort({ transactionID: -1 }).limit(1).toArray();
    let transactionCounter = 1;
    if (latestLog.length && latestLog[0].transactionID) {
      const lastTxnNum = parseInt(latestLog[0].transactionID.replace('TRXM-', ''), 10);
      if (!isNaN(lastTxnNum)) transactionCounter = lastTxnNum + 1;
    }

    const bulkOps = [];
    const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // Each establishment changed must be in a province the account may change,
    // not only see. One that is not refuses the whole request — nothing written.
    const canWrite = writableFilter(req);

    // Every row's current values in one read, and which of them the account
    // may change in a second — it was two reads per row, so saving a few
    // hundred rows from the spreadsheet waited on a few hundred round trips.
    const items = updatesArray
      .filter((item) => item?.changes && Object.keys(item.changes).length && (item.sort_key || item.id_no))
      .map((item) => ({ ...item, filter: item.sort_key ? { sort_key: item.sort_key } : { id_no: item.id_no } }));
    const sortKeys = items.filter((i) => i.filter.sort_key).map((i) => i.sort_key);
    const idNos = items.filter((i) => !i.filter.sort_key).map((i) => i.id_no);
    const wanted = { $or: [{ sort_key: { $in: sortKeys } }, { id_no: { $in: idNos } }] };
    const bySortKey = new Map();
    const byIdNo = new Map();
    // The first match per key, as findOne() gave.
    for (const d of items.length ? await ucdsFor(req).find(wanted).toArray() : []) {
      if (d.sort_key != null && !bySortKey.has(d.sort_key)) bySortKey.set(d.sort_key, d);
      if (d.id_no != null && !byIdNo.has(d.id_no)) byIdNo.set(d.id_no, d);
    }
    const writable = canWrite && items.length ? new Set((await registerOf(req).find({ $and: [wanted, canWrite] }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id))) : null;

    for (const item of items) {
      const { changes, filter } = item;
      const oldDoc = filter.sort_key ? bySortKey.get(filter.sort_key) : byIdNo.get(filter.id_no);
      if (!oldDoc) continue;
      if (writable && !writable.has(String(oldDoc._id))) {
        return res.status(403).json({ error: `You may view ${oldDoc.province || 'this province'} but not change it. Ask the administrator for edit access.` });
      }

      const changeLogs = [];
      for (const field in changes) {
        const oldVal = oldDoc[field] ?? '-';
        const newVal = changes[field] ?? '-';
        if (typeof oldVal === 'string' && typeof newVal === 'string' ? oldVal.trim() !== newVal.trim() : !deepEqual(oldVal, newVal)) {
          changeLogs.push({ field, old_value: oldVal, new_value: newVal });
        }
      }
      if (changeLogs.length === 0) continue;

      const transactionID = `TRXM-${String(transactionCounter).padStart(4, '0')}`;
      transactionCounter++;

      logsToInsert.push({
        transactionID,
        transactionDate,
        actionType: 'Modified',
        ecc_cnc: changes.ecc_cnc || oldDoc.ecc_cnc,
        userActed: updatedBy,
        dateActed: transactionDate,
        changes: changeLogs,
      });

      bulkOps.push({ updateOne: { filter, update: { $set: changes } } });
    }

    if (bulkOps.length === 0) return res.status(400).json({ error: 'No valid update operations to perform.' });

    const result = await ucdsFor(req).bulkWrite(bulkOps);
    if (logsToInsert.length > 0) await collections.ucdsLog.insertMany(logsToInsert.map((l) => stampYear('ucdsLog', req.activeYear, l)));

    return res.status(200).json({ message: `${result.modifiedCount} records updated successfully.`, result });
  } catch (error) {
    console.error('Error during bulk update:', error);
    res.status(500).json({ error: 'Failed to perform bulk update.' });
  }
}

async function getDistinctDropdownValues(req, res) {
  try {
    await connectToMongo();
    const fields = ['industry_type','industry_subtype','industry_class','psic_code','mbu_area','waterbody','emp_total','wwtf_type','cong_district','street','brgy','city','section_incharged','handler','monitoring_sched','insp_type','pismu_tracking','title_status','with_nov','pismu_count_month','permit_process','denr_pab_case_no','legal_officer','tc_commitment','province'];
    const distinctValues = {};
    for (const f of fields) {
      distinctValues[f] = await ucdsFor(req).distinct(f, { [f]: { $exists: true, $ne: null, $ne: '' } });
    }
    res.status(200).json(distinctValues);
  } catch (error) {
    console.error('Error fetching distinct dropdown values:', error);
    res.status(500).json({ error: 'Failed to fetch distinct dropdown values.' });
  }
}

module.exports = {
  checkData,
  getDuplicates,
  updateDuplicates,
  archiveData,
  getByIdentifier,
  getDistinctValues,
  bulkUpdateUcds,
  getDistinctDropdownValues,
  // appended below
  // province data extractors will be exported too
};
 
// ---- Additional UCDS GET endpoints migration ----
// Helpers migrated from server.js (scoped here)
const PERMITS_SUMMARY_DEFAULT_PAGE_SIZE = 10;
const isValidDate = (d) => d instanceof Date && !isNaN(d);
function parseDateStringForStats(dateStrInput) {
  if (!dateStrInput || typeof dateStrInput !== 'string') return null;
  let dateStr = dateStrInput.trim();
  const yearRangeMatch = dateStr.match(/^(\d{4})-(\d{4})$/);
  if (yearRangeMatch) {
    const endYear = parseInt(yearRangeMatch[2], 10);
    if (endYear >= 1900 && endYear < 2100) return new Date(endYear, 11, 31);
    return null;
  }
  const nonDateKeywords = ['n/a','pending','approval','ongoing','application','for approval','verification','unknown','none','---','not applicable','coa no','ref no','dp-r03','fla-','in-process','app. no','for verification','new designated pco','contact person'];
  if (nonDateKeywords.some((kw) => dateStr.toLowerCase().includes(kw))) return null;
  if (/^#+$/.test(dateStr)) return null;
  if (/^\d{1,2}\/\d{1,2}\/\-\d{4}$/.test(dateStr)) return null;
  const lines = dateStr.split(/[\n\r]/);
  dateStr = lines[0].trim();
  let d = new Date(dateStr);
  if (isValidDate(d)) return d;
  const dmYMatch = dateStr.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$/);
  if (dmYMatch) {
    const day = parseInt(dmYMatch[1], 10);
    const month = parseInt(dmYMatch[2], 10);
    const year = parseInt(dmYMatch[3], 10);
    if (day > 12 && month <= 12 && year > 1900 && year < 2100) {
      d = new Date(`${month}/${day}/${year}`);
      if (isValidDate(d)) return d;
    }
  }
  const monthDotDayYearMatch = dateStr.match(/^([A-Za-z]{3,})\.?\s*(\d{1,2}),?\s*(\d{4})$/i);
  if (monthDotDayYearMatch) {
    const cleanedForParse = `${monthDotDayYearMatch[1]} ${monthDotDayYearMatch[2]} ${monthDotDayYearMatch[3]}`;
    d = new Date(cleanedForParse);
    if (isValidDate(d)) return d;
  }
  const dateFollowedByTextMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateFollowedByTextMatch) {
    d = new Date(dateFollowedByTextMatch[1]);
    if (isValidDate(d)) return d;
  }
  return null;
}
function isPermitExpired(dateStr) {
  const d = parseDateStringForStats(dateStr);
  if (!isValidDate(d)) return false;
  return new Date() > d;
}
function isPermitNearExpiry(dateStr, now = new Date()) {
  const d = parseDateStringForStats(dateStr);
  if (!isValidDate(d)) return false;
  const oneMonthBefore = new Date(d);
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
  return now >= oneMonthBefore && now <= d;
}

const permitKeyToFieldMap = {
  ecc_cnc: { queryField: 'ecc_cnc', dateField: 'date_approved', validityYears: 5, isDateAnExpiry: false, displayName: 'ECC/CNC' },
  pto_code: { queryField: 'pto_code', dateField: 'pto_expiration', isDateAnExpiry: true, displayName: 'PTO' },
  wwdp_code: { queryField: 'wwdp_code', dateField: 'wwdp_expiration', isDateAnExpiry: true, displayName: 'WWDP' },
  haz_id: { queryField: 'haz_id', dateField: 'haz_issued', validityYears: 1, isDateAnExpiry: false, displayName: 'HWG ID' },
  pco_no: { queryField: 'pco_no', dateField: 'pco_validity', isDateAnExpiry: true, displayName: 'PCO' },
};

// ---- Daily notices and monitored dates (migrated from server.js) ----
// Monitored dates and daily notices are asked for by every Planning
// dashboard, and are the same for everyone in the same province scope: read
// once per scope every two minutes, with only the fields they return (the
// notices used to read whole register documents to keep 31 fields of each).
// A register edit clears them (clearRegisterChecks).
const REGISTER_LIST_TTL = 2 * 60 * 1000;

async function getMonitoredDates(req, res) {
  try {
    const monitoredDates = await shortCache.cached(registerScopeKey(req, `${REGISTER_CACHE}monitored:`), REGISTER_LIST_TTL, async () => {
      await connectToMongo();
      return ucdsFor(req)
        .find({ title: { $exists: true, $ne: '' }, date_monitored: { $exists: true, $ne: '' } })
        .project({ title: 1, date_monitored: 1 })
        .toArray();
    });
    return res.status(200).json({ monitoredDates });
  } catch (error) {
    console.error('Error fetching monitored dates:', error);
    return res.status(500).json({ error: 'An error occurred while fetching monitored dates.' });
  }
}

const NOTICE_FIELDS = [
  'sort_key', 'title', 'name', 'address', 'industry_class', 'date_monitored', 'date_routed', 'date_signed',
  'iis_no_2024', 'iis_no_2025', 'pismu_tracking', 'section_incharged', 'fmr_section_incharged', 'handler',
  'monitoring_sched', 'insp_type', 'remarks', 'ecc_cnc', 'pto_code', 'wwdp_code', 'haz_id', 'pco_no',
  'pismu_count_month', 'title_status', 'docket_no', 'v_pd1586', 'v_ra9275', 'v_ra8749', 'v_ra6969_haz', 'v_ra6969_tchem',
];

async function getDailyNotices(req, res) {
  try {
    const notices = await shortCache.cached(registerScopeKey(req, `${REGISTER_CACHE}notices:`), REGISTER_LIST_TTL, async () => {
      await connectToMongo();
      const rawNotices = await ucdsFor(req)
        .find({ date_monitored: { $exists: true, $ne: '' } })
        .project(Object.fromEntries(NOTICE_FIELDS.map((f) => [f, 1])))
        .toArray();
      return rawNotices.map((doc) => ({
        _id: doc._id,
        ...Object.fromEntries(NOTICE_FIELDS.map((f) => [f, doc[f] || ''])),
      }));
    });
    return res.json({ notices });
  } catch (error) {
    console.error('Error fetching daily notices:', error);
    return res.status(500).json({ error: 'An error occurred while fetching daily notices.' });
  }
}

module.exports.getMonitoredDates = getMonitoredDates;
module.exports.getDailyNotices = getDailyNotices;

// Every permit of every establishment, with its expiry worked out: three dates
// parsed per record, on Node's one thread — the slowest thing on the Planning
// dashboard. Only the rows with a permit date cross the link: the rest were read
// (about two rows in three) to be dropped by the caller for having no permit.
async function computePermits(req, mongoQuery) {
  const now = new Date();
  const hasPermitDate = { $or: ['pto_issued', 'wwdp_issued', 'pco_validity'].map((field) => ({ [field]: { $nin: [null, ''] } })) };
  const allMatchingRecords = await ucdsFor(req)
    .find({ ...mongoQuery, $and: [hasPermitDate] }, { projection: { sort_key: 1, title: 1, name: 1, ecc_cnc: 1, pto_issued: 1, pto_code: 1, wwdp_issued: 1, wwdp_code: 1, pco_validity: 1, pco_no: 1 } })
    .toArray();
  return allMatchingRecords.map((record) => {
    const permits = [];
    if (record.pto_issued) {
      const issuedDate = parseDateStringForStats(record.pto_issued);
      if (isValidDate(issuedDate)) {
        const expiry = new Date(issuedDate); expiry.setFullYear(expiry.getFullYear() + 2);
        permits.push({ type: 'PTO', code: record.pto_code || '', expiry, isNearExpiry: isPermitNearExpiry(expiry.toISOString().split('T')[0], now), isExpired: isPermitExpired(expiry.toISOString().split('T')[0]) });
      }
    }
    if (record.wwdp_issued) {
      const issuedDate = parseDateStringForStats(record.wwdp_issued);
      if (isValidDate(issuedDate)) {
        const expiry = new Date(issuedDate); expiry.setFullYear(expiry.getFullYear() + 1);
        permits.push({ type: 'WWDP', code: record.wwdp_code || '', expiry, isNearExpiry: isPermitNearExpiry(expiry.toISOString().split('T')[0], now), isExpired: isPermitExpired(expiry.toISOString().split('T')[0]) });
      }
    }
    if (record.pco_validity) {
      const validityDate = parseDateStringForStats(record.pco_validity);
      if (isValidDate(validityDate)) {
        const expiry = validityDate;
        permits.push({ type: 'PCO', code: record.pco_no || '', expiry, isNearExpiry: isPermitNearExpiry(expiry.toISOString().split('T')[0], now), isExpired: isPermitExpired(expiry.toISOString().split('T')[0]) });
      }
    }
    return { sort_key: record.sort_key, title: record.title || record.name || 'Untitled', ecc_cnc: record.ecc_cnc || '', permits };
  });
}

// Without a search it is the same for everyone in the same scope, so it is
// shared for two minutes (cleared by any register edit); filtering and paging
// are per request and cheap.
const sharedPermits = (req, prefixList, mongoQuery) =>
  shortCache.cached(registerScopeKey(req, `${REGISTER_CACHE}permits:${prefixList.join(',')}:`), 2 * 60 * 1000, () => computePermits(req, mongoQuery), { staleMs: REGISTER_STALE_MS });

async function permitsSummary(req, res) {
  let { page = 1, pageSize = PERMITS_SUMMARY_DEFAULT_PAGE_SIZE, prefixes = '', searchText = '', filterEstablishmentsByExpiryStatus = 'false', permitTypesFilter = '' } = req.query;
  let currentPage = parseInt(page, 10);
  let pageSizeInt = parseInt(pageSize, 10);
  if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
  if (isNaN(pageSizeInt) || pageSizeInt <= 0) pageSizeInt = PERMITS_SUMMARY_DEFAULT_PAGE_SIZE;
  const skip = (currentPage - 1) * pageSizeInt;
  const shouldFilterByExpiry = filterEstablishmentsByExpiryStatus === 'true';
  try {
    await connectToMongo();
    const now = new Date();
    const prefixList = prefixes.split(',').map((p) => p.trim().toUpperCase()).filter((p) => p !== '');
    const mongoQuery = {};
    if (prefixList.length > 0) mongoQuery.sort_key = { $regex: `^(${prefixList.join('|')})`, $options: 'i' };
    if (searchText) {
      const searchRegex = { $regex: searchText, $options: 'i' };
      mongoQuery.$or = [{ sort_key: searchRegex }, { title: searchRegex }, { name: searchRegex }, { ecc_cnc: searchRegex }];
    }
    const processedRecords = searchText ? await computePermits(req, mongoQuery) : await sharedPermits(req, prefixList, mongoQuery);
    let finalRecordsToPaginate = processedRecords.filter((rec) => rec.permits.length > 0);
    if (shouldFilterByExpiry) {
      finalRecordsToPaginate = finalRecordsToPaginate.map((rec) => ({ ...rec, permits: rec.permits.filter((p) => p.isExpired || p.isNearExpiry) })).filter((rec) => rec.permits.length > 0);
    }
    const selectedPermitTypesArray = (permitTypesFilter || '').split(',').map((pt) => pt.trim().toUpperCase()).filter((pt) => pt !== '');
    if (selectedPermitTypesArray.length > 0) {
      finalRecordsToPaginate = finalRecordsToPaginate.filter((establishment) => establishment.permits.some((permit) => (permit.isExpired || permit.isNearExpiry) && selectedPermitTypesArray.includes(permit.type.toUpperCase())));
    }
    // order=soonest: what expires next first (the soonest upcoming expiry),
    // then what has already expired, the most recently expired first — the
    // dashboard's "Permits expiring soonest". Without it, the register's order.
    if (req.query.order === 'soonest') {
      const t = now.getTime();
      const rank = (rec) => {
        const times = rec.permits.map((p) => new Date(p.expiry).getTime()).filter(Number.isFinite);
        const upcoming = times.filter((x) => x >= t);
        return upcoming.length ? [0, Math.min(...upcoming)] : [1, -Math.max(...times)];
      };
      finalRecordsToPaginate = finalRecordsToPaginate
        .map((rec) => ({ rec, r: rank(rec) }))
        .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1])
        .map((x) => x.rec);
    }
    const totalRecords = finalRecordsToPaginate.length;
    const dataToSend = finalRecordsToPaginate.slice(skip, skip + pageSizeInt);
    // How many permits are already expired and how many expire soon, over the whole list.
    let expired = 0;
    let expiringSoon = 0;
    for (const rec of finalRecordsToPaginate) for (const p of rec.permits) p.isExpired ? (expired += 1) : p.isNearExpiry && (expiringSoon += 1);
    return res.json({ data: dataToSend, total: totalRecords, summary: { expired, expiringSoon } });
  } catch (err) {
    console.error('Error in /api/permits-summary:', err);
    return res.status(500).send('Internal Server Error');
  }
}

async function dashboardStats(req, res) {
  try {
    await connectToMongo();
    // Only a filter the dashboard knows: it names the cache entry below.
    const permitTypeFilterKey = permitKeyToFieldMap[req.query.permitTypeFilterKey] ? req.query.permitTypeFilterKey : '';
    // Nine aggregations and a read of the whole register, about 3 s on 4 Nov
    // 2026, for each viewer on every refresh of a dashboard that refreshes
    // itself. Worked out once per scope for two minutes (any register edit
    // clears it), and the reads no longer wait on one another.
    // By year as well: years can share a register, and the monitoring history
    // differs between them.
    return res.json(await sharedDashboardStats(req, permitTypeFilterKey));
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
}

const sharedDashboardStats = (req, permitTypeFilterKey) =>
  shortCache.cached(registerScopeKey(req, `${REGISTER_CACHE}dashboard:${req.activeYear}:${permitTypeFilterKey}:`), 2 * 60 * 1000, () => computeDashboardStats(req, permitTypeFilterKey), { staleMs: REGISTER_STALE_MS });

// A value the dashboard counts as filled in, in the database's terms: truthy, and
// text once trimmed. Worked out there: reading every row here to count them was
// nearly all of this screen's time.
const truthyExpr = (field) => ({ $not: [{ $in: [{ $ifNull: [`$${field}`, ''] }, ['', 0, false]] }] });
const filledExpr = (field) => ({ $ne: [{ $trim: { input: { $convert: { input: `$${field}`, to: 'string', onError: '[not text]', onNull: '' } } } }, ''] });
const countIf = (expr) => ({ $sum: { $cond: [expr, 1, 0] } });

async function computeDashboardStats(req, permitTypeFilterKey) {
    const year = Number(req.activeYear) || new Date().getFullYear();
    const historyYears = Array.from({ length: 4 }, (_, i) => year - 4 + i);
    const iisField = (y) => `iis_no_${y}`;
    const permitMatch = permitTypeFilterKey ? [{ $match: { [permitKeyToFieldMap[permitTypeFilterKey].queryField]: { $exists: true, $ne: null, $ne: '' } } }] : [];
    const [totalIndustries, resolvedEccCount, resolvedPtoCount, resolvedWwdpCount, resolvedHwgCount, resolvedPcoCount, sectionBreakdownResults, projectStatusResults, notYetMonitored, unitRows, expiryRows] = await Promise.all([
      ucdsFor(req).countDocuments({}),
      ucdsFor(req).countDocuments({ ecc_cnc: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ pto_code: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ wwdp_code: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ haz_id: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ pco_no: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).aggregate([
        ...permitMatch,
        { $match: { section_incharged: { $exists: true, $ne: null, $ne: '' } } },
        { $project: { sections: { $split: [{ $ifNull: ['$section_incharged', ''] }, ','] } } },
        { $unwind: '$sections' },
        { $project: { section: { $trim: { input: { $toUpper: { $replaceAll: { input: '$sections', find: ' ', replacement: '_' } } } } } } },
        { $match: { section: { $nin: ['N/A', 'NONE', '', null] } } },
        { $group: { _id: '$section', count: { $sum: 1 } } },
        { $project: { _id: 0, section: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]).toArray(),
      ucdsFor(req).aggregate([
        ...permitMatch,
        { $match: { title_status: { $exists: true, $ne: null, $ne: '' } } },
        { $project: { status: { $toUpper: { $trim: { input: { $ifNull: ['$title_status', ''] } } } } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).toArray(),
      // "Not yet monitored" is every establishment with no project status — the
      // field absent as well as blank. Only the blank ones were counted, so the
      // dashboard said 0 while thousands had never been monitored.
      ucdsFor(req).countDocuments({ $or: [{ title_status: { $exists: false } }, { title_status: null }, { title_status: { $regex: '^\\s*$' } }] }),
      // Grouped by the serial without its number, and the province: the most
      // that the list a row counts under (unitOf) can depend on. With the rows
      // holding any permit, those monitored this year, and those with an IIS
      // number of the years before: an establishment with one was monitored
      // that year (the monitoring history).
      ucdsFor(req)
        .aggregate([
          {
            $group: {
              _id: {
                serial: { $ifNull: [{ $first: { $getField: { field: 'captures', input: { $regexFind: { input: { $convert: { input: '$sort_key', to: 'string', onError: '', onNull: '' } }, regex: '^(.*-)\\d+$' } } } } }, { $convert: { input: '$sort_key', to: 'string', onError: '', onNull: '' } }] },
                province: '$province',
              },
              n: { $sum: 1 },
              anyPermit: countIf({ $or: ['ecc_cnc', 'pto_code', 'wwdp_code', 'haz_id', 'pco_no'].map(truthyExpr) }),
              monitored: countIf(filledExpr('date_monitored')),
              ...Object.fromEntries(historyYears.map((y) => [`y${y}`, countIf(filledExpr(iisField(y)))])),
            },
          },
        ])
        .toArray(),
      // The three expiry dates, as many rows as hold each combination.
      ucdsFor(req)
        .aggregate([
          { $match: { $or: ['pto_expiration', 'wwdp_expiration', 'pco_validity'].map((field) => ({ [field]: { $nin: [null, ''] } })) } },
          { $group: { _id: { pto: '$pto_expiration', wwdp: '$wwdp_expiration', pco: '$pco_validity' }, n: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    // Per province of the Monitoring Plan and per list (Healthcare Industries,
    // Chemical permits, TSD / TRC, Importers — the 2027 registers' own series),
    // as the Progress Tracker counts them (analyze.js unitOf).
    const byUnit = new Map();
    const monitoringHistory = Object.fromEntries(historyYears.map((y) => [y, 0]));
    let monitoredThisYear = 0;
    let industriesWithAnyPermit = 0;
    for (const row of unitRows) {
      // A number on the serial stands for the one it had: unitOf reads the shape.
      const key = /-$/.test(row._id.serial) ? `${row._id.serial}0` : row._id.serial;
      const unit = unitOf(key, row._id.province);
      byUnit.set(unit, (byUnit.get(unit) || 0) + row.n);
      industriesWithAnyPermit += row.anyPermit;
      monitoredThisYear += row.monitored;
      for (const y of historyYears) monitoringHistory[y] += row[`y${y}`];
    }
    const industriesWithAtLeastOneExpiredPermit = expiryRows.reduce((sum, r) => sum + (isPermitExpired(r._id.pto) || isPermitExpired(r._id.wwdp) || isPermitExpired(r._id.pco) ? r.n : 0), 0);
    const permitBreakdown = { ecc: resolvedEccCount, pto: resolvedPtoCount, wwdp: resolvedWwdpCount, hwg: resolvedHwgCount, pco: resolvedPcoCount };
    const projectStatusBreakdown = { operational: 0, nonOperational: 0, notOperational: 0, notYetMonitored: 0, other: 0 };
    projectStatusResults.forEach((item) => {
      if (item._id === 'OPERATIONAL') projectStatusBreakdown.operational = item.count;
      else if (item._id === 'NON-OPERATIONAL') projectStatusBreakdown.nonOperational = item.count;
      else if (item._id === 'NOT OPERATIONAL') projectStatusBreakdown.notOperational = item.count;
      else if (item._id === '') projectStatusBreakdown.notYetMonitored = item.count;
      else if (item._id && item._id !== 'N/A' && item._id !== 'NONE') projectStatusBreakdown.other += item.count;
    });
    projectStatusBreakdown.notYetMonitored = notYetMonitored;
    const unitRank = (u) => (groupOfUnit(u) === 'province' ? 0 : groupOfUnit(u) === 'healthcare' ? 1 : 2);
    const byList = [...byUnit]
      .map(([unit, count]) => ({ unit, label: unit.replace(/_/g, ' '), group: groupOfUnit(unit), count }))
      .sort((a, b) => unitRank(a.unit) - unitRank(b.unit) || (a.group === 'province' ? a.unit.localeCompare(b.unit) : b.count - a.count));
    return {
      totalIndustries,
      industriesWithAnyPermit,
      industriesWithAtLeastOneExpiredPermit,
      permitBreakdown,
      sectionBreakdown: sectionBreakdownResults,
      projectStatusBreakdown,
      year,
      byList,
      // Only the years the register has any IIS number for.
      monitoringHistory: Object.entries(monitoringHistory).filter(([, n]) => n > 0).map(([y, count]) => ({ year: Number(y), count })),
      monitoredThisYear,
    };
}

// ----- Province data extractors migrated from server.js -----
// Helper: Capitalize first letter of each word separated by underscore
function capitalizeFirstLetter(input) {
  return String(input || '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

// The register fields getProvinceData sends, by their names in the database
// (commitment, resolution and order go out as tc_commitment,
// resolution_issued and order_issued).
const PROVINCE_PROJECTION = Object.fromEntries(
  [
    'id_no', 'sort_key', 'helper_column', 'helper_count', 'title', 'name', 'address', 'ecc_cnc', 'industry_class', 'remarks',
    'industry_type', 'industry_subtype', 'psic_code', 'mbu_area', 'waterbody', 'long', 'lat', 'cong_district', 'street', 'brgy',
    'city', 'province', 'emp_total', 'wwtf_type', 'bod', 'section_incharged', 'handler', 'monitoring_sched', 'iis_no_2024',
    'iis_no_2025', 'iis_no_2026', 'iis_no_nov', 'protected_area', 'insp_type', 'date_monitored', 'date_routed', 'date_signed',
    'days_dmds', 'days_drds', 'pismu_tracking', 'title_status', 'with_nov', 'pismu_count_month', 'permit_process', 'date_amended',
    'date_approved', 'pto_code', 'pto_issued', 'pto_expiration', 'wwdp_code', 'wwdp_issued', 'wwdp_expiration', 'haz_id',
    'haz_issued', 'pco_no', 'pco_name', 'pco_validity', 'docket_no', 'denr_pab_case_no', 'nov_issued', 'v_pd1586', 'v_ra9275',
    'v_ra8749', 'v_ra6969_haz', 'v_ra6969_tchem', 'tc_date_actual', 'legal_officer', 'tc_compliance_link', 'pos_paper',
    'penalty_date', 'amount', 'or_number', 'commitment', 'other_tc_remarks', 'resolution', 'order', 'order_status', 'color',
  ].map((f) => [f, 1])
);
// The Monitoring Plan template's other fields (monitoringTemplate.js), which
// its spreadsheet and list show. Sent only when filled: most rows have none of
// them, and a province is already 2 to 10 MB.
const TEMPLATE_ONLY_FIELDS = ['iis_no_2027', 'latest_status', 'recommendations', 'iis_survey', 'reported_to_co', 'pd1586', 'ra8749', 'standby_genset', 'ra9275', 'ra6969'];
for (const f of TEMPLATE_ONLY_FIELDS) PROVINCE_PROJECTION[f] = 1;
const templateOnly = (doc) => Object.fromEntries(TEMPLATE_ONLY_FIELDS.filter((f) => doc[f] !== undefined && doc[f] !== null && doc[f] !== '').map((f) => [f, doc[f]]));

// One province as the JSON the screen is sent: see getProvinceData.
const provinceBody = (req, province, healthcare) =>
  shortCache.cached(
    registerScopeKey(req, `${REGISTER_CACHE}province:${province.toLowerCase()}:`),
    2 * 60 * 1000,
    async () => {
    // Only the fields the screen is sent (below): a register row loaded from
    // a RAW workbook carries many more, and every one was read from Atlas
    // and held in memory for each province, only to be dropped here.
    const provinceData = await ucdsFor(req)
      .find(healthcare ? healthcareList.healthcareFilter() : healthcareList.provinceFilter(req, new RegExp(`^${province}$`, 'i')), { projection: PROVINCE_PROJECTION })
      .toArray();
    provinceData.sort((a, b) => (a.id_no || 0) - (b.id_no || 0));
    return Buffer.from(JSON.stringify(provinceData.map((doc) => ({
      id_no: doc.id_no,
      sort_key: doc.sort_key || '',
      helper_column: doc.helper_column || '',
      helper_count: doc.helper_count || '',
      title: doc.title || '',
      name: doc.name || '',
      address: doc.address || '',
      ecc_cnc: doc.ecc_cnc || '',
      industry_class: doc.industry_class,
      remarks: doc.remarks || '',
      industry_type: doc.industry_type || '',
      industry_subtype: doc.industry_subtype || '',
      psic_code: doc.psic_code || '',
      mbu_area: doc.mbu_area || '',
      waterbody: doc.waterbody || '',
      long: doc.long || '',
      lat: doc.lat || '',
      cong_district: doc.cong_district || '',
      street: doc.street || '',
      brgy: doc.brgy || '',
      city: doc.city || '',
      province: doc.province || '',
      emp_total: doc.emp_total || '',
      wwtf_type: doc.wwtf_type || '',
      bod: doc.bod || '',
      section_incharged: doc.section_incharged || '',
      handler: doc.handler || '',
      monitoring_sched: doc.monitoring_sched || '',
      iis_no_2024: doc.iis_no_2024 || '',
      iis_no_2025: doc.iis_no_2025 || '',
      iis_no_2026: doc.iis_no_2026 || '',
      iis_no_nov: doc.iis_no_nov || '',
      protected_area: doc.protected_area || '',
      insp_type: doc.insp_type || '',
      date_monitored: doc.date_monitored || '',
      date_routed: doc.date_routed || '',
      date_signed: doc.date_signed || '',
      days_dmds: doc.days_dmds || '',
      days_drds: doc.days_drds || '',
      pismu_tracking: doc.pismu_tracking || '',
      title_status: doc.title_status || '',
      with_nov: doc.with_nov || '',
      pismu_count_month: doc.pismu_count_month || '',
      permit_process: doc.permit_process || '',
      date_amended: doc.date_amended || '',
      date_approved: doc.date_approved || '',
      pto_code: doc.pto_code || '',
      pto_issued: doc.pto_issued || '',
      pto_expiration: doc.pto_expiration || '',
      wwdp_code: doc.wwdp_code || '',
      wwdp_issued: doc.wwdp_issued || '',
      wwdp_expiration: doc.wwdp_expiration || '',
      haz_id: doc.haz_id || '',
      haz_issued: doc.haz_issued || '',
      pco_no: doc.pco_no || '',
      pco_name: doc.pco_name || '',
      pco_validity: doc.pco_validity || '',
      docket_no: doc.docket_no || '',
      denr_pab_case_no: doc.denr_pab_case_no || '',
      nov_issued: doc.nov_issued || '',
      v_pd1586: doc.v_pd1586 || '',
      v_ra9275: doc.v_ra9275 || '',
      v_ra8749: doc.v_ra8749 || '',
      v_ra6969_haz: doc.v_ra6969_haz || '',
      v_ra6969_tchem: doc.v_ra6969_tchem || '',
      tc_date_actual: doc.tc_date_actual || '',
      legal_officer: doc.legal_officer || '',
      tc_compliance_link: doc.tc_compliance_link || '',
      pos_paper: doc.pos_paper || '',
      penalty_date: doc.penalty_date || '',
      amount: doc.amount || '',
      or_number: doc.or_number || '',
      tc_commitment: doc.commitment || '',
      other_tc_remarks: doc.other_tc_remarks || '',
      resolution_issued: doc.resolution || '',
      order_issued: doc.order || '',
      order_status: doc.order_status || '',
      color: doc.color || '',
      ...templateOnly(doc),
    }))));
    },
    { staleMs: REGISTER_STALE_MS }
  );

async function getProvinceData(req, res) {
  try {
    await connectToMongo();
    const provinceQuery = req.query.province;
    if (!provinceQuery) return res.status(400).json({ error: 'Province parameter is required.' });
    const province = capitalizeFirstLetter(provinceQuery);
    // Healthcare Industries is not a province: the year's healthcare list,
    // across the provinces the account may see (ucdsFor applies that scope).
    const healthcare = healthcareList.isHealthcare(province);
    if (healthcare && !healthcareList.hasOwnRegister(req)) return res.json([]);

    // A province named in the query is a request, not an entitlement.
    if (!healthcare && !requestAllowsProvince(req, province)) {
      return res.status(403).json({
        code: 'PROVINCE_FORBIDDEN',
        error: `${province} is not available in the ${req.activeYear} data container for your account.`,
      });
    }

    // ucdsFor() already applies the request's province scope to every find, so
    // the filter here only narrows to the province that was asked for. This
    // previously called an undefined `withProvinceScope`, which threw on every
    // request — the helper exists in services/provinces.js but was never
    // imported, and applying it here would have scoped the query twice anyway.
    // Everyone opening the same province in the same scope shares one read
    // for two minutes — the whole province, 2 to 10 MB, was read from Atlas
    // for each of them. Every write to the register clears it (see
    // clearRegisterChecks), so an edit shows at once.
    // A browser keeps its copy and asks each time whether it is still right
    // (no-cache is "check first", not "do not keep"): unchanged, the answer is
    // a 304 with no body rather than the province again.
    res.set('Cache-Control', 'private, no-cache');
    // Kept as the JSON it is sent as: a fraction of the memory the rows take,
    // and not written out afresh (a tenth of a second of Node's one thread) for
    // each person. Past the two minutes it still answers, and is read again
    // behind that: a province was seconds over the link, tens of them at worst.
    const body = await provinceBody(req, province, healthcare);
    if (body.length <= 2) return res.status(404).json({ message: `No data found for ${province}.` });
    return res.status(200).type('application/json').send(body);
  } catch (error) {
    console.error('Error retrieving data:', error);
    return res.status(500).json({ error: 'Failed to retrieve data. Please try again later.' });
  }
}

// The keyword search's text index, made once per register per process — it
// was asked of Atlas on every extract, an index build check each time.
const textIndexed = new Map(); // register name -> Promise
function textIndexOnce(col) {
  if (!textIndexed.has(col.collectionName)) {
    textIndexed.set(
      col.collectionName,
      col.createIndex({ description: 'text' }).catch((err) => {
        textIndexed.delete(col.collectionName);
        throw err;
      })
    );
  }
  return textIndexed.get(col.collectionName);
}

async function extractProvinceData(req, res) {
  try {
    await connectToMongo();
    const { province, keyword, startDate, endDate } = req.query;
    await textIndexOnce(registerOf(req));
    const query = {};
    if (keyword) query.$text = { $search: keyword };
    if (startDate && endDate) query.date_approved = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (province && province !== 'All') {
      const provinceCapitalized = capitalizeFirstLetter(province);
      if (!requestAllowsProvince(req, provinceCapitalized)) {
        return res.status(403).json({
          code: 'PROVINCE_FORBIDDEN',
          error: `${provinceCapitalized} is not available in the ${req.activeYear} data container for your account.`,
        });
      }
      query.province = new RegExp(`^${provinceCapitalized}$`, 'i');
    }
    const provinceData = await ucdsFor(req).find(query).toArray();
    if (provinceData.length === 0) return res.status(404).json({ message: `No data found for ${province}.` });
    provinceData.sort((a, b) => (a.id_no || 0) - (b.id_no || 0));
    const formattedData = provinceData.map((doc) => ({
      id_no: doc.id_no,
      sort_key: doc.sort_key || '',
      helper_column: doc.helper_column || '',
      helper_count: doc.helper_count || '',
      title: doc.title || '',
      name: doc.name || '',
      address: doc.address || '',
      ecc_cnc: doc.ecc_cnc || '',
      industry_class: doc.industry_class,
      remarks: doc.remarks || '',
      industry_type: doc.industry_type || '',
      industry_subtype: doc.industry_subtype || '',
      psic_code: doc.psic_code || '',
      mbu_area: doc.mbu_area || '',
      waterbody: doc.waterbody || '',
      long: doc.long || '',
      lat: doc.lat || '',
      cong_district: doc.cong_district || '',
      street: doc.street || '',
      brgy: doc.brgy || '',
      city: doc.city || '',
      province: doc.province || '',
      emp_total: doc.emp_total || '',
      wwtf_type: doc.wwtf_type || '',
      bod: doc.bod || '',
      section_incharged: doc.section_incharged || '',
      handler: doc.handler || '',
      monitoring_sched: doc.monitoring_sched || '',
      iis_no_2024: doc.iis_no_2024 || '',
      iis_no_2025: doc.iis_no_2025 || '',
      iis_no_2026: doc.iis_no_2026 || '',
      iis_no_nov: doc.iis_no_nov || '',
      protected_area: doc.protected_area || '',
      insp_type: doc.insp_type || '',
      date_monitored: doc.date_monitored || '',
      date_routed: doc.date_routed || '',
      date_signed: doc.date_signed || '',
      days_dmds: doc.days_dmds || '',
      days_drds: doc.days_drds || '',
      pismu_tracking: doc.pismu_tracking || '',
      title_status: doc.title_status || '',
      with_nov: doc.with_nov || '',
      pismu_count_month: doc.pismu_count_month || '',
      permit_process: doc.permit_process || '',
      date_amended: doc.date_amended || '',
      date_approved: doc.date_approved || '',
      pto_code: doc.pto_code || '',
      pto_issued: doc.pto_issued || '',
      pto_expiration: doc.pto_expiration || '',
      wwdp_code: doc.wwdp_code || '',
      wwdp_issued: doc.wwdp_issued || '',
      wwdp_expiration: doc.wwdp_expiration || '',
      haz_id: doc.haz_id || '',
      haz_issued: doc.haz_issued || '',
      pco_no: doc.pco_no || '',
      pco_name: doc.pco_name || '',
      pco_validity: doc.pco_validity || '',
      docket_no: doc.docket_no || '',
      denr_pab_case_no: doc.denr_pab_case_no || '',
      nov_issued: doc.nov_issued || '',
      v_pd1586: doc.v_pd1586 || '',
      v_ra9275: doc.v_ra9275 || '',
      v_ra8749: doc.v_ra8749 || '',
      v_ra6969_haz: doc.v_ra6969_haz || '',
      v_ra6969_tchem: doc.v_ra6969_tchem || '',
      tc_date_actual: doc.tc_date_actual || '',
      legal_officer: doc.legal_officer || '',
      tc_compliance_link: doc.tc_compliance_link || '',
      pos_paper: doc.pos_paper || '',
      penalty_date: doc.penalty_date || '',
      amount: doc.amount || '',
      or_number: doc.or_number || '',
      tc_commitment: doc.commitment || '',
      other_tc_remarks: doc.other_tc_remarks || '',
      resolution_issued: doc.resolution || '',
      order_issued: doc.order || '',
      order_status: doc.order_status || '',
      color: doc.color || '',
    }));
    return res.status(200).json(formattedData);
  } catch (error) {
    console.error('Error retrieving data:', error);
    return res.status(500).json({ error: 'Failed to retrieve data. Please try again later.' });
  }
}

module.exports.getProvinceData = getProvinceData;

// ----- Worked out ahead of the people who ask -----
// When a Planning screen opens, its dashboard, permits, register check and
// reports all ask at once, each reading over a link that slows with every reader:
// up to 9 s each on 4 Nov 2026, for the first to arrive after a restart or an
// edit. Done here one after another, for the whole of each open year (every
// account holding all seven provinces shares these): nothing waits on it, and
// a person who arrives first simply joins what is under way.
let warmable = false;
let warmTimer = null;

async function warmRegisterCaches({ provinces = false } = {}) {
  warmable = true;
  const started = Date.now();
  const yearService = require('../services/yearService');
  const reports = require('../modules/ucds/services/ucdsReports');
  const { authorizedProvinces } = require('../services/authorization');
  let warmed = 0;
  for (const container of await yearService.listYears()) {
    if (!(await yearService.isSelectableYear(container.year))) continue;
    const req = { activeYear: container.year, yearContainer: container, provinceFilter: provinceFilterOf(authorizedProvinces({ permission: 'developer' }, container)) };
    await sharedDashboardStats(req, '');
    await shortCache.cached(registerScopeKey(req), 5 * 60 * 1000, () => computeRegisterChecks(req), { staleMs: REGISTER_STALE_MS });
    await registerDuplicates(req);
    await sharedPermits(req, [], {});
    await reports.notInErms(ucdsFor(req), { cacheKey: reports.scopeKeyOf(req) });
    // Every province too, at startup: the slowest read of all, and only the first
    // person to open each would wait. Not after each edit: only the province
    // edited needs it, and that is read when it is next opened.
    if (provinces) for (const { value } of PROVINCES) await provinceBody(req, value, false);
    warmed += 1;
  }
  console.log(`Register answers ready for ${warmed} year(s) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

/** After an edit drops them, once the edits have paused. */
function warmSoon() {
  if (!warmable) return;
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => warmRegisterCaches().catch((err) => console.warn(`[cache] could not warm the register answers: ${err.message}`)), 30 * 1000);
  if (warmTimer.unref) warmTimer.unref();
}

module.exports.warmRegisterCaches = warmRegisterCaches;
module.exports.extractProvinceData = extractProvinceData;

async function getBySortKey(req, res) {
  const { sort_key } = req.params;
  try {
    await connectToMongo();
    let data = await ucdsFor(req).findOne({ sort_key: { $regex: `^${String(sort_key).trim()}$`, $options: 'i' } });
    if (!data) {
      data = await collections.archive.findOne({ sort_key: { $regex: `^${String(sort_key).trim()}$`, $options: 'i' } });
      if (!data) return res.status(404).json({ message: `Data not found for sort_key: ${sort_key}` });
      data.archived = true;
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error(`Error fetching data by sort_key (${sort_key}):`, error);
    return res.status(500).json({ message: 'Error fetching record by sort_key.' });
  }
}

async function getNextId(req, res) {
  try {
    await connectToMongo();
    const { province } = req.query;
    if (!province) return res.status(200).json({ nextIdNo: 'No ID assigned yet' });
    const provincePrefixes = { Aurora: 'AU-', Bataan: 'BA-', Bulacan: 'BU-', Nueva_Ecija: 'NE-', Pampanga: 'PA-', Tarlac: 'TA-', Zambales: 'ZA-' };
    const prefix = provincePrefixes[province];
    if (!prefix) return res.status(400).json({ error: 'Invalid province' });
    // The id_no alone: every establishment in the province was read whole for it.
    const surveys = await ucdsFor(req).find({ province }, { projection: { _id: 0, id_no: 1 } }).toArray();
    const maxIdNo = surveys.reduce((max, survey) => { const match = (survey.id_no || '').toString().match(/\d+$/); const idNo = match ? parseInt(match[0], 10) : 0; return idNo > max ? idNo : max; }, 0);
    const nextIdNo = maxIdNo + 1;
    const formattedId = `${prefix}${nextIdNo}`;
    return res.status(200).json({ nextIdNo: formattedId });
  } catch (error) {
    console.error('Error fetching next id_no:', error);
    return res.status(500).send('Internal Server Error');
  }
}

const escapeRx = (s) => String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Search-as-you-type over one register field: each value containing what was
 * typed, and how many establishments hold it ([{ keyword, count }], the most
 * held first). Counted by the database: every matching establishment was read
 * whole and counted here, on every keystroke of everyone typing. What was
 * typed is matched as written — a "(" made an invalid pattern and a 500.
 */
async function valueCounts(req, field, query) {
  const rows = await ucdsFor(req)
    .aggregate([
      { $match: { [field]: new RegExp(escapeRx(query), 'i') } },
      { $group: { _id: { $toString: `$${field}` }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({ keyword: r._id, count: r.count }));
}

async function searchName(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'name', req.query.query));
  } catch (error) {
    console.error('Error searching names:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchTitle(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'title', req.query.query));
  } catch (error) {
    console.error('Error searching titles:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchIndustryClass(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'industry_class', req.query.query));
  } catch (error) {
    console.error('Error searching industry class:', error);
    return res.status(500).send('Internal Server Error');
  }
}

// GET /api/ucds-data with filters, pagination, and sorting logic
async function getUcdsData(req, res) {
  try {
    await connectToMongo();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const mongoQuery = {};
    const queryConditions = [];

    const globalSearchFields = [
      'name','title','ecc_cnc','sort_key','address','industry_class','section_incharged','handler','remarks','province','city','brgy','psic_code','pco_name','legal_officer','title_status'
    ];

    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = globalSearchFields.map((sField) => {
          if (sField === 'sort_key') {
            const parts = searchTermTrimmed.split('-');
            if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1])) {
              const prefix = parts[0];
              const numberPart = parts[1];
              return { [sField]: { $regex: `^${prefix}-0*${numberPart}$`, $options: 'i' } };
            }
            return { [sField]: { $regex: searchTermTrimmed, $options: 'i' } };
          }
          return { [sField]: { $regex: searchTermTrimmed, $options: 'i' } };
        });
        if (orConditions.length > 0) queryConditions.push({ $or: orConditions });
      }
    }

    const topLevelFilterKeys = ['search','page','pageSize','projectStatus','sectionFilter','permitTypeKey','filterExpired','province'];
    const { projectStatus, sectionFilter, permitTypeKey, filterExpired } = req.query;

    const columnFilterableFields = [
      'sort_key','name','title','long','lat','bod','address','iis_no_2024','iis_no_2025','days_dmds','days_drds','remarks','ecc_cnc','pco_no','pto_code','wwdp_code','haz_id','pco_name','docket_no','v_pd1586','v_ra9275','v_ra8749','v_ra6969_haz','v_ra6969_tchem','tc_date_actual','tc_compliance_link','pos_paper','amount','or_number','other_tc_remarks','order_issued','order_status','date_monitored','date_routed','date_signed','date_amended','date_approved','pto_issued','pto_expiration','wwdp_issued','wwdp_expiration','haz_issued','nov_issued','penalty_date','resolution_issued','pco_validity','province','industry_type','industry_subtype','industry_class','psic_code','mbu_area','waterbody','emp_total','wwtf_type','cong_district','street','brgy','city','section_incharged','handler','monitoring_sched','insp_type','pismu_tracking','title_status','with_nov','pismu_count_month','permit_process','denr_pab_case_no','legal_officer','tc_commitment','province'
    ];
    const inputTypeFilterFields = [
      'sort_key','name','title','long','lat','bod','address','iis_no_2024','iis_no_2025','days_dmds','days_drds','remarks','ecc_cnc','pco_no','pto_code','wwdp_code','haz_id','pco_name','docket_no','v_pd1586','v_ra9275','v_ra8749','v_ra6969_haz','v_ra6969_tchem','tc_date_actual','tc_compliance_link','pos_paper','amount','or_number','other_tc_remarks','order_issued','order_status','date_monitored','date_routed','date_signed','date_amended','date_approved','pto_issued','pto_expiration','wwdp_issued','wwdp_expiration','haz_issued','nov_issued','penalty_date','resolution_issued','pco_validity','industry_type','industry_subtype','industry_class','psic_code','mbu_area','waterbody','emp_total','wwtf_type','cong_district','street','brgy','city','section_incharged','handler','monitoring_sched','insp_type','pismu_tracking','title_status','with_nov','pismu_count_month','permit_process','denr_pab_case_no','legal_officer','tc_commitment','province'
    ];
    const monthTypeFilterFields = [ 'date_monitored','date_routed','date_signed','date_amended','date_approved','pto_issued','pto_expiration','wwdp_issued','wwdp_expiration','haz_issued','nov_issued','penalty_date','resolution_issued' ];
    const yearTypeFilterFields = ['pco_validity'];

    columnFilterableFields.forEach((field) => {
      if (req.query[field] && req.query[field].length > 0 && !topLevelFilterKeys.includes(field)) {
        const filterValues = Array.isArray(req.query[field]) ? req.query[field] : [req.query[field]];
        const firstFilterValue = String(filterValues[0]).trim();
        let handledBySpecificLogic = false;

        if (field === 'sort_key') {
          const parts = firstFilterValue.split('-');
          if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1])) {
            const prefix = parts[0];
            const numberPart = parts[1];
            queryConditions.push({ [field]: { $regex: `^${prefix}-0*${numberPart}$`, $options: 'i' } });
            handledBySpecificLogic = true;
          }
        }

        if (!handledBySpecificLogic) {
          if (inputTypeFilterFields.includes(field)) {
            queryConditions.push({ [field]: { $regex: firstFilterValue, $options: 'i' } });
          } else if (monthTypeFilterFields.includes(field)) {
            const targetMonth = dayjs(firstFilterValue, 'MMMM YYYY');
            if (targetMonth.isValid()) {
              const startDate = targetMonth.startOf('month').toDate();
              const endDate = targetMonth.endOf('month').toDate();
              queryConditions.push({ [field]: { $gte: startDate, $lte: endDate } });
            }
          } else if (yearTypeFilterFields.includes(field)) {
            const targetYear = dayjs(firstFilterValue, 'YYYY');
            if (targetYear.isValid()) {
              const startDate = targetYear.startOf('year').toDate();
              const endDate = targetYear.endOf('year').toDate();
              queryConditions.push({ [field]: { $gte: startDate, $lte: endDate } });
            }
          } else {
            queryConditions.push({ [field]: { $in: filterValues.map((val) => String(val).trim()) } });
          }
        }
      }
    });

    if (projectStatus) {
      const statusKey = projectStatus.toLowerCase();
      if (statusKey === 'operational') queryConditions.push({ title_status: { $regex: /^OPERATIONAL$/i } });
      else if (statusKey === 'nonoperational') queryConditions.push({ title_status: { $regex: /^NON-OPERATIONAL$/i } });
      else if (statusKey === 'notoperational') queryConditions.push({ title_status: { $regex: /^NOT OPERATIONAL$/i } });
      else if (statusKey === 'notyetmonitored') queryConditions.push({ title_status: { $in: ['', null] } });
      else if (statusKey === 'other') {
        queryConditions.push({
          title_status: {
            $nin: ['OPERATIONAL','NON-OPERATIONAL','NOT OPERATIONAL','','null','N/A','NONE'],
            $exists: true,
            $ne: 'N/A',
            $ne: 'NONE',
          },
        });
      }
    }

    if (sectionFilter && typeof sectionFilter === 'string' && sectionFilter.trim() !== '') {
      queryConditions.push({ section_incharged: { $regex: sectionFilter.trim(), $options: 'i' } });
    }

    if (permitTypeKey && typeof permitTypeKey === 'string' && permitTypeKey.trim() !== '') {
      const fieldToFilter = permitTypeKey.trim();
      queryConditions.push({ [fieldToFilter]: { $exists: true, $ne: null, $ne: '' } });
    }

    const { province: queryProvince } = req.query;
    if (queryProvince && typeof queryProvince === 'string' && queryProvince.trim() !== '' && queryProvince.trim().toLowerCase() !== 'all provinces') {
      queryConditions.push({ province: { $regex: `^${queryProvince.trim()}$`, $options: 'i' } });
    }

    if (queryConditions.length > 0) mongoQuery.$and = queryConditions;

    let surveys;
    let total;

    if (filterExpired === 'true') {
      // Decided and sorted on four fields; only the page asked for is read
      // whole (every matching establishment was, to send one page of them).
      const allMatchingRecords = await ucdsFor(req).find(mongoQuery, { projection: { _id: 1, sort_key: 1, pto_expiration: 1, wwdp_expiration: 1, pco_validity: 1 } }).toArray();
      const recordsWithExpiredPermits = allMatchingRecords.filter((record) =>
        isPermitExpired(record.pto_expiration) || isPermitExpired(record.wwdp_expiration) || isPermitExpired(record.pco_validity)
      );
      total = recordsWithExpiredPermits.length;
      recordsWithExpiredPermits.sort((a, b) => {
        const getSortParts = (sortKeyStr) => {
          const sKey = String(sortKeyStr || '');
          if (!sKey.includes('-')) return { prefix: sKey, num: 0 };
          const parts = sKey.split('-');
          return { prefix: parts[0], num: parseInt(parts[1], 10) || 0 };
        };
        const partsA = getSortParts(a.sort_key);
        const partsB = getSortParts(b.sort_key);
        if (partsA.prefix < partsB.prefix) return -1;
        if (partsA.prefix > partsB.prefix) return 1;
        return partsA.num - partsB.num;
      });
      const pageIds = recordsWithExpiredPermits.slice(skip, skip + pageSize).map((r) => r._id);
      const full = new Map((await ucdsFor(req).find({ _id: { $in: pageIds } }).toArray()).map((d) => [String(d._id), d]));
      surveys = pageIds.map((id) => full.get(String(id))).filter(Boolean);
    } else {
      total = await ucdsFor(req).countDocuments(mongoQuery);
      const pipeline = [];
      if (Object.keys(mongoQuery).length > 0) pipeline.push({ $match: mongoQuery });
      pipeline.push(
        { $addFields: { _temp_sort_key: { $ifNull: ['$sort_key', ''] } } },
        { $addFields: { _sort_key_parts: { $split: ['$_temp_sort_key', '-'] } } },
        { $addFields: {
          _sort_key_prefix: {
            $cond: { if: { $gt: [{ $size: { $ifNull: ['$_sort_key_parts', []] } }, 0] }, then: { $arrayElemAt: ['$_sort_key_parts', 0] }, else: '$_temp_sort_key' },
          },
          _sort_key_number_str: {
            $cond: { if: { $gt: [{ $size: { $ifNull: ['$_sort_key_parts', []] } }, 1] }, then: { $arrayElemAt: ['$_sort_key_parts', 1] }, else: null },
          },
        } },
        { $addFields: { _sort_key_number: { $convert: { input: '$_sort_key_number_str', to: 'int', onError: null, onNull: null } } } }
      );
      pipeline.push({ $sort: { _sort_key_prefix: 1, _sort_key_number: 1 } });
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: pageSize });
      pipeline.push({ $project: { _temp_sort_key: 0, _sort_key_parts: 0, _sort_key_prefix: 0, _sort_key_number_str: 0, _sort_key_number: 0 } });
      surveys = await ucdsFor(req).aggregate(pipeline, { allowDiskUse: true }).toArray();
    }

    return res.status(200).json({ data: surveys, total });
  } catch (error) {
    console.error('Error fetching UCDS data:', error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports.getUcdsData = getUcdsData;
module.exports.permitsSummary = permitsSummary;
module.exports.dashboardStats = dashboardStats;
module.exports.getBySortKey = getBySortKey;
module.exports.getNextId = getNextId;
module.exports.searchName = searchName;
module.exports.searchTitle = searchTitle;
module.exports.searchIndustryClass = searchIndustryClass;

// Additional simple UCDS endpoints
async function firmCount(req, res) {
  try {
    await connectToMongo();
    const count = await ucdsFor(req).countDocuments({});
    return res.status(200).json({ count, updatedFirms: 0 });
  } catch (error) {
    console.error('Error retrieving firm count:', error);
    return res.status(500).json({ error: 'Failed to retrieve firm count.' });
  }
}

async function getAllUcds(req, res) {
  try {
    await connectToMongo();
    const surveys = await ucdsFor(req).find({}).toArray();
    res.status(200).json(surveys);
  } catch (error) {
    console.error('Error fetching UCDS data:', error);
    res.status(500).send('Internal Server Error');
  }
}

async function searchEccCnc(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'ecc_cnc', req.query.query));
  } catch (error) {
    console.error('Error searching ECC CNCs:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function checkDuplicate(req, res) {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: 'Query parameter is required' });
  try {
    await connectToMongo();
    // The number as written: a "." in it matched any character, a "(" threw.
    const regex = new RegExp(`^${escapeRx(query)}$`, 'i');
    const duplicateEntry = await ucdsFor(req).findOne({ ecc_cnc: regex }, { projection: { ecc_cnc: 1, name: 1, title: 1, province: 1 } });
    if (duplicateEntry) {
      return res.status(200).json({
        duplicate: true,
        details: {
          id: duplicateEntry._id,
          ecc_cnc: duplicateEntry.ecc_cnc,
          name: duplicateEntry.name || 'N/A',
          title: duplicateEntry.title || 'N/A',
          province: duplicateEntry.province || 'N/A',
        },
      });
    }
    return res.status(200).json({ duplicate: false });
  } catch (error) {
    console.error('Error checking duplicate ECC CNC:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function searchPtoCode(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'pto_code', req.query.query));
  } catch (error) {
    console.error('Error searching PTO codes:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchWwdpCode(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'wwdp_code', req.query.query));
  } catch (error) {
    console.error('Error searching WWDP codes:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchHazId(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'haz_id', req.query.query));
  } catch (error) {
    console.error('Error searching HAZ IDs:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchPcoNo(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'pco_no', req.query.query));
  } catch (error) {
    console.error('Error searching PCO numbers:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchPcoName(req, res) {
  try {
    await connectToMongo();
    return res.status(200).json(await valueCounts(req, 'pco_name', req.query.query));
  } catch (error) {
    console.error('Error searching PCO names:', error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports.firmCount = firmCount;
module.exports.getAllUcds = getAllUcds;
module.exports.searchEccCnc = searchEccCnc;
module.exports.checkDuplicate = checkDuplicate;
module.exports.searchPtoCode = searchPtoCode;
module.exports.searchWwdpCode = searchWwdpCode;
module.exports.searchHazId = searchHazId;
module.exports.searchPcoNo = searchPcoNo;
module.exports.searchPcoName = searchPcoName;

// Lightweight locations for map rendering
async function getUcdsLocations(req, res) {
  try {
    await connectToMongo();
    const data = await ucdsFor(req)
      .find({}, { projection: { lat: 1, long: 1, name: 1, _id: 0 } })
      .toArray();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching UCDS locations:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Simple UCDS count endpoint (legacy parity)
async function getUcdsCount(req, res) {
  try {
    await connectToMongo();
    const count = await ucdsFor(req).countDocuments();
    return res.status(200).json(count);
  } catch (error) {
    console.error('Error fetching UCDS count:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports.getUcdsLocations = getUcdsLocations;
module.exports.getUcdsCount = getUcdsCount;

async function addEstablishment(req, res) {
  try {
    await connectToMongo();
    const {
      id_no,
      title,
      name,
      address,
      ecc_cnc,
      industry_class,
      remarks,
      industry_type,
      industry_subtype,
      psic_code,
      mbu_area,
      waterbody,
      long,
      lat,
      cong_district,
      street,
      brgy,
      city,
      province,
      emp_total,
      wwtf_type,
      bod,
      section_incharged,
      handler,
      monitoring_sched,
      iis_no,
      iis_no_2025,
      insp_type,
      date_monitored,
      date_routed,
      date_signed,
      days_dmds,
      days_drds,
      pismu_tracking,
      title_status,
      with_nov,
      permit_process,
      date_amended,
      date_approved,
      pto_code,
      pto_issued,
      pto_expiration,
      wwdp_code,
      wwdp_issued,
      wwdp_expiration,
      haz_id,
      haz_issued,
      pco_no,
      pco_name,
      pco_validity,
      docket_no,
      denr_pab_case_no,
      nov_issued,
      v_pd1586,
      v_ra9275,
      v_ra8749,
      v_ra6969_haz,
      v_ra6969_tchem,
      tc_date_actual,
      legal_officer,
      tc_compliance_link,
      pos_paper,
      penalty_date,
      amount,
      or_number,
      tc_commitment,
      other_tc_remarks,
      resolution_issued,
      order_issued,
      order_status,
      current_user,
      division,
    } = req.body;

    if (!name || !title || !province || !ecc_cnc) return res.status(400).json({ message: 'Missing required fields' });
    const existingRecord = await ucdsFor(req).findOne({ ecc_cnc });
    if (existingRecord) return res.status(409).json({ message: 'Duplicate entry found', details: existingRecord });

    const newEntry = {
      id_no,
      title,
      name,
      address,
      ecc_cnc,
      industry_class,
      remarks,
      industry_type,
      industry_subtype,
      psic_code,
      mbu_area,
      waterbody,
      long,
      lat,
      cong_district,
      street,
      brgy,
      city,
      province,
      emp_total,
      wwtf_type,
      bod,
      section_incharged,
      handler,
      monitoring_sched,
      iis_no,
      iis_no_2025,
      insp_type,
      date_monitored,
      date_routed,
      date_signed,
      days_dmds,
      days_drds,
      pismu_tracking,
      title_status,
      with_nov,
      permit_process,
      date_amended,
      date_approved,
      pto_code,
      pto_issued,
      pto_expiration,
      wwdp_code,
      wwdp_issued,
      wwdp_expiration,
      haz_id,
      haz_issued,
      pco_no,
      pco_name,
      pco_validity,
      docket_no,
      denr_pab_case_no,
      nov_issued,
      v_pd1586,
      v_ra9275,
      v_ra8749,
      v_ra6969_haz,
      v_ra6969_tchem,
      tc_date_actual,
      legal_officer,
      tc_compliance_link,
      pos_paper,
      penalty_date,
      amount,
      or_number,
      tc_commitment,
      other_tc_remarks,
      resolution_issued,
      order_issued,
      order_status,
      createdBy: current_user,
      division,
      dateAdded: new Date(),
    };
    const result = await ucdsFor(req).insertOne(newEntry);
    return res.status(201).json({ message: 'Establishment added successfully', id: result.insertedId });
  } catch (error) {
    console.error('Error adding establishment:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports.addEstablishment = addEstablishment;

// ---- UCDS write endpoints migrated from server.js ----
async function updateData(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params; // BU-201 or ObjectId
    const newData = req.body;
    const updatedBy = req.session && req.session.user ? req.session.user.username : 'Unknown User';

    // Build query by ObjectId or sort_key flexible match
    let filter = {};
    if (ObjectId.isValid(id)) filter = { _id: new ObjectId(id) };
    else filter = buildSortKeyQuery(id);

    const collection = ucdsFor(req);
    const logsCollection = yearBoundLogs(collections.ucdsLog, req.activeYear);

    const oldDocument = await collection.findOne(filter);
    if (!oldDocument) return res.status(404).json({ error: 'Data not found' });

    const result = await collection.updateOne(filter, { $set: newData });

    // Generate transaction log when updated
    if (result.modifiedCount === 1) {
      const latestLog = await logsCollection.find({}).sort({ transactionID: -1 }).limit(1).toArray();
      let newTransactionNumber = 1;
      if (latestLog.length && latestLog[0].transactionID) {
        const lastTxnNum = parseInt(latestLog[0].transactionID.replace('TRXM-', ''), 10);
        if (!isNaN(lastTxnNum)) newTransactionNumber = lastTxnNum + 1;
      }
      const transactionID = `TRXM-${String(newTransactionNumber).padStart(4, '0')}`;

      const changes = [];
      Object.keys(newData).forEach((key) => {
        if (oldDocument[key] !== newData[key]) {
          changes.push({ field: key, old_value: oldDocument[key], new_value: newData[key] });
        }
      });

      await logsCollection.insertOne({
        transactionID,
        transactionDate: new Date().toLocaleString('en-US', { hour12: true }),
        actionType: 'Modified',
        // The record itself: its History is read by serial (an ECC/CNC can be shared, or missing).
        sort_key: oldDocument.sort_key,
        ecc_cnc: newData.ecc_cnc || oldDocument.ecc_cnc,
        userActed: updatedBy,
        dateActed: new Date().toLocaleString('en-US', { hour12: true }),
        changes,
      });

      return res.status(200).json({ message: 'Data updated successfully' });
    }

    return res.status(200).json({ message: 'No changes were made' });
  } catch (error) {
    console.error('Error updating data:', error);
    return res.status(500).json({ error: 'Failed to update data. Please try again later.' });
  }
}

async function revertByEcc(req, res) {
  try {
    await connectToMongo();
    const { ecc_cnc, sort_key, field, oldValue } = req.body;
    if ((!ecc_cnc && !sort_key) || !field || oldValue === undefined) return res.status(400).json({ error: 'Missing required fields: sort_key (or ecc_cnc), field, or oldValue.' });
    // Who reverted: the session's account, not a name sent in the body.
    const updated_by = req.session?.user?.username || req.body.updated_by || 'Unknown User';

    const dataCollection = ucdsFor(req);
    const logsCollection = yearBoundLogs(collections.ucdsLog, req.activeYear);

    // The record by its serial; by ECC/CNC only for an older caller (an ECC can
    // be on several records, and this changed whichever came first).
    const filter = sort_key ? { sort_key } : { ecc_cnc };
    const originalDoc = await dataCollection.findOne(filter);
    if (!originalDoc) return res.status(404).json({ error: 'Document not found.' });

    const currentValue = originalDoc[field];
    if (currentValue === oldValue) return res.status(200).json({ message: 'No changes to revert.' });

    const update = { $set: { [field]: oldValue, updated_by, updated_at: new Date() } };
    const result = await dataCollection.updateOne(filter, update);

    if (result.modifiedCount === 1) {
      const lastLog = await logsCollection.find().sort({ transactionID: -1 }).limit(1).toArray();
      let newTxnNumber = 1;
      if (lastLog.length && lastLog[0].transactionID?.startsWith('TRXM-')) {
        const lastNum = parseInt(lastLog[0].transactionID.replace('TRXM-', ''), 10);
        if (!isNaN(lastNum)) newTxnNumber = lastNum + 1;
      }
      const transactionID = `TRXM-${String(newTxnNumber).padStart(4, '0')}`;

      const revertLog = {
        transactionID,
        transactionDate: new Date().toLocaleString('en-US', { hour12: true }),
        actionType: 'Reverted',
        sort_key: originalDoc.sort_key,
        ecc_cnc: originalDoc.ecc_cnc || ecc_cnc,
        userActed: updated_by,
        dateActed: new Date().toLocaleString('en-US', { hour12: true }),
        changes: [ { field, old_value: currentValue, new_value: oldValue } ],
      };

      await logsCollection.insertOne(revertLog);
      return res.status(200).json({ message: 'Revert successful', revertLog });
    }
    return res.status(200).json({ message: 'No changes were made' });
  } catch (err) {
    console.error('Error in /api/revert-by-ecc:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updatePermitExpiry(req, res) {
  const { sort_key, permitType, newExpiryDate, newPermitCode } = req.body;
  if (!sort_key || !permitType || !newExpiryDate) return res.status(400).json({ message: 'Missing required fields: sort_key, permitType, or newExpiryDate.' });
  try {
    await connectToMongo();
    let parsedNewExpiry;
    if (typeof newExpiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(newExpiryDate)) parsedNewExpiry = new Date(newExpiryDate);
    else parsedNewExpiry = new Date(newExpiryDate);
    if (!(parsedNewExpiry instanceof Date) || isNaN(parsedNewExpiry)) return res.status(400).json({ message: 'Invalid newExpiryDate format. Please use YYYY-MM-DD.' });

    const fieldsToUpdate = {};
    if (permitType === 'PTO') {
      const newIssueDate = new Date(parsedNewExpiry); newIssueDate.setFullYear(newIssueDate.getFullYear() - 2);
      fieldsToUpdate['pto_issued'] = newIssueDate.toISOString().split('T')[0];
      if (newPermitCode !== undefined) fieldsToUpdate['pto_code'] = newPermitCode;
    } else if (permitType === 'WWDP') {
      const newIssueDate = new Date(parsedNewExpiry); newIssueDate.setFullYear(newIssueDate.getFullYear() - 1);
      fieldsToUpdate['wwdp_issued'] = newIssueDate.toISOString().split('T')[0];
      if (newPermitCode !== undefined) fieldsToUpdate['wwdp_code'] = newPermitCode;
    } else if (permitType === 'PCO') {
      fieldsToUpdate['pco_validity'] = parsedNewExpiry.toISOString().split('T')[0];
      if (newPermitCode !== undefined) fieldsToUpdate['pco_no'] = newPermitCode;
    } else {
      return res.status(400).json({ message: 'Invalid permitType.' });
    }

    const result = await ucdsFor(req).updateOne({ sort_key }, { $set: fieldsToUpdate });
    if (result.matchedCount === 0) return res.status(404).json({ message: `Record with sort_key ${sort_key} not found.` });
    if (result.modifiedCount === 0) return res.status(200).json({ message: 'No changes made to the permit expiry.' });
    return res.status(200).json({ message: 'Permit expiry updated successfully.' });
  } catch (err) {
    console.error('Error updating permit expiry:', err);
    return res.status(500).json({ message: 'Internal Server Error while updating permit expiry.' });
  }
}

module.exports.updateData = updateData;
module.exports.revertByEcc = revertByEcc;
module.exports.updatePermitExpiry = updatePermitExpiry;

// Register writes change what the completeness check reports (checkData):
// once one succeeds, the cached result is dropped and the next ask
// recomputes it. Named as the handler they wrap, for the route audit.
for (const name of ['updateDuplicates', 'archiveData', 'bulkUpdateUcds', 'addEstablishment', 'updateData', 'revertByEcc', 'updatePermitExpiry']) {
  const handler = module.exports[name];
  const wrapped = (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) clearRegisterChecks();
    });
    return handler(req, res, next);
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  module.exports[name] = wrapped;
}
