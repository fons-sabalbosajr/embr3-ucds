const express = require('express');
const router = express.Router();
const { logActivity } = require('../middleware/activityLog');
const { getSwmPlanData, getSwmPlanStats, updateSwmPlanData } = require('../controllers/swmController');

// Prefix with /api to align with front-end API_BASE
router.get('/api/swm-plan-data', getSwmPlanData);
router.get('/api/swm-plan-stats', getSwmPlanStats);
router.put('/api/update-swm-plan-data/:id', logActivity, updateSwmPlanData);

module.exports = router;
