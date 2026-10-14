const { connectToMongo, getDb } = require('../../../config/db');

// ---------------------------------------------------------------------------
// How a document was shared: the Document Portal requests for it and what
// became of each — asked for, approved or declined (by whom, for how long,
// which pages), access changed or withdrawn, ended, and every time the
// requester opened it. Read for a document's History (Legal, Laboratory)
// and a record's Tracking (Records), so sharing is on the document's own
// trail and not only in the portal's desk.
//
// The portal's audit entries are filed under the request, not the document
// (modules/portal), so the requests for this document are found first —
// by serial *and* unit, since a Legal serial (FSN-0000002) can read like a
// Records one — and their entries read by request id.
// ---------------------------------------------------------------------------

const PORTAL = 'portal-requests';
const LOGS = 'app-logs';

const LABELS = {
  'portal-request': 'Requested in the Document Portal',
  'portal-decision': 'Sharing decided',
  'portal-revoke': 'Sharing withdrawn',
  'portal-adjust': 'Shared access changed',
  'portal-ended': 'Sharing ended',
  'portal-leave': 'Requester left',
  'portal-view': 'Opened by the requester',
  'portal-download': 'Downloaded by the requester',
};

async function ensureIndexes() {
  await connectToMongo();
  await getDb().collection(PORTAL).createIndex({ serialNo: 1, source: 1 });
}

const minutes = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);

/** One line on what an entry did, from what the portal wrote down. */
function detailOf(row, request) {
  const c = row.changes || {};
  const who = c.for || c.requesterName || request?.requesterName;
  const designation = c.designation || request?.designation;
  const parts = [];
  if (who) parts.push(`for ${who}${designation ? ` (${designation})` : ''}`);
  if (row.actionType === 'portal-decision' && c.status) parts.push(c.status);
  if (c.grantedMinutes) parts.push(minutes(c.grantedMinutes));
  if (c.pages && c.pages !== 'all') parts.push(`pages ${c.pages}`);
  if (c.how) parts.push(c.how);
  if (c.purpose) parts.push(`“${String(c.purpose).slice(0, 160)}”`);
  if (c.note) parts.push(`note: ${String(c.note).slice(0, 160)}`);
  return parts.join(' · ') || row.detail || null;
}

/**
 * The sharing events for one document, newest first, as
 * { id, at, who, action, label, detail, success }.
 *
 * @param source  'records' | 'legal' | 'laboratory'
 * @param serialNo
 * @param opts.views  include the requester's opens (the NAS events) — a unit's
 *                    History reads those itself, a record's Tracking does not
 */
async function shareEvents(source, serialNo, { views = true } = {}) {
  await connectToMongo();
  // Requests from before the portal named a source are the Records Unit's.
  const sourceFilter = source === 'records' ? { $or: [{ source: 'records' }, { source: { $exists: false } }] } : { source };
  const requests = await getDb()
    .collection(PORTAL)
    .find({ serialNo, ...sourceFilter }, { projection: { requesterName: 1, designation: 1 } })
    .limit(300)
    .toArray();
  if (!requests.length) return [];
  const byId = new Map(requests.map((r) => [String(r._id), r]));

  const or = [{ targetCollection: PORTAL, documentId: { $in: [...byId.keys()] }, actionType: { $in: Object.keys(LABELS) } }];
  if (views) or.push({ domain: 'nas', serialNo, operation: { $in: ['portal-view', 'portal-download'] } });
  const rows = await getDb()
    .collection(LOGS)
    .find({ $or: or }, { projection: { requestData: 0, userAgent: 0 } })
    .sort({ timestamp: -1 })
    .limit(500)
    .toArray();

  // A view names its request in the detail ("request <id> (…)"); an audit
  // entry is filed under it.
  const requestIdOf = (r) => (r.domain === 'nas' ? /request ([a-f0-9]{24})/.exec(String(r.detail || ''))?.[1] : String(r.documentId));
  return rows
    .filter((r) => byId.has(requestIdOf(r)))
    .map((r) => {
      const action = r.actionType === 'NAS' ? r.operation : r.actionType;
      const request = byId.get(requestIdOf(r));
      const requester = r.changes?.requesterName || request?.requesterName;
      return {
        id: String(r._id),
        at: r.timestamp,
        // Staff decide; the requester asks and opens; the system ends.
        who: r.username || (requester ? `${requester} (Document Portal)` : 'E-Universe (automatic)'),
        action,
        label: LABELS[action] || r.actionLabel || action,
        detail: r.domain === 'nas' ? String(r.detail || '').replace(/^request [a-f0-9]{24} /, '') || null : detailOf(r, request),
        success: r.success !== false,
      };
    });
}

module.exports = { ensureIndexes, shareEvents, LABELS };
