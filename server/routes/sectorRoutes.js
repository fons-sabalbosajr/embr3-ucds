const express = require('express');
const router = express.Router();
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { logActivity } = require('../middleware/activityLog');
const { updateHealthcare, updateChemical, updateTsd, getHealthcare, getChemicals, getTsd } = require('../controllers/sectorController');

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

// Legacy endpoints preserved
router.put('/api/update-healthcare/:id', ucdsAccess, logActivity, updateHealthcare);
router.put('/api/update-chemical/:id', ucdsAccess, logActivity, updateChemical);
router.put('/api/update-tsd/:id', ucdsAccess, logActivity, updateTsd);

// Read endpoints. These previously carried no authentication and served the
// healthcare, chemicals and TSD datasets to unauthenticated callers.
router.get('/api/healthcare', ucdsAccess, getHealthcare);
router.get('/api/chemicals', ucdsAccess, getChemicals);
router.get('/api/tsd', ucdsAccess, getTsd);

module.exports = router;
