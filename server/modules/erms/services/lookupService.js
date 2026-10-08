const { connectToMongo, getDb } = require('../../../config/db');

// ---------------------------------------------------------------------------
// The menus. What the desktop ERMS kept under Settings — project types,
// document statuses, the Legal Unit's case statuses, officers and handlers,
// the Laboratory's parameter groups, and the province → city → barangay
// address tables — loaded into erms-lookups by
// scripts/migrate-erms/legacy-sql/load.js and read here for the screens.
//
// Edited from Admin Settings › ERMS Config › Menus (every list), and by each
// unit's own staff from Settings › ERMS › Menus (their unit's lists) — as in
// the desktop system, where the Legal Unit kept its own officers and case
// handlers and the Laboratory its parameter groups. Cached briefly because
// every record form asks for them.
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
    // With the desktop tables' coordinates, so choosing a place can fill them.
    cities: mine(cities).map((c) => ({ id: c.cityId, province: c.province, label: c.label, lat: c.lat ?? null, long: c.long ?? null })),
    barangays: mine(barangays).map((b) => ({ id: b.brgyId, cityId: b.cityId, province: b.province, label: b.label, lat: b.lat ?? null, long: b.long ?? null })),
  };
}

const invalidate = () => { cache = { at: 0, value: null }; };

/**
 * Lists a unit's own staff do not edit: the address tables (shared by
 * every form, thousands of rows, loaded from the desktop system) and the
 * docket registers (issued by docketService, not typed).
 */
const NOT_UNIT_EDITABLE = new Set(['provinces', 'cities', 'barangays', 'legal-dockets', 'document-types']);

/** The lists a unit keeps for itself, full. */
async function forUnit(unit) {
  const lists = await all();
  return Object.entries(lists)
    .filter(([kind, v]) => v.unit === unit && !NOT_UNIT_EDITABLE.has(kind))
    .map(([kind, v]) => ({ kind, description: v.description || '', count: v.items.length, items: v.items }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** Whether `unit`'s staff may edit the list `kind`. */
async function unitMayEdit(unit, kind) {
  if (NOT_UNIT_EDITABLE.has(kind)) return false;
  const lists = await all();
  return lists[kind]?.unit === unit;
}

/**
 * Replace a list's items. The whole list comes back from the editor, so a
 * removed entry is simply absent; the fields an item carries besides its
 * label (a code, a category) are kept, cleaned. Returns { kind, items, count }.
 */
async function save(kind, rawItems, { actor, description, unit } = {}) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map((it) => {
      if (typeof it === 'string') return { code: null, label: it.trim().slice(0, 200) };
      return {
        ...Object.fromEntries(Object.entries(it || {}).filter(([k]) => /^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(k)).map(([k, v]) => [k, typeof v === 'string' ? v.trim().slice(0, 500) : v])),
        label: String(it?.label || '').trim().slice(0, 200),
      };
    })
    .filter((it) => it.label)
    .slice(0, 5000);
  await connectToMongo();
  const existing = await collection().findOne({ _id: kind });
  await collection().updateOne(
    { _id: kind },
    {
      $set: {
        kind,
        items,
        count: items.length,
        updatedAt: new Date(),
        updatedBy: actor?.username || 'unknown',
        description: description ? String(description).slice(0, 300) : existing?.description || '',
        unit: existing?.unit || unit || null,
      },
      $setOnInsert: { source: 'Admin Settings', importedAt: new Date() },
    },
    { upsert: true }
  );
  invalidate();
  return { kind, items, count: items.length };
}

module.exports = { COLLECTION, NOT_UNIT_EDITABLE, all, items, addresses, invalidate, forUnit, unitMayEdit, save };
