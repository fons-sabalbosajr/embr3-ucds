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
// And it watches that the colouring means what it says (validation): a row
// coloured as updated while a permit newly issued to that firm is still not
// in the RAW data, or a save that colours a block of rows nobody changed, is
// a warning — in the season's activity, on the Validation tab, and as a
// notice to the Developers (the Planning Unit edits in Excel, where the
// tracker cannot reach them; the warning names who saved).
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
const { analyzeOff, mapLimit } = require('./analyzePool');
const { mergeUnits, addInto, groupOfUnit, unitOf,unvalidatedHighlights, unencodedHighlights, bulkHighlight, colourFamily, permitStatus, healthcareIndex, healthcareUnitOf, notHealthcareByPsic, masterlistUnitOf, copiesOf, MASTERLIST_LEGEND, ANALYSIS_VERSION } = require('./analyze');
const { notesFor } = require('./notes');
// The event history: MongoDB or SQL Server, as phase B2 says (events.js).
const eventLog = require('./events');

// The matrix's column order: the provinces, then the 2027 lists that span them.
const UNIT_ORDER = ['Aurora', 'Bataan', 'Bulacan', 'Nueva_Ecija', 'Pampanga', 'Tarlac', 'Zambales', 'Healthcare Industries', 'Chemical permits', 'TSD / TRC', 'Importers'];

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

// A look lists the folders (a few small REST calls); a file is downloaded
// again only when its version moved. 15 s keeps the screen close to live
// without hammering SharePoint.
const MIN_POLL = 15;
// Workbooks downloaded and read at once on a look (the worker pool reads two at a time).
const READ_AT_ONCE = 3;
const MAX_POLL = 3600;
const DEFAULT_POLL = 30;

// The old UCD Tracking System's "conditional highlighting" legend: what each
// fill colour meant, per province. The Planning Unit colours a row as they
// update it; white (no fill) is "not yet modified". Colours are matched by
// family (colourFamily), as the workbooks use several shades of each: light
// and dark greens are one "green", the shades listed under it. The Developer
// can change these per season (setLegend).
const DEFAULT_LEGEND = {
  Aurora: { red: 'Incomplete info; not available OL', yellow: 'Transferred complete', green: 'Duplicate quarry' },
  Bataan: { orange: 'Additional permits not on V3' },
  Bulacan: { red: 'Duplicates, incorrect permits (same for DP & HAZ)', green: 'Correct data' },
  Nueva_Ecija: { red: 'Data not found on universe', green: 'Additional data' },
  Pampanga: { red: 'No data, no permits, duplicates', green: 'Correct data', yellow: 'Address already corrected', gray: 'Assigned to staff (resolved)' },
  Tarlac: { red: 'Duplicates', pink: 'PTO data', blue: 'DP data', green: 'HAZ data' },
  Zambales: { red: 'No barangay', yellow: 'Cleared data', orange: 'Duplicate data' },
};
const FAMILIES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'];
// Families the legend once kept apart, now folded into their neighbour.
const MERGED = { beige: 'orange', peach: 'orange', skyblue: 'blue', lightblue: 'blue' };

/** A legend with the old family names folded into the merged ones. */
function normaliseLegend(legend) {
  const out = {};
  for (const [unit, colours] of Object.entries(legend || {})) {
    for (const [fam, label] of Object.entries(colours || {})) {
      const to = MERGED[fam] || fam;
      if (!FAMILIES.includes(to) || !label) continue;
      const u = (out[unit] ||= {});
      u[to] = u[to] && u[to] !== label ? `${u[to]} / ${label}` : label;
    }
  }
  return out;
}

// A fill colour's family (analyze.js colourFamily).
const INSTANCE = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

const db = () => getDb();
const fileId = (season, source, path) => `${season}:${source}:${path}`;

// file id -> { etag, keys, keyProvince } — the comparison material, which is
// not stored: after a restart the first look reads every file again.
const cache = new Map();
// file id -> its season baseline, as stored (read once per file, not on each save).
const baselines = new Map();
// The seasons whose figures this server has worked out since it started.
const countedSince = new Set();
/** Drop every reading in memory: the next look reads the files again and works the figures out anew. */
function forget() {
  cache.clear();
  baselines.clear();
  countedSince.clear();
}

// The open screens told a RAW file's firms are in as soon as it is recorded,
// before the rest of the look (the newly issued lists, the permit matching,
// the validation) — at most once every SOON_MS; the look's end tells them again.
const SOON_MS = 1500;
let soonTimer = null;
function soon(seasonId) {
  if (soonTimer) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    broadcast(seasonId);
  }, SOON_MS);
  soonTimer.unref?.();
}

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
  const pollSeconds = Math.min(MAX_POLL, Math.max(MIN_POLL, Number(input.pollSeconds ?? current.pollSeconds ?? DEFAULT_POLL) || DEFAULT_POLL));
  let sources;
  try {
    sources = cleanSources(input.sources ?? current.sources);
  } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'A source link is not a valid URL.'), { status: 400 });
  }
  return { name, startsAt, endsAt, pollSeconds, sources };
}

const isOpen = (s, now = new Date()) => s && s.status === 'active' && s.startsAt <= now && now <= s.endsAt;
// Watched from the moment it is opened until its end: before its start the
// files are read so the baseline is the RAW data as it stands when the
// season starts (and the screen has figures at once); saves are recorded
// from the start.
const isWatched = (s, now = new Date()) => s && s.status === 'active' && now <= s.endsAt;
const isPreSeason = (s, now = new Date()) => isWatched(s, now) && now < s.startsAt;

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
  forget();
  invalidate();
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
  if (JSON.stringify(set.sources) !== JSON.stringify(s.sources)) forget();
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: set });
  invalidate();
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
  await eventLog.record({ season, at: new Date(), kind: 'baseline', note: 'Baseline taken again from the files as they are now.' });
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { baselineAt: null } });
  forget();
  invalidate();
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
  const { fingerprints, keys, keyProvince, keySource, keyCells, keyKind, keyType, keyNames, keyLabel, keyAt, keyHealthcare, keyReviewed, keyPsic, keyTitle, keyCity, entries, records, classifications, iis, highlights, checks, ...rest } = a;
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

/**
 * One look at every source of the season; returns how many files changed.
 * `listsOnly`: the newly issued lists' folders only (the Highlighting tab's
 * Refresh) — the RAW files are left as last read, so the lists' colours are
 * matched against the RAW data in memory in seconds, not after every RAW file.
 */
async function poll(season, { listsOnly = false } = {}) {
  const seasonId = String(season._id);
  const started = Date.now();
  const preSeason = isPreSeason(season);
  // Before the start every reading is the baseline: it follows the files
  // until the season begins.
  const firstLook = !season.baselineAt || preSeason;
  const files = db().collection(FILES);
  const events = [];
  let changed = 0;
  const errors = [];
  const seen = new Set();
  const sources = listsOnly ? season.sources.filter((s) => s.kind === 'permits') : season.sources;

  // The folders listed together (a few REST calls each).
  const listings = await Promise.all(sources.map((s) => sharepoint.list(s.link).then((listing) => ({ listing }), (err) => ({ err }))));
  // When, from the look's start, each stage was done (ms): kept with the look, to see where the time goes.
  const stages = { listed: Date.now() - started };
  // The files saved since the last look, of every source…
  const jobs = [];
  for (const [s, source] of sources.entries()) {
    const { listing, err: listErr } = listings[s];
    if (listErr) {
      errors.push(`${source.label}: ${listErr.message}`);
      continue;
    }
    for (const meta of listing.files) {
      if (!/\.xls[xm]?$/i.test(meta.name) || /^~\$/.test(meta.name)) continue;
      const id = fileId(seasonId, source.key, meta.path);
      seen.add(id);
      const cached = cache.get(id);
      if (!cached || cached.etag !== meta.etag) jobs.push({ meta, source });
    }
  }
  // …the newly issued lists first (small: under a second each, where a RAW
  // file takes three), so their colours — "Firm not in the universe" among
  // them — are counted before the RAW files are read…
  jobs.sort((x, y) => (x.source.kind === 'permits' ? 0 : 1) - (y.source.kind === 'permits' ? 0 : 1));
  let listsLeft = jobs.filter((j) => j.source.kind === 'permits').length;
  // …and, the lists read, the permits matched against the RAW data held in
  // memory and the screens told at once. Not on the first look since the
  // server started: the RAW files are not all in memory yet.
  // (A lists-only look matches once, at its end.)
  const matchEarly = listsLeft > 0 && countedSince.has(seasonId) && !firstLook && !listsOnly;
  // Downloaded and read a few at a time, in worker threads (analyzePool.js):
  // the server goes on answering meanwhile. Each is recorded as soon as it is
  // read — one at a time, in the order they finish — and a RAW file's firms
  // reach the open screens at once (soon), not after every other file and the
  // permit matching.
  let recording = Promise.resolve();
  /**
   * A RAW file's serials at the season's baseline: a workbook without an
   * additions log (the healthcare lists) counts as added the firms not among
   * them (analyze.js baselineMatcher). None on the season's first look —
   * everything is the baseline then; a file new since then had none (all added).
   */
  const baseSerialsOf = async (id) => {
    if (firstLook) return null;
    const base = baselines.get(id) || (await db().collection(BASELINES).findOne({ _id: id }, { projection: { fingerprints: 1 } }));
    return Object.keys(base?.fingerprints || {});
  };
  await mapLimit(jobs, READ_AT_ONCE, async ({ meta, source }) => {
    let reading;
    try {
      const opts = { reference: REFERENCE_FILES.test(meta.path), baseSerials: source.kind === 'raw' ? await baseSerialsOf(fileId(seasonId, source.key, meta.path)) : null };
      reading = { meta, source, a: await analyzeOff(await sharepoint.download(source.link, meta.path), source.kind, opts) };
    } catch (err) {
      reading = { meta, source, err };
    }
    recording = recording.then(async () => {
      try {
        await record(reading);
      } catch (err) {
        errors.push(`${meta.path}: ${err.message}`);
      }
      if (source.kind !== 'permits') return;
      listsLeft -= 1;
      if (listsLeft === 0 && matchEarly) {
        await matchPermits(seasonId);
        broadcast(seasonId);
        stages.listsShown = Date.now() - started;
      }
    });
  });
  await recording;
  stages.read = Date.now() - started;
  stages.files = jobs.length;

  /** One file's reading recorded: the cache, its document, its baseline, the activity. */
  async function record({ meta, a, err, source }) {
    {
      if (err) {
        errors.push(`${meta.path}: ${err.message}`);
        return;
      }
      const id = fileId(seasonId, source.key, meta.path);
      const cached = cache.get(id);
      const entry = {
        etag: meta.etag,
        kind: source.kind,
        keys: a.keys || [],
        keyProvince: a.keyProvince || null,
        keySource: a.keySource || null,
        keyCells: a.keyCells || null,
        keyKind: a.keyKind || null,
        keyType: a.keyType || null,
        keyNames: a.keyNames || null,
        keyLabel: a.keyLabel || null,
        keyAt: a.keyAt || null,
        // A newly issued list's healthcare / TSD / TRC mark, and each permit's PSIC description.
        keyHealthcare: a.keyHealthcare || null,
        keyReviewed: a.keyReviewed || null,
        keyPsic: a.keyPsic || null,
        keyTitle: a.keyTitle || null,
        keyCity: a.keyCity || null,
        // A newly issued list's rows as counted (analyze.js countedEntries).
        entries: a.entries || null,
        records: a.records || null,
        // A RAW workbook's standard industry classifications: the PSIC basis.
        classifications: a.classifications || null,
        // The validation check's material: this reading's rows and colouring.
        checks: a.checks || null,
        highlights: a.highlights || null,
        fingerprints: a.fingerprints || null,
        modifiedAt: meta.modifiedAt || new Date(),
        reference: REFERENCE_FILES.test(meta.path),
        // A working copy of another list (matchPermits works it out again after the look).
        copyOf: cached?.copyOf || null,
      };
      cache.set(id, entry);

      const prev = await files.findOne({ _id: id });
      // The baseline does not change during the season: read once, then kept
      // (a large province's is half a megabyte, read again on every save before).
      let base = preSeason ? null : baselines.get(id) || (await db().collection(BASELINES).findOne({ _id: id }));
      if (!base) {
        // Read at the season's first look: this is where it starts. A file
        // that appears later in the season starts empty — all of it is new.
        base = firstLook || !prev
          ? { _id: id, at: new Date(), version: meta.version, fingerprints: firstLook ? a.fingerprints || {} : {}, highlights: firstLook ? a.highlights || {} : {}, keys: firstLook ? a.keys || [] : [], counts: firstLook ? counts(a) : null }
          : base;
        if (base) await db().collection(BASELINES).replaceOne({ _id: id }, base, { upsert: true });
      }
      // A baseline taken before the tracker kept the colouring (of the RAW
      // rows, or of the permit lists): what is coloured now is taken as the
      // start, and colouring counts from here.
      if (base && !base.highlights) {
        base.highlights = a.highlights || {};
        await db().collection(BASELINES).updateOne({ _id: id }, { $set: { highlights: base.highlights } });
      }
      if (base && !preSeason) baselines.set(id, base);
      entry.baseHighlights = base?.highlights || {};
      entry.baseFingerprints = base?.fingerprints || {};
      // The permit numbers the file held at the baseline ("already in the records").
      entry.baseKeys = base?.keys || [];
      const baseKeys = new Set(base.keys || []);
      const compare = source.kind === 'raw' ? compareRaw(base.fingerprints, a.fingerprints) : { newSinceBaseline: (a.keys || []).filter((k) => !baseKeys.has(k)).length };
      const now = {
        at: new Date(),
        version: meta.version,
        counts: counts(a),
        compare,
        ...(a.iis ? { iis: a.iis } : {}),
        // A list's permits matched against the RAW data, as last worked out —
        // kept until matchPermits works them out again, so a screen told of a
        // save meanwhile never sees the list at nought.
        ...(source.kind === 'permits' && prev?.current?.inRawByKind
          ? { inRaw: prev.current.inRaw, inRawByProvince: prev.current.inRawByProvince, inRawByKind: prev.current.inRawByKind }
          : {}),
      };
      const activity = source.kind === 'raw' && prev && prev.meta?.etag !== meta.etag && !preSeason ? encodingActivity(prev, cached, a, meta) : prev?.activity || null;
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
          copyOf: entry.copyOf,
          meta,
          baseline: { at: base.at, version: base.version, counts: base.counts },
          current: now,
          // The validation check's last finding (checkValidation), kept across readings.
          validation: prev?.validation || null,
          // A RAW file: the kinds of permit its recent saves wrote in (encodingActivity).
          activity,
          missing: false,
        },
        { upsert: true }
      );
      // Its firms — the count, the added ones — on the screens now, not at the look's end.
      if (source.kind === 'raw') soon(seasonId);
      // A save since the last reading: what it changed.
      if (prev?.current && prev.meta?.etag !== meta.etag && !preSeason) {
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
        // A block of rows coloured in one go, with nothing on them changed.
        // Against the reading before, which only memory holds (none after a restart).
        // Not on the ECP monitoring list, which is not part of the updating.
        const tracked = Object.keys(a.units || {}).some((u) => groupOfUnit(u) !== 'other');
        if (source.kind === 'raw' && cached && tracked) {
          const minutes = (new Date(meta.modifiedAt || Date.now()) - new Date(cached.modifiedAt || prev.current.at)) / 60000;
          const bulk = bulkHighlight(cached, a, minutes);
          if (bulk) {
            events.push({ season: seasonId, at: meta.modifiedAt || new Date(), seenAt: new Date(), kind: 'warning', check: 'bulk', file: id, name: meta.name, source: source.label, version: meta.version, modifiedBy: meta.modifiedBy, ...bulk });
          }
        }
      } else if (!prev) {
        changed += 1;
      }
    }
  }

  // Files no longer in the folders (of the folders looked at).
  if (!errors.length) {
    await files.updateMany(
      { season: seasonId, _id: { $nin: [...seen] }, missing: false, ...(listsOnly ? { source: { $in: sources.map((s) => s.key) } } : {}) },
      { $set: { missing: true, missingSince: new Date() } }
    );
  }

  // The newly issued permits already written into the RAW files, and the
  // rows coloured without theirs (warned of from the season's start only).
  // Also on the first look since the server started: the figures are worked
  // out from the readings in memory, so a new way of counting (a new server)
  // shows at once rather than at the next save.
  const recount = changed || firstLook || !countedSince.has(seasonId);
  if (recount) {
    await matchPermits(seasonId);
    stages.matched = Date.now() - started;
    // The figures on the screens now: the validation below (several seconds
    // on a busy look) only adds its warnings, told when it is done.
    broadcast(seasonId);
    events.push(...(await checkValidation(seasonId, { record: !preSeason })));
    stages.validated = Date.now() - started;
    countedSince.add(seasonId);
  }

  if (events.length) await eventLog.record(events);
  const warnings = events.filter((e) => e.kind === 'warning');
  if (warnings.length) warnDevelopers(warnings);
  // A lists-only look is not a look at every file: "checked" stays the last full one's.
  const set = listsOnly
    ? { lastListsLook: { at: new Date(), ms: Date.now() - started, changed, errors: errors.slice(0, 10), stages } }
    : { lastPoll: { at: new Date(), ms: Date.now() - started, changed, errors: errors.slice(0, 10), stages } };
  if (firstLook && !errors.length && !listsOnly) set.baselineAt = new Date();
  await db().collection(SEASONS).updateOne({ _id: season._id }, { $set: set });
  // Told again only for what the validation and the activity added.
  if (recount && events.length) broadcast(seasonId);
  return { changed, errors };
}

/**
 * A city or municipality as a key of the stored figures: as the list writes
 * it, in capitals, single-spaced; a dot kept as a look-alike (MongoDB keys
 * take none: "STO. TOMAS"). "(no city)" when the list has none.
 */
const cityKey = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '․')
    .replace(/^\$+/, '')
    .slice(0, 60) || '(no city)';

/**
 * One newly issued permit counted into its universe's figures (`scopes.plan`
 * or `scopes.healthcare`) at each level it is counted at — the same issued,
 * in the RAW data, highlighted and by-colour counts as the level's own.
 */
function tallyScope(levels, scope, fill, inRaw) {
  const written = inRaw ? 1 : 0;
  const fam = fill ? colourFamily(fill) : null;
  for (const at of levels) {
    const s = ((at.scopes ||= {})[scope] ||= { issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {} });
    s.issued += 1;
    s.inRaw += written;
    if (!fill) continue;
    s.colored += 1;
    s.coloredInRaw += written;
    const f = (s.families[fam] ||= { rows: 0, inRaw: 0, shades: {} });
    f.rows += 1;
    f.inRaw += written;
    f.shades[fill] = (f.shades[fill] || 0) + 1;
  }
}

/**
 * The season's healthcare universe from the RAW readings in memory: the
 * healthcare lists' permits and firms, and the PSIC basis (the workbooks'
 * standard classifications, judged by where their firms are). analyze.js healthcareIndex.
 */
function seasonHealthcareIndex(seasonId) {
  const raws = [...cache].filter(([id, c]) => id.startsWith(`${seasonId}:`) && c.kind === 'raw').map(([, c]) => c);
  return healthcareIndex(
    raws.map((c) => c.checks),
    raws.map((c) => c.records),
    raws.map((c) => c.classifications || [])
  );
}

/**
 * The four healthcare lists (Healthcare Industries, Chemical permits, TSD /
 * TRC, Importers) by kind of permit — ECC/CNC, PTO, WWDP, HW ID — with the
 * duplicates taken out. One establishment is often on several lists (a
 * hospital also on Chemical permits; a firm on both TSD and TRC), and a
 * permit number now and then on two rows of one list: each counts once.
 * Per list: the numbers listed and the distinct ones; across the four: the
 * distinct ones (the total), and the numbers on more than one row, with
 * where — for the Planning Unit to clear them from the workbooks.
 */
const HC_PERMIT_KINDS = ['ecc', 'pto', 'wwdp', 'haz'];
function healthcarePermits(seasonId) {
  const empty = () => Object.fromEntries(HC_PERMIT_KINDS.map((k) => [k, { listed: 0, keys: new Set() }]));
  const units = {};
  const where = Object.fromEntries(HC_PERMIT_KINDS.map((k) => [k, new Map()])); // kind -> permit -> [{ unit, serial }]
  for (const [id, c] of cache) {
    if (!id.startsWith(`${seasonId}:`) || c.kind !== 'raw' || !c.keyCells) continue;
    for (const [key, cells] of Object.entries(c.keyCells)) {
      for (const cell of cells) {
        if (!HC_PERMIT_KINDS.includes(cell.kind)) continue;
        const unit = unitOf(String(cell.serial || ''), null);
        if (groupOfUnit(unit) !== 'healthcare') continue;
        const u = (units[unit] ||= empty())[cell.kind];
        u.listed += 1;
        u.keys.add(key);
        const at = where[cell.kind].get(key) || [];
        if (!at.some((w) => w.serial === cell.serial)) at.push({ unit, serial: cell.serial });
        where[cell.kind].set(key, at);
      }
    }
  }
  const count = (k) => ({ listed: k.listed, distinct: k.keys.size });
  const total = Object.fromEntries(
    HC_PERMIT_KINDS.map((kind) => [kind, { listed: Object.values(units).reduce((a, u) => a + u[kind].listed, 0), distinct: where[kind].size }])
  );
  const duplicates = HC_PERMIT_KINDS.flatMap((kind) =>
    [...where[kind]].filter(([, at]) => at.length > 1).map(([permit, at]) => ({ kind, permit, at, across: new Set(at.map((w) => w.unit)).size > 1 }))
  );
  return {
    kinds: HC_PERMIT_KINDS,
    units: Object.entries(units)
      .map(([unit, kinds]) => ({ unit, kinds: Object.fromEntries(HC_PERMIT_KINDS.map((k) => [k, count(kinds[k])])) }))
      .sort((a, b) => UNIT_ORDER.indexOf(a.unit) - UNIT_ORDER.indexOf(b.unit)),
    total,
    duplicateCount: duplicates.length,
    duplicates: duplicates.slice(0, 1000),
  };
}

/**
 * The newly issued permits already in the RAW data: per file, by province and
 * by kind of permit, and — of those found — whether they sit on a baseline
 * firm or on one added from ERMS or ECC Online.
 */
async function matchPermits(seasonId) {
  // Working copies of a list (its rows set aside for someone to check): shown
  // in the Files tab, not counted — their permits are the list's own.
  const lists = [...cache].filter(([id, c]) => id.startsWith(`${seasonId}:`) && c.kind === 'permits' && !c.reference);
  const copies = copiesOf(lists.map(([id, c]) => ({ id, name: (id.split(':').pop() || '').split('/').pop(), keys: c.keys, rows: (c.entries || []).length })));
  for (const [id, c] of lists) {
    const copyOf = copies[id] || null;
    if ((c.copyOf || null) === copyOf) continue;
    c.copyOf = copyOf;
    await db().collection(FILES).updateOne({ _id: id }, { $set: { copyOf } });
  }
  const raw = new Map(); // key -> 'base' | 'erms' | 'ecconline' | 'other'
  for (const [id, c] of cache) if (id.startsWith(`${seasonId}:`) && c.kind === 'raw') for (const k of c.keys) if (!raw.has(k)) raw.set(k, c.keySource?.[k] || 'base');
  if (!raw.size) return;
  // The healthcare universe in the RAW data: a newly issued permit of it is
  // counted under its healthcare list, apart from the Monitoring Plan's provinces.
  const hcIndex = seasonHealthcareIndex(seasonId);
  // `colored`: the permits the masterlist holder coloured on the list (as
  // written in); `coloredInRaw`: of those, the ones really in the RAW data.
  // `rowColors`: the same by fill — { rgb: { rows, inRaw } }.
  // `families`: by colour family (the workshop's green, pink, yellow, red; any
  // other) — { family: { rows, inRaw } }.
  const emptyKind = () => ({ issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, rowColors: {}, families: {}, bySource: { base: 0, erms: 0, ecconline: 0, other: 0 }, status: { new: 0, updated: 0, firmNew: 0 } });
  // The UCD Tracking System's "Added permits to universe", worked out: a
  // permit already in the RAW data is FIRM NEW when it came with a firm
  // added this updating (ERMS, ECC Online), UPDATED when its list says
  // renewal, NEW otherwise.
  const statusOf = (k, c) => {
    const src = raw.get(k);
    if (src && src !== 'base') return 'firmNew';
    return c.keyType?.[k] === 'renewal' ? 'updated' : 'new';
  };
  for (const [id, c] of cache) {
    if (!id.startsWith(`${seasonId}:`) || c.kind !== 'permits' || c.copyOf) continue;
    const byProvince = {};
    const byKind = {};
    let inRaw = 0;
    // The list's rows as counted (analyze.js countedEntries): each its own
    // colour, province, municipality and healthcare mark; its permit number
    // looked for in the RAW data.
    for (const e of c.entries || []) {
      const k = e.k;
      const kind = e.kind || c.keyKind?.[k] || 'other';
      // Counted as the list's own sheets count it (analyze.js
      // masterlistUnitOf): a province sheet's rows under that province, the
      // healthcare firms the list keeps apart under their healthcare list.
      const names = c.keyNames?.[k] || [];
      const p = masterlistUnitOf({ ...e, kind }, hcIndex, names);
      // Of the healthcare universe (marked, TSD / TRC, or on the healthcare
      // RAW lists): a breakdown within the unit — the Universe switch.
      const hcUnit = healthcareUnitOf({ ...e, kind }, hcIndex, names);
      const prov = (byProvince[p] ||= { issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {}, byKind: {} });
      const pk = (prov.byKind[kind] ||= { issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {}, status: { new: 0, updated: 0, firmNew: 0 } });
      const kk = (byKind[kind] ||= emptyKind());
      prov.issued += 1;
      pk.issued += 1;
      kk.issued += 1;
      // Sanitary landfills: counted as the sheet counts them, shown apart.
      if (e.landfill) for (const at of [prov, pk, kk]) at.landfills = (at.landfills || 0) + 1;
      const fill = e.fill;
      if (fill) {
        const written = raw.has(k) ? 1 : 0;
        prov.colored += 1;
        pk.colored += 1;
        kk.colored += 1;
        prov.coloredInRaw += written;
        pk.coloredInRaw += written;
        kk.coloredInRaw += written;
        const shade = (kk.rowColors[fill] ||= { rows: 0, inRaw: 0 });
        shade.rows += 1;
        shade.inRaw += written;
        const fam = colourFamily(fill);
        for (const at of [prov, pk, kk]) {
          // The family, and under it the very shades used ({ rgb: permits }).
          const f = (at.families[fam] ||= { rows: 0, inRaw: 0, shades: {} });
          f.rows += 1;
          f.inRaw += written;
          f.shades[fill] = (f.shades[fill] || 0) + 1;
        }
      }
      if (raw.has(k)) {
        inRaw += 1;
        prov.inRaw += 1;
        pk.inRaw += 1;
        kk.inRaw += 1;
        kk.bySource[raw.get(k)] += 1;
        const st = statusOf(k, c);
        kk.status[st] += 1;
        pk.status[st] += 1;
      }
      // The same figures again within the permit's universe — the province's
      // Monitoring Plan, or Healthcare / TSD / TRC as the list marks it — so
      // the tiles can show either; and the mark's own counts: permits marked,
      // permits on a sheet that carries the mark (gone through for it), and
      // marks on an establishment whose PSIC is not of that universe.
      const healthcare = Boolean(hcUnit);
      // The kind's permits again per city or municipality, as the list writes it.
      const ck = ((pk.cities ||= {})[cityKey(e.city)] ||= { issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {} });
      ck.issued += 1;
      if (raw.has(k)) ck.inRaw += 1;
      if (fill) {
        const written = raw.has(k) ? 1 : 0;
        const fam = colourFamily(fill);
        ck.colored += 1;
        ck.coloredInRaw += written;
        const f = (ck.families[fam] ||= { rows: 0, inRaw: 0, shades: {} });
        f.rows += 1;
        f.inRaw += written;
        f.shades[fill] = (f.shades[fill] || 0) + 1;
      }
      tallyScope([prov, pk, kk, ck], healthcare ? 'healthcare' : 'plan', fill, raw.has(k));
      for (const at of [prov, pk, kk]) {
        if (healthcare) at.healthcare = (at.healthcare || 0) + 1;
        if (e.reviewed) at.healthcareReviewed = (at.healthcareReviewed || 0) + 1;
        if (notHealthcareByPsic({ ...e, kind }, hcIndex)) at.healthcareDoubtful = (at.healthcareDoubtful || 0) + 1;
      }
    }
    // Written only when they changed: a look that read only RAW files often
    // leaves most lists' figures as they were.
    const sig = JSON.stringify([inRaw, byProvince, byKind]);
    if (c.matchSig === sig) continue;
    c.matchSig = sig;
    await db().collection(FILES).updateOne({ _id: id }, { $set: { 'current.inRaw': inRaw, 'current.inRawByProvince': byProvince, 'current.inRawByKind': byKind } });
  }
}

// --- validation: colouring that does not mean what it says ---------------------

/**
 * Colouring that does not mean what it says, kept on each file's document:
 *   the rows of each RAW file coloured since the baseline without their
 *     newly issued permits (analyze.js unvalidatedHighlights);
 *   the permits coloured on each newly issued list since the baseline — as
 *     written in — that are not in the RAW data (unencodedHighlights).
 * Returns a warning event per file with rows not flagged before (none when
 * `record` is off: before the season starts).
 */
async function checkValidation(seasonId, { record = true } = {}) {
  const raws = [];
  const lists = [];
  const inRaw = new Set();
  for (const [id, c] of cache) {
    if (!id.startsWith(`${seasonId}:`)) continue;
    if (c.kind === 'raw') for (const k of c.keys || []) inRaw.add(k);
    if (c.kind === 'raw' && c.checks) raws.push({ id, checks: c.checks, baseHighlights: c.baseHighlights, fingerprints: c.fingerprints, baseFingerprints: c.baseFingerprints });
    else if (c.kind === 'permits' && !c.reference && !c.copyOf) lists.push({ id, ...c });
  }
  // No RAW file read: nothing to hold the lists against.
  if (!raws.length) return [];
  const flagged = { ...unvalidatedHighlights(raws, lists), ...unencodedHighlights(lists, inRaw) };
  const docs = await db()
    .collection(FILES)
    .find({ season: seasonId, reference: { $ne: true }, missing: { $ne: true } }, { projection: { name: 1, kind: 1, meta: 1, validation: 1 } })
    .toArray();
  const warnings = [];
  for (const d of docs) {
    // A file not read this time round (it failed to download) keeps its finding.
    const read = cache.get(d._id);
    if (!read || (d.kind === 'raw' && !read.checks)) continue;
    const rows = flagged[d._id] || [];
    const idOf = (r, m) => `${r.serial || ''}|${m.permit}`;
    const ids = rows.flatMap((r) => r.missing.map((m) => idOf(r, m)));
    const before = new Set(d.validation?.ids || []);
    const fresh = rows.filter((r) => r.missing.some((m) => !before.has(idOf(r, m))));
    const same = (d.validation?.flagged || 0) === rows.length && ids.length === before.size && ids.every((x) => before.has(x));
    if (!same) {
      await db()
        .collection(FILES)
        .updateOne({ _id: d._id }, { $set: { validation: { at: new Date(), flagged: rows.length, unchanged: rows.filter((r) => r.unchanged).length, rows: rows.slice(0, 300), ids: ids.slice(0, 2000) } } });
      invalidate();
    }
    if (record && fresh.length) {
      warnings.push({
        season: seasonId,
        at: new Date(),
        seenAt: new Date(),
        kind: 'warning',
        // A RAW row coloured without its permit; a permit coloured on its list without being in the RAW data.
        check: d.kind === 'permits' ? 'unencoded' : 'unvalidated',
        file: d._id,
        name: d.name,
        version: d.meta?.version || null,
        modifiedBy: d.meta?.modifiedBy || null,
        rows: fresh.length,
        unchanged: fresh.filter((r) => r.unchanged).length,
        ...(d.kind === 'permits' ? { notEncoded: fresh.filter((r) => r.reason === 'notEncoded').length, redInRaw: fresh.filter((r) => r.reason === 'redInRaw').length } : {}),
        sample: fresh.slice(0, 5).map((r) => ({ serial: r.serial, sheet: r.sheet, row: r.row, title: r.title, name: r.name, reason: r.reason || null, missing: r.missing.slice(0, 2) })),
      });
    }
  }
  return warnings;
}

const fileTitle = (name) => String(name || '').replace(/\.xls[xm]?$/i, '');

/** The warning's notice: a title and a line. */
function noticeOf(w) {
  const who = w.modifiedBy ? ` Last saved by ${w.modifiedBy}.` : '';
  if (w.check === 'bulk') {
    return {
      title: 'Progress Tracker: rows highlighted in bulk',
      body: `${w.rows} rows of ${fileTitle(w.name)} were highlighted in about ${w.minutes} min; ${w.unchanged} of them had nothing on the row changed.${who}`,
    };
  }
  const first = w.sample?.[0];
  if (w.check === 'unencoded') {
    const example = first ? ` For example ${first.missing.map((m) => m.permit).join(', ')}${first.title ? ` (${first.title})` : ''}.` : '';
    const notEncoded = w.notEncoded ?? w.rows;
    const redInRaw = w.redInRaw || 0;
    const parts = [
      notEncoded && `${notEncoded} highlighted green, pink or yellow (written in) but not in the RAW data`,
      redInRaw && `${redInRaw} highlighted red (firm not in the universe) but already in the RAW data — to turn orange (firm added in the universe RAW)`,
    ].filter(Boolean);
    return {
      title: 'Progress Tracker: highlight does not match the RAW data',
      body: `${fileTitle(w.name)}: ${parts.join('; ')}.${example}${who}`,
    };
  }
  const example = first ? ` For example ${first.title || first.name || first.serial}: ${first.missing.map((m) => m.permit).join(', ')}.` : '';
  return {
    title: 'Progress Tracker: highlighted without validating',
    body: `${w.rows} row${w.rows === 1 ? '' : 's'} of ${fileTitle(w.name)} ${w.rows === 1 ? 'was' : 'were'} highlighted as updated without the newly issued permit.${example}${who}`,
  };
}

/** Tell the Developers (the tracker is theirs), on every screen and device. Not awaited. */
function warnDevelopers(warnings) {
  const notifier = require('../notifier');
  const developers = async () => {
    await connectToMongo();
    const rows = await db().collection('users').find({ permission: { $regex: /^developer$/i } }, { projection: { username: 1 } }).toArray();
    return rows.map((u) => u.username);
  };
  const url = '/e-universe/admin/progress-tracker?tab=validation';
  // A few at most, each on its own; more than that in one notice.
  if (warnings.length <= 3) {
    for (const w of warnings) notifier.notifyLater(developers, { ...noticeOf(w), url, kind: 'security', tag: `progress-${w.check}-${String(w.file).slice(-24)}` });
    return;
  }
  const rows = warnings.reduce((a, w) => a + (w.rows || 0), 0);
  notifier.notifyLater(developers, {
    title: 'Progress Tracker: validation warnings',
    body: `${warnings.length} warnings across ${new Set(warnings.map((w) => w.file)).size} RAW files, ${rows} rows in all. Open the Validation tab.`,
    url,
    kind: 'security',
    tag: 'progress-validation',
  });
}

function broadcast(season) {
  invalidate();
  if (io) io.emit('progress-tracker:update', { season, at: new Date() });
}

async function tick() {
  let next = 5 * 60 * 1000;
  try {
    const season = await currentSeason();
    if (isWatched(season)) {
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

/**
 * Look now, for the "Check now" button; within the season only. `listsOnly`:
 * the newly issued lists alone (the Highlighting tab's Refresh) — a full look
 * instead while the RAW data is not yet in memory (the season's first look, or
 * the first since the server started), as the lists have nothing to match then.
 */
async function refresh({ listsOnly = false } = {}) {
  const season = await currentSeason();
  if (!season) throw Object.assign(new Error('There is no open season to check.'), { status: 409 });
  if (!isWatched(season)) throw Object.assign(new Error('The season has ended: files are no longer checked.'), { status: 409 });
  if (running) await running;
  if (!(await takeLease(season))) throw Object.assign(new Error('Another server is checking the files right now.'), { status: 409 });
  const partial = listsOnly && season.baselineAt && !isPreSeason(season) && countedSince.has(String(season._id));
  return { ...(await poll(season, { listsOnly: Boolean(partial) })), listsOnly: Boolean(partial) };
}

// --- reading ---------------------------------------------------------------------

const sumPermits = (p) => Object.values(p || {}).reduce((a, n) => a + n, 0);

// The overview, kept for a short while: every open screen and every public
// link asks for it each minute, and building it reads every file document.
// Anything that changes the figures (a save read, the legend, the season,
// the public link) drops it at once; a request meanwhile shares the build.
const OVERVIEW_TTL = 20 * 1000;
const overviews = new Map(); // season id | 'current' -> { at, gen, promise }
let generation = 0;
function invalidate() {
  generation += 1;
  overviews.clear();
}

/** Everything the page shows for a season (cached briefly; see above). */
async function overview(id) {
  const key = id ? String(id) : 'current';
  const hit = overviews.get(key);
  if (hit && hit.gen === generation && Date.now() - hit.at < OVERVIEW_TTL) return hit.promise;
  const gen = generation;
  const promise = buildOverview(id).catch((err) => {
    overviews.delete(key);
    throw err;
  });
  overviews.set(key, { at: Date.now(), gen, promise });
  return promise;
}

async function buildOverview(id) {
  await connectToMongo();
  const seasons = await db().collection(SEASONS).find({}, { projection: { lease: 0 } }).sort({ startsAt: -1 }).limit(20).toArray();
  const season = id ? seasons.find((s) => String(s._id) === String(id)) : seasons.find((s) => s.status === 'active') || seasons[0];
  if (!season) return { season: null, seasons: [], defaults: { sources: DEFAULT_SOURCES } };
  const sid = String(season._id);
  const files = await db().collection(FILES).find({ season: sid }).sort({ source: 1, path: 1 }).toArray();
  const events = await eventLog.latest(sid, 80);

  // The Monitoring Plan (the seven provinces) and the healthcare lists. The
  // ECP monitoring list is not part of the universe's updating: left out.
  const notTracked = (f) => f.kind === 'raw' && Object.keys(f.current?.counts?.units || {}).every((u) => groupOfUnit(u) === 'other');
  const raw = files.filter((f) => f.kind === 'raw' && !f.missing && !notTracked(f));
  const permits = files.filter((f) => f.kind === 'permits' && !f.missing);
  const add = (list, get) => list.reduce((a, f) => a + (get(f) || 0), 0);
  const kinds = ['ecc', 'pto', 'wwdp', 'haz', 'pco', 'chemical', 'importer', 'tsd', 'trc'];
  const permitKinds = Object.fromEntries(kinds.map((k) => [k, { baseline: add(raw, (f) => f.baseline?.counts?.permits?.[k]), now: add(raw, (f) => f.current?.counts?.permits?.[k]) }]));

  // Not the reference extracts, nor a working copy of another list (matchPermits).
  const counted = permits.filter((f) => !f.reference && !f.copyOf);
  const issued = add(counted, (f) => f.current?.counts?.rows);
  const inRaw = add(counted, (f) => f.current?.inRaw);
  // By province (each with its kinds of permit), and by kind of permit (each
  // with the firms the encoded ones sit on).
  const byProvince = {};
  const issuedByKind = {};
  for (const f of counted) {
    for (const [p, v] of Object.entries(f.current?.inRawByProvince || {})) addInto((byProvince[p] ||= { issued: 0, inRaw: 0, byKind: {} }), v);
    addInto(issuedByKind, f.current?.inRawByKind);
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
      byCategory: ['main', 'review', 'duplicate', 'delisting', 'deletion'].reduce((o, k) => ({ ...o, [k]: { baseline: add(raw, (f) => f.baseline?.counts?.byCategory?.[k]), now: add(raw, (f) => f.current?.counts?.byCategory?.[k]) } }), {}),
      permitKinds,
    },
    permits: {
      files: counted.length,
      issued,
      inRaw,
      // Highlighted on the lists by the masterlist holder (as written in), and of those the ones really in the RAW data.
      colored: Object.values(issuedByKind).reduce((a, k) => a + (k.colored || 0), 0),
      coloredInRaw: Object.values(issuedByKind).reduce((a, k) => a + (k.coloredInRaw || 0), 0),
      newSinceBaseline: add(counted, (f) => f.current?.compare?.newSinceBaseline),
      // Sanitary landfills' permits on the lists: left out of every count above.
      landfills: add(counted, (f) => f.current?.counts?.landfills),
      byProvince,
      byKind: issuedByKind,
    },
  };
  // The main sheets split by where each firm came from: the baseline (on the
  // sheet before this updating) and the additions from ERMS and ECC Online,
  // read from each workbook's additions log.
  const composition = raw.reduce(
    (t, f) => addInto(t, { base: f.current?.counts?.base, added: f.current?.counts?.added, pending: f.current?.counts?.pending, addedPermits: f.current?.counts?.addedPermits, addedPermitsByKind: f.current?.counts?.addedPermitsByKind }),
    { base: 0, added: { erms: 0, ecconline: 0, other: 0 }, pending: { erms: 0, ecconline: 0, other: 0 }, addedPermits: {}, addedPermitsByKind: { erms: {}, ecconline: {}, other: {} } }
  );
  const addedPermitsTotal = sumPermits(composition.addedPermits);
  Object.assign(summary.raw, {
    base: composition.base,
    additions: composition.added,
    pending: composition.pending,
    review: summary.raw.byCategory.review.now,
    addedPermits: addedPermitsTotal,
    basePermits: summary.raw.permitsNow - addedPermitsTotal,
  });
  // Each kind of permit on its own — they are not added together: on the
  // baseline firms, and on the firms added from ERMS and from ECC Online.
  for (const k of kinds) {
    const p = summary.raw.permitKinds[k];
    p.added = composition.addedPermits[k] || 0;
    p.erms = composition.addedPermitsByKind.erms[k] || 0;
    p.ecconline = composition.addedPermitsByKind.ecconline[k] || 0;
    p.other = composition.addedPermitsByKind.other[k] || 0;
    p.base = p.now - p.added;
  }
  // A baseline read under an older reading of the workbooks (before only the
  // main sheet counted) does not compare with today's: the screen says so.
  const stale = raw.some((f) => f.baseline?.counts && f.baseline.counts.v !== ANALYSIS_VERSION);

  // The province matrix — the old tracker's tracking_v3 sheet, live: per
  // province (and per 2027 list) the firms, set-aside rows, permits by kind,
  // the highlighting by colour with its meaning, and the newly issued permits
  // already written in.
  const nowUnits = mergeUnits(raw.map((f) => f.current?.counts?.units));
  const baseUnits = mergeUnits(raw.map((f) => f.baseline?.counts?.units));
  // The family legend the Developer saved for the season, if any. The old
  // UCD Tracking System's (DEFAULT_LEGEND) no longer stands in for it: its
  // meanings were that sheet's, not the RAW files' (the colours are named
  // one by one now: rawColourNames).
  const legend = normaliseLegend(season.legend || {});
  const sourceLink = Object.fromEntries((season.sources || []).map((x) => [x.key, x.link]));
  const openOf = (f) => ({ id: f._id, name: f.name, webUrl: f.meta?.webUrl || null, appUrl: f.meta?.appUrl || null, folderUrl: sourceLink[f.source] || null });
  const unitFiles = {};
  for (const f of raw) for (const unit of Object.keys(f.current?.counts?.units || {})) (unitFiles[unit] ||= []).push(openOf(f));
  const order = (u) => {
    const i = UNIT_ORDER.indexOf(u);
    return i < 0 ? UNIT_ORDER.length : i;
  };
  const matrix = [...new Set([...Object.keys(nowUnits), ...Object.keys(baseUnits)])]
    .filter((u) => groupOfUnit(u) !== 'other' && (nowUnits[u]?.rows || 0) + (baseUnits[u]?.rows || 0) > 0)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((unit) => {
      const u = nowUnits[unit] || {};
      const b = baseUnits[unit] || {};
      // The highlighting by colour family, each shade of it listed under it.
      const families = {};
      for (const [rgb, rows] of Object.entries(u.rowColors || {})) {
        const fam = colourFamily(rgb);
        const f = (families[fam] ||= { family: fam, rows: 0, shades: [] });
        f.rows += rows;
        f.shades.push({ rgb, rows });
      }
      const baseFamilies = {};
      for (const [rgb, rows] of Object.entries(b.rowColors || {})) baseFamilies[colourFamily(rgb)] = (baseFamilies[colourFamily(rgb)] || 0) + rows;
      const p = byProvince[unit] || {};
      const base = u.base ?? u.rows ?? 0;
      return {
        unit,
        group: groupOfUnit(unit),
        rows: u.rows || 0,
        base,
        added: { erms: u.added?.erms || 0, ecconline: u.added?.ecconline || 0, other: u.added?.other || 0 },
        baselineRows: b.rows || 0,
        review: u.review || 0,
        reviewSheets: u.reviewSheets || {},
        pending: { erms: u.pending?.erms || 0, ecconline: u.pending?.ecconline || 0, other: u.pending?.other || 0 },
        duplicate: u.duplicate || 0,
        delisting: u.delisting || 0,
        deletion: u.deletion || 0,
        permits: u.permits || {},
        addedPermits: u.addedPermits || {},
        pendingPermits: u.pendingPermits || {},
        addedPermitsBy: { erms: u.addedPermitsBy?.erms || 0, ecconline: u.addedPermitsBy?.ecconline || 0, other: u.addedPermitsBy?.other || 0 },
        addedPermitsByKind: { erms: u.addedPermitsByKind?.erms || {}, ecconline: u.addedPermitsByKind?.ecconline || {}, other: u.addedPermitsByKind?.other || {} },
        issuedByKind: p.byKind || {},
        // The Data Visualization tab's counts.
        classes: u.classes || {},
        cities: u.cities || {},
        eccYears: u.eccYears || {},
        // The workbook(s) the unit is read from, to open in Excel.
        files: unitFiles[unit] || [],
        baselinePermits: b.permits || {},
        withPermit: u.withPermit || 0,
        colored: u.colored || 0,
        coloredBase: u.coloredBase ?? u.colored ?? 0,
        baselineColored: b.colored || 0,
        coloredPermit: u.coloredPermit || 0,
        // Baseline firms no one has highlighted yet.
        notModified: Math.max(0, base - (u.coloredBase ?? u.colored ?? 0)),
        colours: Object.values(families)
          .sort((x, y) => FAMILIES.indexOf(x.family) - FAMILIES.indexOf(y.family))
          .map((f) => ({ ...f, shades: f.shades.sort((x, y) => y.rows - x.rows), baseline: baseFamilies[f.family] || 0, label: legend[unit]?.[f.family] || null })),
        // The very fills the RAW file's main sheet uses, as Excel shows them (no
        // shades merged): each with its rows, its rows at the baseline, and the
        // name the Developer gave it (rawColourNameOf).
        fills: Object.entries(u.rowColors || {})
          .map(([rgb, rows]) => ({ rgb, rows, family: colourFamily(rgb), baseline: b.rowColors?.[rgb] || 0, label: rawColourNameOf(season.rawColourNames, unit, rgb) }))
          .sort((x, y) => y.rows - x.rows || x.rgb.localeCompare(y.rgb)),
        issued: p.issued || 0,
        inRaw: p.inRaw || 0,
        // Of the newly issued: highlighted on their lists, and of those really in the RAW data.
        issuedColored: p.colored || 0,
        issuedColoredInRaw: p.coloredInRaw || 0,
        // …by colour family, as the workshop's legend reads them (masterlistLegend).
        issuedFamilies: p.families || {},
        // …within each universe (plan: the Monitoring Plan; healthcare: Healthcare / TSD / TRC).
        issuedScopes: p.scopes || {},
      };
    });

  // Validation: the RAW rows coloured without their newly issued permits, the
  // permits coloured on their lists without being in the RAW data, per file,
  // and the bulk-colouring warnings. The Developer's screen only.
  const validation = { flagged: 0, unchanged: 0, unencoded: 0, bulk: events.filter((e) => e.kind === 'warning' && e.check === 'bulk').length, files: [] };
  for (const f of [...raw, ...counted]) {
    const v = f.validation;
    if (!v?.flagged) continue;
    if (f.kind === 'permits') validation.unencoded += v.flagged;
    else validation.flagged += v.flagged;
    validation.unchanged += v.unchanged || 0;
    validation.files.push({
      id: f._id,
      name: f.name,
      kind: f.kind,
      units: f.kind === 'permits' ? Object.keys(f.current?.counts?.provinces || {}).filter((p) => p !== '(none)') : Object.keys(f.current?.counts?.units || {}).filter((u) => groupOfUnit(u) !== 'other'),
      open: openOf(f),
      modifiedBy: f.meta?.modifiedBy || null,
      at: v.at,
      flagged: v.flagged,
      unchanged: v.unchanged || 0,
      rows: v.rows || [],
    });
  }
  validation.files.sort((a, b) => b.flagged - a.flagged);

  // A file as the Files tab shows it: its reading's counts and sheets, not the
  // per-unit and per-province detail the matrix and the summary already carry
  // (half the page's weight, sent on every refresh of every open screen).
  const slimCounts = (c) =>
    c && {
      rows: c.rows,
      base: c.base,
      added: c.added,
      colored: c.colored,
      coloredPermit: c.coloredPermit,
      withPermit: c.withPermit,
      permits: c.permits,
      byKind: c.byKind,
      landfills: c.landfills,
      mainSheet: c.mainSheet,
      sheets: c.sheets,
      // Which units the file holds (the Files tab groups by them), without their figures.
      units: Object.fromEntries(Object.keys(c.units || {}).map((u) => [u, true])),
    };
  const publicFile = (f) => ({
    id: f._id,
    source: f.source,
    sourceLabel: f.sourceLabel,
    kind: f.kind,
    path: f.path,
    name: f.name,
    reference: f.reference,
    copyOf: f.copyOf || null,
    missing: f.missing,
    meta: f.meta,
    open: openOf(f),
    baseline: f.baseline && { at: f.baseline.at, version: f.baseline.version },
    current: f.current && {
      at: f.current.at,
      version: f.current.version,
      inRaw: f.current.inRaw,
      counts: slimCounts(f.current.counts),
      compare: f.current.compare && { ...f.current.compare, addedSerials: undefined, modifiedSerials: undefined },
    },
  });

  const { lease, ...s } = season;
  return {
    season: { ...s, id: sid, open: isOpen(season), watched: isWatched(season), preSeason: isPreSeason(season), baselineStale: stale },
    seasons: seasons.map((x) => ({ id: String(x._id), name: x.name, status: x.status, startsAt: x.startsAt, endsAt: x.endsAt })),
    summary,
    matrix,
    // The healthcare lists by kind of permit, duplicates removed (healthcarePermits).
    healthcarePermits: healthcarePermits(sid),
    // The workbooks someone is editing now (Excel saved them in the last minutes).
    editing: editingNow(files),
    // VERA's tracking notes: what stands out, as plain sentences.
    notes: notesFor({ matrix, summary, stale, legend }),
    legend,
    families: FAMILIES,
    // What each colour on the newly issued lists means (the workshop's rule),
    // and the Developer's names for the colours the workshop does not use.
    masterlistLegend: MASTERLIST_LEGEND,
    masterlistNames: season.masterlistNames || {},
    files: files.filter((f) => !notTracked(f)).map(publicFile),
    events: events.map(({ _id, ...e }) => ({ id: String(_id), ...e })),
    validation,
    defaults: { sources: DEFAULT_SOURCES },
    map: mapConfig(),
  };
}

/** The season's colour legend: { unit: { family: meaning } }. */
async function setLegend(id, input) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('The legend must list meanings by province and colour.'), { status: 400 });
  const legend = {};
  for (const [unit, colours] of Object.entries(input).slice(0, 30)) {
    if (!colours || typeof colours !== 'object') continue;
    const name = String(unit).slice(0, 40);
    for (const [fam, label] of Object.entries(colours)) {
      const text = String(label ?? '').trim().slice(0, 80);
      const to = MERGED[fam] || fam;
      if (FAMILIES.includes(to) && text) (legend[name] ||= {})[to] = text;
    }
  }
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { legend, legendUpdatedAt: new Date() } });
  broadcast(String(s._id));
  return legend;
}

// A RAW file's colour names: per province, or for every province ('*'); a
// province's own name wins.
const ALL_UNITS = '*';
const rawColourNameOf = (names, unit, rgb) => names?.[unit]?.[rgb] || names?.[ALL_UNITS]?.[rgb] || null;

/**
 * Name one colour of the RAW files' main sheets — what it means when a row is
 * filled with it. `unit`: the province (or list) it is named for; `allUnits`:
 * for every province instead (its own names for the colour taken off). An
 * empty label takes the name off. Stored on the season: rawColourNames
 * { unit | '*': { RGB: label } }.
 */
async function setRawColourName(id, input) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  const rgb = String(input?.rgb || '').replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(rgb)) throw Object.assign(new Error('Name a colour by its RGB (e.g. FFFF00).'), { status: 400 });
  const unit = String(input?.unit || '').trim().slice(0, 40);
  if (!input?.allUnits && (!unit || unit === ALL_UNITS)) throw Object.assign(new Error('Say which province the name is for.'), { status: 400 });
  const label = String(input?.label ?? '').trim().slice(0, 80);
  const names = JSON.parse(JSON.stringify(s.rawColourNames || {}));
  const put = (key) => {
    if (label) (names[key] ||= {})[rgb] = label;
    else if (names[key]) delete names[key][rgb];
    if (names[key] && !Object.keys(names[key]).length) delete names[key];
  };
  if (input?.allUnits) {
    put(ALL_UNITS);
    // Every province reads the shared name from now on.
    for (const key of Object.keys(names)) if (key !== ALL_UNITS && names[key]?.[rgb] !== undefined) {
      delete names[key][rgb];
      if (!Object.keys(names[key]).length) delete names[key];
    }
  } else {
    put(unit);
  }
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { rawColourNames: names, rawColourNamesUpdatedAt: new Date() } });
  broadcast(String(s._id));
  return names;
}

/**
 * The Developer's names for the colours on the newly issued lists that the
 * workshop's legend does not use (blue, purple, gray): { family:
 * name }. Named, not judged — the RAW data is not held against them. An empty
 * name takes the name off.
 */
async function setMasterlistNames(id, input) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('The names must be given by colour.'), { status: 400 });
  const names = {};
  for (const [fam, label] of Object.entries(input)) {
    const to = MERGED[fam] || fam;
    const text = String(label ?? '').trim().slice(0, 60);
    // Not the workshop's own (MASTERLIST_LEGEND).
    if (FAMILIES.includes(to) && !MASTERLIST_LEGEND[to] && text) names[to] = text;
  }
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { masterlistNames: names, masterlistNamesUpdatedAt: new Date() } });
  broadcast(String(s._id));
  return names;
}

// --- the workbooks being edited now ---------------------------------------------
//
// SharePoint does not say, through a shared link, who has a workbook open.
// But Excel saves an open workbook every few seconds while it is edited
// (AutoSave), and each save is a new version the tracker reads. So a file
// saved in the last few minutes is being edited now: the screen shows it
// with its province and who saved it, and it drops off a few minutes after
// the last save.
const EDITING_MS = 5 * 60 * 1000;
function editingNow(files, now = Date.now()) {
  return files
    .filter((f) => !f.missing && !f.reference && f.meta?.modifiedAt && now - new Date(f.meta.modifiedAt).getTime() < EDITING_MS)
    .sort((a, b) => new Date(b.meta.modifiedAt) - new Date(a.meta.modifiedAt))
    .map((f) => ({
      id: f._id,
      name: f.name,
      kind: f.kind,
      units: Object.keys(f.current?.counts?.units || {}).filter((u) => groupOfUnit(u) !== 'other'),
      permitKinds: Object.keys(f.current?.counts?.byKind || {}),
      // A RAW file: the permits of each kind its saves of the last minutes
      // wrote in — "encoding" for those kinds only, not for every kind.
      encoded: f.kind === 'raw' && f.activity?.at && now - new Date(f.activity.at).getTime() < EDITING_MS ? f.activity.kinds || {} : {},
      by: f.meta.modifiedBy || null,
      at: f.meta.modifiedAt,
      version: f.meta.version || null,
    }));
}

/**
 * What a save of a RAW file wrote in: { at, kinds: { kind: permits } } — the
 * permit numbers it holds that the reading before did not, by kind. Saves
 * close together (within the editing window) add up, so a tile stays
 * "encoding" while someone works through a list; a save that wrote no permit
 * keeps the earlier saves' record, which then runs out. After a restart the
 * reading before is not in memory: the counts per kind are compared instead.
 */
function encodingActivity(prev, before, a, meta) {
  const kinds = {};
  if (before?.keys) {
    const had = new Set(before.keys);
    for (const k of a.keys || []) {
      if (had.has(k)) continue;
      const kind = a.keyCells?.[k]?.[0]?.kind || 'other';
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
  } else {
    for (const [kind, now] of Object.entries(a.permits || {})) {
      const d = now - (prev.current?.counts?.permits?.[kind] || 0);
      if (d > 0) kinds[kind] = d;
    }
  }
  const at = meta.modifiedAt || new Date();
  const was = prev.activity;
  const recent = was?.at && new Date(at) - new Date(was.at) < EDITING_MS;
  if (!Object.keys(kinds).length) return recent ? was : null;
  return { at, kinds: recent ? addInto({ ...was.kinds }, kinds) : kinds };
}

// --- the Data Visualization tab's firms (Developer only) -----------------------
//
// The firm table and the map read the main-sheet rows the last look kept in
// the server's memory (analyze.js `records`) — never stored, never on the
// public link. After a restart they return once the files are read again.

/** The rows the last look kept for a season, the ECP list left out. */
function recordsOf(seasonId) {
  const out = [];
  for (const [id, c] of cache) {
    if (!id.startsWith(`${seasonId}:`) || c.kind !== 'raw' || !c.records) continue;
    for (const r of c.records) if (groupOfUnit(r.unit) !== 'other') out.push(r);
  }
  return out;
}
const PERMIT_COLS = ['ecc', 'pto', 'wwdp', 'haz', 'chemical', 'tsd', 'trc', 'pco'];
const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** A page of firms: by province or list, and a search on a permit number, a name or a title. */
async function vizFirms({ season, unit, q, page = 1, pageSize = 25 } = {}) {
  const s = season ? { _id: season } : await currentSeason();
  if (!s) return { total: 0, rows: [], ready: false };
  let rows = recordsOf(String(s._id));
  const ready = rows.length > 0;
  if (unit) rows = unit === 'healthcare' ? rows.filter((r) => groupOfUnit(r.unit) === 'healthcare') : rows.filter((r) => r.unit === unit);
  // In the provinces' order — Aurora first — then the healthcare lists; by serial within each.
  const rank = (u) => {
    const i = UNIT_ORDER.indexOf(u);
    return i < 0 ? UNIT_ORDER.length : i;
  };
  rows = [...rows].sort((a, b) => rank(a.unit) - rank(b.unit) || a.serial.localeCompare(b.serial, undefined, { numeric: true }));
  const text = String(q || '').trim().slice(0, 80);
  if (text) {
    const key = norm(text);
    const lower = text.toLowerCase();
    rows = rows.filter((r) => (key.length >= 3 && PERMIT_COLS.some((k) => norm(r[k]).includes(key))) || String(r.name || '').toLowerCase().includes(lower) || String(r.title || '').toLowerCase().includes(lower) || r.serial.toLowerCase().includes(lower));
  }
  const size = Math.min(100, Math.max(5, Number(pageSize) || 25));
  const current = Math.max(1, Number(page) || 1);
  return { total: rows.length, ready, rows: rows.slice((current - 1) * size, current * size).map(({ lat, lng, ...r }) => r) };
}

/** The firms' coordinates for the map, coloured by province: [lat, lng, unit index, serial]. At most `max`, evenly sampled. */
async function vizPoints({ unit, max = 30000, seasonId = null } = {}) {
  const s = seasonId ? { _id: seasonId } : await currentSeason();
  if (!s) return { units: [], points: [], total: 0 };
  let rows = recordsOf(String(s._id)).filter((r) => r.lat && r.lng && r.lat > 4 && r.lat < 22 && r.lng > 116 && r.lng < 127);
  if (unit) rows = unit === 'healthcare' ? rows.filter((r) => groupOfUnit(r.unit) === 'healthcare') : rows.filter((r) => r.unit === unit);
  const units = [...new Set(rows.map((r) => r.unit))];
  const step = Math.max(1, Math.ceil(rows.length / max));
  const points = [];
  for (let i = 0; i < rows.length; i += step) points.push([rows[i].lat, rows[i].lng, units.indexOf(rows[i].unit), rows[i].serial]);
  return { units, points, total: rows.length, sampled: step > 1 };
}

/**
 * The 2026 IIS reference numbers of a province's firms, by serial, from the
 * RAW files the open season reads — for the register's Monitoring Status,
 * which has only 2024 and 2025. { serial: "IIS no." }.
 */
async function rawIis(province) {
  await connectToMongo();
  const season = await currentSeason();
  if (!season) return {};
  const unit = String(province || '').trim().replace(/\s+/g, '_').toLowerCase();
  const files = await db()
    .collection(FILES)
    .find({ season: String(season._id), kind: 'raw', missing: { $ne: true } }, { projection: { 'current.iis': 1, 'current.counts.units': 1 } })
    .toArray();
  const out = {};
  for (const f of files) {
    const units = Object.keys(f.current?.counts?.units || {}).map((u) => u.toLowerCase());
    if (unit && !units.includes(unit)) continue;
    Object.assign(out, f.current?.iis || {});
  }
  return out;
}

/** One firm, for the map's floating card. */
async function vizFirm(serial, seasonId = null) {
  const s = seasonId ? { _id: seasonId } : await currentSeason();
  const r = s && recordsOf(String(s._id)).find((x) => x.serial === String(serial || ''));
  if (!r) throw Object.assign(new Error('That firm is not in the files the tracker last read.'), { status: 404 });
  return r;
}

/**
 * The map's settings for the page: the MapTiler key from the server's .env
 * (MAPTILER_KEY, or VITE_MAPTILER_KEY as it may be named there), so it lives
 * in one place and changes with a restart, not a rebuild. A map key is
 * always readable in the browser — MapTiler restricts it to our website's
 * address (its "Allowed HTTP origins") — so sending it is not a leak.
 */
function mapConfig() {
  const key = String(process.env.MAPTILER_KEY || process.env.VITE_MAPTILER_KEY || '').trim();
  return { maptilerKey: /^[A-Za-z0-9_-]{8,80}$/.test(key) ? key : null };
}

// --- colouring the encoded permits in the RAW files ------------------------------
//
// The tracker does not write to the RAW files: their link is "view" only, and
// rewriting a workbook here would lose its fills and collide with AutoSave.
// It says, per RAW file, which cells hold a newly issued permit already
// encoded — sheet, column, row, the permit number, the fill the cell has —
// and the page turns that into an Office Script a Planning Unit member runs
// in Excel for the web, under their own account.

/** Per RAW file, the cells holding a newly issued permit already encoded. */
async function colourTargets(seasonId = null) {
  const s = seasonId ? { _id: seasonId } : await currentSeason();
  if (!s) return { files: [] };
  const sid = String(s._id);
  // The newly issued permits (not the reference extracts), with their kind and list.
  const issued = new Map(); // key -> { kind, type }
  for (const [id, c] of cache) {
    if (!id.startsWith(`${sid}:`) || c.kind !== 'permits' || c.reference || c.copyOf) continue;
    for (const k of c.keys) if (!issued.has(k)) issued.set(k, { kind: c.keyKind?.[k] || 'other', type: c.keyType?.[k] || null });
  }
  const docs = await db().collection(FILES).find({ season: sid, kind: 'raw', missing: { $ne: true } }, { projection: { name: 1, meta: 1, 'current.counts.units': 1 } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));
  const files = [];
  for (const [id, c] of cache) {
    if (!id.startsWith(`${sid}:`) || c.kind !== 'raw' || !c.keyCells) continue;
    const d = byId.get(id);
    if (!d) continue;
    const units = Object.keys(d.current?.counts?.units || {}).filter((u) => groupOfUnit(u) !== 'other');
    if (!units.length) continue;
    const targets = [];
    for (const [k, cells] of Object.entries(c.keyCells)) {
      const hit = issued.get(k);
      if (!hit) continue;
      for (const cell of cells) targets.push({ ...cell, permit: k, listKind: hit.kind, status: c.keySource?.[k] && c.keySource[k] !== 'base' ? 'firmNew' : hit.type === 'renewal' ? 'updated' : 'new' });
    }
    if (!targets.length) continue;
    targets.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row);
    files.push({ id, name: d.name, units, version: d.meta?.version || null, webUrl: d.meta?.webUrl || null, targets });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, ready: files.length > 0 || [...cache.keys()].some((k) => k.startsWith(`${sid}:`)) };
}

// --- one kind of newly issued permit, list by list (Developer only) ---------------
//
// The Highlighting tab's "See more": for each newly issued list of the kind,
// every permit on it — where it sits, whom it was issued to, its colour, and
// where it stands against the RAW data (analyze.js permitStatus) — from the
// readings kept in memory. Permit numbers and firms: never on the public link.

/** { kind, legend, files: [{ id, name, open, …, issued, byStatus, byFamily, rows }], ready }. */
async function issuedDetail(kind, seasonId = null) {
  const s = seasonId ? await db().collection(SEASONS).findOne({ _id: new ObjectId(seasonId) }) : await currentSeason();
  if (!s) return { kind, legend: MASTERLIST_LEGEND, files: [], ready: false };
  const sid = String(s._id);
  const inRaw = new Set();
  const atBaseline = new Set();
  for (const [id, c] of cache) {
    if (!id.startsWith(`${sid}:`) || c.kind !== 'raw') continue;
    for (const k of c.keys || []) inRaw.add(k);
    for (const k of c.baseKeys || []) atBaseline.add(k);
  }
  const hcIndex = seasonHealthcareIndex(sid);
  const docs = await db().collection(FILES).find({ season: sid, kind: 'permits', reference: { $ne: true }, missing: { $ne: true } }, { projection: { name: 1, path: 1, source: 1, meta: 1 } }).toArray();
  const folderOf = Object.fromEntries((s.sources || []).map((x) => [x.key, x.link]));
  const files = [];
  for (const d of docs) {
    const c = cache.get(d._id);
    if (!c || c.copyOf) continue;
    const rows = [];
    const byStatus = {};
    const byFamily = {};
    // The list's rows as counted (analyze.js countedEntries): one line each.
    for (const e of c.entries || []) {
      const k = e.k;
      if ((e.kind || c.keyKind?.[k] || 'other') !== kind) continue;
      const fill = e.fill || null;
      const family = fill ? colourFamily(fill) : null;
      const status = permitStatus(family, inRaw.has(k), atBaseline.has(k));
      byStatus[status] = (byStatus[status] || 0) + 1;
      const f = (byFamily[family || 'none'] ||= { rows: 0, inRaw: 0 });
      f.rows += 1;
      if (inRaw.has(k)) f.inRaw += 1;
      rows.push({
        permit: k,
        firm: e.firm || null,
        // What the permit is for, its industry classification, and where.
        title: e.title || null,
        industry: e.psic || null,
        city: e.city || null,
        province: e.province || null,
        type: e.type || c.keyType?.[k] || null,
        sheet: e.sheet || null,
        row: e.row || null,
        fill,
        family,
        inRaw: inRaw.has(k),
        status,
        // The row's "Healthcare / TSD / TRC Firm" column: true (Yes), false
        // (blank), null (its sheet has no such column); `doubtful`: Yes, yet
        // its PSIC is not of that universe.
        healthcare: e.healthcare ? true : e.reviewed ? false : null,
        // The healthcare list it is counted under (null: the Monitoring Plan's province).
        hcUnit: healthcareUnitOf({ ...e, kind }, hcIndex, c.keyNames?.[k] || []),
        psic: e.psic || null,
        // Marked, yet its PSIC Code names a RAW classification that is not a
        // healthcare one: that classification, for See more to say so.
        psicClass: hcIndex.classify(e.psic)?.label || null,
        doubtful: Boolean(notHealthcareByPsic({ ...e, kind }, hcIndex)),
      });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => String(a.sheet).localeCompare(String(b.sheet)) || (a.row || 0) - (b.row || 0));
    files.push({
      id: d._id,
      name: d.name,
      path: d.path,
      open: { id: d._id, name: d.name, webUrl: d.meta?.webUrl || null, appUrl: d.meta?.appUrl || null, folderUrl: folderOf[d.source] || null },
      version: d.meta?.version || null,
      modifiedBy: d.meta?.modifiedBy || null,
      modifiedAt: d.meta?.modifiedAt || null,
      issued: rows.length,
      byStatus,
      byFamily,
      rows,
    });
  }
  files.sort((a, b) => b.issued - a.issued);
  return {
    kind,
    legend: MASTERLIST_LEGEND,
    names: s.masterlistNames || {},
    // The PSIC basis, to show: the RAW data's classifications counted as healthcare ones.
    healthcareClasses: hcIndex.classify.healthcareClasses || [],
    files,
    ready: [...cache.keys()].some((k) => k.startsWith(`${sid}:`)),
  };
}

// --- the public link ---------------------------------------------------------
//
// The Developer can let people without an E-Universe account follow the
// season: a link with an unguessable token, on or off, with an end date, and
// given a new token at will (which stops the old link at once). Anyone with
// the link sees the FIGURES only — the summary, the charts and the tables:
// no file name or path, no SharePoint or Excel link, no one's name, no
// activity, no settings, and no VERA.

const newToken = () => crypto.randomBytes(18).toString('base64url');
const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;
const shareOpen = (share, now = new Date()) => Boolean(share?.enabled && share.token && (!share.expiresAt || new Date(share.expiresAt) > now));

/** Change a season's public link: { enabled, expiresAt (null: no end), regenerate }. */
async function setShare(id, input = {}, user) {
  await connectToMongo();
  const s = ObjectId.isValid(id) ? await db().collection(SEASONS).findOne({ _id: new ObjectId(id) }) : null;
  if (!s) throw Object.assign(new Error('No such season.'), { status: 404 });
  const was = s.share || {};
  const expiresAt = input.expiresAt === null || input.expiresAt === '' ? null : input.expiresAt !== undefined ? toDate(input.expiresAt) : was.expiresAt || null;
  if (input.expiresAt && !expiresAt) throw Object.assign(new Error('The end date is not a date.'), { status: 400 });
  // Only a date being set must be ahead; an old one that passed is kept as it
  // is (the link then shows "not available" until a later date is set).
  if (input.expiresAt && expiresAt <= new Date()) throw Object.assign(new Error('The end date must be in the future.'), { status: 400 });
  const share = {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : Boolean(was.enabled),
    token: input.regenerate || !was.token ? newToken() : was.token,
    expiresAt,
    updatedAt: new Date(),
    updatedBy: user?.username || null,
    createdAt: input.regenerate || !was.token ? new Date() : was.createdAt || new Date(),
  };
  await db().collection(SEASONS).updateOne({ _id: s._id }, { $set: { share } });
  invalidate();
  return share;
}

/** The season a public link opens — or a 404 that does not say why. */
async function sharedSeason(token) {
  const gone = Object.assign(new Error('This link is not available. It may have been turned off or replaced.'), { status: 404 });
  if (!TOKEN_RE.test(String(token || ''))) throw gone;
  await connectToMongo();
  const s = await db().collection(SEASONS).findOne({ 'share.token': String(token) }, { projection: { _id: 1, share: 1 } });
  if (!s || !shareOpen(s.share)) throw gone;
  return s;
}

/** The map's dots for the public link: a place and a province each, nothing more. */
async function publicPoints(token, unit) {
  const s = await sharedSeason(token);
  return vizPoints({ unit, seasonId: String(s._id) });
}

/**
 * One firm for the public map's card: what it is and where — its project,
 * industry, municipality and province, the kinds of permit it holds and its
 * source. Not the proponent (often a person), the street address or the
 * permit numbers.
 */
async function publicFirm(token, serial) {
  const s = await sharedSeason(token);
  const r = await vizFirm(serial, String(s._id));
  return {
    serial: r.serial,
    unit: r.unit,
    title: r.title,
    industry: r.industry,
    city: r.city,
    province: r.province || r.unit.replace(/_/g, ' '),
    source: r.source,
    holds: PERMIT_COLS.filter((k) => r[k]),
  };
}

/** The season's figures for the public link — or a 404 that does not say why. */
async function publicOverview(token) {
  const s = await sharedSeason(token);
  const o = await overview(String(s._id));
  const season = o.season;
  return {
    season: {
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      open: season.open,
      preSeason: season.preSeason,
      status: season.status,
      checkedAt: season.lastPoll?.at || null,
      baselineAt: season.baselineAt || null,
      baselineStale: season.baselineStale,
      linkExpiresAt: s.share.expiresAt || null,
    },
    summary: o.summary,
    // The figures per province and list, without the workbooks behind them.
    matrix: o.matrix.map(({ files, ...u }) => u),
    // The counts only: no permit number, no serial.
    healthcarePermits: o.healthcarePermits && { ...o.healthcarePermits, duplicates: [] },
    notes: o.notes.map(({ ask, ...n }) => n),
    // Being updated now: the province or list, or the kind of permit list — not the file or who.
    editing: (o.editing || []).map((e) => ({ kind: e.kind, units: e.units, permitKinds: e.permitKinds, encoded: e.encoded, at: e.at })),
    legend: o.legend,
    families: o.families,
    masterlistLegend: o.masterlistLegend,
    masterlistNames: o.masterlistNames,
    map: o.map,
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
  await db().collection(SEASONS).createIndex({ 'share.token': 1 }, { sparse: true });
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
  setLegend,
  setMasterlistNames,
  setRawColourName,
  setShare,
  publicOverview,
  vizFirms,
  vizPoints,
  vizFirm,
  rawIis,
  colourTargets,
  issuedDetail,
  editingNow,
  publicPoints,
  publicFirm,
  shareOpen,
  currentSeason,
  ensureIndexes,
  compareRaw,
  checkValidation,
  noticeOf,
  warnDevelopers,
  isOpen,
  isWatched,
  isPreSeason,
  colourFamily,
  DEFAULT_LEGEND,
  _cache: cache,
  _healthcarePermits: healthcarePermits,
};
