const express = require('express');
const { authenticateSession, requireDomain, requireRole } = require('../middleware/auth');
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

// ── Data corrections: the Developer's ────────────────────────────────────────
// VERA's report on the Records project types, and applying or undoing it.
// Changes records, so the Developer alone.
const developer = [authenticateSession, requireRole('developer')];
router.get('/api/vera/corrections', developer, ctrl.correctionsReport);
router.get('/api/vera/corrections/pending', developer, ctrl.correctionsPending);
router.post('/api/vera/corrections/scan', developer, ctrl.correctionsScan);
router.post('/api/vera/corrections/:id/apply', developer, ctrl.correctionsApply);
router.post('/api/vera/corrections/:id/undo', developer, ctrl.correctionsUndo);
// "Let VERA fix it": a fresh check, and everything she is certain of applied.
router.post('/api/vera/corrections/auto-fix', developer, ctrl.correctionsAutoFix);

// VERA's serial number check across Records, Legal Services and Laboratory,
// and fixing what she may (a counter behind the highest serial on file).
router.get('/api/vera/serials', developer, ctrl.serialsReport);
router.post('/api/vera/serials/scan', developer, ctrl.serialsScan);
router.post('/api/vera/serials/fix', developer, ctrl.serialsFix);

// VERA's check of each record's project type against its document, its
// settings, and applying, undoing or setting aside what she proposes.
router.get('/api/vera/project-types', developer, ctrl.projectTypesReport);

// VERA reads a scan's text so the library can search inside it: one document
// (Developer or administrator; checked in the controller), or the next few.
const signedIn = [authenticateSession];
router.post('/api/vera/scan-text/:unit(records|legal|laboratory)/:serialNo', signedIn, ctrl.scanTextOne);
router.post('/api/vera/scan-text/next', developer, ctrl.scanTextNext);
router.put('/api/vera/project-types/settings', developer, ctrl.projectTypesSettings);
router.post('/api/vera/project-types/scan', developer, ctrl.projectTypesScan);
router.post('/api/vera/project-types/apply', developer, ctrl.projectTypesApply);
router.post('/api/vera/project-types/:serialNo/:action(undo|dismiss)', developer, ctrl.projectTypesSettle);

// VERA's report on records not linked to the central register, and applying
// or undoing the links she proposes.
router.get('/api/vera/register-links', developer, ctrl.linksReport);
router.get('/api/vera/register-links/pending', developer, ctrl.linksPending);
router.post('/api/vera/register-links/scan', developer, ctrl.linksScan);
router.post('/api/vera/register-links/:id/apply', developer, ctrl.linksApply);
router.post('/api/vera/register-links/:id/undo', developer, ctrl.linksUndo);

// VERA's check of the Universe Central DB register — the active year's —
// and applying or undoing the fixes she proposes. Changes the register, so
// the Developer and administrators, inside a selected year.
const { resolveYearContext } = require('../middleware/auth');
const ucdsMaintainer = [authenticateSession, requireRole('developer', 'admin'), requireDomain(DOMAINS.UCDS), resolveYearContext];
router.get('/api/vera/ucds-check', ucdsMaintainer, ctrl.ucdsCheckReport);
router.post('/api/vera/ucds-check/scan', ucdsMaintainer, ctrl.ucdsCheckScan);
router.post('/api/vera/ucds-check/auto-fix', ucdsMaintainer, ctrl.ucdsCheckAutoFix);
router.post('/api/vera/ucds-check/:id/apply', ucdsMaintainer, ctrl.ucdsCheckApply);
router.post('/api/vera/ucds-check/:id/undo', ucdsMaintainer, ctrl.ucdsCheckUndo);

module.exports = router;
