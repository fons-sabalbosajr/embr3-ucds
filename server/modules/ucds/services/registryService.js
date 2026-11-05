const { connectToMongo, getDb } = require('../../../config/db');
const { buildIndex, findMatch, numbersIn, clean } = require('./permitMatch');

// ---------------------------------------------------------------------------
// The establishment register — UCDS's read API for other domains.
//
// ERMS calls these instead of querying ucds-data itself, so the register stays
// owned by one module. There is no write API here by design: a records clerk
// who finds a firm missing raises it with Planning rather than creating it.
//
// The permit index is the same code the migration uses (permitMatch.js), so a
// link made at runtime and a link made during import agree by construction
// rather than by two implementations happening to behave alike.
// ---------------------------------------------------------------------------

const REGISTER = 'ucds-data';
const register = () => getDb().collection(REGISTER);

const REF_PROJECTION = { sort_key: 1, name: 1, title: 1, province: 1, ecc_cnc: 1, haz_id: 1, city: 1 };

// The duplicate-comparison view needs the stored values it has to reconcile,
// not just the key two records collide on. Still a projection rather than the
// whole document: this is a read for one screen, not a general export.
const DETAIL_PROJECTION = {
  sort_key: 1,
  name: 1,
  name_of_firms: 1,
  title: 1,
  project_name: 1,
  ecc_cnc: 1,
  haz_id: 1,
  province: 1,
  city: 1,
  city_municipality: 1,
  barangay: 1,
  industry_type: 1,
  date_issued: 1,
};

// The migration builds an index over the whole register, which is right for a
// script but not for a request: pulling all 16,000 entries takes ~40s, almost
// entirely transfer — the server executes that query in 12ms.
//
// So a lookup fetches candidates first and matches over those. The candidate
// query is a tolerant regex on the number's digit groups, which returns a
// handful of rows in ~100ms, and the same matcher then decides among them.
// One matching implementation, two access patterns.
const CANDIDATE_LIMIT = 50;

/**
 * A regex matching the input's digit groups in order, with any separators
 * between them — so "R03-2017-0370" finds "ECC-OL-R03-2017-0370".
 */
function candidatePattern(permitNumber) {
  const groups = String(permitNumber).match(/\d+/g);
  if (!groups || !groups.length) return null;

  // Leading zeros vary between the two systems, so each group matches with or
  // without them.
  const parts = groups.map((g) => {
    const bare = g.replace(/^0+/, '') || '0';
    return g === bare ? g : `0*${bare}`;
  });
  return new RegExp(parts.join('\\D{0,4}'), 'i');
}

async function candidatesFor(permitNumber) {
  // One pattern per number in the cell ("Amended: X Original: Y" holds two),
  // each built from the cleaned spelling so a typed "RO3" still narrows.
  const numbers = numbersIn(permitNumber);
  const patterns = [...new Set([clean(permitNumber), ...numbers])].map(candidatePattern).filter(Boolean);
  if (!patterns.length) return [];
  await connectToMongo();
  return register()
    .find({ $or: patterns.flatMap((rx) => [{ ecc_cnc: rx }, { haz_id: rx }]) }, { projection: REF_PROJECTION })
    .limit(CANDIDATE_LIMIT * patterns.length)
    .toArray();
}

/**
 * Resolve a permit number to an establishment.
 *
 * Uses the same buildIndex/findMatch as the migration, so a link made when a
 * clerk saves a record and one made during the import agree by construction —
 * including the ambiguity guard, which refuses a key resolving to more than
 * one establishment.
 *
 * @returns {{sortKey, name, province, matchedOn}|null}
 */
async function resolveByPermitNumber(permitNumber) {
  if (!permitNumber) return null;

  const candidates = await candidatesFor(permitNumber);
  if (!candidates.length) return null;

  const hit = findMatch(buildIndex(candidates), permitNumber);
  if (!hit) return null;

  return {
    sortKey: hit.row.sort_key,
    name: hit.row.name || hit.row.title || null,
    province: hit.row.province || null,
    matchedOn: hit.strategy,
  };
}

/**
 * One establishment by register key.
 *
 * `allowedProvinces` of null means unrestricted, matching every other read
 * here. Passing a scope actually confines the lookup: without that, a key is
 * enough to read any establishment in the region, which is the escalation the
 * province rules exist to prevent.
 */
async function findBySortKey(sortKey, allowedProvinces = null) {
  await connectToMongo();
  if (!sortKey) return null;

  // Keys ("bataan") against the register's values ("Bataan"): provinceFilter
  // matches them, as search() below does, and matches nothing for an empty scope.
  const { provinceFilter } = require('../../../services/provinces');
  const scope = Array.isArray(allowedProvinces) ? provinceFilter(allowedProvinces) : null;
  return register().findOne({ sort_key: sortKey, ...(scope || {}) }, { projection: DETAIL_PROJECTION });
}

/**
 * Search the register by name, title or permit number.
 *
 * `allowedProvinces` of null means unrestricted; otherwise the search is
 * confined to those provinces, so it cannot be used to enumerate the register
 * outside the caller's scope.
 */
async function search({ query, limit = 20 }, allowedProvinces) {
  await connectToMongo();
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped, 'i');

  const filter = {
    $or: [{ name: rx }, { title: rx }, { ecc_cnc: rx }, { haz_id: rx }, { sort_key: rx }],
  };
  if (Array.isArray(allowedProvinces)) {
    // Province values in the register are dirty, so match them the same
    // tolerant way the scope filter does.
    const { provinceFilter } = require('../../../services/provinces');
    const scope = provinceFilter(allowedProvinces);
    if (scope) filter.$and = [scope];
  }

  return register().find(filter, { projection: REF_PROJECTION }).limit(limit).toArray();
}

module.exports = {
  REGISTER,
  candidatePattern,
  candidatesFor,
  resolveByPermitNumber,
  findBySortKey,
  search,
};
