const express = require('express');
const router = express.Router();
const { generateICIR, generateCustomICIR, generateSurveyReport, generateCustomSurveyReport } = require('../controllers/pdfController');

// Preserve legacy paths
router.get('/generate-icir/:id', generateICIR);
router.get('/generate-custom-icir/:id', generateCustomICIR);
router.get('/generate-survey-report/:id', generateSurveyReport);
router.get('/generate-custom-survey-report/:id', generateCustomSurveyReport);

module.exports = router;
