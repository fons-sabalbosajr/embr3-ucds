const express = require('express');
const { authenticateSession, requireYearManager, resolveYearContext } = require('../middleware/auth');
const ctrl = require('../controllers/yearController');

const router = express.Router();

// Any signed-in user: discover and enter the containers they are allowed into.
router.get('/api/years', authenticateSession, ctrl.listAuthorizedYears);
router.get('/api/years/active', authenticateSession, ctrl.getActiveYear);
router.post('/api/years/select', authenticateSession, ctrl.selectYear);
router.post('/api/years/clear', authenticateSession, ctrl.clearActiveYear);

// Developers and Admins: manage which containers exist and their province scope.
router.get('/api/admin/years', authenticateSession, requireYearManager, ctrl.listAllYears);
router.post('/api/admin/years', authenticateSession, requireYearManager, ctrl.createYear);
router.patch('/api/admin/years/:year', authenticateSession, requireYearManager, ctrl.updateYearStatus);
router.put('/api/admin/years/:year/provinces', authenticateSession, requireYearManager, ctrl.updateYearProvinces);
router.get('/api/provinces', authenticateSession, ctrl.listProvinces);
router.get('/api/year-provinces', authenticateSession, resolveYearContext, ctrl.activeYearProvinces);

module.exports = router;
