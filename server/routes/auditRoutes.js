const express = require('express');
const { authenticateSession, requireDomain } = require('../middleware/auth');
const auditLog = require('../services/auditLog');

// ---------------------------------------------------------------------------
// Admin Settings › Audit Logs: the audit trail by sub-application (ERMS,
// UCDS, Document Portal, NAS, Admin, VERA). Admin domain only: the Developer
// and an Administrator. Editing and deleting entries stay Developer-only, on
// /api/dev/activity-logs (routes/developerRoutes.js).
// ---------------------------------------------------------------------------

const router = express.Router();
const admins = [authenticateSession, requireDomain('admin')];

router.get('/api/audit/summary', ...admins, async (req, res, next) => {
  try {
    res.json(await auditLog.summary());
  } catch (error) {
    next(error);
  }
});

router.get('/api/audit/logs/:category', ...admins, async (req, res, next) => {
  try {
    const { q, username, start, end, outcome, page, pageSize } = req.query;
    const result = await auditLog.list(req.params.category, { q, username, start, end, outcome, page, pageSize });
    if (!result) return res.status(404).json({ message: `No such log: ${req.params.category}` });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
