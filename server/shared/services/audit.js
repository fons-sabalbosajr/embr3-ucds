
// ---------------------------------------------------------------------------
// Audit trail.
//
// One collection for both domains, discriminated by `domain`, so "what changed
// and who changed it" is answerable in one place.
//
// This is distinct from ERMS tracking. Tracking is business custody history —
// where a physical record went and who holds it. This is a system audit trail:
// which fields a request altered.
//
// The legacy middleware/activityLog.js resolves its target collection from a
// hardcoded path.includes() chain and cannot describe an ERMS write; new code
// calls this instead.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-logs';

/** Field-level difference, shallow, ignoring keys the caller did not send. */
function diff(before = {}, after = {}) {
  const changes = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes[key] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}

/**
 * @param {object} req        the request, for the acting user
 * @param {object} entry      { domain, action, collection, documentId, label, changes }
 */
async function record(req, entry) {
  try {
    const user = req.session?.user;
    // MongoDB or SQL Server by category (services/activityStore.js).
    await require('../../services/activityStore').record({
      userId: user?.userId || null,
      username: user?.username || null,
      domain: entry.domain,
      method: req.method,
      path: req.path,
      actionType: entry.action,
      actionLabel: entry.label,
      targetCollection: entry.collection || null,
      documentId: entry.documentId || null,
      changes: entry.changes || null,
      requestData: entry.includeBody === false ? null : req.body,
      timestamp: new Date(),
    });
  } catch (error) {
    // An audit failure must not fail the operation the user asked for; it is
    // logged loudly instead so the gap is visible.
    console.error('AUDIT WRITE FAILED:', entry.action, error.message);
  }
}

module.exports = { record, diff, COLLECTION };
