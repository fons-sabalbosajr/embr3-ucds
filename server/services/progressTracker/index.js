// ---------------------------------------------------------------------------
// The Progress Tracker (Admin Settings › Progress Tracker): how far the
// Planning Unit's updating of the universe has come during an activity
// season, read live from the working files they share on SharePoint.
//
// A season names its dates and its sources — the RAW data files, the newly
// issued permit files — each a SharePoint "anyone with the link" folder.
// While a season is open (between its dates, not closed) the server looks at
// the folders every minute or so (sharepoint.js). A file whose version moved
// is read again (analyze.js) and compared:
//
//   with the season's BASELINE — the file as it was when the season was
//     first read: the rows and permits it started with, the rows added since,
//     the rows changed and in which section, the rows coloured as updated;
//   with its PREVIOUS reading — what this save changed, kept as an event in
//     the season's activity (who saved, which version, what moved);
//   and the newly issued permits with the RAW files: how many of them are
//     already written into the universe — the progress of the encoding.
//
// Open screens are told at once (Socket.IO 'progress-tracker:update'); they
// fetch the figures through the admin API, so nothing travels on the socket.
// Outside a season nothing is polled. Only one server instance polls at a
// time (a lease on the season).
// ---------------------------------------------------------------------------

const os = require('os');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { connectToMongo, getDb } = require('../../config/db');
const sharepoint = require('./sharepoint');
const { analyze } = require('./analyze');

const SEASONS = 'progress-seasons';
const FILES = 'progress-files';
const BASELINES = 'progress-baselines';
const EVENTS = 'progress-events';

// The Planning Unit's working folders for the UCD updating (Oct 2026).
const DEFAULT_SOURCES = [
  {
    key: 'raw',
    kind: 'raw',
    label: 'RAW data files',
    link: 'https://embco-my.sharepoint.com/:f:/g/personal/ppmissdr3_emb_gov_ph/IgAAcms8EYJtQ5dloXLxLJYYAaOzjvtuSUJeHtID_7xxllU?e=8100xW',
  },
  {
    key: 'permits',
    kind: 'permits',
    label: 'Newly issued permit data files',
    link: 'https://embco-my.sharepoint.com/:f:/g/personal/ppmissdr3_emb_gov_ph/IgCzphB9hrrwSbCIhkJiAvcGAeO0j7svGt793qZIy6l_7S0?e=Fxzg9N',
  },
];
// Permit lists kept for reference, not to be encoded — the Central Office's
// extract of every ECC ever approved in the region. Shown, not counted.
const REFERENCE_FILES = /extracted from co/i;

const MIN_POLL = 30;
const MAX_POLL = 3600;
const INSTANCE = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

const db = () => getDb();
const fileId = (season, source, path) => `${season}:${source}:${path}`;

// file id -> { etag, keys, keyProvince } — the comparison material, which is
// not stored: after a restart the first look reads every file again.
const cache = new Map();

let io = null;
let timer = null;
let running = null;

// --- seasons ------------------------------------------------------------------

const toDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

function cleanSources(list) {
  const src = Array.isArray(list) && list.length ? list : DEFAULT_SOURCES;
  return src.slice(0, 6).map((s, i) => {
    const link = String(s.link || '').trim();
    const u = new URL(link); // throws on garbage
    if (u.protocol !== 'https:' || !/\.sharepoint\.com$/i.test(u.hostname)) throw Object.assign(new Error('Each source must be an https SharePoint link.'), { status: 400 });
    const kind = s.kind === 'permits' ? 'permits' : 'raw';
    return { key: String(s.key || `${kind}-${i + 1}`).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || `${kind}-${i + 1}`, kind, label: String(s.label || (kind === 'raw' ? 'RAW data files' : 'Newly issued permits')).slice(0, 80), link };
  });
}

function validate(input, current = {}) {
  const name = String(input.name ?? current.name ?? '').trim().slice(0, 100);
  const startsAt = toDate(input.startsAt ?? current.startsAt);
  const endsAt = toDate(input.endsAt ?? current.endsAt);
  if (!name) throw Object.assign(new Error('Give the season a name.'), { status: 400 });
  if (!startsAt || !endsAt || endsAt <= startsAt) throw Object.assign(new Error('Give the season a start and an end after it.'), { status: 400 });
  const pollSeconds = Math.min(MAX_POLL, Math.max(MIN_POLL, Number(input.pollSeconds ?? current.pollSeconds ?? 60) || 60));
  let sources;
  try {
    sources = cleanSources(input.sources ?? current.sources);
  } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'A source link is not a valid URL.'), { status: 400 });
  }
  return { name, startsAt, endsAt, pollSeconds, sources };
}

const isOpen = (s, now = new Date()) => s && s.status === 'active' && s.startsAt <= now && now <= s.endsAt;

async function currentSeason() {
  await connectToMongo();
  return db().collection(SEASONS).find({ status: 'active' }).sort({ startsAt: -1 }).limit(1).next();
}

async function createSeason(input, user) {
  await connectToMongo();
  const doc = { ...validate(input), status: 'active', baselineAt: null, createdAt: new Date(), createdBy: user?.username || null, lastPoll: null };
  // One season at a time: the new one closes any still open.
  await db().collection(SEASONS).updateMany({ status: 'active' }, { $set: { status: 'closed', closedAt: new Date() } });
  const { insertedId } = await db().collection(SEASONS).insertOne(doc);
  cache.clear();
  schedule(1000);
  return { _id: insertedId, ...doc };
}

async function updateSeason(id, input, user) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  const set = { ...validate(input, s), updatedAt: new Date(), updatedBy: user?.username || null };
  if (input.status === 'closed' || input.status === 'active') set.status = input.status;
  if (set.status === 'active' && s.status !== 'active') {
    await db().collection(SEASONS).updateMany({ status: 'active', _id: { $ne: s._id } }, { $set: { status: 'closed', closedAt: new Date() } });
  }
  if (JSON.stringify(set.sources) !== JSON.stringify(s.sources)) cache.clear();
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: set });
  schedule(1000);
  return { ...s, ...set };
}

/** Start the season's comparison again from the files as they are now. */
async function rebaseline(id) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  const season = String(s._id);
  const prefix = new RegExp(`^${season}:`);
  await db().collection(BASELINES).deleteMany({ _id: prefix });
  await db().collection(FILES).deleteMany({ season });
  await db().collection(EVENTS).insertOne({ season, at: new Date(), kind: 'baseline', note: 'Baseline taken again from the files as they are now.' });
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { baselineAt: null } });
  cache.clear();
  schedule(500);
}

// --- polling --------------------------------------------------------------------

async function takeLease(season) {
  const now = new Date();
  const until = new Date(now.getTime() + Math.max(season.pollSeconds * 2, 120) * 1000);
  const r = await db().collection(SEASONS).updateOne(
    { _id: season._id, $or: [{ lease: null }, { 'lease.until': { $lt: now } }, { 'lease.by': INSTANCE }] },
    { $set: { lease: { by: INSTANCE, until } } }
  );
  return r.matchedCount === 1;
}

const counts = (a) => {
  const { fingerprints, keys, keyProvince, ...rest } = a;
  return rest;
};

/** Rows added, removed and changed since the baseline, and in which section. */
function compareRaw(baseFp, nowFp) {
  const base = baseFp || {};
  let added = 0;
  let modified = 0;
  const bySection = { profile: 0, monitoring: 0, permits: 0, legal: 0 };
  const names = ['profile', 'monitoring', 'permits', 'legal'];
  const addedSerials = [];
  const modifiedSerials = [];
  for (const [serial, fp] of Object.entries(nowFp)) {
    const was = base[serial];
    if (!was) {
      added += 1;
      if (addedSerials.length < 200) addedSerials.push(serial);
      continue;
    }
    if (was === fp) continue;
    modified += 1;
    if (modifiedSerials.length < 200) modifiedSerials.push(serial);
    const a = was.split('.');
    const b = fp.split('.');
    names.forEach((n, i) => {
      if (a[i] !== b[i]) bySection[n] += 1;
    });
  }
  const removed = Object.keys(base).filter((k) => !nowFp[k]).length;
  return { added, removed, modified, bySection, addedSerials, modifiedSerials };
}

/** One look at every source of the season; returns how many files changed. */
async function poll(season) {
  const seasonId = String(season._id);
  const started = Date.now();
  const firstLook = !season.baselineAt;
  const files = db().collection(FILES);
  const events = [];
  let changed = 0;
  const errors = [];
  const seen = new Set();

  for (const source of season.sources) {
    let listing;
    try {
      listing = await sharepoint.list(source.link);
    } catch (err) {
      errors.push(`${source.label}: ${err.message}`);
      continue;
    }
    for (const meta of listing.files) {
      if (!/\.xls[xm]?$/i.test(meta.name) || /^~\$/.test(meta.name)) continue;
      const id = fileId(seasonId, source.key, meta.path);
      seen.add(id);
      const cached = cache.get(id);
      if (cached && cached.etag === meta.etag) continue;
      let a;
      try {
        a = analyze(await sharepoint.download(source.link, meta.path), source.kind);
      } catch (err) {
        errors.push(`${meta.path}: ${err.message}`);
        continue;
      }
      cache.set(id, { etag: meta.etag, kind: source.kind, keys: a.keys || [], keyProvince: a.keyProvince || null, reference: REFERENCE_FILES.test(meta.path) });

      const prev = await files.findOne({ _id: id });
      let base = await db().collection(BASELINES).findOne({ _id: id });
      if (!base) {
        // Read at the season's first look: this is where it starts. A file
        // that appears later in the season starts empty — all of it is new.
        base = firstLook || !prev
          ? { _id: id, at: new Date(), version: meta.version, fingerprints: firstLook ? a.fingerprints || {} : {}, keys: firstLook ? a.keys || [] : [], counts: firstLook ? counts(a) : null }
          : base;
        if (base) await db().collection(BASELINES).replaceOne({ _id: id }, base, { upsert: true });
      }
      const baseKeys = new Set(base.keys || []);
      const compare = source.kind === 'raw' ? compareRaw(base.fingerprints, a.fingerprints) : { newSinceBaseline: (a.keys || []).filter((k) => !baseKeys.has(k)).length };
      const now = { at: new Date(), version: meta.version, counts: counts(a), compare };
      await files.replaceOne(
        { _id: id },
        {
          _id: id,
          season: seasonId,
          source: source.key,
          sourceLabel: source.label,
          kind: source.kind,
          path: meta.path,
          name: meta.name,
          reference: REFERENCE_FILES.test(meta.path),
          meta,
          baseline: { at: base.at, version: base.version, counts: base.counts },
          current: now,
          missing: false,
        },
        { upsert: true }
      );
      // A save since the last reading: what it changed.
      if (prev?.current && prev.meta?.etag !== meta.etag) {
        changed += 1;
        const p = prev.current.counts || {};
        const c = now.counts;
        const d = (k) => (c[k] || 0) - (p[k] || 0);
        const permitsTotal = (x) => Object.values(x.permits || {}).reduce((s, n) => s + n, 0);
        events.push({
          season: seasonId,
          at: meta.modifiedAt || new Date(),
          seenAt: new Date(),
          kind: 'save',
          file: id,
          name: meta.name,
          source: source.label,
          version: meta.version,
          modifiedBy: meta.modifiedBy,
          delta:
            source.kind === 'raw'
              ? { rows: d('rows'), colored: d('colored'), coloredPermit: d('coloredPermit'), permits: permitsTotal(c) - permitsTotal(p), added: compare.added - (prev.current.compare?.added || 0), modified: compare.modified - (prev.current.compare?.modified || 0) }
              : { permits: d('rows'), newSinceBaseline: compare.newSinceBaseline - (prev.current.compare?.newSinceBaseline || 0) },
        });
      } else if (!prev) {
        changed += 1;
      }
    }
  }

  // Files no longer in the folders.
  if (!errors.length) {
    await files.updateMany({ season: seasonId, _id: { $nin: [...seen] }, missing: false }, { $set: { missing: true, missingSince: new Date() } });
  }

  // The newly issued permits already written into the RAW files.
  if (changed || firstLook) await matchPermits(seasonId);

  if (events.length) await db().collection(EVENTS).insertMany(events);
  const set = { lastPoll: { at: new Date(), ms: Date.now() - started, changed, errors: errors.slice(0, 10) } };
  if (firstLook && !errors.length) set.baselineAt = new Date();
  await db().collection(SEASONS).updateOne({ _id: season._id }, { $set: set });
  if (changed || firstLook) broadcast(seasonId);
  return { changed, errors };
}

async function matchPermits(seasonId) {
  const raw = new Set();
  for (const [id, c] of cache) if (id.startsWith(`${seasonId}:`) && c.kind === 'raw') for (const k of c.keys) raw.add(k);
  if (!raw.size) return;
  for (const [id, c] of cache) {
    if (!id.startsWith(`${seasonId}:`) || c.kind !== 'permits') continue;
    const byProvince = {};
    let inRaw = 0;
    for (const k of c.keys) {
      const p = c.keyProvince?.[k] || '(none)';
      byProvince[p] ||= { issued: 0, inRaw: 0 };
      byProvince[p].issued += 1;
      if (raw.has(k)) {
        inRaw += 1;
        byProvince[p].inRaw += 1;
      }
    }
    await db().collection(FILES).updateOne({ _id: id }, { $set: { 'current.inRaw': inRaw, 'current.inRawByProvince': byProvince } });
  }
}

function broadcast(season) {
  if (io) io.emit('progress-tracker:update', { season, at: new Date() });
}

async function tick() {
  let next = 5 * 60 * 1000;
  try {
    const season = await currentSeason();
    if (isOpen(season)) {
      next = season.pollSeconds * 1000;
      if (await takeLease(season)) {
        running = poll(season);
        await running;
      }
    }
  } catch (err) {
    console.warn('[progress tracker]', err.message);
  } finally {
    running = null;
  }
  schedule(next);
}

function schedule(ms) {
  if (!io && process.env.NODE_ENV === 'test') return;
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
  timer.unref?.();
}

/** Start watching (server start). */
function start(socketServer) {
  io = socketServer;
  schedule(10 * 1000);
}

/** Look now, for the "Check now" button; within the season only. */
async function refresh() {
  const season = await currentSeason();
  if (!season) throw Object.assign(new Error('There is no open season to check.'), { status: 409 });
  if (!isOpen(season)) throw Object.assign(new Error('The season is not open: files are only checked between its dates.'), { status: 409 });
  if (running) await running;
  if (!(await takeLease(season))) throw Object.assign(new Error('Another server is checking the files right now.'), { status: 409 });
  return poll(season);
}

// --- reading ---------------------------------------------------------------------

const sumPermits = (p) => Object.values(p || {}).reduce((a, n) => a + n, 0);

/** Everything the page shows for a season. */
async function overview(id) {
  await connectToMongo();
  const seasons = await db().collection(SEASONS).find({}, { projection: { lease: 0 } }).sort({ startsAt: -1 }).limit(20).toArray();
  const season = id ? seasons.find((s) => String(s._id) === String(id)) : seasons.find((s) => s.status === 'active') || seasons[0];
  if (!season) return { season: null, seasons: [], defaults: { sources: DEFAULT_SOURCES } };
  const sid = String(season._id);
  const files = await db().collection(FILES).find({ season: sid }).sort({ source: 1, path: 1 }).toArray();
  const events = await db().collection(EVENTS).find({ season: sid }).sort({ at: -1 }).limit(80).toArray();

  const raw = files.filter((f) => f.kind === 'raw' && !f.missing);
  const permits = files.filter((f) => f.kind === 'permits' && !f.missing);
  const add = (list, get) => list.reduce((a, f) => a + (get(f) || 0), 0);
  const kinds = ['ecc', 'pto', 'wwdp', 'haz', 'pco', 'chemical', 'importer', 'tsd', 'trc'];
  const permitKinds = Object.fromEntries(kinds.map((k) => [k, { baseline: add(raw, (f) => f.baseline?.counts?.permits?.[k]), now: add(raw, (f) => f.current?.counts?.permits?.[k]) }]));

  const counted = permits.filter((f) => !f.reference);
  const issued = add(counted, (f) => f.current?.counts?.rows);
  const inRaw = add(counted, (f) => f.current?.inRaw);
  const byProvince = {};
  for (const f of counted) {
    for (const [p, v] of Object.entries(f.current?.inRawByProvince || {})) {
      byProvince[p] ||= { issued: 0, inRaw: 0 };
      byProvince[p].issued += v.issued;
      byProvince[p].inRaw += v.inRaw;
    }
  }

  const summary = {
    raw: {
      files: raw.length,
      baselineRows: add(raw, (f) => f.baseline?.counts?.rows),
      rows: add(raw, (f) => f.current?.counts?.rows),
      added: add(raw, (f) => f.current?.compare?.added),
      removed: add(raw, (f) => f.current?.compare?.removed),
      modified: add(raw, (f) => f.current?.compare?.modified),
      bySection: ['profile', 'monitoring', 'permits', 'legal'].reduce((o, k) => ({ ...o, [k]: add(raw, (f) => f.current?.compare?.bySection?.[k]) }), {}),
      colored: add(raw, (f) => f.current?.counts?.colored),
      coloredPermit: add(raw, (f) => f.current?.counts?.coloredPermit),
      baselineColored: add(raw, (f) => f.baseline?.counts?.colored),
      baselineColoredPermit: add(raw, (f) => f.baseline?.counts?.coloredPermit),
      permitsBaseline: add(raw, (f) => sumPermits(f.baseline?.counts?.permits)),
      permitsNow: add(raw, (f) => sumPermits(f.current?.counts?.permits)),
      withPermitBaseline: add(raw, (f) => f.baseline?.counts?.withPermit),
      withPermitNow: add(raw, (f) => f.current?.counts?.withPermit),
      byCategory: ['main', 'duplicate', 'delisting', 'deletion'].reduce((o, k) => ({ ...o, [k]: { baseline: add(raw, (f) => f.baseline?.counts?.byCategory?.[k]), now: add(raw, (f) => f.current?.counts?.byCategory?.[k]) } }), {}),
      permitKinds,
    },
    permits: { files: counted.length, issued, inRaw, newSinceBaseline: add(counted, (f) => f.current?.compare?.newSinceBaseline), byProvince },
  };

  const publicFile = (f) => ({
    id: f._id,
    source: f.source,
    sourceLabel: f.sourceLabel,
    kind: f.kind,
    path: f.path,
    name: f.name,
    reference: f.reference,
    missing: f.missing,
    meta: f.meta,
    baseline: f.baseline,
    current: f.current && { ...f.current, compare: f.current.compare && { ...f.current.compare, addedSerials: undefined, modifiedSerials: undefined } },
  });

  const { lease, ...s } = season;
  return {
    season: { ...s, id: sid, open: isOpen(season) },
    seasons: seasons.map((x) => ({ id: String(x._id), name: x.name, status: x.status, startsAt: x.startsAt, endsAt: x.endsAt })),
    summary,
    files: files.map(publicFile),
    events: events.map(({ _id, ...e }) => ({ id: String(_id), ...e })),
    defaults: { sources: DEFAULT_SOURCES },
  };
}

/** One file in full: its sheets, colours, provinces and the serials added or changed. */
async function fileDetail(id) {
  await connectToMongo();
  const f = await db().collection(FILES).findOne({ _id: String(id) });
  if (!f) throw Object.assign(new Error('No such file in the season.'), { status: 404 });
  return f;
}

async function ensureIndexes() {
  await connectToMongo();
  await db().collection(FILES).createIndex({ season: 1, source: 1, path: 1 });
  await db().collection(EVENTS).createIndex({ season: 1, at: -1 });
}

module.exports = {
  DEFAULT_SOURCES,
  start,
  refresh,
  poll,
  overview,
  fileDetail,
  createSeason,
  updateSeason,
  rebaseline,
  currentSeason,
  ensureIndexes,
  compareRaw,
  isOpen,
  _cache: cache,
};
