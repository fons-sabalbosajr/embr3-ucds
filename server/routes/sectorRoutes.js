const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');
const { updateHealthcare, updateChemical, updateTsd, getHealthcare, getChemicals, getTsd } = require('../controllers/sectorController');

// Legacy endpoints preserved
router.put('/api/update-healthcare/:id', authenticateSession, logActivity, updateHealthcare);
router.put('/api/update-chemical/:id', authenticateSession, logActivity, updateChemical);
router.put('/api/update-tsd/:id', authenticateSession, logActivity, updateTsd);

// Read endpoints
router.get('/api/healthcare', getHealthcare);
router.get('/api/chemicals', getChemicals);
router.get('/api/tsd', getTsd);

module.exports = router;