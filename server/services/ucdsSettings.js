const { connectToMongo, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// Universe Central DB settings.
//
// One document in app-config, read by every UCDS screen and written only by
// a Developer or Administrator. Each setting here changes something the
// server enforces or the screens do; there is no setting that exists only to
// be displayed.
//
//   datasets.editing     whether dataset rows may be added, edited or deleted
//                        at all (checked on the server on every write)
//   datasets.export      whether CSV export is offered and served
//   datasets.pageSize    the page size dataset tables open with
//   register.pageSize    the page size the Monitoring Plan opens with
//   years.lockFuture     whether containers after the current year stay
//                        locked (the picker and /api/years/select rule)
// ---------------------------------------------------------------------------

const COLLECTION = 'app-config';
const DOC_ID = 'ucds-settings';

const DEFAULTS = {
  datasets: { editing: true, export: true, pageSize: 25 },
  register: { pageSize: 50 },
  years: { lockFuture: true },
};

const PAGE_SIZES = [10, 25, 50, 100, 200];

let cache = { at: 0, value: null };
const CACHE_MS = 15 * 1000;

const collection = async () => {
  await connectToMongo();
  return getDb().collection(COLLECTION);
};

function merge(stored) {
  const s = stored || {};
  return {
    datasets: { ...DEFAULTS.datasets, ...(s.datasets || {}) },
    register: { ...DEFAULTS.register, ...(s.register || {}) },
    years: { ...DEFAULTS.years, ...(s.years || {}) },
    updatedAt: s.updatedAt || null,
    updatedBy: s.updatedBy || null,
  };
}

/** The effective settings, defaults filled in. Cached briefly. */
async function read() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const col = await collection();
  const value = merge(await col.findOne({ _id: DOC_ID }));
  cache = { at: Date.now(), value };
  return value;
}

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const size = (v, fallback) => (PAGE_SIZES.includes(Number(v)) ? Number(v) : fallback);

/** Validate and store. Unknown keys are dropped; bad values keep the old ones. */
async function save(input, actor) {
  const current = await read();
  const next = {
    datasets: {
      editing: bool(input?.datasets?.editing, current.datasets.editing),
      export: bool(input?.datasets?.export, current.datasets.export),
      pageSize: size(input?.datasets?.pageSize, current.datasets.pageSize),
    },
    register: {
      pageSize: size(input?.register?.pageSize, current.register.pageSize),
    },
    years: {
      lockFuture: bool(input?.years?.lockFuture, current.years.lockFuture),
    },
    updatedAt: new Date(),
    updatedBy: actor?.username || 'unknown',
  };
  const col = await collection();
  await col.updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
  cache = { at: 0, value: null };
  return merge(next);
}

module.exports = { read, save, DEFAULTS, PAGE_SIZES };
