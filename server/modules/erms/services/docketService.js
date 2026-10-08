const { connectToMongo, getDb } = require('../../../config/db');
const { badRequest, forbidden, notFoundError } = require('../../../shared/middleware/errorHandler');
const { ERMS_UNITS, canAccessAllYears, isErmsEndUser, ermsUnitOf } = require('../../../services/authorization');
const { PROVINCE_KEYS } = require('../../../services/provinces');
const config = require('./configService');

// ---------------------------------------------------------------------------
// Docket numbers: the Legal Services Unit's case numbers.
//
// The desktop system kept a register per province (tb_docketno_AU … _ZA)
// and handed the clerk the next number when a case was opened:
//
//   EMBR3-2023-PA-111     prefix - year - province code - sequence
//
// Here a number is claimed from an atomic counter per province and year
// (erms-sequences, `docket:<province>:<year>`) and written to the register
// (erms-dockets), so two clerks opening cases at once get two numbers. The
// counter is seeded from every docket already known for that province and
// year — the imported registers (erms-lookups › legal-dockets), the dockets
// on filed documents, and this register — so it continues the old
// numbering rather than restarting it, and never hands out a number someone
// typed by hand.
//
// A claimed number that is never used stays claimed, as it did in the
// desktop register: a gap is honest, a reused case number is not.
// ---------------------------------------------------------------------------

const COLLECTION = 'erms-dockets';
const SEQUENCES = 'erms-sequences';
const DOCUMENTS = 'erms-documents';
const LOOKUPS = 'erms-lookups';

/** The province codes the desktop registers used. */
const PROVINCE_CODES = {
  aurora: 'AU',
  bataan: 'BA',
  bulacan: 'BU',
  nuevaEcija: 'NE',
  pampanga: 'PA',
  tarlac: 'TA',
  zambales: 'ZA',
};

const collection = () => getDb().collection(COLLECTION);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function ensureIndexes() {
  await connectToMongo();
  await collection().createIndex({ docketNo: 1 }, { unique: true });
  await collection().createIndex({ province: 1, year: -1, seq: -1 });
}

/** Opening a case is the Legal unit's own work: its staff, and the Developer/Administrator. */
function assertCanIssue(user) {
  if (canAccessAllYears(user)) return;
  if (isErmsEndUser(user) && ermsUnitOf(user) === ERMS_UNITS.LEGAL) return;
  throw forbidden('Only the Legal Services Unit issues docket numbers.', 'UNIT_WRITE_FORBIDDEN');
}

async function format() {
  const unit = await config.unit(ERMS_UNITS.LEGAL);
  if (!unit?.docket) throw notFoundError('This unit does not issue docket numbers.', 'NO_DOCKETS');
  return unit.docket;
}

function checkScope(province, year) {
  if (!PROVINCE_KEYS.includes(province) || !PROVINCE_CODES[province]) throw badRequest('Choose the province.', 'PROVINCE_REQUIRED');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1990 || y > new Date().getFullYear() + 1) throw badRequest('Choose a year.', 'YEAR_INVALID');
  return y;
}

const docketOf = (fmt, province, year, seq) => `${fmt.prefix}-${year}-${PROVINCE_CODES[province]}-${String(seq).padStart(fmt.pad, '0')}`;

/**
 * The highest sequence already used for a province and year, from every
 * place a docket number can be. Matches with or without zero padding: the
 * desktop register wrote EMBR3-2023-BA-001 and the NOV forms EMBR3-2023-BA-1.
 */
async function highestKnown(fmt, province, year) {
  const rx = new RegExp(`^${escapeRe(fmt.prefix)}-${year}-${PROVINCE_CODES[province]}-0*(\\d+)\\s*$`, 'i');
  const [onDocuments, registered, legacy] = await Promise.all([
    getDb().collection(DOCUMENTS).distinct('fields.docketNo', { unit: ERMS_UNITS.LEGAL, 'fields.docketNo': rx }),
    collection().distinct('docketNo', { docketNo: rx }),
    getDb().collection(LOOKUPS).findOne({ _id: 'legal-dockets' }, { projection: { items: 1 } }),
  ]);
  const all = [...onDocuments, ...registered, ...((legacy?.items || []).map((i) => i.docketNo))];
  return all.reduce((max, v) => {
    const m = rx.exec(String(v || ''));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

const counterId = (province, year) => `docket:${province}:${year}`;

/** The number the next case would get, without taking it. */
async function peek(user, province, year) {
  assertCanIssue(user);
  const y = checkScope(province, year);
  await connectToMongo();
  const fmt = await format();
  const counter = await getDb().collection(SEQUENCES).findOne({ _id: counterId(province, y) });
  const seq = Math.max(counter?.seq || 0, await highestKnown(fmt, province, y));
  return { docketNo: docketOf(fmt, province, y, seq + 1), province, year: y };
}

/**
 * Claim the next docket number for a province and year and write it to the
 * register. Returns the register entry.
 */
async function claim(user, { province, year, note } = {}) {
  assertCanIssue(user);
  const y = checkScope(province, year);
  await connectToMongo();
  const fmt = await format();
  const sequences = getDb().collection(SEQUENCES);
  const _id = counterId(province, y);

  // $max, not $set: a concurrent claim may already have moved the counter
  // past the seed, and a seed must never move it back.
  await sequences.updateOne({ _id }, { $max: { seq: await highestKnown(fmt, province, y) } }, { upsert: true });

  // A number typed by hand onto a document after the seed was read would
  // otherwise be handed out again: skip any that is already in use.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await sequences.findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
    const seq = (result && typeof result.seq === 'number' ? result : result?.value)?.seq;
    if (typeof seq !== 'number') throw new Error('Could not allocate a docket number.');
    const docketNo = docketOf(fmt, province, y, seq);
    const inUse = await getDb().collection(DOCUMENTS).findOne({ unit: ERMS_UNITS.LEGAL, 'fields.docketNo': docketNo }, { projection: { _id: 1 } });
    if (inUse) continue;
    const entry = {
      docketNo,
      province,
      year: y,
      seq,
      note: note ? String(note).trim().slice(0, 300) || null : null,
      claimedAt: new Date(),
      claimedBy: user?.username || 'unknown',
      claimedByName: user?.name || null,
    };
    try {
      await collection().insertOne(entry);
    } catch (err) {
      if (err.code === 11000) continue; // already registered — take the next
      throw err;
    }
    const { _id: ignored, ...shown } = entry;
    return shown;
  }
  throw new Error('Could not find a free docket number.');
}

/**
 * The register for a province (and year): the numbers issued here, newest
 * first, each with how many documents are filed under it.
 */
async function list(user, { province, year, limit = 100 } = {}) {
  assertCanIssue(user);
  await connectToMongo();
  const filter = {};
  if (province) filter.province = province;
  if (year) filter.year = Number(year);
  const entries = await collection().find(filter, { projection: { _id: 0 } }).sort({ claimedAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).toArray();
  const counts = entries.length
    ? await getDb()
        .collection(DOCUMENTS)
        .aggregate([
          { $match: { unit: ERMS_UNITS.LEGAL, 'fields.docketNo': { $in: entries.map((e) => e.docketNo) } } },
          { $group: { _id: '$fields.docketNo', count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const used = new Map(counts.map((c) => [c._id, c.count]));
  return entries.map((e) => ({ ...e, documents: used.get(e.docketNo) || 0 }));
}

module.exports = { COLLECTION, PROVINCE_CODES, ensureIndexes, peek, claim, list, docketOf };
