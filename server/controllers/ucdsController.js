const dayjs = require('dayjs');
const { connectToMongo, collections, client, ObjectId } = require('../config/db');
const { withYear, stampYear } = require('../services/yearScope');
const { provinceScoped, requestAllowsProvince } = require('../services/provinces');

// The establishment register, confined to the provinces this request may touch.
const ucdsFor = (req) => provinceScoped(collections.ucds, req);

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

async function checkData(req, res) {
  try {
    await connectToMongo();
    const sampleData = await ucdsFor(req).find().toArray();

    const issues = [];
    sampleData.forEach((record) => {
      const id_no = record.sort_key || record.id_no || '[unknown]';
      if (isMissingOrPlaceholder(record.industry_type)) issues.push(`${id_no} - Missing 'Industry Type'`);
      if (isMissingOrPlaceholder(record.industry_subtype)) issues.push(`${id_no} - Missing 'Industry Sub-type'`);
      if (isMissingOrPlaceholder(record.industry_class)) issues.push(`${id_no} - Missing 'Industry Class'`);
      if (isMissingOrPlaceholder(record.psic_code)) issues.push(`${id_no} - Missing 'PSIC Code'`);
      if (isMissingOrPlaceholder(record.mbu_area)) issues.push(`${id_no} - Missing 'MBU Area'`);
      if (isMissingOrPlaceholder(record.waterbody)) issues.push(`${id_no} - Missing 'Waterbody'`);
      if (isMissingOrPlaceholder(record.long)) issues.push(`${id_no} - Missing 'Longitude'`);
      if (isMissingOrPlaceholder(record.lat)) issues.push(`${id_no} - Missing 'Latitude'`);
      if (isMissingOrPlaceholder(record.cong_district)) issues.push(`${id_no} - Missing 'Congressional District'`);
      if (isMissingOrPlaceholder(record.street)) issues.push(`${id_no} - Missing 'Street'`);
      if (isMissingOrPlaceholder(record.brgy)) issues.push(`${id_no} - Missing 'Barangay'`);
      if (isMissingOrPlaceholder(record.city)) issues.push(`${id_no} - Missing 'City'`);
      if (isMissingOrPlaceholder(record.province)) issues.push(`${id_no} - Missing 'Province'`);
      if (isMissingOrPlaceholder(record.emp_total)) issues.push(`${id_no} - Missing 'Total Employees'`);
      if (isMissingOrPlaceholder(record.wwtf_type)) issues.push(`${id_no} - Missing 'WWTF Type'`);
      if (isMissingOrPlaceholder(record.section_incharged)) issues.push(`${id_no} - Missing 'Section In-Charge'`);
      if (isMissingOrPlaceholder(record.handler)) issues.push(`${id_no} - Missing 'Handler'`);
      if (isMissingOrPlaceholder(record.monitoring_sched)) issues.push(`${id_no} - Missing 'Monitoring Schedule'`);
      if (isMissingOrPlaceholder(record.insp_type)) issues.push(`${id_no} - Missing 'Inspection Type'`);
      if (isMissingOrPlaceholder(record.pismu_tracking)) issues.push(`${id_no} - Missing 'PISMU Tracking'`);
      if (isMissingOrPlaceholder(record.title_status)) issues.push(`${id_no} - Missing 'Title Status'`);
      if (isMissingOrPlaceholder(record.with_nov)) issues.push(`${id_no} - Missing 'With NOV'`);
      if (isMissingOrPlaceholder(record.pismu_count_month)) issues.push(`${id_no} - Missing 'PISMU Count Month'`);
      if (isMissingOrPlaceholder(record.permit_process)) issues.push(`${id_no} - Missing 'Permit Process'`);
      if (isMissingOrPlaceholder(record.denr_pab_case_no)) issues.push(`${id_no} - Missing 'DENR PAB Case No.'`);
      if (isMissingOrPlaceholder(record.legal_officer)) issues.push(`${id_no} - Missing 'Legal Officer'`);
      if (isMissingOrPlaceholder(record.tc_commitment)) issues.push(`${id_no} - Missing 'TC Commitment'`);
      if (isMissingOrPlaceholder(record.ecc_cnc)) issues.push(`${id_no} - Missing 'ECC/CNC'`);
      if (isMissingOrPlaceholder(record.pco_no)) issues.push(`${id_no} - Missing 'PCO Number'`);
      if (isMissingOrPlaceholder(record.pto_code)) issues.push(`${id_no} - Missing 'PTO Code'`);
      if (isMissingOrPlaceholder(record.wwdp_code)) issues.push(`${id_no} - Missing 'WWDP Code'`);
      if (isMissingOrPlaceholder(record.haz_id)) issues.push(`${id_no} - Missing 'HAZ ID'`);
      if (isMissingOrPlaceholder(record.pco_name)) issues.push(`${id_no} - Missing 'PCO Name'`);
      if (isMissingOrPlaceholder(record.docket_no)) issues.push(`${id_no} - Missing 'Docket No.'`);
      if (isMissingOrPlaceholder(record.v_pd1586)) issues.push(`${id_no} - Missing 'PD 1586'`);
      if (isMissingOrPlaceholder(record.v_ra9275)) issues.push(`${id_no} - Missing 'RA 9275'`);
      if (isMissingOrPlaceholder(record.v_ra8749)) issues.push(`${id_no} - Missing 'RA 8749'`);
      if (isMissingOrPlaceholder(record.v_ra6969_haz)) issues.push(`${id_no} - Missing 'RA 6969 (Hazardous)'`);
      if (isMissingOrPlaceholder(record.v_ra6969_chem)) issues.push(`${id_no} - Missing 'RA 6969 (Chemical)'`);
      if (isMissingOrPlaceholder(record.tc_date_actual)) issues.push(`${id_no} - Missing 'Actual TC Date'`);
      if (isMissingOrPlaceholder(record.legal_officer)) issues.push(`${id_no} - Missing 'Legal Officer'`);
      if (isMissingOrPlaceholder(record.speaker_name)) issues.push(`${id_no} - Missing 'Speaker Name'`);
    });

    return res.json({ issues });
  } catch (error) {
    console.error('Error fetching or validating data:', error);
    return res.status(500).json({ issues: ['Error occurred while validating data. Please try again later.'] });
  }
}

async function getDuplicates(req, res) {
  try {
    await connectToMongo();
    const duplicates = await ucdsFor(req).aggregate([
      { $match: { ecc_cnc: { $exists: true, $ne: null } } },
      { $group: { _id: '$ecc_cnc', idNos: { $push: '$sort_key' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, ecc_cnc: '$_id', idNos: 1, count: 1 } },
    ], { allowDiskUse: true }).toArray();
    return res.status(200).json({ duplicates });
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

    for (const item of updatesArray) {
      const { changes, sort_key, id_no } = item;
      if (!changes || Object.keys(changes).length === 0) continue;

      let filter = {};
      if (sort_key) filter = { sort_key };
      else if (id_no) filter = { id_no };
      else continue;

      const oldDoc = await ucdsFor(req).findOne(filter);
      if (!oldDoc) continue;

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
async function getMonitoredDates(req, res) {
  try {
    await connectToMongo();
    const monitoredDates = await ucdsFor(req)
      .find({ title: { $exists: true, $ne: '' }, date_monitored: { $exists: true, $ne: '' } })
      .project({ title: 1, date_monitored: 1 })
      .toArray();
    return res.status(200).json({ monitoredDates });
  } catch (error) {
    console.error('Error fetching monitored dates:', error);
    return res.status(500).json({ error: 'An error occurred while fetching monitored dates.' });
  }
}

async function getDailyNotices(req, res) {
  try {
    await connectToMongo();
    const rawNotices = await ucdsFor(req)
      .find({ date_monitored: { $exists: true, $ne: '' } })
      .toArray();

    const notices = rawNotices.map((doc) => ({
      _id: doc._id,
      sort_key: doc.sort_key || '',
      title: doc.title || '',
      name: doc.name || '',
      address: doc.address || '',
      industry_class: doc.industry_class || '',
      date_monitored: doc.date_monitored || '',
      date_routed: doc.date_routed || '',
      date_signed: doc.date_signed || '',
      iis_no_2024: doc.iis_no_2024 || '',
      iis_no_2025: doc.iis_no_2025 || '',
      pismu_tracking: doc.pismu_tracking || '',
      section_incharged: doc.section_incharged || '',
      fmr_section_incharged: doc.fmr_section_incharged || '',
      handler: doc.handler || '',
      monitoring_sched: doc.monitoring_sched || '',
      insp_type: doc.insp_type || '',
      remarks: doc.remarks || '',
      ecc_cnc: doc.ecc_cnc || '',
      pto_code: doc.pto_code || '',
      wwdp_code: doc.wwdp_code || '',
      haz_id: doc.haz_id || '',
      pco_no: doc.pco_no || '',
      pismu_count_month: doc.pismu_count_month || '',
      title_status: doc.title_status || '',
      docket_no: doc.docket_no || '',
      v_pd1586: doc.v_pd1586 || '',
      v_ra9275: doc.v_ra9275 || '',
      v_ra8749: doc.v_ra8749 || '',
      v_ra6969_haz: doc.v_ra6969_haz || '',
      v_ra6969_tchem: doc.v_ra6969_tchem || '',
    }));

    return res.json({ notices });
  } catch (error) {
    console.error('Error fetching daily notices:', error);
    return res.status(500).json({ error: 'An error occurred while fetching daily notices.' });
  }
}

module.exports.getMonitoredDates = getMonitoredDates;
module.exports.getDailyNotices = getDailyNotices;

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
    const allMatchingRecords = await ucdsFor(req).find(mongoQuery, { projection: { sort_key: 1, title: 1, name: 1, ecc_cnc: 1, pto_issued: 1, pto_code: 1, wwdp_issued: 1, wwdp_code: 1, pco_validity: 1, pco_no: 1 } }).toArray();
    let processedRecords = allMatchingRecords.map((record) => {
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
    let finalRecordsToPaginate = processedRecords.filter((rec) => rec.permits.length > 0);
    if (shouldFilterByExpiry) {
      finalRecordsToPaginate = finalRecordsToPaginate.map((rec) => ({ ...rec, permits: rec.permits.filter((p) => p.isExpired || p.isNearExpiry) })).filter((rec) => rec.permits.length > 0);
    }
    const selectedPermitTypesArray = (permitTypesFilter || '').split(',').map((pt) => pt.trim().toUpperCase()).filter((pt) => pt !== '');
    if (selectedPermitTypesArray.length > 0) {
      finalRecordsToPaginate = finalRecordsToPaginate.filter((establishment) => establishment.permits.some((permit) => (permit.isExpired || permit.isNearExpiry) && selectedPermitTypesArray.includes(permit.type.toUpperCase())));
    }
    const totalRecords = finalRecordsToPaginate.length;
    const dataToSend = finalRecordsToPaginate.slice(skip, skip + pageSizeInt);
    return res.json({ data: dataToSend, total: totalRecords });
  } catch (err) {
    console.error('Error in /api/permits-summary:', err);
    return res.status(500).send('Internal Server Error');
  }
}

async function dashboardStats(req, res) {
  try {
    await connectToMongo();
    const { permitTypeFilterKey } = req.query;
    const totalIndustries = await ucdsFor(req).countDocuments({});
    const [resolvedEccCount, resolvedPtoCount, resolvedWwdpCount, resolvedHwgCount, resolvedPcoCount] = await Promise.all([
      ucdsFor(req).countDocuments({ ecc_cnc: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ pto_code: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ wwdp_code: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ haz_id: { $exists: true, $ne: null, $ne: '' } }),
      ucdsFor(req).countDocuments({ pco_no: { $exists: true, $ne: null, $ne: '' } }),
    ]);
    const permitBreakdown = { ecc: resolvedEccCount, pto: resolvedPtoCount, wwdp: resolvedWwdpCount, hwg: resolvedHwgCount, pco: resolvedPcoCount };
    const sectionBreakdownResults = await ucdsFor(req).aggregate([
      ...(permitTypeFilterKey && permitKeyToFieldMap[permitTypeFilterKey] ? [{ $match: { [permitKeyToFieldMap[permitTypeFilterKey].queryField]: { $exists: true, $ne: null, $ne: '' } } }] : []),
      { $match: { section_incharged: { $exists: true, $ne: null, $ne: '' } } },
      { $project: { sections: { $split: [{ $ifNull: ['$section_incharged', ''] }, ','] } } },
      { $unwind: '$sections' },
      { $project: { section: { $trim: { input: { $toUpper: { $replaceAll: { input: '$sections', find: ' ', replacement: '_' } } } } } } },
      { $match: { section: { $nin: ['N/A', 'NONE', '', null] } } },
      { $group: { _id: '$section', count: { $sum: 1 } } },
      { $project: { _id: 0, section: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]).toArray();
    const projectStatusResults = await ucdsFor(req).aggregate([
      ...(permitTypeFilterKey && permitKeyToFieldMap[permitTypeFilterKey] ? [{ $match: { [permitKeyToFieldMap[permitTypeFilterKey].queryField]: { $exists: true, $ne: null, $ne: '' } } }] : []),
      { $match: { title_status: { $exists: true, $ne: null, $ne: '' } } },
      { $project: { status: { $toUpper: { $trim: { input: { $ifNull: ['$title_status', ''] } } } } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();
    const projectStatusBreakdown = { operational: 0, nonOperational: 0, notOperational: 0, notYetMonitored: 0, other: 0 };
    projectStatusResults.forEach((item) => {
      if (item._id === 'OPERATIONAL') projectStatusBreakdown.operational = item.count;
      else if (item._id === 'NON-OPERATIONAL') projectStatusBreakdown.nonOperational = item.count;
      else if (item._id === 'NOT OPERATIONAL') projectStatusBreakdown.notOperational = item.count;
      else if (item._id === '') projectStatusBreakdown.notYetMonitored = item.count;
      else if (item._id && item._id !== 'N/A' && item._id !== 'NONE') projectStatusBreakdown.other += item.count;
    });
    const industriesCursor = ucdsFor(req).find({}, { projection: { _id: 1, ecc_cnc: 1, pto_code: 1, wwdp_code: 1, haz_id: 1, pco_no: 1, pto_expiration: 1, wwdp_expiration: 1, pco_validity: 1 } });
    const industriesWithAnyPermitSet = new Set();
    const industriesWithExpiredPermitSet = new Set();
    await industriesCursor.forEach((item) => {
      if (item.ecc_cnc || item.pto_code || item.wwdp_code || item.haz_id || item.pco_no) industriesWithAnyPermitSet.add(item._id.toString());
      if (isPermitExpired(item.pto_expiration) || isPermitExpired(item.wwdp_expiration) || isPermitExpired(item.pco_validity)) industriesWithExpiredPermitSet.add(item._id.toString());
    });
    return res.json({ totalIndustries, industriesWithAnyPermit: industriesWithAnyPermitSet.size, industriesWithAtLeastOneExpiredPermit: industriesWithExpiredPermitSet.size, permitBreakdown, sectionBreakdown: sectionBreakdownResults, projectStatusBreakdown });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
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

async function getProvinceData(req, res) {
  try {
    await connectToMongo();
    const provinceQuery = req.query.province;
    if (!provinceQuery) return res.status(400).json({ error: 'Province parameter is required.' });
    const province = capitalizeFirstLetter(provinceQuery);

    // A province named in the query is a request, not an entitlement.
    if (!requestAllowsProvince(req, province)) {
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
    const provinceData = await ucdsFor(req)
      .find({ province: new RegExp(`^${province}$`, 'i') })
      .toArray();
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

async function extractProvinceData(req, res) {
  try {
    await connectToMongo();
    const { province, keyword, startDate, endDate } = req.query;
    await ucdsFor(req).createIndex({ description: 'text' });
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
    const surveys = await ucdsFor(req).find({ province }).toArray();
    const maxIdNo = surveys.reduce((max, survey) => { const match = (survey.id_no || '').toString().match(/\d+$/); const idNo = match ? parseInt(match[0], 10) : 0; return idNo > max ? idNo : max; }, 0);
    const nextIdNo = maxIdNo + 1;
    const formattedId = `${prefix}${nextIdNo}`;
    return res.status(200).json({ nextIdNo: formattedId });
  } catch (error) {
    console.error('Error fetching next id_no:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchName(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ name: regex }).toArray();
    const nameCounts = results.reduce((acc, item) => { const name = (item.name || '').toString(); acc[name] = (acc[name] || 0) + 1; return acc; }, {});
    const uniqueNames = Object.keys(nameCounts).map((key) => ({ keyword: key, count: nameCounts[key] }));
    return res.status(200).json(uniqueNames);
  } catch (error) {
    console.error('Error searching names:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchTitle(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ title: regex }).toArray();
    const titleCounts = results.reduce((acc, item) => { const title = (item.title || '').toString(); acc[title] = (acc[title] || 0) + 1; return acc; }, {});
    const uniqueTitles = Object.keys(titleCounts).map((key) => ({ keyword: key, count: titleCounts[key] }));
    return res.status(200).json(uniqueTitles);
  } catch (error) {
    console.error('Error searching titles:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchIndustryClass(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ industry_class: regex }).toArray();
    const counts = results.reduce((acc, item) => { const key = (item.industry_class || '').toString(); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
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
      const allMatchingRecords = await ucdsFor(req).find(mongoQuery).toArray();
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
      surveys = recordsWithExpiredPermits.slice(skip, skip + pageSize);
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
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ ecc_cnc: regex }).toArray();
    const counts = results.reduce((acc, item) => {
      const k = (item.ecc_cnc || '').toString();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
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
    const regex = new RegExp(`^${query}$`, 'i');
    const duplicateEntry = await ucdsFor(req).findOne({ ecc_cnc: regex });
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
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ pto_code: regex }).toArray();
    const counts = results.reduce((acc, item) => { const k = (item.pto_code || '').toString(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
  } catch (error) {
    console.error('Error searching PTO codes:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchWwdpCode(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ wwdp_code: regex }).toArray();
    const counts = results.reduce((acc, item) => { const k = (item.wwdp_code || '').toString(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
  } catch (error) {
    console.error('Error searching WWDP codes:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchHazId(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ haz_id: regex }).toArray();
    const counts = results.reduce((acc, item) => { const k = (item.haz_id || '').toString(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
  } catch (error) {
    console.error('Error searching HAZ IDs:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchPcoNo(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ pco_no: regex }).toArray();
    const counts = results.reduce((acc, item) => { const k = (item.pco_no || '').toString(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
  } catch (error) {
    console.error('Error searching PCO numbers:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function searchPcoName(req, res) {
  const query = req.query.query;
  try {
    await connectToMongo();
    const regex = new RegExp(query, 'i');
    const results = await ucdsFor(req).find({ pco_name: regex }).toArray();
    const counts = results.reduce((acc, item) => { const k = (item.pco_name || '').toString(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const unique = Object.keys(counts).map((key) => ({ keyword: key, count: counts[key] }));
    return res.status(200).json(unique);
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
    const { ecc_cnc, field, oldValue, updated_by } = req.body;
    if (!ecc_cnc || !field || oldValue === undefined) return res.status(400).json({ error: 'Missing required fields: ecc_cnc, field, or oldValue.' });

    const dataCollection = ucdsFor(req);
    const logsCollection = yearBoundLogs(collections.ucdsLog, req.activeYear);

    const filter = { ecc_cnc };
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
        ecc_cnc,
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
