const express = require('express');
const router = express.Router();
const { logActivity } = require('../middleware/activityLog');
const { authenticateSession } = require('../middleware/auth');
const { createPosting, listPostings, updatePosting, patchPosting, deletePosting } = require('../controllers/postingController');

router.post('/api/posting', authenticateSession, logActivity, createPosting);
router.get('/api/postings', authenticateSession, listPostings);
router.put('/api/postings/:id', authenticateSession, logActivity, updatePosting);
router.patch('/api/postings/:id', authenticateSession, logActivity, patchPosting);
router.delete('/api/postings/:id', authenticateSession, deletePosting);

module.exports = router;
