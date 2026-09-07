const { collections, getDb } = require('../config/db');

// ---------------------------------------------------------------------------
// The single place that decides how a dataset is partitioned by year.
//
// The UCDS data model has two kinds of collection:
//
//   SHARED    The establishment register and its lookup tables. A firm is a
//             standing entity, not a yearly record, so these carry no year and
//             are visible from every year container.
//
//   SCOPED    Yearly activity — survey cycles, transaction logs, drafts. These
//             are isolated per year, either by a `year` field or, where the
//             repository already split them physically, by collection name.
//
// Every year-aware query must go through scopeOf()/withYear() so isolation is
// enforced in one auditable place rather than repeated at ~160 call sites.
// ---------------------------------------------------------------------------

const STRATEGY = {
  SHARED: 'shared',
  FIELD: 'field', // one collection, filtered by { year }
  COLLECTION: 'collection', // physically separate collection per year
};

const DATASETS = {
  // --- Shared: the register and its lookups -------------------------------
  ucds: { strategy: STRATEGY.SHARED, collection: 'ucds' },
  archive: { strategy: STRATEGY.SHARED, collection: 'archive' },
  duplicates: { strategy: STRATEGY.SHARED, collection: 'ucds' },
  projectType: { strategy: STRATEGY.SHARED, collection: 'projectType' },
  healthcare: { strategy: STRATEGY.SHARED, collection: 'healthcare' },
  chemicals: { strategy: STRATEGY.SHARED, collection: 'chemicals' },
  tsd: { strategy: STRATEGY.SHARED, collection: 'tsd' },
  trc: { strategy: STRATEGY.SHARED, collection: 'trc' },
  swmplan: { strategy: STRATEGY.SHARED, collection: 'swmplan' },
  mrf: { strategy: STRATEGY.SHARED, collection: 'mrf' },
  slf: { strategy: STRATEGY.SHARED, collection: 'slf' },
  equipment: { strategy: STRATEGY.SHARED, collection: 'equipment' },
  ods: { strategy: STRATEGY.SHARED, collection: 'ods' },

  // ERMS records are SHARED on purpose. Year containers model an annual cycle;
  // a record has its own creation and retention dates and is retrieved across
  // years, so scoping it to a container would make "find this document" depend
  // on guessing the right year first.
  ermsRecords: { strategy: STRATEGY.SHARED, collection: 'ermsRecords' },

  // --- Year-scoped activity ------------------------------------------------
  // Survey was already split physically by the existing codebase; keep that
  // rather than merging 3,500 rows into one collection during a migration.
  survey: { strategy: STRATEGY.COLLECTION, pattern: (year) => `survey-data-${year}` },

  ucdsLog: { strategy: STRATEGY.FIELD, collection: 'ucdsLog' },
  surveyLog: { strategy: STRATEGY.FIELD, collection: 'surveyLog' },
  draftReports: { strategy: STRATEGY.FIELD, collection: 'draftReports' },
  postings: { strategy: STRATEGY.FIELD, collection: 'postings' },
};

// Datasets that the migration stamps with a `year` field.
const FIELD_SCOPED_DATASETS = Object.entries(DATASETS)
  .filter(([, d]) => d.strategy === STRATEGY.FIELD)
  .map(([key]) => key);

const YEAR_FIELD = 'year';

function assertYear(year, datasetKey) {
  const n = Number(year);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    throw new Error(`yearScope: invalid year "${year}" for dataset "${datasetKey}"`);
  }
  return n;
}

/**
 * Resolve a logical dataset for a given year.
 * @returns {{ collection: import('mongodb').Collection, filter: object, isYearScoped: boolean, year: number|null }}
 */
function scopeOf(datasetKey, year) {
  const def = DATASETS[datasetKey];
  if (!def) throw new Error(`yearScope: unknown dataset "${datasetKey}"`);

  if (def.strategy === STRATEGY.SHARED) {
    return { collection: collections[def.collection], filter: {}, isYearScoped: false, year: null };
  }

  const y = assertYear(year, datasetKey);

  if (def.strategy === STRATEGY.COLLECTION) {
    return {
      collection: getDb().collection(def.pattern(y)),
      filter: {},
      isYearScoped: true,
      year: y,
    };
  }

  return {
    collection: collections[def.collection],
    filter: { [YEAR_FIELD]: y },
    isYearScoped: true,
    year: y,
  };
}

/** Merge a caller's filter with the year constraint for `datasetKey`. */
function withYear(datasetKey, year, filter = {}) {
  const { filter: yearFilter } = scopeOf(datasetKey, year);
  if (!Object.keys(yearFilter).length) return filter;

  // Preserve an existing $and rather than letting keys collide.
  if (Object.prototype.hasOwnProperty.call(filter, '$and')) {
    return { ...filter, $and: [...filter.$and, yearFilter] };
  }
  return { ...filter, ...yearFilter };
}

/** Stamp the active year onto a document being inserted into a scoped dataset. */
function stampYear(datasetKey, year, doc) {
  const { isYearScoped, filter } = scopeOf(datasetKey, year);
  if (!isYearScoped || !Object.keys(filter).length) return doc;
  return { ...doc, ...filter };
}

module.exports = {
  STRATEGY,
  DATASETS,
  FIELD_SCOPED_DATASETS,
  YEAR_FIELD,
  scopeOf,
  withYear,
  stampYear,
};
