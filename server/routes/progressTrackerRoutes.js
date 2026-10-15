const express = require('express');
const { authenticateSession, requireDomain, principalOf } = require('../middleware/auth');
const { DOMAINS } = require('../services/authorization');
const tracker = require('../services/progressTracker');
const audit = require('../shared/services/audit');

// ---------------------------------------------------------------------------
// Admin Settings › Progress Tracker (see services/progressTracker). The
// administrators' tool: the season, its sources, and the live figures.
// ---------------------------------------------------------------------------

const router = express.Router();
const admin = [authenticateSession, requireDomain(DOMAINS.ADMIN)];

const fail = (res, err, next) => (err.status ? res.status(err.status).json({ message: err.message }) : next(err));

router.get('/api/admin/progress-tracker', admin, async (req, res, next) => {
  try {
    res.json(await tracker.overview(req.query.season || null));
  } catch (err) {
    fail(res, err, next);
  }
});

router.get('/api/admin/progress-tracker/files/:id', admin, async (req, res, next) => {
  try {
    res.json({ file: await tracker.fileDetail(req.params.id) });
  } catch (err) {
    fail(res, err, next);
  }
});

router.post('/api/admin/progress-tracker/seasons', admin, async (req, res, next) => {
  try {
    const season = await tracker.createSeason(req.body || {}, principalOf(req));
    await audit.record(req, { domain: 'admin', action: 'progress-season-create', label: `progress tracker season opened: ${season.name}`, collection: 'progress-seasons', documentId: String(season._id) });
    res.status(201).json(await tracker.overview(String(season._id)));
  } catch (err) {
    fail(res, err, next);
  }
});

router.put('/api/admin/progress-tracker/seasons/:id', admin, async (req, res, next) => {
  try {
    const season = await tracker.updateSeason(req.params.id, req.body || {}, principalOf(req));
    await audit.record(req, { domain: 'admin', action: 'progress-season-update', label: `progress tracker season changed: ${season.name} (${season.status})`, collection: 'progress-seasons', documentId: req.params.id });
    res.json(await tracker.overview(req.params.id));
  } catch (err) {
    fail(res, err, next);
  }
});

router.post('/api/admin/progress-tracker/seasons/:id/rebaseline', admin, async (req, res, next) => {
  try {
    await tracker.rebaseline(req.params.id);
    await audit.record(req, { domain: 'admin', action: 'progress-season-rebaseline', label: 'progress tracker baseline taken again', collection: 'progress-seasons', documentId: req.params.id });
    res.json(await tracker.overview(req.params.id));
  } catch (err) {
    fail(res, err, next);
  }
});

// "Check now": one look at the folders, within the season.
router.post('/api/admin/progress-tracker/refresh', admin, async (req, res, next) => {
  try {
    const result = await tracker.refresh();
    res.json({ ...result, ...(await tracker.overview(null)) });
  } catch (err) {
    fail(res, err, next);
  }
});

module.exports = router;
