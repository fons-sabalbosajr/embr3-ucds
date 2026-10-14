const { connectToMongo, getDb } = require('../../../config/db');
const { forbidden } = require('../../../shared/middleware/errorHandler');
const { isDeveloper } = require('../../../services/authorization');

// ---------------------------------------------------------------------------
// The Document Portal's room settings — the Developer's to set (ERMS ›
// Portal Requests › Room settings).
//
//   closedOnWeekends   the room is closed on Saturdays and Sundays (Philippine
//                      time): nobody enters, and no document opens. A
//                      request's 24 hours to be decided count weekdays only.
//   watermark          the reader's name, computer and time printed across
//                      every page. Off: the pages are shown clean, as
//                      scanned; the approved pages are still all that is sent.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'portal-settings';
const DEFAULTS = Object.freeze({ closedOnWeekends: true, watermark: false });

let cache = null;

async function read() {
  if (cache && Date.now() - cache.at < 15000) return cache.value;
  await connectToMongo();
  const doc = await getDb().collection(COLLECTION).findOne({ _id: DOC_ID });
  const value = {
    closedOnWeekends: typeof doc?.closedOnWeekends === 'boolean' ? doc.closedOnWeekends : DEFAULTS.closedOnWeekends,
    watermark: typeof doc?.watermark === 'boolean' ? doc.watermark : DEFAULTS.watermark,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
  cache = { at: Date.now(), value };
  return value;
}

async function save(user, input = {}) {
  if (!isDeveloper(user)) throw forbidden('Only the Developer sets the Document Portal room settings.', 'DEVELOPER_ONLY');
  await connectToMongo();
  const set = { updatedAt: new Date(), updatedBy: user?.username || null };
  for (const key of Object.keys(DEFAULTS)) if (typeof input[key] === 'boolean') set[key] = input[key];
  await getDb().collection(COLLECTION).updateOne({ _id: DOC_ID }, { $set: set }, { upsert: true });
  cache = null;
  return read();
}

/** For tests: forget the cached settings. */
const forget = () => {
  cache = null;
};

// ── Weekends ────────────────────────────────────────────────────────────────

const MANILA_MS = 8 * 3600000; // UTC+8, no daylight saving
const DAY_MS = 24 * 3600000;

/** Saturday or Sunday in the Philippines. */
const isWeekend = (at = new Date()) => {
  const day = new Date(at.getTime() + MANILA_MS).getUTCDay();
  return day === 0 || day === 6;
};

/** Monday 00:00 Philippine time after `at` (or `at` itself when not a weekend). */
function nextOpening(at = new Date()) {
  if (!isWeekend(at)) return at;
  const local = new Date(at.getTime() + MANILA_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const daysToMonday = local.getUTCDay() === 6 ? 2 : 1;
  return new Date(midnight + daysToMonday * DAY_MS - MANILA_MS);
}

/**
 * `ms` of open time after `start`: weekend hours are skipped when the room
 * closes on weekends, so a request asked on Friday evening is not lapsed
 * over the weekend before anyone could decide it.
 */
function addOpenTime(start, ms, closedOnWeekends) {
  if (!closedOnWeekends) return new Date(start.getTime() + ms);
  let at = nextOpening(start);
  let left = ms;
  while (left > 0) {
    const local = new Date(at.getTime() + MANILA_MS);
    const endOfDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DAY_MS - MANILA_MS;
    const step = Math.min(left, endOfDay - at.getTime());
    at = new Date(at.getTime() + step);
    left -= step;
    if (left > 0) at = nextOpening(at);
  }
  return at;
}

/** Whether the room is open now, and when it opens next if not. */
async function roomState(at = new Date()) {
  const s = await read();
  const closed = s.closedOnWeekends && isWeekend(at);
  return { open: !closed, opensAt: closed ? nextOpening(at) : null, reason: closed ? 'weekend' : null };
}

module.exports = { read, save, forget, DEFAULTS, isWeekend, nextOpening, addOpenTime, roomState };
