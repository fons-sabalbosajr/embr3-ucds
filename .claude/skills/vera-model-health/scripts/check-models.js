#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Are VERA's models able to answer? Asked of each provider's model-info
// endpoint, which costs no tokens and no request against a generate quota.
//
//   node check-models.js                 route, keys, model-info, last 24 h
//   node check-models.js --list          also: every model each key can reach
//   node check-models.js --ping=a,b      also: one real 16-token call to a, b
//   node check-models.js --ping          also: one real call to every model
//   node check-models.js --no-db         skip the database (env settings only)
//
// Exit code: 0 all answerable, 1 degraded, 2 chat cannot reach any model.
//
// Reads only. It never prints a key or a vendor's raw message, and it calls
// vendors directly rather than through provider.complete(): that reports to
// modelUsage, whose flush replaces each vera-model-limits document with this
// process's short memory and would erase the limits the server has learned.
// A ping is therefore not counted on the Models tab, though the provider
// counts it.
// ---------------------------------------------------------------------------

const path = require('path');

const SERVER = path.resolve(__dirname, '../../../../server');
require(path.join(SERVER, 'node_modules/dotenv')).config({ path: path.join(SERVER, '.env'), quiet: true });
const provider = require(path.join(SERVER, 'services/vera/provider'));
const usage = require(path.join(SERVER, 'services/vera/modelUsage'));

const arg = (name) => process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const pingArg = arg('ping');
const pingOnly = pingArg?.includes('=') ? pingArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;

const TIMEOUT_MS = 10000;
const when = (t) => (t ? new Date(t).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'short' }) : '-');
const key = (p) => provider.ENV.key(p);

const VENDOR = {
  anthropic: {
    headers: () => ({ 'x-api-key': key('anthropic'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    info: (m) => `https://api.anthropic.com/v1/models/${encodeURIComponent(m)}`,
    list: 'https://api.anthropic.com/v1/models?limit=100',
    names: (b) => (b.data || []).map((d) => d.id),
    ping: (m) => ['https://api.anthropic.com/v1/messages', { model: m, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: OK' }] }],
    tokens: (b) => [b.usage?.input_tokens || 0, b.usage?.output_tokens || 0],
  },
  gemini: {
    headers: () => ({ 'x-goog-api-key': key('gemini'), 'content-type': 'application/json' }),
    info: (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}`,
    list: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    names: (b) => (b.models || []).filter((d) => (d.supportedGenerationMethods || []).includes('generateContent')).map((d) => d.name.replace(/^models\//, '')),
    ping: (m) => [
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: OK' }] }], generationConfig: { maxOutputTokens: 16, ...(/flash/.test(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } },
    ],
    tokens: (b) => [b.usageMetadata?.promptTokenCount || 0, b.usageMetadata?.candidatesTokenCount || 0],
  },
  groq: {
    headers: () => ({ authorization: `Bearer ${key('groq')}`, 'content-type': 'application/json' }),
    // The slash in "openai/gpt-oss-120b" stays a slash: Groq answers 404 to %2F.
    info: (m) => `https://api.groq.com/openai/v1/models/${m.split('/').map(encodeURIComponent).join('/')}`,
    list: 'https://api.groq.com/openai/v1/models',
    names: (b) => (b.data || []).map((d) => d.id),
    ping: (m) => [
      'https://api.groq.com/openai/v1/chat/completions',
      { model: m, messages: [{ role: 'user', content: 'Reply with the single word: OK' }], max_completion_tokens: 16, ...(/gpt-oss/.test(m) ? { reasoning_effort: 'low', include_reasoning: false } : {}) },
    ],
    tokens: (b) => [b.usage?.prompt_tokens || 0, b.usage?.completion_tokens || 0],
  },
};

/** A provider's word for a model: listed, or the reason it is not. Costs no tokens. */
async function infoOf(p, model) {
  if (!key(p)) return { ok: false, state: 'no key' };
  try {
    const res = await fetch(VENDOR[p].info(model), { headers: VENDOR[p].headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return { ok: true, state: 'listed' };
    if (res.status === 404) return { ok: false, state: 'NOT AVAILABLE to this key (404)' };
    if (res.status === 401 || res.status === 403) return { ok: false, state: `KEY REJECTED (${res.status})` };
    return { ok: false, state: `HTTP ${res.status}` };
  } catch {
    return { ok: false, state: 'no response (network or timeout)' };
  }
}

/** One real call. Spends one request and a few tokens of the provider's quota. */
async function pingOf(p, model) {
  const [url, body] = VENDOR[p].ping(model);
  const at = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers: VENDOR[p].headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const json = await res.json().catch(() => ({}));
    const ms = Date.now() - at;
    if (res.ok) {
      const [input, output] = VENDOR[p].tokens(json);
      return { ok: true, text: `answered in ${ms} ms (${input}+${output} tokens)` };
    }
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    return { ok: false, text: `${provider.sanitizeError(err).code} (HTTP ${res.status}, ${ms} ms)` };
  } catch (err) {
    return { ok: false, text: provider.sanitizeError(err).code };
  }
}

async function listOf(p) {
  try {
    const res = await fetch(VENDOR[p].list, { headers: VENDOR[p].headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return `HTTP ${res.status}`;
    return VENDOR[p].names(await res.json()).sort().join('\n    ');
  } catch {
    return 'no response';
  }
}

/** The stored settings and what the server has learned. Read only. */
async function readDb() {
  const { connectToMongo, getDb, client } = require(path.join(SERVER, 'config/db'));
  await connectToMongo();
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [doc, limits, buckets] = await Promise.all([
    db.collection('app-config').findOne({ _id: 'vera-settings' }),
    db.collection(usage.LIMITS).find({}).toArray(),
    db.collection(usage.COLLECTION).find({ at: { $gte: since } }).toArray(),
  ]);
  await client.close();
  const { _id, ...cfg } = doc || {};
  return { cfg, limits: new Map(limits.map((l) => [l._id, l])), buckets };
}

async function main() {
  let cfg = {};
  let limits = new Map();
  let buckets = [];
  let dbNote = 'read';
  if (!arg('no-db')) {
    try {
      ({ cfg, limits, buckets } = await readDb());
    } catch (err) {
      dbNote = `NOT READ (${err.name}); showing the environment's settings, and the saved model may differ`;
    }
  } else dbNote = 'skipped (--no-db); the saved model may differ';

  const primary = provider.resolveProvider(cfg);
  const configured = provider.resolveModel(cfg);
  const envModel = provider.PROVIDERS[primary].defaultModel();
  console.log('VERA MODEL HEALTH');
  console.log(`  Master switch      ${provider.ENV.masterEnabled() ? 'on' : 'OFF (no model is ever called)'}`);
  console.log(`  VERA settings      ${cfg.enabled === false ? 'DISABLED in the app' : 'enabled'}; database ${dbNote}`);
  console.log(`  Provider / model   ${primary} / ${configured}${cfg.model ? `  (saved in VERA settings, which overrides the env's ${envModel})` : '  (from the env)'}`);
  console.log(`  Keys               ${Object.keys(provider.PROVIDERS).map((p) => `${p}: ${key(p) ? 'set' : 'none'}`).join(', ')}`);
  console.log(`  Routing            ${provider.routerStatus(cfg).routing ? 'on' : 'OFF'}; cross-provider ${provider.routerStatus(cfg).crossProvider ? 'on' : 'OFF'}`);

  const routes = {
    'main (chat, tools)': provider.routeFor(cfg, 'main'),
    'light (short help)': provider.routeFor(cfg, 'light'),
    'accurate (legal)': provider.routeFor(cfg, 'accurate'),
    'PDF (scan reading)': provider.routeFor(cfg, 'main', { documents: true }),
  };

  const models = new Map();
  for (const route of Object.values(routes)) for (const c of route) models.set(`${c.provider}|${c.model}`, c);
  const infos = new Map(await Promise.all([...models].map(async ([k, c]) => [k, await infoOf(c.provider, c.model)])));

  console.log('\nMODELS (from the provider; no tokens spent)');
  for (const [k, c] of models) {
    const l = limits.get(k) || {};
    const mine = buckets.filter((b) => `${b.provider}|${b.model}` === k);
    const sum = (f) => mine.reduce((n, b) => n + (b[f] || 0), 0);
    const codes = {};
    for (const b of mine) for (const [code, n] of Object.entries(b.codes || {})) codes[code] = (codes[code] || 0) + n;
    // Listed says the model exists for this key, not that it answers: tried in
    // the last 24 hours and never once answering is the evidence for that.
    infos.get(k).failing = sum('calls') > 0 && sum('ok') === 0;
    console.log(`  ${c.provider} / ${c.model}: ${infos.get(k).state}${infos.get(k).failing ? `; FAILING, 0 of ${sum('calls')} calls answered in 24 h` : ''}`);
    console.log(`      24 h: ${sum('calls')} calls, ${sum('ok')} ok, ${sum('failed')} failed${Object.keys(codes).length ? ` ${JSON.stringify(codes)}` : ''}, ${sum('inputTokens') + sum('outputTokens')} tokens`);
    console.log(`      last ok ${when(l.lastOkAt)}; last error ${when(l.lastErrorAt)}${l.lastErrorCode ? ` (${l.lastErrorCode})` : ''}${l.limitSeen ? `; stated limit ${l.limitSeen}/day` : ''}`);
  }

  if (pingArg) {
    console.log('\nPINGS (real calls; each uses one request of the provider\'s quota)');
    for (const [k, c] of models) {
      if (pingOnly && !pingOnly.includes(c.model)) continue;
      if (!key(c.provider)) continue;
      const r = await pingOf(c.provider, c.model);
      console.log(`  ${c.provider} / ${c.model}: ${r.text}`);
      // The freshest evidence there is: it overrules the last 24 hours.
      Object.assign(infos.get(k), { pinged: r.ok, failing: !r.ok });
    }
  }

  const answerable = (c) => {
    const i = infos.get(`${c.provider}|${c.model}`);
    return i?.ok && !i.failing;
  };
  console.log('\nROUTES (in the order VERA tries them; [x] not listed or failing)');
  for (const [name, route] of Object.entries(routes)) {
    console.log(`  ${name}: ${route.filter(answerable).length}/${route.length} answering`);
    console.log(`      ${route.map((c) => `${answerable(c) ? '' : '[x]'}${c.model}`).join(' -> ') || '(empty)'}`);
  }

  if (arg('list')) {
    console.log('\nWHAT EACH KEY CAN REACH');
    for (const p of Object.keys(provider.PROVIDERS)) if (key(p)) console.log(`  ${p}:\n    ${await listOf(p)}`);
  }

  const main = routes['main (chat, tools)'];
  const off = !provider.ENV.masterEnabled() || cfg.enabled === false;
  const none = !main.some(answerable);
  const any = [...models.values()].some((c) => key(c.provider) && !answerable(c));
  const firstDown = main[0] && !answerable(main[0]);
  const verdict = off ? 'OFF: VERA answers from the help library only' : none ? 'DOWN: chat cannot reach any model' : firstDown ? `DEGRADED: the selected model ${main[0].model} is not answering; every chat waits for it before the route stands in` : any ? 'DEGRADED: at least one fallback is not answering' : 'HEALTHY: every keyed model is listed and none is failing';
  console.log(`\nVERDICT  ${verdict}`);
  process.exit(off || none ? 2 : firstDown || any ? 1 : 0);
}

main().catch((err) => {
  console.error(`check-models failed: ${err.name}`);
  process.exit(2);
});
