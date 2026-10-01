const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// When the NAS is offered at all.
//
// Two rules, both set by the Developer under Storage > Availability and both
// applied to every container at once:
//
//   master     one switch for all of them. Off means nobody opens anything,
//              whatever each container's own switch says. A fast way to take
//              the shares away during maintenance without touching four rows.
//   schedule   the days and hours the NAS is offered. The office server that
//              bridges to the NAS is up on working days only, so outside the
//              schedule the application says so in words the person can act
//              on ("available on weekdays") instead of failing against a
//              share it cannot reach.
//
// The activation window (nasActivation) still applies on top: this decides
// whether the NAS is *offered*, that decides whether it is *on right now*.
// Everything is evaluated on the server on every request; the screens only
// display the outcome.
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'nas-availability';
const TIME_ZONE = process.env.NAS_TIME_ZONE || 'Asia/Manila';

const DEFAULT_MESSAGE =
  'NAS files are available on weekdays only (Monday to Friday, office hours). Please open them again on the next working day.';

const DEFAULTS = {
  master: true,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '07:00', to: '19:00' },
  message: DEFAULT_MESSAGE,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const collection = () => getDb().collection(COLLECTION);

let cache = { at: 0, value: null };
// A few seconds between reads: every NAS request evaluates this. Under
// vitest the module is loaded twice (once by the test, once by the app), so a
// cache in one copy would hide a save made through the other.
const CACHE_MS = process.env.VITEST ? 0 : 10 * 1000;

const clampTime = (v, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : fallback);
const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function normalize(doc) {
  const s = doc?.schedule || {};
  const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULTS.schedule.days;
  return {
    master: doc?.master !== false,
    schedule: {
      enabled: s.enabled === true,
      days,
      from: clampTime(s.from, DEFAULTS.schedule.from),
      to: clampTime(s.to, DEFAULTS.schedule.to),
    },
    message: String(doc?.message || '').trim().slice(0, 400) || DEFAULT_MESSAGE,
    timeZone: TIME_ZONE,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

async function read() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  await connectToMongo();
  const value = normalize(await collection().findOne({ _id: DOC_ID }));
  cache = { at: Date.now(), value };
  return value;
}

/** The local weekday and minute-of-day of `now` in the office time zone. */
function localParts(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hour = Number(get('hour')) % 24;
  return { day, minutes: hour * 60 + Number(get('minute')) };
}

/**
 * Whether the NAS is offered at `now`, and if not why and when it is next.
 *
 *   available   true when the master is on and the schedule (if any) allows
 *   reason      'master-off' | 'outside-schedule' | null
 *   message     the configured sentence, for the screen to show as it is
 *   nextOpensAt when the schedule next opens, if it ever does
 */
async function evaluate(now = new Date()) {
  const cfg = await read();
  if (!cfg.master) {
    return { available: false, reason: 'master-off', message: 'The NAS is switched off for everyone by the Developer.', schedule: cfg.schedule };
  }
  // The road to the NAS: when the bridge server is off, nothing is offered
  // whatever the schedule says — and the person is told which it is.
  const bridge = await require('./nasBridge').blocking();
  if (bridge) {
    return { available: false, reason: bridge.reason, message: bridge.message, schedule: cfg.schedule, bridge };
  }
  if (!cfg.schedule.enabled) {
    return { available: true, reason: null, message: null, schedule: cfg.schedule };
  }
  const { day, minutes } = localParts(now);
  const from = minutesOf(cfg.schedule.from);
  const to = minutesOf(cfg.schedule.to);
  const inDay = cfg.schedule.days.includes(day);
  const inHours = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  if (inDay && inHours) {
    return { available: true, reason: null, message: null, schedule: cfg.schedule };
  }
  return {
    available: false,
    reason: 'outside-schedule',
    message: cfg.message,
    schedule: cfg.schedule,
    nextOpensAt: nextOpening(cfg.schedule, now, { day, minutes }),
  };
}

/** The next moment the schedule opens, as an ISO string, or null if it never does. */
function nextOpening(schedule, now, { day, minutes }) {
  if (!schedule.days.length) return null;
  const from = minutesOf(schedule.from);
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const d = (day + ahead) % 7;
    if (!schedule.days.includes(d)) continue;
    if (ahead === 0 && minutes >= from) continue;
    const waitMinutes = ahead * 24 * 60 + from - minutes;
    return new Date(now.getTime() + waitMinutes * 60000).toISOString();
  }
  return null;
}

/** A sentence describing the schedule, for screens and for the audit trail. */
function describeSchedule(schedule) {
  if (!schedule?.enabled) return 'every day, all hours';
  const days = schedule.days;
  let dayText;
  if (days.join() === '1,2,3,4,5') dayText = 'weekdays';
  else if (days.length === 7) dayText = 'every day';
  else dayText = days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ');
  return `${dayText}, ${schedule.from}–${schedule.to} (${TIME_ZONE})`;
}

async function save(input, actor) {
  const current = await read();
  const next = normalize({
    master: input?.master === undefined ? current.master : input.master === true,
    schedule: { ...current.schedule, ...(input?.schedule || {}) },
    message: input?.message === undefined ? current.message : input.message,
  });
  if (next.schedule.enabled && !next.schedule.days.length) {
    return { ok: false, status: 400, message: 'Pick at least one day, or switch the schedule off.' };
  }
  const doc = {
    master: next.master,
    schedule: next.schedule,
    message: next.message,
    updatedAt: new Date(),
    updatedBy: actor?.username || 'unknown',
  };
  await connectToMongo();
  await collection().updateOne({ _id: DOC_ID }, { $set: doc }, { upsert: true });
  cache = { at: 0, value: null };
  const changed = [];
  if (current.master !== next.master) changed.push(next.master ? 'master on' : 'master off');
  if (JSON.stringify(current.schedule) !== JSON.stringify(next.schedule)) changed.push(`schedule: ${describeSchedule(next.schedule)}`);
  if (current.message !== next.message) changed.push('message changed');
  return { ok: true, config: await read(), changed };
}

module.exports = { read, save, evaluate, describeSchedule, DEFAULTS, DEFAULT_MESSAGE, TIME_ZONE, COLLECTION, DOC_ID };
