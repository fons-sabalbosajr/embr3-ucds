// ---------------------------------------------------------------------------
// VERA SEMANTIC CACHE — the same question, answered once.
//
// Staff ask the same few things in many wordings ("how do I upload a scan",
// "how to upload scanned file?"). A model answer is kept and handed to the
// next person who asks something close enough, so the second asking costs no
// request and no tokens — which matters on a free tier of 20 requests a day.
//
// "Close enough" is measured on the question's stems (assistant.tokenize: the
// stemmer, synonyms and stop words retrieval already uses), as Jaccard
// similarity, AND the help articles retrieved for it must be the same ones.
// The second condition is what keeps a near-miss from being served: two
// questions that pull different articles get different answers.
//
// What is never cached, so nothing personal or live is ever shared:
//   - an answer that used LIVE FIGURES or a record search (per person, live)
//   - an answer to a follow-up (it depends on that conversation)
//   - anything but a model answer (guards and the help library cost nothing)
// and every entry is partitioned by who may see it — realm, role, domains,
// ERMS unit, screen — so a Developer's answer never reaches an Encoder.
//
// Process memory only: nothing about a question is written anywhere, as
// before (veraController logs metadata, never the question or the answer).
//   VERA_SEMANTIC_CACHE=false     off
//   VERA_CACHE_TTL_MS             how long an answer is kept (default 12 h)
//   VERA_CACHE_MAX                entries kept (default 500, oldest dropped)
//   VERA_CACHE_SIMILARITY         0..1, default 0.8
// ---------------------------------------------------------------------------

const num = (v, fallback) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));
const TTL_MS = () => num(process.env.VERA_CACHE_TTL_MS, 12 * 60 * 60 * 1000);
const MAX_ENTRIES = () => num(process.env.VERA_CACHE_MAX, 500);
const THRESHOLD = () => Math.min(1, Math.max(0.5, num(process.env.VERA_CACHE_SIMILARITY, 0.8)));

const enabled = (cfg) => cfg?.semanticCache !== false && String(process.env.VERA_SEMANTIC_CACHE || '').toLowerCase() !== 'false';

// "Can I delete it" and "can't I delete it" share every stem but one; a
// negation on one side only is never a match.
const NEGATION_RE = /\b(not|no|never|cannot|can'?t|don'?t|doesn'?t|won'?t|isn'?t|aren'?t|wasn'?t|without|hindi|wala)\b/i;

/** partition -> Map(id -> entry). Insertion order doubles as age. */
const store = new Map();
let size = 0;
let hits = 0;
let misses = 0;

/** Who may see an answer: entries never cross these lines. */
function partitionOf(ctx, page, cfg) {
  return [
    ctx.realm,
    ctx.role,
    ctx.portal ? 'portal' : '',
    (ctx.domains || []).slice().sort().join('+'),
    ctx.ermsUnit || '',
    String(page || '').toLowerCase(),
    // A settings change (support contact, welcome text, model) starts afresh.
    cfg?.updatedAt ? new Date(cfg.updatedAt).getTime() : '',
  ].join('|');
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  return common / (a.size + b.size - common);
}

const sameHits = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

function prune(now) {
  for (const [key, entries] of store) {
    for (const [id, e] of entries) {
      if (e.expires <= now) {
        entries.delete(id);
        size -= 1;
      }
    }
    if (!entries.size) store.delete(key);
  }
  while (size > MAX_ENTRIES()) {
    const [key, entries] = store.entries().next().value;
    const [oldest] = entries.keys();
    entries.delete(oldest);
    size -= 1;
    if (!entries.size) store.delete(key);
  }
}

/**
 * A cached answer for this question, or null.
 * @param {{partition: string, stems: Set<string>, negated: boolean, hitIds: string[]}} q
 */
function lookup(q) {
  const entries = store.get(q.partition);
  const now = Date.now();
  let best = null;
  let bestScore = 0;
  if (entries) {
    for (const e of entries.values()) {
      if (e.expires <= now || e.negated !== q.negated || !sameHits(e.hitIds, q.hitIds)) continue;
      const score = jaccard(e.stems, q.stems);
      if (score > bestScore) {
        best = e;
        bestScore = score;
      }
    }
  }
  if (best && bestScore >= THRESHOLD()) {
    hits += 1;
    best.uses += 1;
    return { answer: best.answer, similarity: bestScore };
  }
  misses += 1;
  return null;
}

function remember(q, answer) {
  if (!answer || !q.stems.size) return;
  const now = Date.now();
  let entries = store.get(q.partition);
  if (!entries) {
    entries = new Map();
    store.set(q.partition, entries);
  }
  const id = [...q.stems].sort().join(' ');
  if (!entries.has(id)) size += 1;
  entries.set(id, { stems: q.stems, negated: q.negated, hitIds: q.hitIds.slice(), answer, expires: now + TTL_MS(), uses: 0 });
  prune(now);
}

function clear() {
  store.clear();
  size = 0;
}

/** Counts only — never a question or an answer — for the settings screen. */
const stats = () => ({ entries: size, hits, misses });

module.exports = { enabled, partitionOf, lookup, remember, clear, stats, NEGATION_RE, jaccard };
