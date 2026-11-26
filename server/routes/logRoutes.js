const express = require('express');
const { authenticateSession, resolveYearContext } = require('../middleware/auth');
const { saveUcdsLog, getUcdsLog, deleteUcdsTransaction } = require('../controllers/logController');

const router = express.Router();

// These routes previously had no authentication at all.
const yearScoped = [authenticateSession, resolveYearContext];

router.post('/api/ucds-log', ...yearScoped, saveUcdsLog);
router.get('/api/ucds-log', ...yearScoped, getUcdsLog);
router.delete('/api/transaction/:transactionID', ...yearScoped, deleteUcdsTransaction);

// GET /api/logs is gone. It returned the audit trail, request bodies
// included, to any signed-in account; Admin Settings › Audit Logs reads it
// through /api/audit (routes/auditRoutes.js), Admin domain only and redacted.

module.exports = router;
