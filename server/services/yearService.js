const { connectToMongo, collections } = require('../config/db');
const { normalizeKeys, PROVINCE_KEYS } = require('./provinces');

// ---------------------------------------------------------------------------
// Year containers are data, not constants. Adding 2028 means inserting one
// document — no code change, no redeploy.
// ---------------------------------------------------------------------------

const BASELINE_YEAR = 2025; // the dataset that existed before year containers

async function listYears({ includeArchived = false } = {}) {
  await connectToMongo();
  const filter = includeArchived ? {} : { status: 'active' };
  return collections.yearContainers.find(filter).sort({ year: -1 }).toArray();
}

async function listYearNumbers(options) {
  return (await listYears(options)).map((y) => y.year);
}

async function getYear(year) {
  await connectToMongo();
  const n = Number(year);
  if (!Number.isInteger(n)) return null;
  return collections.yearContainers.findOne({ year: n });
}

/** A year is usable only if it is registered and active. */
async function isSelectableYear(year) {
  const doc = await getYear(year);
  return Boolean(doc && doc.status === 'active');
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
}

module.exports = {
  BASELINE_YEAR,
  listYears,
  listYearNumbers,
  getYear,
  isSelectableYear,
  createYear,
  setYearStatus,
  setYearProvinces,
  ensureSeeded,
};
