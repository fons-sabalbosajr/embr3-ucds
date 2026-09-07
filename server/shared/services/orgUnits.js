const { connectToMongo, getDb, ObjectId } = require('../../config/db');
const { conflict, notFoundError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// Organisational units — shared master data, owned by the platform.
//
// Today "division" is a free-text string on each user document, which has
// already accumulated variants ("ORD-PISMU" and "ORD - PISMU" are the same
// office). Both domains need to attribute records and permits to an office, so
// the list is promoted to one authoritative collection rather than being owned
// by UCDS or ERMS.
//
// Ownership rule: the platform writes org-units. Domains read them.
// ---------------------------------------------------------------------------

const COLLECTION = 'org-units';
const TYPES = ['office', 'division', 'section', 'unit'];

const collection = () => getDb().collection(COLLECTION);

/**
 * A stable comparison key for a free-text division string, so that
 * "ORD - PISMU", "ORD-PISMU" and "ord pismu" collapse to one unit.
 */
function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ code: 1 }, { unique: true });
  await collection().createIndex({ type: 1, active: 1 });
}

async function list({ includeInactive = false } = {}) {
  await connectToMongo();
  const filter = includeInactive ? {} : { active: true };
  return collection().find(filter).sort({ code: 1 }).toArray();
}

async function getByCode(code) {
  await connectToMongo();
  return collection().findOne({ code: normalizeCode(code) });
}

async function create({ code, name, type = 'division', parentCode = null, createdBy = null }) {
  await connectToMongo();
  const normalized = normalizeCode(code);
  if (!normalized) throw conflict('An organisational unit needs a code.');
  if (await getByCode(normalized)) {
    throw conflict(`Organisational unit "${normalized}" already exists.`, 'ORG_UNIT_EXISTS');
  }

  const doc = {
    code: normalized,
    name: String(name || normalized).trim(),
    type: TYPES.includes(type) ? type : 'division',
    parentCode: parentCode ? normalizeCode(parentCode) : null,
    active: true,
    // Every spelling seen in the wild that maps to this unit, so a legacy
    // value on a user or record still resolves.
    aliases: [],
    createdAt: new Date(),
    createdBy,
  };
  await collection().insertOne(doc);
  return doc;
}

async function update(id, changes) {
  await connectToMongo();
  const set = { updatedAt: new Date() };
  if (changes.name !== undefined) set.name = String(changes.name).trim();
  if (changes.type !== undefined && TYPES.includes(changes.type)) set.type = changes.type;
  if (changes.parentCode !== undefined) {
    set.parentCode = changes.parentCode ? normalizeCode(changes.parentCode) : null;
  }
  if (changes.active !== undefined) set.active = changes.active === true;

  const result = await collection().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: set },
    { returnDocument: 'after' }
  );
  const doc = result && (result.value || result);
  if (!doc) throw notFoundError('Organisational unit not found.', 'ORG_UNIT_NOT_FOUND');
  return doc;
}

/** Record an additional spelling that resolves to an existing unit. */
async function addAlias(code, alias) {
  await connectToMongo();
  return collection().updateOne(
    { code: normalizeCode(code) },
    { $addToSet: { aliases: String(alias).trim() }, $set: { updatedAt: new Date() } }
  );
}

/** Resolve any spelling — canonical code or recorded alias — to one unit. */
async function resolve(value) {
  await connectToMongo();
  const normalized = normalizeCode(value);
  if (!normalized) return null;
  return collection().findOne({
    $or: [{ code: normalized }, { aliases: String(value).trim() }],
  });
}

module.exports = {
  COLLECTION,
  TYPES,
  normalizeCode,
  ensureIndexes,
  list,
  getByCode,
  create,
  update,
  addAlias,
  resolve,
};
