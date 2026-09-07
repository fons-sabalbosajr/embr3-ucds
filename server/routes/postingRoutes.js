const express = require('express');
const router = express.Router();
const { logActivity } = require('../middleware/activityLog');
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const { createPosting, listPostings, updatePosting, patchPosting, deletePosting } = require('../controllers/postingController');

const ucdsAccess = [authenticateSession, requireDomain(DOMAINS.UCDS)];

router.post('/api/posting', ucdsAccess, logActivity, createPosting);
router.get('/api/postings', ucdsAccess, listPostings);
router.put('/api/postings/:id', ucdsAccess, logActivity, updatePosting);
router.patch('/api/postings/:id', ucdsAccess, logActivity, patchPosting);
router.delete('/api/postings/:id', ucdsAccess, deletePosting);

module.exports = router;
