const express = require('express');
const { connectToMongo, client } = require('../config/db');

const router = express.Router();

// Liveness: process is up
router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: DB reachable
router.get('/readyz', async (req, res) => {
  try {
    await connectToMongo();
    await client.db('admin').command({ ping: 1 });
    res.status(200).json({ db: 'ok' });
  } catch (e) {
    res.status(503).json({ db: 'down', error: e.message });
  }
});

module.exports = router;
