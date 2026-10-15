const { connectToMongo, collections } = require('../config/db');
const { normalizeKeys, PROVINCE_KEYS } = require('./provinces');
const shortCache = require('../shared/services/shortCache');

// ---------------------------------------------------------------------------
// Year containers are data, not constants. Adding 2028 means inserting one
// document — no code change, no redeploy.
// ---------------------------------------------------------------------------

const BASELINE_YEAR = 2025; // the dataset that existed before year containers

// Every year-scoped request checks the container twice (may this user still
// enter it, and which provinces does it cover) — two reads per request, for
// documents that change a few times a year. Kept for 30 seconds; every change
// below clears them. Callers must treat what they get as read-only.
const YEARS_CACHE = 'years:';
const YEARS_TTL = 30 * 1000;
const yearsChanged = () => shortCache.invalidate(YEARS_CACHE);

async function listYears({ includeArchived = false } = {}) {
  return shortCache.cached(`${YEARS_CACHE}list:${includeArchived}`, YEARS_TTL, async () => {
    await connectToMongo();
    const filter = includeArchived ? {} : { status: 'active' };
    return collections.yearContainers.find(filter).sort({ year: -1 }).toArray();
  });
}

async function listYearNumbers(options) {
  return (await listYears(options)).map((y) => y.year);
}

async function getYear(year) {
  const n = Number(year);
  if (!Number.isInteger(n)) return null;
  return shortCache.cached(`${YEARS_CACHE}one:${n}`, YEARS_TTL, async () => {
    await connectToMongo();
    return collections.yearContainers.findOne({ year: n });
  });
}

/**
 * Whether a container has opened yet.
 *
 * Future years are registered ahead of time so the picker shows what is
 * coming, but nobody enters 2029 in 2026: there is nothing there yet, and a
 * record filed into it by mistake is stranded until then.
 */
const isOpenYear = (year, now = new Date()) => Number(year) <= now.getFullYear();

/**
 * The same rule, honouring the Universe Central DB setting that turns the
 * lock off — for a deployment that wants next year's container open early.
 */
async function isOpenYearNow(year, now = new Date()) {
  const doc = await getYear(year);
  if (doc?.locked === true) return false;
  // One future year opened ahead of time (2027 in October 2026, for its
  // monitoring plan), without unlocking every year after it.
  if (doc?.openEarly === true) return true;
  const settings = await require('./ucdsSettings').read();
  return settings.years.lockFuture === false ? true : isOpenYear(year, now);
}

/** A year is usable only if it is registered, active and has opened. */
async function isSelectableYear(year) {
  const doc = await getYear(year);
  return Boolean(doc && doc.status === 'active' && doc.hidden !== true && (await isOpenYearNow(doc.year)));
}

async function createYear({ year, label, description, provinces, createdBy }) {
  await connectToMongo();
  const n = Number(year);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    const err = new Error('Year must be an integer between 2000 and 2100.');
    err.status = 400;
    throw err;
  }
  if (await getYear(n)) {
    const err = new Error(`Year container ${n} already exists.`);
    err.status = 409;
    throw err;
  }
  const doc = {
    year: n,
    label: label || `${n} Data`,
    description: description || '',
    status: 'active',
    // Which provinces' data this container covers. Empty means all provinces.
    provinces: normalizeKeys(provinces).length ? normalizeKeys(provinces) : PROVINCE_KEYS,
    createdAt: new Date(),
    createdBy: createdBy || null,
  };
  await collections.yearContainers.insertOne(doc);
  yearsChanged();
  return doc;
}

/** Replace a container's province scope. */
async function setYearProvinces(year, provinces) {
  await connectToMongo();
  const keys = normalizeKeys(provinces);
  if (!keys.length) {
    const err = new Error('Select at least one province for this container.');
    err.status = 400;
    throw err;
  }
  const result = await collections.yearContainers.findOneAndUpdate(
    { year: Number(year) },
    { $set: { provinces: keys, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  yearsChanged();
  return result && (result.value || result);
}

/**
 * Per-container switches, set from Year Configuration:
 *   hidden  the container is not offered to anyone — not on the picker, not
 *           in the sidebar; the data stays and it can be shown again
 *   locked  listed but not enterable, whatever the calendar says; for a year
 *           that is being reconciled, or an old one that should not change
 */
async function setYearFlags(year, { hidden, locked }) {
  await connectToMongo();
  const set = { updatedAt: new Date() };
  if (typeof hidden === 'boolean') set.hidden = hidden;
  if (typeof locked === 'boolean') set.locked = locked;
  const result = await collections.yearContainers.findOneAndUpdate(
    { year: Number(year) },
    { $set: set },
    { returnDocument: 'after' }
  );
  yearsChanged();
  return result && (result.value || result);
}

async function setYearStatus(year, status) {
  await connectToMongo();
  if (!['active', 'archived'].includes(status)) {
    const err = new Error('Status must be "active" or "archived".');
    err.status = 400;
    throw err;
  }
  const n = Number(year);
  const result = await collections.yearContainers.findOneAndUpdate(
    { year: n },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  yearsChanged();
  return result && (result.value || result);
}

/** Register the baseline year if the registry has never been populated. */
async function ensureSeeded() {
  await connectToMongo();
  if ((await collections.yearContainers.estimatedDocumentCount()) > 0) return;
  await collections.yearContainers.insertOne({
    year: BASELINE_YEAR,
    label: `${BASELINE_YEAR} Data`,
    description: 'Baseline UCDS dataset.',
    status: 'active',
    createdAt: new Date(),
    createdBy: 'system',
  });
  yearsChanged();
}

module.exports = {
  BASELINE_YEAR,
  listYears,
  listYearNumbers,
  getYear,
  isOpenYear,
  isOpenYearNow,
  isSelectableYear,
  createYear,
  setYearStatus,
  setYearFlags,
  setYearProvinces,
  ensureSeeded,
};
