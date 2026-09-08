const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/auth');
const { streamFile } = require('../controllers/fileController');

// Streams a file out of the GridFS pdfFiles bucket by name. It had no session
// check, so anyone who knew or guessed a filename could download it.
router.get('/api/files/:filename', authenticateSession, streamFile);

module.exports = router;
