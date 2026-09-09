const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { generateICIR, generateCustomICIR } = require('../controllers/pdfController');

// These four generate a report for a record id and carried no authentication,
// so anyone who could guess an id could pull the report. Year context is
// deliberately not added: the handlers do not read it, and requiring a
// selected container would change behaviour beyond closing the hole.
const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

// Preserve legacy paths
router.get('/generate-icir/:id', ucdsAccess, generateICIR);
router.get('/generate-custom-icir/:id', ucdsAccess, generateCustomICIR);

module.exports = router;
