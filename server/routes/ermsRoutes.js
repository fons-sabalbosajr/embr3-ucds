const express = require('express');
const router = express.Router();
const { ermsLogin, listFiles, viewPdf, requireErmsAuth, envStatus } = require('../controllers/ermsController');

router.post('/api/erms/login', ermsLogin);
router.get('/api/erms/files', requireErmsAuth, listFiles);
router.get('/api/erms/view-pdf', requireErmsAuth, viewPdf);
router.get('/api/erms/env-status', envStatus);

module.exports = router;
