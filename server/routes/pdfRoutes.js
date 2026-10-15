const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain, resolveYearContext } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { generateICIR, generateCustomICIR } = require('../controllers/pdfController');

// These generate a report for a record id and carried no authentication,
// so anyone who could guess an id could pull the report. The stored-record
// report reads the register, and since 2027 a year can have its own (an
// id_no is only unique within one), so it takes the year context too; the
// custom report is filled from the request and needs none.
const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

// Preserve legacy paths
router.get('/generate-icir/:id', ucdsAccess, resolveYearContext, generateICIR);
router.get('/generate-custom-icir/:id', ucdsAccess, generateCustomICIR);

module.exports = router;
