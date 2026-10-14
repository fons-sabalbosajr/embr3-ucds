const { MongoClient } = require('mongodb');
const { resilientLookup } = require('../config/dns');

// ---------------------------------------------------------------------------
// Designations from HRPMS — the office's personnel system — for the
// Document Portal's "Designation" box: the sections, units and divisions
// staff actually belong to (employees.sectionOrUnit and .division), offered
// as suggestions while the person types.
//
// Read only, and only the unit names: no employee, no position, nothing
// personal leaves HRPMS through here.
//
// Where it reads from, in order:
//   1. MONGO_URI_HRPMS — HRPMS's own connection, when it is set and works;
//   2. the HRPMS database (HRPMS_DB_NAME, default `db-hrpms`) on the
//      application's own cluster, which is where it lives today;
//   3. a short built-in list, so the box still suggests something when
//      neither can be reached.
// The list is kept for an hour: units change a few times a year, and the
// public page must not wait on HR's database.
// ---------------------------------------------------------------------------

const HRPMS_DB = () => String(process.env.HRPMS_DB_NAME || 'db-hrpms').trim();
const TTL_MS = 60 * 60 * 1000;
const FAILED_TTL_MS = 5 * 60 * 1000;

// Short names the office uses that do not follow from the initials.
const ABBREVIATION_OVERRIDES = {
  'environmental impact assessment section': 'EIA',
  'office of the regional director': 'ORD',
  'commission on audit': 'COA',
};
const SMALL_WORDS = new Set(['and', 'of', 'the', 'on', 'for', 'in', 'to']);

/** "Planning and Information System Management Unit" → "PISMU". */
function abbreviate(name) {
  const key = String(name).trim().toLowerCase();
  if (ABBREVIATION_OVERRIDES[key]) return ABBREVIATION_OVERRIDES[key];
  const words = String(name)
    .replace(/[^A-Za-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join('') : null;
}

const FALLBACK = [
  'Planning and Information System Management Unit',
  'Ambient Monitoring and Technical Services Section',
  'Environmental Impact Assessment Section',
];

const toEntries = (names) => {
  const seen = new Set();
  return names
    .map((n) => String(n || '').replace(/\s+/g, ' ').trim())
    .filter((n) => n.length > 1 && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .map((name) => ({ name, abbreviation: abbreviate(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

let cache = null; // { at, ttl, entries, source }
const warned = new Set();

async function readFrom(db) {
  const employees = db.collection('employees');
  const [units, divisions] = await Promise.all([employees.distinct('sectionOrUnit'), employees.distinct('division')]);
  return [...units, ...divisions];
}

async function viaOwnConnection() {
  const uri = String(process.env.MONGO_URI_HRPMS || '').trim();
  if (!uri) return null;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, lookup: resilientLookup, maxPoolSize: 2 });
  try {
    await client.connect();
    return await readFrom(client.db());
  } finally {
    await client.close().catch(() => {});
  }
}

async function viaApplicationCluster() {
  const { connectToMongo, client } = require('../config/db');
  await connectToMongo();
  return readFrom(client.db(HRPMS_DB()));
}

/** The designations to suggest: [{ name, abbreviation }], sorted by name. Never throws. */
async function designations() {
  if (cache && Date.now() - cache.at < cache.ttl) return cache.entries;
  let names = null;
  let source = 'built-in';
  for (const [label, read] of [['hrpms', viaOwnConnection], ['application cluster', viaApplicationCluster]]) {
    try {
      const found = await read();
      if (found && found.filter(Boolean).length) {
        names = found;
        source = label;
        break;
      }
    } catch (err) {
      // Once per cause, not every five minutes: the next source is tried anyway.
      const why = `${label}: ${err.message}`;
      if (!warned.has(why)) {
        warned.add(why);
        const next = label === 'hrpms' ? `reading ${HRPMS_DB()} on the application's cluster instead` : 'using the built-in list';
        console.warn(`[hrpms] designations via ${label} unavailable (${err.message}); ${next}.${label === 'hrpms' ? ' Check MONGO_URI_HRPMS, or remove it — the application cluster is enough.' : ''}`);
      }
    }
  }
  const entries = toEntries(names || FALLBACK);
  cache = { at: Date.now(), ttl: names ? TTL_MS : FAILED_TTL_MS, entries, source };
  return entries;
}

/** For tests: forget what was read. */
const reset = () => {
  cache = null;
};

module.exports = { designations, abbreviate, reset };
