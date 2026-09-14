const express = require('express');
const router = express.Router();
const { authenticateSession, resolveYearContext, requireDomain } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');
const { expensiveLimiter } = require('../config/security');
const { DOMAINS } = require('../services/authorization');
const ctrl = require('../controllers/datasetController');

// ---------------------------------------------------------------------------
// UCDS datasets: the year folder's spreadsheets as tables.
//
// The registry is the one route without a year context — the sidebar needs
// every year the account may enter, and it carries names only. Everything
// else is scoped to the session's active year by resolveYearContext, so no
// URL can name a year the account did not select through /api/years/select.
// ---------------------------------------------------------------------------

const ucds = [authenticateSession, requireDomain(DOMAINS.UCDS)];
const scoped = [...ucds, resolveYearContext];

router.get('/api/ucds/datasets/registry', ucds, ctrl.registry);

// Universe Central DB settings: read by every UCDS screen, written by a
// Developer or Administrator, and enforced on the server where they matter.
const { requireRole } = require('../middleware/auth');
router.get('/api/ucds/settings', authenticateSession, ctrl.getSettings);
router.put('/api/ucds/settings', authenticateSession, requireRole('developer', 'admin'), logActivity, ctrl.putSettings);

// Import a chosen year's spreadsheets from the Data Management tab.
router.post('/api/ucds/datasets/import-year', ucds, expensiveLimiter, logActivity, ctrl.importForYear);
router.get('/api/ucds/datasets', scoped, ctrl.listForActiveYear);
router.get('/api/ucds/datasets/:key', scoped, ctrl.describe);
router.get('/api/ucds/datasets/:key/rows', scoped, ctrl.rowsPage);
router.post('/api/ucds/datasets/:key/rows', scoped, logActivity, ctrl.createRow);
router.post('/api/ucds/datasets/:key/columns', scoped, logActivity, ctrl.createColumn);
router.put('/api/ucds/datasets/:key/rows/:id', scoped, logActivity, ctrl.updateRow);
router.delete('/api/ucds/datasets/:key/rows/:id', scoped, logActivity, ctrl.deleteRow);

// Reading a whole spreadsheet or streaming a whole dataset is the expensive
// tier: a few a minute per person, not a few a second.
router.post('/api/ucds/datasets/:key/import', scoped, expensiveLimiter, logActivity, ctrl.importDataset);
router.get('/api/ucds/datasets/:key/export.csv', scoped, expensiveLimiter, ctrl.exportCsv);

module.exports = router;
