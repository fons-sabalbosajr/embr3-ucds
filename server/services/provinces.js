// ---------------------------------------------------------------------------
// The seven Region III provinces.
//
// `key`   matches the existing per-user permission booleans on user documents
//         (aurora, bataan, bulacan, nuevaEcija, pampanga, tarlac, zambales).
// `value` matches the canonical `province` value stored in ucds-data.
//
// Register values are dirty in places (TARLAC, " Tarlac", null), which is the
// data guests are meant to cleanse, so matching is case- and whitespace-
// insensitive rather than exact.
// ---------------------------------------------------------------------------

const PROVINCES = [
  { key: 'aurora', value: 'Aurora', label: 'Aurora' },
  { key: 'bataan', value: 'Bataan', label: 'Bataan' },
  { key: 'bulacan', value: 'Bulacan', label: 'Bulacan' },
  { key: 'nuevaEcija', value: 'Nueva_Ecija', label: 'Nueva Ecija' },
  { key: 'pampanga', value: 'Pampanga', label: 'Pampanga' },
  { key: 'tarlac', value: 'Tarlac', label: 'Tarlac' },
  { key: 'zambales', value: 'Zambales', label: 'Zambales' },
];

const PROVINCE_KEYS = PROVINCES.map((p) => p.key);
const byKey = new Map(PROVINCES.map((p) => [p.key, p]));

function isProvinceKey(key) {
  return byKey.has(key);
}

function normalizeKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.map(String).filter(isProvinceKey))];
}

/** Province keys a user is permitted to see, from the existing booleans. */
function userProvinceKeys(user) {
  return PROVINCE_KEYS.filter((k) => user && user[k] === true);
}

/**
 * A Mongo filter matching the given province keys, tolerant of the casing and
 * whitespace variants present in the register.
 */
function provinceFilter(keys) {
  const list = normalizeKeys(keys);
  if (!list.length) return null;

  // Covering all seven provinces is no restriction at all. Returning null keeps
  // records with a missing or malformed province visible to those users —
  // those rows are precisely what needs cleansing, so they must not be filtered
  // out of the very views used to find them.
  if (list.length === PROVINCE_KEYS.length) return null;
  const patterns = list.map((k) => {
    const value = byKey.get(k).value;
    // Nueva_Ecija is also written "Nueva Ecija" in places.
    const alt = value.replace(/_/g, '[ _]');
    return new RegExp(`^\\s*${alt}\\s*$`, 'i');
  });
  return { province: { $in: patterns } };
}

/**
 * Merge the request's province scope into a register query.
 *
 * `req.provinceFilter` is set by resolveYearContext. A null filter means the
 * caller may see every province (Developer/Admin, or a container covering all
 * seven), so the query is returned unchanged.
 */
function withProvinceScope(req, filter = {}) {
  const scope = req && req.provinceFilter;
  if (!scope) return filter;
  if (Object.prototype.hasOwnProperty.call(filter, '$and')) {
    return { ...filter, $and: [...filter.$and, scope] };
  }
  if (Object.prototype.hasOwnProperty.call(filter, 'province')) {
    // Caller already constrains province — keep both so neither widens access.
    const { province, ...rest } = filter;
    return { ...rest, $and: [{ province }, scope] };
  }
  return { ...filter, ...scope };
}

/**
 * Wrap a collection so every query is confined to the request's province scope.
 *
 * Applied once at the top of a handler instead of at each of ~70 call sites, so
 * a new query cannot silently escape the scope. When the request is
 * unrestricted the original collection is returned untouched.
 */
function provinceScoped(collection, req) {
  if (!req || !req.provinceFilter) return collection;
  const scope = (filter) => withProvinceScope(req, filter || {});

  return {
    find: (filter, ...rest) => collection.find(scope(filter), ...rest),
    findOne: (filter, ...rest) => collection.findOne(scope(filter), ...rest),
    countDocuments: (filter, ...rest) => collection.countDocuments(scope(filter), ...rest),
    distinct: (field, filter, ...rest) => collection.distinct(field, scope(filter), ...rest),
    // Constrain the pipeline before any other stage runs.
    aggregate: (pipeline = [], ...rest) =>
      collection.aggregate([{ $match: req.provinceFilter }, ...pipeline], ...rest),
    updateOne: (filter, ...rest) => collection.updateOne(scope(filter), ...rest),
    updateMany: (filter, ...rest) => collection.updateMany(scope(filter), ...rest),
    deleteOne: (filter, ...rest) => collection.deleteOne(scope(filter), ...rest),
    deleteMany: (filter, ...rest) => collection.deleteMany(scope(filter), ...rest),
    bulkWrite: (ops = [], ...rest) =>
      collection.bulkWrite(
        ops.map((op) => {
          const [name] = Object.keys(op);
          if (!op[name] || !op[name].filter) return op;
          return { [name]: { ...op[name], filter: scope(op[name].filter) } };
        }),
        ...rest
      ),
    // Inserts carry no province constraint; the document supplies its own.
    insertOne: (...a) => collection.insertOne(...a),
    insertMany: (...a) => collection.insertMany(...a),

    // Collection-level operations that read no documents.
    createIndex: (...a) => collection.createIndex(...a),
    estimatedDocumentCount: (...a) => collection.estimatedDocumentCount(...a),
  };
}

/** True when the request may access the named province value. */
function requestAllowsProvince(req, provinceValue) {
  const keys = req && req.provinceKeys;
  if (!keys) return true; // no scope resolved => unrestricted
  const wanted = String(provinceValue || '').trim().toLowerCase().replace(/[ _]/g, '');
  return keys.some((k) => byKey.get(k).value.toLowerCase().replace(/[ _]/g, '') === wanted);
}

module.exports = {
  provinceScoped,
  withProvinceScope,
  requestAllowsProvince,
  PROVINCES,
  PROVINCE_KEYS,
  isProvinceKey,
  normalizeKeys,
  userProvinceKeys,
  provinceFilter,
};
