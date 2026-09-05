const express = require('express');
const { updateColor, updateColorUniverse, getSurveysByYear, getLastSurveyId, getSurveyDashboardStats, getSurveysMonitoringData, getSurveyDocketByIdNo, updateSurveyById, updateSurveyDataById, getSurveyDataById, getSurveyLog, getLatestTransactionId, getProjectType, getIndustryDetailsByClass, updateSurveyMonitoringData, patchSurveyColorById } = require('../controllers/surveyController');
const { authenticateSession, resolveYearContext, rejectYearOverride } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLog');

const router = express.Router();

// Survey data is year-scoped. `resolveYearContext` takes the year from the
// session (never the URL) and re-checks authorization; `rejectYearOverride`
// then refuses any request whose :year disagrees with it, so rewriting the URL
// to another container fails instead of silently switching datasets.
const yearScoped = [authenticateSession, resolveYearContext, rejectYearOverride];

// Legacy endpoints preserved
router.post('/api/update-color', logActivity, ...yearScoped, updateColor);
router.post('/api/update-color-universe', ...yearScoped, updateColorUniverse);

// Legacy GET survey endpoints
router.get('/api/surveys/:year', ...yearScoped, getSurveysByYear);
router.get('/api/surveys/last-id/:year', ...yearScoped, getLastSurveyId);
router.get('/api/survey-dashboard-stats/:year', ...yearScoped, getSurveyDashboardStats);
router.get('/api/surveys-monitoring-data/:year', ...yearScoped, getSurveysMonitoringData);
router.put('/api/surveys-monitoring-data/:year/:id', logActivity, ...yearScoped, updateSurveyMonitoringData);
router.get('/api/survey/:id_no', ...yearScoped, getSurveyDocketByIdNo);
router.put('/api/survey/:id', logActivity, ...yearScoped, updateSurveyById);
router.put('/api/update-survey-data/:id', logActivity, ...yearScoped, updateSurveyDataById);
router.patch('/api/surveys/:id', ...yearScoped, patchSurveyColorById);

// Additional GETs migrated from server.js
router.get('/api/survey-data/:id', ...yearScoped, getSurveyDataById);
router.get('/api/survey-log', ...yearScoped, getSurveyLog);
router.get('/api/get-latest-transaction-id', ...yearScoped, getLatestTransactionId);

// project_type and industry lookups are shared reference data, not year-scoped.
router.get('/api/project_type', authenticateSession, getProjectType);
router.get('/api/industry-details-by-class', authenticateSession, getIndustryDetailsByClass);

module.exports = router;
