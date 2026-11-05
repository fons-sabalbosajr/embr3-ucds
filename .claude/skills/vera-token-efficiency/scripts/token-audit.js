#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Where VERA's tokens go, measured. Reads vera-model-usage (every model call,
// per hour) and app-logs (every chat answer and where it came from). Counts,
// tokens and article ids only: the logs hold no question or answer.
//
//   node token-audit.js            the last 7 days
//   node token-audit.js --days=30  vera-model-usage keeps 35 days
//
// Reads only, and prints no key. Live cache counters (entries, hits across
// chat and tools) are in the running server's memory, not here: see the Models
// tab or GET /api/vera/models.
// ---------------------------------------------------------------------------

const path = require('path');

const SERVER = path.resolve(__dirname, '../../../../server');
require(path.join(SERVER, 'node_modules/dotenv')).config({ path: path.join(SERVER, '.env'), quiet: true });
const { connectToMongo, getDb, client } = require(path.join(SERVER, 'config/db'));
const usage = require(path.join(SERVER, 'services/vera/modelUsage'));

const daysArg = process.argv.slice(2).find((a) => a.startsWith('--days='));
const DAYS = Number(daysArg?.split('=')[1]) || 7;
const CHATS = ['vera:chat', 'vera:public-chat'];

const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '-');
const k = (n) => Number(n || 0).toLocaleString('en-PH');

async function main() {
  await connectToMongo();
  const db = getDb();
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const logs = db.collection('app-logs');
  const match = { $match: { actionType: { $in: CHATS }, timestamp: { $gte: since } } };
  const opts = { maxTimeMS: 60000 };

  const [buckets, bySource, byTier, byGuard, byArticles, tests] = await Promise.all([
    db.collection(usage.COLLECTION).find({ at: { $gte: since } }).toArray(),
    logs.aggregate([match, { $group: { _id: '$details.source', n: { $sum: 1 } } }, { $sort: { n: -1 } }], opts).toArray(),
    logs
      .aggregate(
        [
          match,
          { $match: { 'details.usedModel': true } },
          { $group: { _id: { tier: '$details.tier', model: '$details.model' }, n: { $sum: 1 }, input: { $sum: '$details.inputTokens' }, output: { $sum: '$details.outputTokens' }, ms: { $sum: '$details.durationMs' } } },
          { $sort: { input: -1 } },
        ],
        opts
      )
      .toArray(),
    logs.aggregate([match, { $match: { 'details.guardrail': { $nin: [null, ''] } } }, { $group: { _id: '$details.guardrail', n: { $sum: 1 } } }], opts).toArray(),
    // Answers the model wrote over the same help articles: the cache's misses
    // and what could not be cached, the place to look for a saving.
    logs
      .aggregate(
        [
          match,
          { $match: { 'details.usedModel': true, 'details.hitIds.0': { $exists: true } } },
          { $group: { _id: '$details.hitIds', n: { $sum: 1 }, tokens: { $sum: { $add: [{ $ifNull: ['$details.inputTokens', 0] }, { $ifNull: ['$details.outputTokens', 0] }] } } } },
          { $match: { n: { $gt: 1 } } },
          { $sort: { tokens: -1 } },
          { $limit: 10 },
        ],
        opts
      )
      .toArray(),
    logs.countDocuments({ actionType: 'vera:test', timestamp: { $gte: since } }, opts),
  ]);
  await client.close();

  console.log(`VERA TOKEN AUDIT: the last ${DAYS} days\n`);

  // ── Every model call ───────────────────────────────────────────────────────
  const models = new Map();
  const features = {};
  for (const b of buckets) {
    const key = `${b.provider} / ${b.model}`;
    const m = models.get(key) || { calls: 0, ok: 0, failed: 0, input: 0, output: 0, ms: 0, codes: {} };
    m.calls += b.calls || 0;
    m.ok += b.ok || 0;
    m.failed += b.failed || 0;
    m.input += b.inputTokens || 0;
    m.output += b.outputTokens || 0;
    m.ms += b.ms || 0;
    for (const [c, n] of Object.entries(b.codes || {})) m.codes[c] = (m.codes[c] || 0) + n;
    for (const [f, n] of Object.entries(b.features || {})) features[f] = (features[f] || 0) + n;
    models.set(key, m);
  }
  const list = [...models].sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output));
  const total = list.reduce((t, [, m]) => ({ calls: t.calls + m.calls, failed: t.failed + m.failed, tokens: t.tokens + m.input + m.output }), { calls: 0, failed: 0, tokens: 0 });

  console.log('EVERY MODEL CALL, BY MODEL (vera-model-usage)');
  if (!list.length) console.log('  none recorded');
  for (const [name, m] of list) {
    console.log(`  ${name}`);
    console.log(`      ${k(m.calls)} calls, ${pct(m.failed, m.calls)} failed${Object.keys(m.codes).length ? ` ${JSON.stringify(m.codes)}` : ''}; ${k(m.input)} in + ${k(m.output)} out; avg ${m.ok ? k(Math.round(m.input / m.ok)) : '-'} in per answer, ${m.calls ? k(Math.round(m.ms / m.calls)) : '-'} ms`);
  }
  console.log(`  TOTAL ${k(total.calls)} calls, ${pct(total.failed, total.calls)} failed, ${k(total.tokens)} tokens`);

  console.log('\nCALLS BY FEATURE (attempts, including failures; tokens are not kept per feature)');
  const featureTotal = Object.values(features).reduce((a, b) => a + b, 0);
  for (const [f, n] of Object.entries(features).sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(14)} ${k(n).padStart(7)}  ${pct(n, featureTotal)}`);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const src = Object.fromEntries(bySource.map((s) => [s._id || 'unknown', s.n]));
  const chats = bySource.reduce((n, s) => n + s.n, 0);
  const free = chats - (src.model || 0);
  console.log('\nCHAT ANSWERS, BY WHERE THEY CAME FROM (app-logs)');
  for (const s of bySource) console.log(`  ${String(s._id || 'unknown').padEnd(10)} ${k(s.n).padStart(7)}  ${pct(s.n, chats)}`);
  console.log(`  Answered without a model: ${k(free)} of ${k(chats)} (${pct(free, chats)})`);
  console.log(`  Cache hit rate, of answers a model would otherwise write: ${pct(src.cache || 0, (src.cache || 0) + (src.model || 0))}`);

  console.log('\nCHAT MODEL ANSWERS, BY TIER');
  for (const t of byTier) {
    const { tier, model } = t._id;
    console.log(`  ${String(tier || '?').padEnd(9)} ${String(model || '?').padEnd(28)} ${k(t.n).padStart(6)} answers; avg ${k(Math.round(t.input / t.n))} in, ${k(Math.round(t.output / t.n))} out, ${k(Math.round(t.ms / t.n))} ms`);
  }

  console.log('\nGUARDRAILS THAT ACTED ON A MODEL ANSWER');
  if (!byGuard.length) console.log('  none');
  for (const g of byGuard) console.log(`  ${String(g._id).padEnd(18)} ${k(g.n)}`);

  console.log('\nSAME HELP ARTICLES, ANSWERED BY THE MODEL MORE THAN ONCE (top 10 by tokens)');
  if (!byArticles.length) console.log('  none');
  for (const a of byArticles) console.log(`  ${k(a.n).padStart(5)}x  ${k(a.tokens).padStart(9)} tokens  ${a._id.join(', ')}`);

  console.log(`\nConnection tests run: ${k(tests)}`);
}

main().catch((err) => {
  console.error(`token-audit failed: ${err.name}`);
  process.exit(1);
});
