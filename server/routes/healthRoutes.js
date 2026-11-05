const express = require('express');
const { connectToMongo, client } = require('../config/db');
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const requestTiming = require('../shared/middleware/requestTiming');

const router = express.Router();

// The slowest routes since the server started (shared/middleware/requestTiming).
router.get('/api/health/performance', authenticateSession, requireDeveloper, (req, res) => {
  res.json(requestTiming.summary());
});

// Liveness: process is up
router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: DB reachable. The NAS is reported alongside for whoever is
// looking, but does not decide readiness — the application serves the
// register, records and reports from MongoDB whether or not the NAS answers.
router.get('/readyz', async (req, res) => {
  let nas = 'unwatched';
  try {
    const last = await require('../services/nasBridge').status();
    if (last.up === true) nas = 'up';
    else if (last.up === false) nas = 'down';
  } catch {
    // the NAS watch is not what readiness is about
  }
  try {
    await connectToMongo();
    await client.db('admin').command({ ping: 1 });
    res.status(200).json({ db: 'ok', nas });
  } catch (e) {
    res.status(503).json({ db: 'down', nas, error: e.message });
  }
});

module.exports = router;
