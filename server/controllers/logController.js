const { connectToMongo, collections } = require('../config/db');
const { withYear, stampYear } = require('../services/yearScope');
const { principalOf } = require('../middleware/auth');
const { roleOf, ROLES } = require('../services/authorization');

// Transaction logs are year-scoped: a log written while 2026 is active belongs
// to 2026 and must not surface in the 2025 container. The year always comes
// from req.activeYear, never from the request body.

async function saveSurveyLog(req, res) {
  try {
    await connectToMongo();
    const logEntry = stampYear('surveyLog', req.activeYear, req.body);
    await collections.surveyLog.insertOne(logEntry);
    res.status(200).send(logEntry);
  } catch (error) {
    console.error('Error saving log entry:', error);
    res.status(500).send('Error saving log entry');
  }
}

async function saveUcdsLog(req, res) {
  try {
    await connectToMongo();
    const logEntry = stampYear('ucdsLog', req.activeYear, req.body);
    await collections.ucdsLog.insertOne(logEntry);
    res.status(200).send(logEntry);
  } catch (error) {
    console.error('Error saving log entry:', error);
    res.status(500).send('Error saving log entry');
  }
}

module.exports = { saveSurveyLog, saveUcdsLog };

// GET /api/logs — migrated from server.js
async function getLogs(req, res) {
  try {
    await connectToMongo();
    const username = req.query.username;
    const filter = {};
    if (username) filter.username = username;

    // Elevation is decided from the session, not from a query parameter that
    // the caller can set to "admin".
    const role = roleOf(principalOf(req));
    if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
      filter.actionType = { $nin: ['Generic Action', 'Patch'] };
    }
    const logs = await collections.activityLogs.find(filter).toArray();
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

module.exports.getLogs = getLogs;

// GET /api/ucds-log — migrated from server.js
async function getUcdsLog(req, res) {
  const { ecc_cnc } = req.query;
  try {
    await connectToMongo();
    const base = ecc_cnc ? { ecc_cnc: { $regex: ecc_cnc, $options: 'i' } } : {};
    const logs = await collections.ucdsLog.find(withYear('ucdsLog', req.activeYear, base)).toArray();
    return res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching UCDS logs:', error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports.getUcdsLog = getUcdsLog;

// DELETE handlers migrated from server.js
async function deleteUcdsTransaction(req, res) {
  const { transactionID } = req.params;
  try {
    await connectToMongo();
    const result = await collections.ucdsLog.deleteOne(
      withYear('ucdsLog', req.activeYear, { transactionID })
    );
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    return res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteSurveyTransaction(req, res) {
  const { transactionID } = req.params;
  try {
    await connectToMongo();
    const result = await collections.surveyLog.deleteOne(
      withYear('surveyLog', req.activeYear, { transactionID })
    );
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Transaction not found' });
    return res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports.deleteUcdsTransaction = deleteUcdsTransaction;
module.exports.deleteSurveyTransaction = deleteSurveyTransaction;
