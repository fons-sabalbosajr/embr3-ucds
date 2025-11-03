const express = require('express');
const { saveSurveyLog, saveUcdsLog, getLogs, getUcdsLog, deleteUcdsTransaction, deleteSurveyTransaction } = require('../controllers/logController');

const router = express.Router();

router.post('/api/survey-log', saveSurveyLog);
router.post('/api/ucds-log', saveUcdsLog);
router.get('/api/logs', getLogs);
router.get('/api/ucds-log', getUcdsLog);
router.delete('/api/transaction/:transactionID', deleteUcdsTransaction);
router.delete('/api/survey-transaction/:transactionID', deleteSurveyTransaction);

module.exports = router;
