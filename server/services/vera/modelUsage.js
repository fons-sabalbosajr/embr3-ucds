// ---------------------------------------------------------------------------
// VERA MODEL USAGE — every call to a model, counted, for the Models tab of
// Admin Settings › VERA Assistant.
//
// provider.complete() reports each attempt here: which model, whether it
// answered, the mapped failure code, the tokens and how long it took. The
// counts are kept per model per hour (UTC), so the screen can show any day
// in Manila time and, separately, the use inside a provider's quota window
// (Gemini's free tier resets at midnight Pacific time).
//
// Written in batches: the increments gather in memory and go to the database
// every FLUSH_MS as one bulkWrite — never a write per call on a shared free
// cluster with an operations-per-second limit. Buckets expire after
// KEEP_DAYS (a TTL index). Nothing about a question or an answer is kept:
// counts, tokens, durations and failure codes only.
//
// Also remembered in memory: the last success and failure of each model, and
// the daily request limit a provider stated in its last quota refusal
// (Gemini: "limit: 20, model: gemini-2.5-flash").
// ---------------------------------------------------------------------------

// Loaded when first needed: the provider (and so this file) is also used by
// scripts and tests that never connect.
const getDb = () => require('../../config/db').getDb();

const COLLECTION = 'vera-model-usage';
const FLUSH_MS = 30 * 1000;
const KEEP_DAYS = 35;
const HOUR = 60 * 60 * 1000;

const pending = new Map(); // `${hour}|${provider}|${model}` -> increments
const live = new Map(); // `${provider}|${model}` -> { lastOkAt, lastErrorAt, lastErrorCode, limitSeen, limitSeenAt }
let timer = null;
let indexed = false;

const keyOf = (provider, model) => `${provider}|${model}`;
const hourOf = (t) => new Date(Math.floor(t / HOUR) * HOUR);

/**
 * One attempt at a model.
 * @param {{provider, model, ok, code?, inputTokens?, outputTokens?, ms?, feature?, limit?}} a
 */
function record(a) {
  if (!a?.provider || !a?.model) return;
  const now = Date.now();
  const hour = hourOf(now);
  const k = `${hour.getTime()}|${a.provider}|${a.model}`;
  const inc = pending.get(k) || { at: hour, provider: a.provider, model: a.model, calls: 0, ok: 0, failed: 0, inputTokens: 0, outputTokens: 0, ms: 0, codes: {}, features: {} };
  inc.calls += 1;
  if (a.ok) inc.ok += 1;
  else {
    inc.failed += 1;
    const code = String(a.code || 'unknown').replace(/[^a-z_]/gi, '');
    inc.codes[code] = (inc.codes[code] || 0) + 1;
  }
  inc.inputTokens += a.inputTokens || 0;
  inc.outputTokens += a.outputTokens || 0;
  inc.ms += a.ms || 0;
  const feature = String(a.feature || 'other').replace(/[^a-z_-]/gi, '');
  inc.features[feature] = (inc.features[feature] || 0) + 1;
  pending.set(k, inc);

  const l = live.get(keyOf(a.provider, a.model)) || {};
  if (a.ok) l.lastOkAt = new Date(now);
  else Object.assign(l, { lastErrorAt: new Date(now), lastErrorCode: a.code || 'unknown' });
  if (a.limit) Object.assign(l, { limitSeen: a.limit, limitSeenAt: new Date(now) });
  live.set(keyOf(a.provider, a.model), l);
  changed();

  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, FLUSH_MS);
    if (timer.unref) timer.unref();
  }
}

/**
 * The quota a provider reports on each response (Groq: requests left today,
 * tokens left this minute). Kept in memory with the time it was read.
 */
function limits(provider, model, l) {
  if (!l || (l.requestsPerDay == null && l.tokensPerMinute == null)) return;
  const k = keyOf(provider, model);
  live.set(k, { ...(live.get(k) || {}), reported: { ...l, at: new Date() } });
}

// Browsers with the Models tab open hear that something changed (the
// "vera:usage" notice, no data in it) and reload — at most every 5 seconds.
let lastNotice = 0;
let noticeTimer = null;
function changed() {
  if (noticeTimer) return;
  const wait = Math.max(0, lastNotice + 5000 - Date.now());
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    lastNotice = Date.now();
    try {
      require('../notifier').broadcast('vera:usage', { at: new Date().toISOString() });
    } catch {
      /* no socket server (a script, a test) */
    }
  }, wait);
  if (noticeTimer.unref) noticeTimer.unref();
}

/** Write what has gathered, as one bulkWrite. */
async function flush() {
  if (!pending.size) return;
  const batch = [...pending.values()];
  pending.clear();
  let db;
  try {
    db = getDb();
  } catch {
    return; // not connected (a script, a test): the counts stay in memory only
  }
  const col = db.collection(COLLECTION);
  if (!indexed) {
    indexed = true;
    col.createIndex({ at: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 3600 }).catch(() => {});
  }
  await col.bulkWrite(
    batch.map((b) => {
      const $inc = { calls: b.calls, ok: b.ok, failed: b.failed, inputTokens: b.inputTokens, outputTokens: b.outputTokens, ms: b.ms };
      for (const [c, n] of Object.entries(b.codes)) $inc[`codes.${c}`] = n;
      for (const [f, n] of Object.entries(b.features)) $inc[`features.${f}`] = n;
      return {
        updateOne: {
          filter: { _id: `${b.at.getTime()}|${b.provider}|${b.model}` },
          update: { $setOnInsert: { at: b.at, provider: b.provider, model: b.model }, $inc },
          upsert: true,
        },
      };
    }),
    { ordered: false }
  );
}

// ── Reading ──────────────────────────────────────────────────────────────────

const MANILA = 'Asia/Manila';
const PACIFIC = 'America/Los_Angeles';

/** The offset of `tz` from UTC at `t`, in ms. */
function offsetOf(tz, t) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** The last and next midnight in `tz` around `t`, as UTC times. */
function dayBounds(tz, t = Date.now()) {
  const off = offsetOf(tz, t);
  const local = t + off;
  const startLocal = Math.floor(local / (24 * HOUR)) * 24 * HOUR;
  const start = startLocal - off;
  // A day either side of a daylight-saving change is 23 or 25 hours: re-read the offset there.
  const next = startLocal + 24 * HOUR - offsetOf(tz, start + 26 * HOUR);
  return { start, next };
}

/** "2026-10-28" for `t` in `tz`. */
const dayIn = (tz, t) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

/** When each provider's daily quota starts again. */
function quotaWindows(now = Date.now()) {
  const pacific = dayBounds(PACIFIC, now);
  return {
    gemini: { start: new Date(pacific.start), resetsAt: new Date(pacific.next), note: 'Gemini free-tier requests per day reset at midnight Pacific time.' },
    anthropic: { start: null, resetsAt: null, note: 'Anthropic limits are per minute and refill continuously; spending draws on the account’s credit.' },
  };
}

/** Hourly buckets since `since`, from the database and what has not been written yet. */
async function bucketsSince(since) {
  let rows = [];
  try {
    rows = await getDb().collection(COLLECTION).find({ at: { $gte: since } }).toArray();
  } catch {
    rows = [];
  }
  const merged = new Map(rows.map((r) => [r._id, { ...r, codes: { ...(r.codes || {}) }, features: { ...(r.features || {}) } }]));
  for (const p of pending.values()) {
    if (p.at < since) continue;
    const id = `${p.at.getTime()}|${p.provider}|${p.model}`;
    const m = merged.get(id) || { _id: id, at: p.at, provider: p.provider, model: p.model, calls: 0, ok: 0, failed: 0, inputTokens: 0, outputTokens: 0, ms: 0, codes: {}, features: {} };
    for (const f of ['calls', 'ok', 'failed', 'inputTokens', 'outputTokens', 'ms']) m[f] += p[f];
    for (const [c, n] of Object.entries(p.codes)) m.codes[c] = (m.codes[c] || 0) + n;
    for (const [c, n] of Object.entries(p.features)) m.features[c] = (m.features[c] || 0) + n;
    merged.set(id, m);
  }
  return [...merged.values()];
}

const empty = () => ({ calls: 0, ok: 0, failed: 0, inputTokens: 0, outputTokens: 0, ms: 0, codes: {}, features: {} });
function add(into, b) {
  for (const f of ['calls', 'ok', 'failed', 'inputTokens', 'outputTokens', 'ms']) into[f] += b[f] || 0;
  for (const [c, n] of Object.entries(b.codes || {})) into.codes[c] = (into.codes[c] || 0) + n;
  for (const [c, n] of Object.entries(b.features || {})) into.features[c] = (into.features[c] || 0) + n;
  return into;
}

/**
 * Everything the Models tab shows.
 * @param {{route: Array<{provider, model, restingUntil, reason}>, roles: Object<string,string>, keys: Object<string,boolean>, days?: number}} opts
 */
/**
 * How much of a model's allowance is left, from the best source there is:
 * what the provider reported on its last response (Groq's headers), the limit
 * it stated in a refusal (Gemini), or its published limit against what VERA
 * counted. Null where nothing is known — never a guess.
 */
function available({ provider, l, window, today, published, now }) {
  const pct = (left, of) => (of ? Math.max(0, Math.min(100, Math.round((left / of) * 100))) : null);
  const rep = l.reported;
  let requests = null;
  if (rep?.requestsPerDay != null && rep?.requestsLeft != null) {
    requests = { left: rep.requestsLeft, of: rep.requestsPerDay, pct: pct(rep.requestsLeft, rep.requestsPerDay), source: 'reported by the provider', at: rep.at, resetIn: rep.requestsReset || null };
  } else if (window && (l.limitSeen || published?.rpd)) {
    const of = l.limitSeen || published.rpd;
    const left = Math.max(0, of - window.calls);
    requests = { left, of, pct: pct(left, of), source: l.limitSeen ? 'limit stated by the provider; use counted by VERA' : 'published limit; use counted by VERA', at: null, resetIn: null };
  } else if (published?.rpd) {
    const left = Math.max(0, published.rpd - today.calls);
    requests = { left, of: published.rpd, pct: pct(left, published.rpd), source: 'published limit; use counted by VERA today', at: null, resetIn: null };
  }
  let tokensPerMinute = null;
  if (rep?.tokensPerMinute != null && rep?.tokensLeft != null) {
    // A minute after the last call the per-minute budget is whole again.
    const fresh = now - new Date(rep.at).getTime() < 60 * 1000;
    const left = fresh ? rep.tokensLeft : rep.tokensPerMinute;
    tokensPerMinute = { left, of: rep.tokensPerMinute, pct: pct(left, rep.tokensPerMinute), source: fresh ? 'reported by the provider' : 'refilled since the last call' };
  } else if (published?.tpm) {
    tokensPerMinute = { left: null, of: published.tpm, pct: null, source: 'published limit' };
  }
  let tokensPerDay = null;
  if (published?.tpd) {
    const used = today.inputTokens + today.outputTokens;
    tokensPerDay = { left: Math.max(0, published.tpd - used), of: published.tpd, pct: pct(published.tpd - used, published.tpd), source: 'published limit; use counted by VERA today (estimate)' };
  }
  return { requests, tokensPerMinute, tokensPerDay, provider };
}

async function report({ route = [], roles = {}, keys = {}, days = 14, info = {}, caps = {} } = {}) {
  const now = Date.now();
  const windows = quotaWindows(now);
  const manila = dayBounds(MANILA, now);
  const since = new Date(manila.start - (days - 1) * 24 * HOUR);
  const buckets = await bucketsSince(new Date(Math.min(since.getTime(), windows.gemini.start.getTime())));

  // The models: the route's, in order, then any other that was used.
  const order = route.map((c) => keyOf(c.provider, c.model));
  for (const b of buckets) if (!order.includes(keyOf(b.provider, b.model))) order.push(keyOf(b.provider, b.model));

  const models = order.map((k) => {
    const [provider, model] = k.split('|');
    const r = route.find((c) => keyOf(c.provider, c.model) === k);
    const mine = buckets.filter((b) => keyOf(b.provider, b.model) === k);
    const today = mine.filter((b) => b.at.getTime() >= manila.start).reduce(add, empty());
    const window = windows[provider]?.start ? mine.filter((b) => b.at.getTime() >= windows[provider].start.getTime()).reduce(add, empty()) : null;
    const period = mine.filter((b) => b.at >= since).reduce(add, empty());
    const l = live.get(k) || {};
    const published = caps[k]?.published || null;
    return {
      provider,
      model,
      info: info[k] || null,
      capabilities: caps[k] || null,
      available: available({ provider, l, window, today, published, now }),
      position: r ? route.indexOf(r) + 1 : null,
      role: roles[k] || (r ? 'fallback' : 'not in use'),
      keyPresent: Boolean(keys[provider]),
      status: !keys[provider] ? 'no-key' : r?.restingUntil ? 'resting' : r ? 'ready' : 'unused',
      restingUntil: r?.restingUntil || null,
      reason: r?.reason || '',
      today: { ...today, avgMs: today.calls ? Math.round(today.ms / today.calls) : null },
      quotaWindow: window ? { calls: window.calls, ok: window.ok, limit: l.limitSeen || null, resetsAt: windows[provider].resetsAt } : null,
      period: { ...period, avgMs: period.calls ? Math.round(period.ms / period.calls) : null },
      lastOkAt: l.lastOkAt || null,
      lastErrorAt: l.lastErrorAt || null,
      lastErrorCode: l.lastErrorCode || null,
    };
  });

  // Per Manila day and model, for the charts.
  const daily = new Map();
  for (const b of buckets) {
    if (b.at < since) continue;
    const d = dayIn(MANILA, b.at.getTime());
    const k = `${d}|${b.model}`;
    daily.set(k, add(daily.get(k) || { day: d, model: b.model, provider: b.provider, ...empty() }, b));
  }
  const dayList = [];
  for (let t = since.getTime(); t <= now; t += 24 * HOUR) dayList.push(dayIn(MANILA, t + 12 * HOUR));

  return {
    now: new Date(now),
    days: [...new Set(dayList)],
    windows,
    models,
    daily: [...daily.values()].map(({ codes, features, ...d }) => ({ ...d, codes, features })),
    totals: models.reduce((t, m) => add(t, m.today), empty()),
  };
}

module.exports = { record, limits, changed, flush, report, quotaWindows, dayBounds, COLLECTION };
