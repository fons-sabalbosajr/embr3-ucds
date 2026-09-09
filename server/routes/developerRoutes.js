const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const {
  // field configs
  // pdf forms
  // activity logs
  listActivityLogs,
  updateActivityLog,
  deleteActivityLog,
} = require('../controllers/developerController');

// ---------------------------------------------------------------------------
// Developer Settings.
//
// Every route here carried no authentication at all. /api/dev/activity-logs
// returned the audit trail — usernames, paths, request bodies — to anonymous
// names and addresses, and the DELETE routes let anyone remove audit entries or
// uploaded PDF forms.
//
// These are the screens the application itself labels "Developer Settings", so
// requireDeveloper is the matching guard and was already available.
// ---------------------------------------------------------------------------
const developerOnly = [authenticateSession, requireDeveloper];

// Field Management
// Introspection and import helpers

// PDF Forms (upload/list/preview/delete)

// Activity History Configuration
router.get('/api/dev/activity-logs', developerOnly, listActivityLogs);
router.put('/api/dev/activity-logs/:id', developerOnly, updateActivityLog);
router.delete('/api/dev/activity-logs/:id', developerOnly, deleteActivityLog);

module.exports = router;
