const { connectToMongo, getDb } = require('../../../config/db');

// ---------------------------------------------------------------------------
// The menus. What the desktop ERMS kept under Settings — project types,
// document statuses, the Legal Unit's case statuses, officers and handlers,
// the Laboratory's parameter groups, and the province → city → barangay
// address tables — loaded into erms-lookups by
// scripts/migrate-erms/legacy-sql/load.js and read here for the screens.
//
// Read-only from the application for now: the lists are edited by re-running
// the loader, or directly in the collection. Cached briefly because every
// record form asks for them.
// ---------------------------------------------------------------------------

const COLLECTION = 'erms-lookups';
const CACHE_MS = process.env.VITEST ? 0 : 60 * 1000;

let cache = { at: 0, value: null };

const collection = () => getDb().collection(COLLECTION);

/** Every lookup list, keyed by kind, items only. */
async function all() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  await connectToMongo();
  const docs = await collection().find({}).toArray();
  const value = Object.fromEntries(docs.map((d) => [d.kind, { unit: d.unit, description: d.description, items: d.items || [], importedAt: d.importedAt || null }]));
  cache = { at: Date.now(), value };
  return value;
}

/** One list's items, or an empty list when it has not been loaded. */
async function items(kind) {
  const lists = await all();
  return lists[kind]?.items || [];
}

/**
 * The address menus for one province: its cities, and the barangays of each,
 * as the form needs them. `province` is the application key (bataan, …).
 */
async function addresses(province) {
  const [cities, barangays] = await Promise.all([items('cities'), items('barangays')]);
  const mine = (list) => (province ? list.filter((x) => x.province === province) : list);
  return {
    cities: mine(cities).map((c) => ({ id: c.cityId, province: c.province, label: c.label })),
    barangays: mine(barangays).map((b) => ({ id: b.brgyId, cityId: b.cityId, province: b.province, label: b.label })),
  };
}

const invalidate = () => { cache = { at: 0, value: null }; };

module.exports = { COLLECTION, all, items, addresses, invalidate };
