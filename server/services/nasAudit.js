const { connectToMongo, getDb } = require('../config/db');
const { principalOf } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Audit trail for document and NAS-configuration operations.
//
// Writes into the existing `app-logs` collection rather than a second one, so
// there is one audit trail to read and the Admin > Audit screen keeps working
// unchanged. The generic activityLog middleware only records mutations; file
// reads matter here, so these are recorded explicitly.
//
// What is deliberately NOT recorded: the resolved UNC path. It contains the
// internal host address and share name, and the audit trail is readable from
// the Admin screens — so recording it would publish the network topology to
// everyone who can read a log. The record serial identifies the document, and
// the path can be derived from the record by anyone entitled to it.
// ---------------------------------------------------------------------------

async function recordFileEvent(req, { operation, serialNo, fileName, success, detail, bytes }) {
  const user = principalOf(req) || {};

  const entry = {
    userId: user.userId || user._id || null,
    username: user.username || null,
    domain: 'nas',
    method: req?.method || null,
    path: req?.originalUrl ? String(req.originalUrl).split('?')[0] : null,
    actionType: 'NAS',
    actionLabel: operation,
    operation,
    serialNo: serialNo || null,
    fileName: fileName || null,
    success: success !== false,
    detail: detail || null,
    bytes: typeof bytes === 'number' ? bytes : null,
    timestamp: new Date(),
  };

  try {
    await connectToMongo();
    await getDb().collection('app-logs').insertOne(entry);
  } catch (error) {
    // An audit write must never take down a file read the user is entitled to.
    console.error('NAS audit write failed:', error.message);
  }
}

module.exports = { recordFileEvent };
