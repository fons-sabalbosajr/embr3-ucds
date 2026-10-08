const express = require('express');
const { authenticateSession, requireDomain } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const ctrl = require('../controllers/veraController');

const router = express.Router();

// ── The sign-in pages (no session) ───────────────────────────────────────────
// The only VERA endpoints reachable without signing in, declared public in
// shared/routeInventory.js. Their own narrow knowledge base, every lookup
// refused, rate limited by address — and off until an administrator turns on
// Public pages in Admin Settings › VERA Assistant.
router.get('/api/vera/public-status', ctrl.getPublicStatus);
router.post('/api/vera/public-chat', ctrl.publicChat);

// ── Every signed-in account ──────────────────────────────────────────────────
// No further entitlement: VERA explains the screens a person can already
// reach, scoped to their domains, and it can never read a record.
router.get('/api/vera/status', authenticateSession, ctrl.getStatus);
router.post('/api/vera/chat', authenticateSession, ctrl.chat);

// ── Administration ───────────────────────────────────────────────────────────
const admin = [authenticateSession, requireDomain(DOMAINS.ADMIN)];
router.get('/api/vera/config', admin, ctrl.getConfig);
router.put('/api/vera/config', admin, ctrl.updateConfig);
router.post('/api/vera/test', admin, ctrl.testConnection);
router.get('/api/vera/usage', admin, ctrl.getUsage);
router.get('/api/vera/logs', admin, ctrl.getLogs);

module.exports = router;
