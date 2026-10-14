const { connectToMongo, getDb } = require('../config/db');
const { ERMS_UNIT_VALUES, ERMS_UNIT_LABELS, isDeveloper } = require('./authorization');
const { principalOf } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Taking an ERMS unit down — Records, Legal Services or Laboratory — for
// maintenance, or to keep E-Universe light while a unit is not in use.
//
// The Developer switches a unit off under Admin Settings › ERMS Units. While
// it is off, everything that reads or files that unit's documents answers
// 503 ERMS_UNIT_DOWN with the reason given — its screens, its uploads, its
// documents in the Document Portal and on an establishment's panel — and the
// application stops asking for them (the sidebar, the dashboards and the
// notification counts read GET /api/erms/availability first). The Developer
// is never turned away, so the unit can be checked before it is opened
// again. Nothing is deleted or changed: switching it back on is all it takes.
//
// One document, app-config/erms-availability, read through a short cache:
// the guard runs on every request and must cost next to nothing.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'erms-availability';
const CACHE_MS = 5000;

let cache = null;
let cachedAt = 0;

const blank = () => Object.fromEntries(ERMS_UNIT_VALUES.map((u) => [u, { down: false, reason: null, since: null, by: null }]));

/** Every unit's state: { records: { down, reason, since, by }, legal: …, laboratory: … }. */
async function read() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
  await connectToMongo();
  const doc = await getDb().collection(COLLECTION).findOne({ _id: DOC_ID });
  const units = blank();
  for (const u of ERMS_UNIT_VALUES) {
    const s = doc?.units?.[u];
    if (s) units[u] = { down: s.down === true, reason: s.reason || null, since: s.since || null, by: s.by || null };
  }
  cache = units;
  cachedAt = Date.now();
  return units;
}

const isDown = async (unit) => Boolean((await read())[unit]?.down);
const downUnits = async () => Object.entries(await read()).filter(([, s]) => s.down).map(([u]) => u);

/** Switch one unit off (with a reason the screens show) or back on. */
async function set(unit, { down, reason }, user) {
  if (!ERMS_UNIT_VALUES.includes(unit)) throw Object.assign(new Error('Unknown unit.'), { status: 404, code: 'UNIT_UNKNOWN' });
  await connectToMongo();
  const state = down
    ? { down: true, reason: String(reason || '').trim().slice(0, 300) || null, since: new Date(), by: user?.username || null }
    : { down: false, reason: null, since: new Date(), by: user?.username || null };
  await getDb().collection(COLLECTION).updateOne({ _id: DOC_ID }, { $set: { [`units.${unit}`]: state, updatedAt: new Date() } }, { upsert: true });
  cache = null;
  return read();
}

/**
 * Whose documents a request is about, from its path — or null when it is
 * about none in particular (messages, configuration, the lookups every form
 * shares, this switch itself).
 */
function unitOfPath(path) {
  const p = String(path || '');
  const unitPath = /^\/api\/erms\/units\/(records|legal|laboratory)(\/|$)/.exec(p);
  if (unitPath) return unitPath[1];
  // The Records Unit's own screens, which predate the units' paths.
  if (/^\/api\/erms\/(records|dashboard|filter-options|boxes|tracking|disposal-due|reports?)(\/|$)/.test(p)) return 'records';
  // A Records document behind an establishment, for Planning.
  if (/^\/api\/ucds\/records\//.test(p)) return 'records';
  return null;
}

const label = (unit) => ERMS_UNIT_LABELS[unit] || unit;

/** The refusal, the same wherever a down unit is reached. */
function downBody(unit, state) {
  return {
    code: 'ERMS_UNIT_DOWN',
    unit,
    message: `The ${label(unit)} is temporarily unavailable${state?.reason ? `: ${state.reason}` : ' for maintenance'}. Please try again later.`,
    reason: state?.reason || null,
    since: state?.since || null,
  };
}

/** Express middleware: a down unit's requests answer 503, except to the Developer. */
async function guard(req, res, next) {
  const unit = unitOfPath(req.path);
  if (!unit) return next();
  try {
    const state = (await read())[unit];
    if (!state?.down || isDeveloper(principalOf(req))) return next();
    return res.status(503).json(downBody(unit, state));
  } catch (error) {
    // The switch failing to read must not take the units down with it.
    console.error('ERMS availability check failed:', error.message);
    return next();
  }
}

module.exports = { DOC_ID, read, isDown, downUnits, set, guard, unitOfPath, downBody };
