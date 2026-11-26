const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// The audit trail, read by sub-application for Admin Settings › Audit Logs.
//
// Everything is in one collection, app-logs. Most entries carry a `domain`
// (nas, erms, ucds, vera, admin), written by middleware/activityLog.js,
// services/nasAudit.js and the module controllers. Two things are not
// recorded that way and are worked out here instead:
//
//   - Document Portal entries are written by the ERMS module, so they say
//     domain: 'erms'; every one of them has an actionType beginning
//     "portal-" (portalController, shareTrail).
//   - Entries from before the domain field existed (September 2026 and
//     earlier) have none. Their paths are UCDS work (postings, surveys,
//     register edits) except the account screens, which are Admin.
//
// The categories are mutually exclusive and checked in this order, so every
// entry appears on exactly one tab: NAS, Document Portal, ERMS, VERA, Admin,
// then UCDS for whatever remains.
//
// What leaves the server is a fixed shape, with request bodies passed through
// redact(): the old /api/logs handed the raw documents, request bodies
// included, to any signed-in account.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-logs';

const ADMIN_PATH = /^\/api\/(users|profile|org-units|admin)(\/|$)/;
const PORTAL_TYPE = /^portal-/;
const PORTAL_PATH = /^\/api\/(erms\/)?portal(\/|$)/;

const NOT_NAS = { domain: { $ne: 'nas' } };
const IS_PORTAL = { $or: [{ actionType: PORTAL_TYPE }, { path: PORTAL_PATH }] };
const NOT_PORTAL = { $nor: [{ actionType: PORTAL_TYPE }, { path: PORTAL_PATH }] };

const CATEGORIES = {
  erms: { label: 'ERMS', filter: { $and: [{ domain: 'erms' }, NOT_PORTAL] } },
  ucds: {
    label: 'UCDS',
    filter: {
      $and: [
        NOT_NAS,
        NOT_PORTAL,
        { $or: [{ domain: 'ucds' }, { domain: null, path: { $not: ADMIN_PATH } }] },
      ],
    },
  },
  portal: { label: 'Document Portal', filter: { $and: [NOT_NAS, IS_PORTAL] } },
  nas: { label: 'NAS', filter: { domain: 'nas' } },
  admin: {
    label: 'Admin',
    filter: { $and: [NOT_PORTAL, { $or: [{ domain: 'admin' }, { domain: null, path: ADMIN_PATH }] }] },
  },
  vera: { label: 'VERA', filter: { $and: [{ domain: 'vera' }, NOT_PORTAL] } },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

/** A search term as a literal, case-insensitive pattern: never user-supplied regex. */
const literal = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100), 'i');

/** The MongoDB filter for one tab and its search box, user and date range. */
function buildFilter(category, { q, username, start, end, outcome } = {}) {
  const def = CATEGORIES[category];
  if (!def) return null;
  const and = [def.filter];
  if (username) and.push({ username: String(username) });
  if (q) {
    const re = literal(q);
    and.push({
      $or: ['actionLabel', 'detail', 'message', 'username', 'path', 'serialNo', 'fileName', 'actionType', 'operation'].map((f) => ({ [f]: re })),
    });
  }
  const range = {};
  if (start && !Number.isNaN(Date.parse(start))) range.$gte = new Date(start);
  if (end && !Number.isNaN(Date.parse(end))) range.$lte = new Date(end);
  if (Object.keys(range).length) and.push({ $or: [{ timestamp: range }, { createdAt: range }] });
  if (outcome === 'failed') and.push({ success: false });
  if (outcome === 'ok') and.push({ success: { $ne: false } });
  return and.length === 1 ? and[0] : { $and: and };
}

// Keys whose values must never be shown, at any depth of a request body.
const SECRET_KEY = /pass(word)?|secret|token|^pin$|otp|api[-_]?key|credential|^code$|verification/i;

/** A copy of a request body with secrets hidden, depth and size bounded. */
function redact(value, depth = 0) {
  if (value == null || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (depth > 4) return '[…]';
  if (Array.isArray(value)) {
    const out = value.slice(0, 50).map((v) => redact(v, depth + 1));
    if (value.length > 50) out.push(`… ${value.length - 50} more`);
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 80)) {
    out[k] = SECRET_KEY.test(k) ? '[hidden]' : redact(v, depth + 1);
  }
  return out;
}

/** Which ERMS unit an entry concerns, from its path: /api/erms/legal/... */
const unitOf = (path) => {
  const m = /^\/api\/erms\/(legal|laboratory)(\/|$)/.exec(path || '');
  if (m) return m[1];
  return /^\/api\/erms\//.test(path || '') ? 'records' : null;
};

/** The fixed shape a screen receives. */
function present(doc) {
  const label = doc.actionLabel || doc.message || '';
  return {
    _id: String(doc._id),
    timestamp: doc.timestamp || doc.createdAt || doc.date || null,
    username: doc.username || null,
    actionType: doc.actionType || doc.operation || null,
    actionLabel: label.length > 600 ? `${label.slice(0, 600)}…` : label,
    // A Developer's note on the entry (PUT /api/dev/activity-logs/:id).
    message: doc.actionLabel && doc.message ? String(doc.message).slice(0, 600) : null,
    detail: doc.detail || null,
    method: doc.method || null,
    path: doc.path || null,
    success: doc.success === false ? false : doc.success === true ? true : null,
    serialNo: doc.serialNo || null,
    container: doc.container || null,
    fileName: doc.fileName || null,
    unit: unitOf(doc.path),
    ip: doc.ip || null,
    requestData: doc.requestData ? redact(doc.requestData) : null,
  };
}

async function list(category, { page = 1, pageSize = 50, ...criteria } = {}) {
  const filter = buildFilter(category, criteria);
  if (!filter) return null;
  // UCDS and Admin, once moved (phase B2.2): read from SQL Server.
  const store = require('./activityStore');
  if (await store.readsSql(category)) return store.list(category, { page, pageSize, ...criteria });
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
  await connectToMongo();
  const col = getDb().collection(COLLECTION);
  const [total, docs] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ timestamp: -1, createdAt: -1, _id: -1 }).skip(skip).limit(size).toArray(),
  ]);
  return { total, items: docs.map(present) };
}

/** Entries per tab: all time, and in the last seven days. */
async function summary(now = new Date()) {
  await connectToMongo();
  const col = getDb().collection(COLLECTION);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const store = require('./activityStore');
  const fromSql = (await Promise.all(CATEGORY_KEYS.map((k) => store.readsSql(k)))).some(Boolean) ? await store.summary(now) : null;
  const counts = await Promise.all(
    CATEGORY_KEYS.map(async (key) => {
      if (fromSql && (await store.readsSql(key))) {
        const s = fromSql[key] || { total: 0, week: 0 };
        return [key, { label: CATEGORIES[key].label, total: s.total, week: s.week }];
      }
      const [total, week] = await Promise.all([
        col.countDocuments(CATEGORIES[key].filter),
        col.countDocuments(buildFilter(key, { start: weekAgo.toISOString() })),
      ]);
      return [key, { label: CATEGORIES[key].label, total, week }];
    })
  );
  return Object.fromEntries(counts);
}

module.exports = { CATEGORIES, CATEGORY_KEYS, buildFilter, redact, present, unitOf, list, summary, COLLECTION };
