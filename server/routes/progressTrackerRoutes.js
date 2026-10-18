const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { authenticateSession, requireDeveloper, principalOf } = require('../middleware/auth');
const tracker = require('../services/progressTracker');
const audit = require('../shared/services/audit');

// ---------------------------------------------------------------------------
// Admin Settings › Progress Tracker (see services/progressTracker). The
// Developer's tool: the season, its sources, and the live figures. Not the
// admin domain — an Admin does not see it.
// ---------------------------------------------------------------------------

const router = express.Router();
const admin = [authenticateSession, requireDeveloper];

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

// The Data Visualization tab's firm table and map: the Developer's screen
// only (names, addresses, locations — never on the public link).
router.get('/api/admin/progress-tracker/viz/firms', admin, async (req, res, next) => {
  try {
    const { season, unit, q, page, pageSize } = req.query;
    res.json(await tracker.vizFirms({ season: season || null, unit: unit || null, q, page, pageSize }));
  } catch (err) {
    fail(res, err, next);
  }
});
router.get('/api/admin/progress-tracker/viz/points', admin, async (req, res, next) => {
  try {
    res.json(await tracker.vizPoints({ unit: req.query.unit || null }));
  } catch (err) {
    fail(res, err, next);
  }
});

router.get('/api/admin/progress-tracker/viz/firms/:serial', admin, async (req, res, next) => {
  try {
    res.json({ firm: await tracker.vizFirm(req.params.serial) });
  } catch (err) {
    fail(res, err, next);
  }
});

// The cells to colour in each RAW file — the newly issued permits already
// encoded — for the Office Script the page writes (Developer only).
router.get('/api/admin/progress-tracker/colour-targets', admin, async (req, res, next) => {
  try {
    res.json(await tracker.colourTargets());
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

// The colour legend: what each highlight colour means, per province.
router.put('/api/admin/progress-tracker/seasons/:id/legend', admin, async (req, res, next) => {
  try {
    await tracker.setLegend(req.params.id, req.body?.legend);
    await audit.record(req, { domain: 'admin', action: 'progress-season-legend', label: 'progress tracker colour legend changed', collection: 'progress-seasons', documentId: req.params.id });
    res.json(await tracker.overview(req.params.id));
  } catch (err) {
    fail(res, err, next);
  }
});

// The public link: on or off, its end date, a new token (the old link stops).
router.put('/api/admin/progress-tracker/seasons/:id/share', admin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const share = await tracker.setShare(req.params.id, { enabled: b.enabled, expiresAt: b.expiresAt, regenerate: b.regenerate === true }, principalOf(req));
    await audit.record(req, {
      domain: 'admin',
      action: 'progress-season-share',
      label: `progress tracker public link ${share.enabled ? 'on' : 'off'}${b.regenerate ? ', new link' : ''}${share.expiresAt ? `, until ${share.expiresAt.toISOString().slice(0, 10)}` : ''}`,
      collection: 'progress-seasons',
      documentId: req.params.id,
    });
    res.json(await tracker.overview(req.params.id));
  } catch (err) {
    fail(res, err, next);
  }
});

// The public page (/e-universe/progress/:token): no session. The figures
// only (services/progressTracker publicOverview), for a link the Developer
// turned on; limited per address. Declared public in shared/routeInventory.js.
const publicLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req, res) => ipKeyGenerator(req, res),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' }),
});
router.get('/api/public/progress/:token', publicLimit, async (req, res, next) => {
  try {
    // Revalidated, not stored blind: an unchanged answer is a 304 (its ETag).
    res.set('Cache-Control', 'no-cache');
    res.set('X-Robots-Tag', 'noindex');
    res.json(await tracker.publicOverview(req.params.token));
  } catch (err) {
    fail(res, err, next);
  }
});

// The public map: the dots, and one firm's card (what and where only).
router.get('/api/public/progress/:token/points', publicLimit, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.set('X-Robots-Tag', 'noindex');
    res.json(await tracker.publicPoints(req.params.token, req.query.unit ? String(req.query.unit).slice(0, 40) : null));
  } catch (err) {
    fail(res, err, next);
  }
});
router.get('/api/public/progress/:token/firms/:serial', publicLimit, async (req, res, next) => {
  try {
    res.set('X-Robots-Tag', 'noindex');
    res.json({ firm: await tracker.publicFirm(req.params.token, req.params.serial) });
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
