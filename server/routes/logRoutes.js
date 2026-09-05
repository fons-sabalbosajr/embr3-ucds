const express = require('express');
const { saveSurveyLog, saveUcdsLog, getLogs, getUcdsLog, deleteUcdsTransaction, deleteSurveyTransaction } = require('../controllers/logController');
const { authenticateSession, resolveYearContext } = require('../middleware/auth');

const router = express.Router();

// These routes previously had no authentication at all.
const yearScoped = [authenticateSession, resolveYearContext];

router.post('/api/survey-log', ...yearScoped, saveSurveyLog);
router.post('/api/ucds-log', ...yearScoped, saveUcdsLog);
router.get('/api/ucds-log', ...yearScoped, getUcdsLog);
router.delete('/api/transaction/:transactionID', ...yearScoped, deleteUcdsTransaction);
router.delete('/api/survey-transaction/:transactionID', ...yearScoped, deleteSurveyTransaction);

// Application activity logs are system-wide, not per year container.
router.get('/api/logs', authenticateSession, getLogs);

module.exports = router;
