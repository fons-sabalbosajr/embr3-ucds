const express = require('express');
const router = express.Router();
const { logActivity } = require('../middleware/activityLog');
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { getSwmPlanData, getSwmPlanStats, updateSwmPlanData } = require('../controllers/swmController');

// These three carried no authentication at all: the two reads served the SWM
// plan dataset to anyone who asked, and the write was protected only by
// accident, because logActivity happens to 401 without a session.
const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

// Prefix with /api to align with front-end API_BASE
router.get('/api/swm-plan-data', ucdsAccess, getSwmPlanData);
router.get('/api/swm-plan-stats', ucdsAccess, getSwmPlanStats);
router.put('/api/update-swm-plan-data/:id', ucdsAccess, logActivity, updateSwmPlanData);

module.exports = router;
