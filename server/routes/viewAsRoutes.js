const express = require('express');
const router = express.Router();
const { authenticateSession, requireDeveloper } = require('../middleware/auth');
const viewAs = require('../services/viewAs');

// ---------------------------------------------------------------------------
// Developer "view as" (services/viewAs.js). Setting the PIN, entering it and
// starting are the Developer's own; ending is open to the session that is
// viewing, since by then the session holds the officer's snapshot.
// ---------------------------------------------------------------------------

const developerOnly = [authenticateSession, requireDeveloper];
const BASE = '/api/developer/view-as';

const send = (res, result) => {
  const { status = 200, ...body } = result;
  res.status(status).json(body);
};
const handle = (fn) => async (req, res) => {
  try {
    send(res, await fn(req, req.body || {}));
  } catch (error) {
    console.error('View as failed:', error.message);
    res.status(500).json({ message: 'Could not complete that.' });
  }
};

router.get(`${BASE}/status`, developerOnly, handle((req) => viewAs.status(req)));
router.post(`${BASE}/pin`, developerOnly, handle((req, body) => viewAs.setPin(req, body)));
router.post(`${BASE}/unlock`, developerOnly, handle((req, body) => viewAs.unlock(req, body)));
router.post(`${BASE}/start`, developerOnly, handle((req, body) => viewAs.start(req, body)));
router.post(`${BASE}/stop`, authenticateSession, handle((req) => viewAs.stop(req)));

module.exports = router;
