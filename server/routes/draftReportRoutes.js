const express = require('express');
const multer = require('multer');
const { logActivity } = require('../middleware/activityLog');
const { saveDraftReport, saveDraftReportSurvey, listDraftReports } = require('../controllers/draftReportController');
const { authenticateSession } = require('../middleware/auth');

const router = express.Router();

// Use memory storage to match legacy behavior
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Legacy paths preserved
router.post('/save-draft-report', upload.single('pdfFile'), logActivity, saveDraftReport);
router.post('/save-draft-report-survey', upload.single('pdfFile'), logActivity, saveDraftReportSurvey);

// Legacy GET endpoint
router.get('/api/draft-report', authenticateSession, listDraftReports);

module.exports = router;
