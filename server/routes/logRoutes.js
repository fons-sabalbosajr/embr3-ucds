const express = require('express');
const { authenticateSession, resolveYearContext } = require('../middleware/auth');
const { saveUcdsLog, getLogs, getUcdsLog, deleteUcdsTransaction } = require('../controllers/logController');

const router = express.Router();

// These routes previously had no authentication at all.
const yearScoped = [authenticateSession, resolveYearContext];

router.post('/api/ucds-log', ...yearScoped, saveUcdsLog);
router.get('/api/ucds-log', ...yearScoped, getUcdsLog);
router.delete('/api/transaction/:transactionID', ...yearScoped, deleteUcdsTransaction);

// Application activity logs are system-wide, not per year container.
router.get('/api/logs', authenticateSession, getLogs);

module.exports = router;
