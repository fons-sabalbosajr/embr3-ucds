const express = require('express');
const router = express.Router();
const { streamFile } = require('../controllers/fileController');

router.get('/api/files/:filename', streamFile);

module.exports = router;
