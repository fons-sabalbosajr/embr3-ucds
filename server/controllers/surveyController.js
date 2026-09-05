const { connectToMongo, collections, getDb } = require('../config/db');
const { scopeOf } = require('../services/yearScope');

async function updateColor(req, res) {
  const { id_no, color } = req.body;

  if (!id_no || !color) {
    return res.status(400).send('Serial number and color are required.');
  }

  try {
    await connectToMongo();
    const result = await scopeOf('survey', req.activeYear).collection.updateOne({ id_no }, { $set: { color } });

    if (result.matchedCount === 0) {
      return res.status(404).send('Record not found.');
    }

    res.status(200).send('Color updated successfully.');
  } catch (error) {
    console.error('Error updating color:', error);
    res.status(500).send('Internal server error.');
  }
}

async function updateColorUniverse(req, res) {
  const colorUpdates = req.body;

  if (!colorUpdates || !Array.isArray(colorUpdates)) {
    return res.status(400).send({ error: 'Color updates are required.' });
  }

  try {
    await connectToMongo();
    const results = await Promise.all(
      colorUpdates.map((update) =>
        collections.ucds.updateOne(
          { id_no: update.id_no },
          { $set: { color: update.color } },
          { upsert: true }
        )
      )
    );

    const updatedCount = results.reduce((acc, result) => acc + (result.modifiedCount || 0), 0);
    const upsertedCount = results.reduce((acc, result) => acc + (result.upsertedCount || 0), 0);
    const matchedCount = results.reduce((acc, result) => acc + (result.matchedCount || 0), 0);

    if (updatedCount === 0 && upsertedCount === 0 && matchedCount === 0) {
      return res.status(200).send({ message: 'No documents updated, upserted, or matched.' });
    }

    res.status(200).send({ message: `Colors updated or upserted for ${updatedCount + upsertedCount} document(s).` });
  } catch (error) {
    console.error('Error updating colors:', error);
    res.status(500).send({ error: 'Internal server error.' });
  }
}

module.exports = { updateColor, updateColorUniverse };
 
// New survey endpoints migrated from server.js
async function getSurveysByYear(req, res) {
  try {
    await connectToMongo();
    const { collection } = scopeOf('survey', req.activeYear);

    const surveys = await collection.find({}).toArray();
    res.status(200).json(surveys);
  } catch (error) {
    console.error('Error fetching survey data:', error);
    res.status(500).send('Internal Server Error');
  }
}

async function getLastSurveyId(req, res) {
  try {
    await connectToMongo();
    const { collection } = scopeOf('survey', req.activeYear);

    const lastSurvey = await collection.find({}).sort({ id_no: -1 }).limit(1).toArray();
    if (lastSurvey.length === 0) return res.status(404).json({ error: 'No survey data found' });
    res.status(200).json({ lastIdNo: lastSurvey[0].id_no });
  } catch (error) {
    console.error('Error fetching last id_no:', error);
    res.status(500).send('Internal Server Error');
  }
}

async function getSurveyDashboardStats(req, res) {
  try {
    await connectToMongo();
    const { collection: surveyMonitoringCollection } = scopeOf('survey', req.activeYear);

    const totalSurveys = await surveyMonitoringCollection.countDocuments({});
    const projectTypeBreakdown = await surveyMonitoringCollection
      .aggregate([
        { $match: { project_type: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$project_type', count: { $sum: 1 } } },
        { $project: { _id: 0, type: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const provinceBreakdown = await surveyMonitoringCollection
      .aggregate([
        { $match: { province: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$province', count: { $sum: 1 } } },
        { $project: { _id: 0, province: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const eiaSurveyCount = await surveyMonitoringCollection.countDocuments({ survey_eia: true });
    const mbuAreaSurveyCount = await surveyMonitoringCollection.countDocuments({ mbu_area: true });

    res.status(200).json({
      totalSurveys,
      projectTypeBreakdown,
      provinceBreakdown,
      eiaSurveyCount,
      mbuAreaSurveyCount,
    });
  } catch (error) {
    console.error('Error fetching survey dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch survey dashboard statistics.', details: error.message });
  }
}

async function getSurveysMonitoringData(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    await connectToMongo();
    const { collection: surveyMonitoringCollection } = scopeOf('survey', req.activeYear);

    const mongoQuery = {};
    const queryConditions = [];
    const surveyGlobalSearchFields = ['id_no', 'project_title', 'name', 'industry_class', 'address', 'province', 'city', 'brgy'];
    if (req.query.search) {
      const searchTermTrimmed = String(req.query.search).trim();
      if (searchTermTrimmed) {
        const orConditions = surveyGlobalSearchFields.map((sField) => ({ [sField]: { $regex: searchTermTrimmed, $options: 'i' } }));
        if (orConditions.length > 0) queryConditions.push({ $or: orConditions });
      }
    }

    if (req.query.province && typeof req.query.province === 'string' && req.query.province.trim() !== '' && req.query.province.trim().toLowerCase() !== 'all provinces') {
      queryConditions.push({ province: { $regex: `^${req.query.province.trim()}$`, $options: 'i' } });
    }

    if (req.query.status && typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      queryConditions.push({ status_survey: { $regex: `^${req.query.status.trim()}$`, $options: 'i' } });
    }

    const surveyColumnFilterableFields = ['id_no', 'project_title', 'industry_class', 'address', 'province', 'city', 'brgy', 'lat', 'long', 'date_surveyed', 'status_survey', 'remarks_survey'];
    surveyColumnFilterableFields.forEach((field) => {
      if (req.query[field] && req.query[field].length > 0 && !['search', 'page', 'pageSize', 'province', 'status'].includes(field)) {
        const filterValue = Array.isArray(req.query[field]) ? String(req.query[field][0]).trim() : String(req.query[field]).trim();
        if (filterValue) queryConditions.push({ [field]: { $regex: filterValue, $options: 'i' } });
      }
    });

    if (queryConditions.length > 0) mongoQuery.$and = queryConditions;

    const total = await surveyMonitoringCollection.countDocuments(mongoQuery);
    const surveys = await surveyMonitoringCollection
      .find(mongoQuery)
      .sort({ id_no: 1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    res.status(200).json({ data: surveys, total });
  } catch (error) {
    console.error('Error fetching survey monitoring data:', error);
    res.status(500).send('Internal Server Error');
  }
}

async function getSurveyDocketByIdNo(req, res) {
  try {
    await connectToMongo();
    const { id_no } = req.params;
    const record = await scopeOf('survey', req.activeYear).collection.findOne({ id_no });
    if (record && record.docket_no) {
      return res.json({ docket_no: record.docket_no });
    }
    // Fallback after short delay (legacy behavior)
    setTimeout(async () => {
      const again = await scopeOf('survey', req.activeYear).collection.findOne({ id_no });
      if (again && again.docket_no) {
        return res.json({ docket_no: again.docket_no });
      }
      return res.status(404).json({ error: 'Not found' });
    }, 2000);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { updateColor, updateColorUniverse, getSurveysByYear, getLastSurveyId, getSurveyDashboardStats, getSurveysMonitoringData, getSurveyDocketByIdNo };

// PUT endpoints
async function updateSurveyById(req, res) {
  const { id } = req.params;
  const update = req.body;
  const year = req.activeYear;
  try {
    await connectToMongo();
        const { collection } = scopeOf('survey', year);
    let filter = [{ id_no: isNaN(id) ? id : parseInt(id, 10) }, { id_no: id }];
    let currentRecord = await collection.findOne(filter[0]);
    if (!currentRecord) currentRecord = await collection.findOne(filter[1]);
    if (!currentRecord) return res.status(404).json({ message: 'Record not found' });
    const result = await collection.updateOne({ _id: currentRecord._id }, { $set: update });
    if (result.modifiedCount > 0) return res.status(200).json({ message: 'Update successful!' });
    return res.status(200).json({ message: 'No changes made' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateSurveyDataById(req, res) {
  try {
    await connectToMongo();
    const { id } = req.params;
    const newData = req.body;
    const iisNo = req.body.iis_no;
    const updatedBy = req.body.updated_by;
    const match = iisNo && iisNo.match(/R3-(\d{4})-/);
    if (!match) return res.status(400).json({ error: 'Invalid iis_no format.' });

    // The year embedded in iis_no is client-supplied and must never choose the
    // target collection; it may only be cross-checked against the active year.
    const year = req.activeYear;
    if (Number(match[1]) !== Number(year)) {
      return res.status(403).json({
        code: 'YEAR_MISMATCH',
        error: `Record ${iisNo} does not belong to the ${year} data container.`,
      });
    }
    const { collection } = scopeOf('survey', year);
    const collectionName = `survey-data-${year}`;
    const recordId = isNaN(id) ? id.toString() : parseInt(id);
    const oldDocument = await collection.findOne({ id_no: recordId });
    if (!oldDocument) return res.status(404).json({ error: `Record not found in ${collectionName}.` });
    await collection.updateOne({ id_no: recordId }, { $set: newData });
    const updatedDocument = await collection.findOne({ id_no: recordId });
    const auditLog = { updated_by: updatedBy, updated_at: new Date(), iis_no: iisNo, changes: [] };
    Object.keys(newData).forEach((key) => {
      if (oldDocument[key] !== newData[key]) {
        auditLog.changes.push({ field: key, old_value: oldDocument[key] || 'N/A', new_value: newData[key] || 'N/A' });
      }
    });
    return res.status(200).json(auditLog);
  } catch (error) {
    console.error('Error updating data:', error);
    return res.status(500).json({ error: 'Failed to update data. Please try again later.' });
  }
}

module.exports.updateSurveyById = updateSurveyById;
module.exports.updateSurveyDataById = updateSurveyDataById;

// ---- Additional Survey endpoints migrated from server.js ----
async function getSurveyDataById(req, res) {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Valid ID parameter is required' });
  try {
    await connectToMongo();
    const idNumber = parseInt(id, 10);
    const data = await scopeOf('survey', req.activeYear).collection.findOne({ id_no: idNumber });
    if (!data) return res.status(404).json({ error: 'Data not found' });
    return res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function getSurveyLog(req, res) {
  const { iis_no } = req.query;
  try {
    await connectToMongo();
    const query = iis_no ? { newValue: { $regex: iis_no, $options: 'i' } } : {};
    const logs = await collections.surveyLog.find(query).toArray();
    if (logs.length === 0) return res.status(200).json([]);
    return res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching survey logs:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function getLatestTransactionId(req, res) {
  try {
    await connectToMongo();
    const latest = await collections.surveyLog.find().sort({ transactionID: -1 }).limit(1).toArray();
    if (latest.length > 0) {
      const id = parseInt(String(latest[0].transactionID).replace('TRX-', ''));
      return res.status(200).json({ transactionId: isNaN(id) ? 0 : id });
    }
    return res.status(200).json({ transactionId: 0 });
  } catch (error) {
    console.error('Error getting latest transaction ID:', error);
    return res.status(500).json({ error: 'Failed to get latest transaction ID' });
  }
}

async function getProjectType(req, res) {
  const { industry_class } = req.query;
  try {
    await connectToMongo();
    const projectData = await collections.projectType.findOne({ industry_class });
    if (projectData) return res.status(200).json(projectData);
    return res.status(404).json({ message: 'No project type found for this industry class' });
  } catch (error) {
    console.error('Error fetching project data:', error);
    return res.status(500).json({ error: 'An error occurred while fetching project data.' });
  }
}

async function getIndustryDetailsByClass(req, res) {
  const { className } = req.query;
  if (!className) return res.status(400).json({ error: 'className query parameter is required.' });
  try {
    await connectToMongo();
    const industryDetails = await collections.projectType.findOne({ industry_class: className });
    if (industryDetails) return res.status(200).json(industryDetails);
    return res.status(404).json({ message: `No industry details found for class: ${className}` });
  } catch (error) {
    console.error(`Error fetching industry details for class ${className}:`, error);
    return res.status(500).json({ error: 'An error occurred while fetching industry details.' });
  }
}

module.exports.getSurveyDataById = getSurveyDataById;
module.exports.getSurveyLog = getSurveyLog;
module.exports.getLatestTransactionId = getLatestTransactionId;
module.exports.getProjectType = getProjectType;
module.exports.getIndustryDetailsByClass = getIndustryDetailsByClass;
 
// ---- Additional write endpoints migrated from server.js ----
async function updateSurveyMonitoringData(req, res) {
  try {
    const { year, id } = req.params;
    const newData = req.body;
    await connectToMongo();
    const db = getDb();
    if (!id) return res.status(400).json({ error: 'Invalid survey record ID format.' });

    const { collection: surveyMonitoringCollection } = scopeOf('survey', req.activeYear);

    const { _id, ...updatePayload } = newData || {};
    const { ObjectId } = require('../config/db');
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid survey record ID format.' });
    const result = await surveyMonitoringCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatePayload });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Survey record not found.' });
    if (result.modifiedCount === 0) return res.status(200).json({ message: 'No changes made to the survey record.' });
    return res.status(200).json({ message: 'Survey record updated successfully.' });
  } catch (error) {
    console.error('Error updating survey monitoring data:', error);
    return res.status(500).json({ error: 'Failed to update survey record.' });
  }
}

async function patchSurveyColorById(req, res) {
  const id = req.params.id;
  const color = req.body.color;
  try {
    await connectToMongo();
    const filter = { id_no: isNaN(id) ? id : parseInt(id, 10) };
    const update = { $set: { color } };
    const result = await scopeOf('survey', req.activeYear).collection.updateOne(filter, update);
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Survey not found' });
    const survey = await scopeOf('survey', req.activeYear).collection.findOne(filter);
    return res.json(survey);
  } catch (error) {
    console.error('Error updating row color:', error.message);
    return res.status(500).json({ message: 'Error updating row color' });
  }
}

module.exports.updateSurveyMonitoringData = updateSurveyMonitoringData;
module.exports.patchSurveyColorById = patchSurveyColorById;
