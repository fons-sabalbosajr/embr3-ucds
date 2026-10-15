const express = require('express');
const { authenticateSession } = require('../middleware/auth');
const notifier = require('../services/notifier');

// ---------------------------------------------------------------------------
// Notices on this device (services/notifier.js).
//
// Every signed-in account may ask for them: a person is only ever sent
// notices about their own work — a request to decide if they decide them, a
// message to them, a decision on their own request. What reaches whom is
// decided where the notice is raised, not here.
// ---------------------------------------------------------------------------

const router = express.Router();

const me = (req) => req.session?.user?.username || null;

/**
 * The key a browser subscribes with; whether this account takes notices on
 * the browser named by ?endpoint=, and how many accounts that browser serves.
 */
router.get('/api/notifications/push', authenticateSession, async (req, res, next) => {
  try {
    const key = await notifier.publicKey();
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.slice(0, 1024) : null;
    return res.json({ available: Boolean(key), publicKey: key, ...(await notifier.statusOf(me(req), endpoint)) });
  } catch (err) {
    return next(err);
  }
});

router.post('/api/notifications/push/subscribe', authenticateSession, async (req, res, next) => {
  try {
    const ok = await notifier.subscribe(me(req), req.body?.subscription, req.get('user-agent'));
    if (!ok) return res.status(400).json({ message: 'That browser subscription could not be read.' });
    return res.json({ ok: true, devices: await notifier.devicesOf(me(req)) });
  } catch (err) {
    return next(err);
  }
});

router.post('/api/notifications/push/unsubscribe', authenticateSession, async (req, res, next) => {
  try {
    const remaining = await notifier.unsubscribe(me(req), req.body?.endpoint);
    // remaining: other accounts this browser still serves. At 0 the browser
    // drops its subscription altogether.
    return res.json({ ok: true, remaining, devices: await notifier.devicesOf(me(req)) });
  } catch (err) {
    return next(err);
  }
});

// Sign-out pauses this account's notices on this browser; signing back in
// resumes them. Neither turns notices on for an account that never asked.
const pauseOrResume = (paused) => async (req, res, next) => {
  try {
    const found = await notifier.setPaused(me(req), req.body?.endpoint, paused);
    return res.json({ ok: true, on: !paused && found });
  } catch (err) {
    return next(err);
  }
};
router.post('/api/notifications/push/pause', authenticateSession, pauseOrResume(true));
router.post('/api/notifications/push/resume', authenticateSession, pauseOrResume(false));

/** A test notice to this account's screens and devices. */
router.post('/api/notifications/test', authenticateSession, async (req, res, next) => {
  try {
    const result = await notifier.notify([me(req)], {
      title: 'Notifications are on',
      body: 'E-Universe will tell you here when something needs you.',
      url: '/e-universe/home',
      kind: 'test',
      tag: 'test',
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
