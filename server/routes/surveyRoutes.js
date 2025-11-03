const express = require('express');
const { updateColor, updateColorUniverse, getSurveysByYear, getLastSurveyId, getSurveyDashboardStats, getSurveysMonitoringData, getSurveyDocketByIdNo, updateSurveyById, updateSurveyDataById, getSurveyDataById, getSurveyLog, getLatestTransactionId, getProjectType, getIndustryDetailsByClass, updateSurveyMonitoringData, patchSurveyColorById } = require('../controllers/surveyController');
const { authenticateSession } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');

const router = express.Router();

// Legacy endpoints preserved
router.post('/api/update-color', logActivity, authenticateSession, updateColor);
router.post('/api/update-color-universe', updateColorUniverse);

// Legacy GET survey endpoints
router.get('/api/surveys/:year', authenticateSession, getSurveysByYear);
router.get('/api/surveys/last-id/:year', authenticateSession, getLastSurveyId);
router.get('/api/survey-dashboard-stats/:year', authenticateSession, getSurveyDashboardStats);
router.get('/api/surveys-monitoring-data/:year', authenticateSession, getSurveysMonitoringData);
router.put('/api/surveys-monitoring-data/:year/:id', logActivity, authenticateSession, updateSurveyMonitoringData);
router.get('/api/survey/:id_no', authenticateSession, getSurveyDocketByIdNo);
router.put('/api/survey/:id', logActivity, authenticateSession, updateSurveyById);
router.put('/api/update-survey-data/:id', logActivity, authenticateSession, updateSurveyDataById);
router.patch('/api/surveys/:id', authenticateSession, patchSurveyColorById);

// Additional GETs migrated from server.js
router.get('/api/survey-data/:id', authenticateSession, getSurveyDataById);
router.get('/api/survey-log', authenticateSession, getSurveyLog);
router.get('/api/get-latest-transaction-id', authenticateSession, getLatestTransactionId);
router.get('/api/project_type', authenticateSession, getProjectType);
router.get('/api/industry-details-by-class', authenticateSession, getIndustryDetailsByClass);

module.exports = router;
