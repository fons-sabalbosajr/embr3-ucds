// ---------------------------------------------------------------------------
// An establishment's coordinates from its address, for the register's record
// view ("Locate from address"): MapTiler's geocoding, kept to the
// Philippines and leaning on Central Luzon, with the key from the server's
// .env (MAPTILER_KEY, or VITE_MAPTILER_KEY — the same key as the maps).
//
// The address goes to MapTiler and nothing else: no name, no serial, no
// permit. Answers are kept in memory for a day, so the same barangay is not
// asked for twice. A point outside Region III is still returned, flagged, so
// the person decides.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const cache = new Map(); // query -> { at, value }
// Central Luzon, roughly: west, south, east, north.
const REGION_III = { west: 119.7, south: 14.4, east: 122.3, north: 16.6 };
const inRegion = (lat, lng) => lat >= REGION_III.south && lat <= REGION_III.north && lng >= REGION_III.west && lng <= REGION_III.east;

const keyOf = () => String(process.env.MAPTILER_KEY || process.env.VITE_MAPTILER_KEY || '').trim();

/** Underscored names as the register writes them ("San_Jose_Del_Monte", "San_Miguel_b") as words. */
const words = (v) =>
  String(v || '')
    .replace(/_[a-z]$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Coordinates for an address: { lat, lng, label, precision, inRegion } or null.
 * `parts`: { street, barangay, city, province } — the more given, the closer.
 */
async function geocode(parts = {}) {
  const key = keyOf();
  if (!key) throw Object.assign(new Error('No map key is set on the server (MAPTILER_KEY).'), { status: 503 });
  const city = words(parts.city);
  if (!city && !words(parts.barangay)) throw Object.assign(new Error('Give at least the municipality and the province.'), { status: 400 });
  const cacheKey = [parts.street, parts.barangay, parts.city, parts.province].map(words).join('|').toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < DAY) return hit.value;

  // From the most precise to the town itself. Barangay names repeat from
  // town to town ("Poblacion"), so a match counts only inside the record's
  // own municipality; failing that, the next, wider question is asked.
  const tries = [
    { q: [parts.street, parts.barangay, parts.city, parts.province], level: 'street' },
    { q: [parts.barangay, parts.city, parts.province], level: 'barangay' },
    { q: [parts.city, parts.province], level: 'municipality' },
  ].filter((t, i, all) => t.q.filter(Boolean).length && (i === 0 || t.q.filter(Boolean).length < all[i - 1].q.filter(Boolean).length));
  let value = null;
  for (const t of tries) {
    const f = await ask(key, t.q.map(words).filter(Boolean).join(', '));
    if (!f) continue;
    const where = `${f.place_name || ''} ${(f.context || []).map((c) => c.text).join(' ')}`.toLowerCase();
    if (city && !where.includes(city.toLowerCase())) continue;
    value = {
      lat: Math.round(f.center[1] * 1e6) / 1e6,
      lng: Math.round(f.center[0] * 1e6) / 1e6,
      label: f.place_name || f.text,
      // How close the point is: the street, the barangay, or only the town's centre.
      precision: precisionOf(f, t.level),
      inRegion: inRegion(f.center[1], f.center[0]),
    };
    break;
  }
  cache.set(cacheKey, { at: Date.now(), value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}

/** What MapTiler matched — never finer than what was asked. */
function precisionOf(f, asked) {
  const type = (f.place_type || [])[0] || '';
  const found = /address|street|road|poi/.test(type) ? 'street' : /neighbourhood|place|locality|village|hamlet/.test(type) ? 'barangay' : 'municipality';
  const rank = { street: 0, barangay: 1, municipality: 2 };
  return rank[found] >= rank[asked] ? found : asked;
}

/** One question to MapTiler: its best place, or null. */
async function ask(key, query) {
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(`${query}, Philippines`.slice(0, 200))}.json`);
  url.searchParams.set('key', key);
  url.searchParams.set('country', 'ph');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('proximity', '120.75,15.35'); // lean on Central Luzon
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10 * 1000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw Object.assign(new Error(`The map service answered ${r.status}.`), { status: 502 });
    const f = (await r.json())?.features?.[0];
    return f?.center?.length === 2 ? f : null;
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error('The map service could not be reached.'), { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

module.exports = { geocode, inRegion, words };
