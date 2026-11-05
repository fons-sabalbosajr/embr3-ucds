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
//   VERA_CACHE_MAX                entries kept, for the chat and for the other
//                                 model calls each (default 500, oldest dropped)
//   VERA_CACHE_SIMILARITY         0..1, default 0.8
//
// Every other model call (29 Oct 2026) — the checks and tools — is kept here
// too, by provider.complete(): a check run twice no longer pays twice.
//   - Most are written by VERA from data (a list of values, a record, a
//     scan's pages): kept by their exact content — system prompt, prompt,
//     pages, length — since a near list is a different list.
//   - One carrying words a person typed (the table builder's request) is
//     matched as a chat question is, by its stems, AND the rest of the call
//     (the field catalog it is drafted over, the day) must be the same.
// Same switches, lifetime and size as the chat's; partitioned by tool.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

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
// The chat and the other model calls are counted apart: a batch of scans read
// (hundreds of entries in one go) must not push out what people have asked.
const sizes = { chat: 0, tools: 0 };
const poolOf = (partition) => (partition.startsWith('model|') ? 'tools' : 'chat');
let born = 0;
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

/** The oldest entry of a pool: each partition's first is its oldest. */
function oldestIn(pool) {
  let found = null;
  for (const [key, entries] of store) {
    if (poolOf(key) !== pool) continue;
    const [id, entry] = entries.entries().next().value;
    if (!found || entry.born < found.born) found = { key, id, born: entry.born };
  }
  return found;
}

function prune(now) {
  for (const [key, entries] of store) {
    for (const [id, e] of entries) {
      if (e.expires <= now) {
        entries.delete(id);
        sizes[poolOf(key)] -= 1;
      }
    }
    if (!entries.size) store.delete(key);
  }
  for (const pool of Object.keys(sizes)) {
    while (sizes[pool] > MAX_ENTRIES()) {
      const { key, id } = oldestIn(pool);
      const entries = store.get(key);
      entries.delete(id);
      sizes[pool] -= 1;
      if (!entries.size) store.delete(key);
    }
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
  // The same words over other hits (other articles, another catalog) are another entry.
  const id = `${[...q.stems].sort().join(' ')}|${q.hitIds.join(',')}`;
  // Out and in again when it is already there: the end of the partition is the youngest.
  if (!entries.delete(id)) sizes[poolOf(q.partition)] += 1;
  born += 1;
  entries.set(id, { stems: q.stems, negated: q.negated, hitIds: q.hitIds.slice(), answer, expires: now + TTL_MS(), uses: 0, born });
  prune(now);
}

const digest = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/**
 * The cache query for a model call that is not the chat (provider.complete).
 * `semantic`: { question, context } — the words a person typed, and the rest
 * of the call that must match exactly.
 */
function modelQuery(cfg, { feature, tier, system, prompt, documents = [], maxTokens, semantic }) {
  const pages = documents.map((d) => digest(d.mimeType, d.data));
  const partition = ['model', feature, tier, cfg?.updatedAt ? new Date(cfg.updatedAt).getTime() : ''].join('|');
  if (semantic?.question) {
    // Required here, not above: assistant.js requires this module.
    const { tokenize } = require('./assistant');
    return {
      partition,
      stems: new Set(tokenize(semantic.question)),
      negated: NEGATION_RE.test(semantic.question),
      hitIds: [digest(system, semantic.context ?? '', pages, maxTokens)],
    };
  }
  return { partition, stems: new Set([digest(system, prompt, pages, maxTokens)]), negated: false, hitIds: [] };
}

function clear() {
  store.clear();
  sizes.chat = 0;
  sizes.tools = 0;
}

/** Counts only — never a question or an answer — for the settings screen. */
const stats = () => ({ entries: sizes.chat + sizes.tools, hits, misses });

module.exports = { enabled, partitionOf, modelQuery, lookup, remember, clear, stats, NEGATION_RE, jaccard };
