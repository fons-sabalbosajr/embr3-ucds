const express = require('express');
const multer = require('multer');
const { logActivity } = require('../middleware/activityLog');
const { saveDraftReport, saveDraftReportSurvey, listDraftReports } = require('../controllers/draftReportController');
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');

const router = express.Router();

// Use memory storage to match legacy behavior
const storage = multer.memoryStorage();
const upload = multer({ storage });

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

// Legacy paths preserved. The two upload routes declared no auth middleware and
// were protected only incidentally, by logActivity rejecting a request with no
// session — and only after multer had already buffered the upload.
router.post('/save-draft-report', ucdsAccess, upload.single('pdfFile'), logActivity, saveDraftReport);
router.post('/save-draft-report-survey', ucdsAccess, upload.single('pdfFile'), logActivity, saveDraftReportSurvey);

// Legacy GET endpoint
router.get('/api/draft-report', ucdsAccess, listDraftReports);

module.exports = router;
