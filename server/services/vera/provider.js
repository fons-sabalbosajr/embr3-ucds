// ---------------------------------------------------------------------------
// VERA MODEL PROVIDER — the one place VERA talks to a language model.
//
// Anthropic (Claude) through the official SDK, Google Gemini over its REST
// API. Ported in approach from VERA in embr3-hr-pms.
//
// Security model
//   - The API key is read ONLY from the server environment (ANTHROPIC_API_KEY
//     / GEMINI_API_KEY). It is never stored in the database, never returned to
//     a caller, and never written to a log.
//   - safeStatus() is the only thing that leaves this module for the UI: it
//     reports booleans and the NAME of the variable expected, never a value.
//   - The browser never calls a vendor; only this module does.
//   - Vendor failures are mapped to a few safe codes; a key that somehow
//     appears in a vendor message is redacted.
//
// Environment, as this deployment names it (server/.env). The VERA_* names
// from the HR system are accepted too, and win when both are set.
//   AUTOMATION_AGENT_ENABLED / VERA_ENABLED      master switch (spend gate)
//   ANTHROPIC_MODEL, _MAX_TOKENS, _TEMPERATURE, _TIMEOUT_MS
//   GEMINI_MODEL,    _MAX_TOKENS, _TEMPERATURE, _TIMEOUT_MS
//   AUTOMATION_AGENT_USER_LIMIT / VERA_USER_DAILY_LIMIT   messages per user per day
//   AUTOMATION_AGENT_DAILY_LIMIT / VERA_DAILY_LIMIT       messages per day, everyone
// ---------------------------------------------------------------------------

const AnthropicSdk = require('@anthropic-ai/sdk');
const usage = require('./modelUsage');

const Anthropic = AnthropicSdk.default || AnthropicSdk;

const env = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};
const num = (v, fallback) => (v === '' || v == null || !Number.isFinite(Number(v)) ? fallback : Number(v));

const PROVIDERS = Object.freeze({
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: () => env('ANTHROPIC_MODEL') || 'claude-opus-5-5',
    prefix: 'ANTHROPIC',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    defaultModel: () => env('GEMINI_MODEL') || 'gemini-2.5-flash',
    prefix: 'GEMINI',
  },
  // Groq's free tier (no card): OpenAI's open-weight GPT-OSS models, fast. On
  // 28 Oct 2026 its rate-limits page gave openai/gpt-oss-120b 30 requests a
  // minute, 1,000 a day, 8,000 tokens a minute and 200,000 a day. VERA's
  // most accurate model for legal questions when its key is set (the
  // "accurate" route); it does not read PDFs, so scans go to the others.
  groq: {
    id: 'groq',
    label: 'Groq (GPT-OSS, free tier)',
    envKey: 'GROQ_API_KEY',
    defaultModel: () => env('GROQ_MODEL') || 'openai/gpt-oss-120b',
    prefix: 'GROQ',
  },
});

const ENV = {
  key: (provider) => env(PROVIDERS[provider].envKey),
  // Master switch. No model call is made unless this is "true", whatever the
  // stored settings say — so a mis-click in the UI can never start spending.
  masterEnabled: () => env('VERA_ENABLED', 'AUTOMATION_AGENT_ENABLED').toLowerCase() === 'true',
  maxTokens: (p) => num(env('VERA_MAX_TOKENS', `${PROVIDERS[p].prefix}_MAX_TOKENS`), 1024),
  temperature: (p) => num(env('VERA_TEMPERATURE', `${PROVIDERS[p].prefix}_TEMPERATURE`), 0.2),
  // 60s: the current Claude models think before they answer, and 30s was
  // too short for a long question — the chat fell back to the help library
  // with "did not respond in time".
  timeoutMs: (p) => num(env('VERA_TIMEOUT_MS', `${PROVIDERS[p].prefix}_TIMEOUT_MS`), 60000),
  userDailyLimit: () => num(env('VERA_USER_DAILY_LIMIT', 'AUTOMATION_AGENT_USER_LIMIT'), 20),
  dailyLimit: () => num(env('VERA_DAILY_LIMIT', 'AUTOMATION_AGENT_DAILY_LIMIT'), 0),
};

function resolveProvider(cfg) {
  const p = String(cfg?.provider || '').trim().toLowerCase();
  return PROVIDERS[p] ? p : 'anthropic';
}

/** The key for the selected provider. Environment only — no database fallback. */
function resolveKey(cfg) {
  const key = ENV.key(resolveProvider(cfg));
  return key ? { key, source: 'env' } : { key: '', source: '' };
}

const resolveModel = (cfg) => String(cfg?.model || '').trim() || PROVIDERS[resolveProvider(cfg)].defaultModel();
const resolveMaxTokens = (cfg) => num(cfg?.maxTokens, ENV.maxTokens(resolveProvider(cfg)));
// Temperature and the request timeout are no longer settings on the VERA
// screen (28 Oct 2026): the router spreads the time between models itself,
// and the current Claude models refuse a temperature. A value saved before
// is ignored rather than kept working out of sight; the server environment
// still sets both.
const resolveTemperature = (cfg) => ENV.temperature(resolveProvider(cfg));
// Never below 45s for a model that thinks by default.
const resolveTimeoutMs = (cfg) => {
  const ms = ENV.timeoutMs(resolveProvider(cfg));
  // Gemini too: its budget is shared between the chosen model and the
  // fallback (see completeGemini), and 30s left neither enough.
  return resolveProvider(cfg) === 'gemini' || thinksByDefault(resolveModel(cfg)) ? Math.max(ms, 45000) : ms;
};
const resolveUserDailyLimit = (cfg) => num(cfg?.perUserDailyLimit, ENV.userDailyLimit());
const resolveDailyLimit = (cfg) => num(cfg?.dailyLimit, ENV.dailyLimit());

/** Can VERA make a real model call right now? Master switch AND stored toggle AND a key. */
function isOperational(cfg) {
  return ENV.masterEnabled() && cfg?.enabled !== false && Boolean(resolveKey(cfg).key);
}

/** UI-safe status. Never the key, never any part of it. */
function safeStatus(cfg) {
  const provider = resolveProvider(cfg);
  const { key, source } = resolveKey(cfg);
  return {
    provider,
    providerLabel: PROVIDERS[provider].label,
    keyEnvVar: PROVIDERS[provider].envKey,
    masterEnvVars: ['AUTOMATION_AGENT_ENABLED', 'VERA_ENABLED'],
    keyConfigured: Boolean(key),
    keySource: source,
    keyHint: key ? 'configured via the server environment' : '',
    masterEnabled: ENV.masterEnabled(),
    enabled: cfg?.enabled !== false,
    operational: isOperational(cfg),
    model: resolveModel(cfg),
    maxTokens: resolveMaxTokens(cfg),
    temperature: resolveTemperature(cfg),
    requestTimeoutMs: resolveTimeoutMs(cfg),
    perUserDailyLimit: resolveUserDailyLimit(cfg),
    dailyLimit: resolveDailyLimit(cfg),
    lastSuccessfulConnectionAt: cfg?.lastSuccessfulConnectionAt || null,
    lastError: cfg?.lastError || '',
    lastErrorAt: cfg?.lastErrorAt || null,
    // The models VERA may turn to, and which are resting (names, never keys).
    router: routerStatus(cfg),
  };
}

// ── What each Claude model accepts ───────────────────────────────────────────
// Sampling parameters (temperature) are rejected by the current generation
// (Opus 4.7 and later, Sonnet 5 and later, Fable); older models and Haiku 4.5
// still take them. Effort is accepted from Opus 4.5 / Sonnet 4.6 on and errors
// on Haiku 4.5. Adaptive thinking is on by default on the 5-series, so those
// get room for it in max_tokens. Server-side refusal fallbacks are opted into
// for the models that support them.
// Haiku 5.5 (VERA's light model) rejects a non-default temperature, takes
// effort, thinks by default, and has no server-side refusal fallback.
const isCurrentGen = (m) => /claude-(opus-(4-[78]|5)|sonnet-5|haiku-5|fable|mythos)/.test(m);
const acceptsSampling = (m) => !isCurrentGen(m);
const acceptsEffort = (m) => /claude-(opus-(4-[5-8]|5)|sonnet-(4-6|5)|haiku-5|fable|mythos)/.test(m);
const thinksByDefault = (m) => /claude-(opus-5|sonnet-5|haiku-5|fable|mythos)/.test(m);
const usesServerFallback = (m) => /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/.test(m);

/** Map a failure to a safe, provider-neutral shape. Never the key or the raw payload. */
function sanitizeError(err) {
  // Already mapped (complete() throws these): keep the code and the safe text.
  if (err?.sanitized) return { code: err.code, message: err.message };
  let out = { code: 'unknown', message: 'The assistant request failed. Please try again.' };
  const status = err?.status;
  const raw = String(err?.message || err || '');

  if (err?.code === 'all_resting') {
    // Each model and why it did not answer — not just the last one's error,
    // which said "overloaded" while another model was out of quota and a
    // third not on the key at all.
    const reasons = err.reasons || [];
    const allQuota = reasons.length > 0 && reasons.every((r) => /quota/.test(r));
    const until = err.until && Number.isFinite(err.until) ? ` Trying again from about ${formatResume(err.until)}.` : '';
    out = {
      code: allQuota ? 'quota_exhausted' : 'no_model',
      message: `No AI model VERA may use is answering${reasons.length ? ` (${reasons.join('; ')})` : ''}.${until} VERA answers from the help library meanwhile; choose another model in VERA settings, or add credit or a key for the other provider in server/.env.`,
    };
  } else if (isDailyQuota(err)) {
    out = {
      code: 'quota_exhausted',
      message: "The AI model's daily quota (the provider's free tier) is used up. VERA moves to another model when one is available, and answers from the help library otherwise.",
    };
  } else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || status === 401 || status === 403) {
    out = { code: 'auth_failed', message: "The assistant's API key was rejected. Ask a developer to check the server configuration." };
  } else if (err instanceof Anthropic.NotFoundError || status === 404) {
    out = { code: 'model_unavailable', message: 'The configured assistant model is not available for this API key.' };
  } else if (err instanceof Anthropic.RateLimitError || status === 429 || /resource[_\s-]?exhausted|quota/i.test(raw)) {
    out = { code: 'rate_limited', message: 'The assistant is rate limited right now. Please wait a moment and try again.' };
  } else if (/credit balance|billing|insufficient[_\s-]?(funds|quota)/i.test(raw)) {
    // A valid key on an account with nothing left to spend: an administrator
    // problem, not a request problem — and the fix is in the vendor console.
    out = {
      code: 'no_credit',
      message: 'The model account behind this key has no credit left. Add credit in the provider console (Anthropic: Plans & Billing), or switch VERA to the other provider.',
    };
  } else if (err instanceof Anthropic.BadRequestError || status === 400) {
    out = { code: 'bad_request', message: 'The assistant could not process that request.' };
  } else if (err?.code === 'refused') {
    out = { code: 'refused', message: 'The model declined to answer that.' };
  } else if (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    err instanceof Anthropic.APIConnectionError ||
    err?.name === 'AbortError' ||
    /abort|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|ENOTFOUND/i.test(raw)
  ) {
    out = { code: 'timeout', message: 'The assistant did not respond in time. Please try again.' };
  } else if (status === 503 || /high demand|overloaded/i.test(raw)) {
    // Gemini's "This model is currently experiencing high demand" — it used
    // to come out as "The assistant request failed", which said nothing.
    out = { code: 'overloaded', message: 'The AI model is overloaded right now (the provider reports high demand). Try again shortly, or choose another model in VERA settings.' };
  } else if (status >= 500) {
    out = { code: 'provider_error', message: 'The model provider had a problem. Please try again shortly.' };
  }

  for (const p of Object.keys(PROVIDERS)) {
    const k = ENV.key(p);
    if (k) out.message = out.message.split(k).join('****');
  }
  return out;
}

async function completeAnthropic({ key, model, maxTokens, temperature, timeoutMs, system, prompt, signal, documents = [] }) {
  // No SDK retry: the caller's budget is one timeout long, so a retry after a
  // slow first attempt could only be cut off — it made a timeout take twice
  // as long to report.
  const client = new Anthropic({ apiKey: key, timeout: timeoutMs, maxRetries: 0 });
  const params = {
    model,
    // Models that think by default spend part of the budget thinking; leave
    // room for it so the visible answer is not cut short.
    max_tokens: thinksByDefault(model) ? Math.max(maxTokens, 2048) : maxTokens,
    ...(system ? { system } : {}),
    // A document (a scan's first pages) goes before the question about it.
    messages: [
      {
        role: 'user',
        content: documents.length
          ? [...documents.map((d) => ({ type: 'document', source: { type: 'base64', media_type: d.mimeType, data: d.data } })), { type: 'text', text: String(prompt || '') }]
          : String(prompt || ''),
      },
    ],
    ...(acceptsSampling(model) ? { temperature } : {}),
    // A help answer is short and routine: low effort is the right setting.
    ...(acceptsEffort(model) ? { output_config: { effort: 'low' } } : {}),
  };

  const response = usesServerFallback(model)
    ? await client.beta.messages.create(
        { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        { signal }
      )
    : await client.messages.create(params, { signal });

  if (response.stop_reason === 'refusal') {
    const e = new Error('refused');
    e.code = 'refused';
    throw e;
  }
  return {
    provider: 'anthropic',
    model: response.model || model,
    text: (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim(),
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    stopReason: response.stop_reason || '',
  };
}

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

// ── The model router ─────────────────────────────────────────────────────────
// Every call is offered to an ordered list of models, not one. A model that
// fails in a way the next one would not (its quota spent, overloaded, slow,
// not on this key) is rested for a while and the next is tried, so one
// exhausted free tier no longer turns VERA into the help library for a day.
//
// On 28 Oct 2026 gemini-2.5-flash answered every call with "Quota exceeded
// for metric generate_content_free_tier_requests, limit: 20 ... retry in
// 20h44m": the free tier's 20 requests a day, per model, were gone. Each
// Gemini model has its own daily quota, so the light model still answered.
//
// The order, for a call of tier "main" (the default):
//   1. the configured model          4. the other provider's models, when
//   2. GEMINI_FALLBACK_MODEL (Gemini)    its key is set (VERA_CROSS_PROVIDER
//   3. the provider's light model        _FALLBACK=false keeps to one)
// A "light" call — a short help question, a spelling check — starts at the
// light model instead (VERA_MODEL_ROUTING=false turns that off).

// On 14 Oct 2026 gemini-3.8-flash answered "This model is currently
// experiencing high demand" (503) or took up to five minutes, and every chat
// fell back to the help library; gemini-2.5-flash answered in a second.
const GEMINI_FALLBACK = () => env('GEMINI_FALLBACK_MODEL') || 'gemini-2.5-flash';
// 28 Oct 2026, this server's key: gemini-2.5-flash-lite and 2.0-flash-lite
// answer 404 (not available to it); gemini-3.1-flash-lite answers.
const LIGHT_MODELS = {
  gemini: () => env('GEMINI_LIGHT_MODEL') || 'gemini-3.1-flash-lite',
  anthropic: () => env('ANTHROPIC_LIGHT_MODEL') || 'claude-haiku-5-5',
  groq: () => env('GROQ_LIGHT_MODEL') || 'openai/gpt-oss-20b',
};
// The model a legal question goes to first (tier "accurate") when its key is
// set: a reasoning model, asked to think before it answers from the law text.
const ACCURATE = { provider: 'groq', model: () => env('GROQ_ACCURATE_MODEL', 'GROQ_MODEL') || 'openai/gpt-oss-120b' };
// The other providers, free before paid.
const FALLBACK_ORDER = ['groq', 'gemini', 'anthropic'];
// What each adapter can be sent (VERA's integration, not the vendor's whole range).
const READS_PDF = { gemini: true, anthropic: true, groq: false };
const flagOff = (...names) => env(...names).toLowerCase() === 'false';
const routingOn = (cfg) => cfg?.modelRouting !== false && !flagOff('VERA_MODEL_ROUTING');
const crossProviderOn = (cfg) => cfg?.crossProviderFallback !== false && !flagOff('VERA_CROSS_PROVIDER_FALLBACK');

const overloaded = (err) => err?.status === 503 || err?.status === 500 || /high demand|overloaded|unavailable|try again later/i.test(String(err?.message || ''));
const timedOut = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout|aborted|timed out/i.test(String(err?.message || ''));
// 413: Groq's "request too large" for the tokens-per-minute budget.
const rateLimited = (err) => err?.status === 429 || err?.status === 413 || err instanceof Anthropic.RateLimitError || /resource[_\s-]?exhausted|quota|rate limit reached/i.test(String(err?.message || ''));
function isDailyQuota(err) {
  if (!rateLimited(err)) return false;
  if (err?.perDay) return true;
  return /per\s?day|daily|free_tier/i.test(String(err?.message || '')) || (err?.retryAfterMs || 0) > 30 * 60 * 1000;
}
const noCredit = (err) => /credit balance|billing|insufficient[_\s-]?(funds|quota)/i.test(String(err?.message || ''));
const keyRejected = (err) => err?.status === 401 || err?.status === 403 || err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;

/** "20h44m58.7s" (Gemini's wording) or "75898s" (its RetryInfo) as milliseconds. */
function parseRetryDelay(text) {
  const s = String(text || '');
  const m = /retry in\s+((?:\d+h)?\s*(?:\d+m)?\s*(?:[\d.]+s)?)/i.exec(s) || /^\s*([\d.]+s)\s*$/.exec(s);
  if (!m) return 0;
  const part = (re) => Number((re.exec(m[1]) || [0, 0])[1]) || 0;
  return Math.round((part(/(\d+)h/) * 3600 + part(/(\d+)m(?!s)/) * 60 + part(/([\d.]+)s/)) * 1000);
}

const formatResume = (until) =>
  new Date(until).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

// provider:model -> { until, reason }. Process-local: a restart forgets, and
// the first call after it learns again in one request.
const resting = new Map();
const restKey = (p, m) => `${p}:${m}`;
const MIN = 60 * 1000;

/** Anthropic's Retry-After header, in milliseconds (the SDK keeps the headers on its errors). */
function retryAfterHeader(err) {
  const h = err?.headers;
  const v = typeof h?.get === 'function' ? h.get('retry-after') : h?.['retry-after'];
  const s = Number(v);
  return Number.isFinite(s) && s > 0 ? s * 1000 : 0;
}

function restFor(err) {
  if (err && !err.retryAfterMs) err.retryAfterMs = retryAfterHeader(err);
  // At most an hour, whatever the provider's retry time says: on 28 Oct 2026
  // Gemini said "retry in 20h44m", yet the model answered again that
  // afternoon. One failed call an hour is the price of noticing.
  if (isDailyQuota(err)) return { ms: Math.min(err.retryAfterMs || 60 * MIN, 60 * MIN), reason: 'daily quota used up' };
  if (rateLimited(err)) return { ms: Math.min(Math.max(err.retryAfterMs || MIN, 15 * 1000), 30 * MIN), reason: 'rate limited' };
  if (noCredit(err)) return { ms: 60 * MIN, reason: 'no credit on the account', wholeProvider: true };
  if (keyRejected(err)) return { ms: 10 * MIN, reason: 'API key rejected', wholeProvider: true };
  if (err?.status === 404) return { ms: 60 * MIN, reason: 'model not available to this key' };
  // A model that just failed is skipped for a while: while it is overloaded,
  // waiting out its share of the time on every message made each answer slow.
  if (overloaded(err)) return { ms: 10 * MIN, reason: 'overloaded' };
  if (timedOut(err)) return { ms: 10 * MIN, reason: 'too slow' };
  return null;
}

function rest(candidate, err) {
  const r = restFor(err);
  if (!r) return false;
  const until = Date.now() + r.ms;
  resting.set(r.wholeProvider ? restKey(candidate.provider, '*') : restKey(candidate.provider, candidate.model), { until, reason: r.reason });
  return true;
}

const restingUntil = (c) => {
  const now = Date.now();
  const hits = [resting.get(restKey(c.provider, c.model)), resting.get(restKey(c.provider, '*'))].filter((r) => r && r.until > now);
  return hits.length ? Math.max(...hits.map((r) => r.until)) : 0;
};

/**
 * The models a call may use, in order. `documents`: the call carries a PDF,
 * so only providers VERA sends PDFs to are in the route.
 */
function routeFor(cfg, tier = 'main', { documents = false } = {}) {
  const primary = resolveProvider(cfg);
  const list = [];
  const add = (provider, model) => {
    if (!model || list.some((c) => c.provider === provider && c.model === model)) return;
    if (documents && !READS_PDF[provider]) return;
    list.push({ provider, model });
  };
  // A legal question: the accurate model first, when there is a key for it.
  if (tier === 'accurate' && ENV.key(ACCURATE.provider) && routingOn(cfg)) add(ACCURATE.provider, ACCURATE.model());
  const light = tier === 'light' && routingOn(cfg);
  if (light) add(primary, LIGHT_MODELS[primary]());
  add(primary, resolveModel(cfg));
  if (primary === 'gemini') add('gemini', GEMINI_FALLBACK());
  add(primary, LIGHT_MODELS[primary]());
  if (crossProviderOn(cfg)) {
    for (const other of FALLBACK_ORDER.filter((p) => p !== primary && ENV.key(p))) {
      if (light) add(other, LIGHT_MODELS[other]());
      add(other, other === ACCURATE.provider ? ACCURATE.model() : PROVIDERS[other].defaultModel());
      add(other, LIGHT_MODELS[other]());
    }
  }
  return list;
}

/** For the settings screen: which models are resting, and until when. Names only. */
function routerStatus(cfg) {
  return {
    routing: routingOn(cfg),
    crossProvider: crossProviderOn(cfg),
    lightModel: LIGHT_MODELS[resolveProvider(cfg)](),
    route: routeFor(cfg, 'main').map((c, i) => {
      const until = restingUntil(c);
      const r = resting.get(restKey(c.provider, c.model)) || resting.get(restKey(c.provider, '*'));
      return { provider: c.provider, model: c.model, role: roleOf(cfg, c, i), restingUntil: until ? new Date(until).toISOString() : null, reason: until ? r?.reason || '' : '' };
    }),
  };
}

/** What a model is in VERA's route, in a few words, for the Models tab. */
function roleOf(cfg, c, position) {
  const primary = resolveProvider(cfg);
  if (position === 0) return 'Selected model';
  if (c.provider === ACCURATE.provider && c.model === ACCURATE.model()) return 'Accurate model (legal questions first)';
  if (c.provider !== primary) return 'Other provider';
  if (c.model === LIGHT_MODELS[primary]()) return 'Light model (short questions)';
  return 'Fallback';
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Groq's rate-limit headers: requests per DAY and tokens per MINUTE (console.groq.com/docs/rate-limits). */
function groqLimits(headers) {
  const n = (h) => {
    const v = Number(headers.get(h));
    return Number.isFinite(v) && headers.get(h) !== null ? v : null;
  };
  return {
    requestsPerDay: n('x-ratelimit-limit-requests'),
    requestsLeft: n('x-ratelimit-remaining-requests'),
    requestsReset: headers.get('x-ratelimit-reset-requests'),
    tokensPerMinute: n('x-ratelimit-limit-tokens'),
    tokensLeft: n('x-ratelimit-remaining-tokens'),
    tokensReset: headers.get('x-ratelimit-reset-tokens'),
  };
}

/**
 * One call to Groq's OpenAI-compatible chat API. The GPT-OSS models reason
 * before they answer: a little for everyday help, more for a legal question
 * (`effort`); the reasoning is not returned, and its tokens come out of the
 * same budget, so room is left for it.
 */
async function groqOnce({ key, model, maxTokens, temperature, timeoutMs, system, prompt, signal, effort = 'low' }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const reasoning = /gpt-oss/.test(model);
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: String(prompt || '') }],
      max_completion_tokens: reasoning ? maxTokens + (effort === 'low' ? 512 : 2048) : maxTokens,
      temperature,
      ...(reasoning ? { reasoning_effort: effort, include_reasoning: false } : {}),
    }),
  });
  usage.limits('groq', model, groqLimits(res.headers));
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = new Error(body?.error?.message || `HTTP ${res.status}`);
    e.status = res.status;
    const after = Number(res.headers.get('retry-after'));
    if (Number.isFinite(after) && after > 0) e.retryAfterMs = after * 1000;
    // "Rate limit reached … on requests per day (RPD)": the day's quota.
    e.perDay = /per day|\(RPD\)|\(TPD\)/i.test(e.message) || groqLimits(res.headers).requestsLeft === 0;
    throw e;
  }
  const choice = body?.choices?.[0];
  return {
    provider: 'groq',
    model: body?.model || model,
    text: String(choice?.message?.content || '').trim(),
    inputTokens: body?.usage?.prompt_tokens || 0,
    outputTokens: body?.usage?.completion_tokens || 0,
    stopReason: choice?.finish_reason || '',
  };
}

async function geminiOnce({ key, model, maxTokens, temperature, timeoutMs, system, prompt, signal, documents = [] }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(GEMINI_URL(model), {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...documents.map((d) => ({ inline_data: { mime_type: d.mimeType, data: d.data } })), { text: String(prompt || '') }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        // Flash models think by default, and the thinking comes out of the
        // same budget — a short help answer came back empty. Off for those.
        ...(/flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = new Error(body?.error?.message || `HTTP ${res.status}`);
    e.status = res.status;
    // How long a 429 lasts, and whether it is the day's quota rather than
    // the minute's: the router rests the model for exactly that long.
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    const retryInfo = details.find((d) => /RetryInfo/.test(d?.['@type'] || ''));
    e.retryAfterMs = parseRetryDelay(retryInfo?.retryDelay) || parseRetryDelay(e.message);
    e.perDay = details.some((d) => (d?.violations || []).some((v) => /PerDay/i.test(v?.quotaId || '')));
    throw e;
  }
  const parts = body?.candidates?.[0]?.content?.parts || [];
  return {
    provider: 'gemini',
    model,
    text: parts.map((p) => p?.text || '').join('').trim(),
    inputTokens: body?.usageMetadata?.promptTokenCount || 0,
    outputTokens: body?.usageMetadata?.candidatesTokenCount || 0,
    stopReason: body?.candidates?.[0]?.finishReason || '',
  };
}

/**
 * One completion, the same shape from either vendor.
 * @returns {Promise<{text, inputTokens, outputTokens, stopReason, provider, model}>}
 */
/**
 * `documents`: [{ mimeType, data (base64) }] for the model to read with the
 * prompt — a PDF, for VERA's project type check. Both providers read a PDF
 * directly, scanned pages included.
 */
/**
 * `tier`: "main" (default) or "light" — see the router above. The error a
 * caller sees is already mapped (sanitizeError): a code and a sentence safe to
 * show, never the vendor's raw message.
 */
/**
 * `ignoreRest`: try every model in the route, resting ones too (the
 * connection test asks whether anything answers now, not what answered last).
 */
async function complete(cfg, { system, prompt, maxTokens, signal, documents, tier = 'main', configuredOnly = false, timeoutMs: budgetMs, ignoreRest = false, exclude = [], feature = 'tools' } = {}) {
  if (!resolveKey(cfg).key) {
    const err = new Error('not_configured');
    err.code = 'not_configured';
    throw err;
  }
  // The connection test asks about the configured model alone, resting or not.
  const route = configuredOnly
    ? [{ provider: resolveProvider(cfg), model: resolveModel(cfg) }]
    : routeFor(cfg, tier, { documents: Boolean(documents?.length) }).filter((c) => ENV.key(c.provider) && !exclude.some((x) => x.provider === c.provider && x.model === c.model));
  if (!route.length) throw toSafe({ code: 'all_resting', reasons: [] });
  if (configuredOnly) resting.delete(restKey(route[0].provider, route[0].model));
  const ready = ignoreRest ? route : route.filter((c) => !restingUntil(c));
  if (!ready.length) {
    // Every model is resting: answer at once rather than spend a request
    // that is certain to be refused — and say why each one is.
    throw toSafe({ code: 'all_resting', until: Math.min(...route.map(restingUntil)), reasons: route.map((c) => `${c.model}: ${restReason(c)}`) });
  }

  const timeoutMs = budgetMs || resolveTimeoutMs(cfg);
  const started = Date.now();
  let lastErr = null;
  const failures = [];
  for (let i = 0; i < ready.length; i += 1) {
    const c = ready[i];
    const left = timeoutMs - (Date.now() - started);
    if (i > 0 && left < 5000) break;
    // The first try gets a share of the time when others could follow, so a
    // slow model leaves the next one room; the last gets what is left.
    const share = i < ready.length - 1 && i === 0 ? Math.max(8000, Math.round(timeoutMs * 0.45)) : left;
    const own = c.provider === resolveProvider(cfg);
    const args = {
      key: ENV.key(c.provider),
      model: c.model,
      maxTokens: num(maxTokens, own ? resolveMaxTokens(cfg) : ENV.maxTokens(c.provider)),
      temperature: own ? resolveTemperature(cfg) : ENV.temperature(c.provider),
      timeoutMs: Math.min(share, left),
      system,
      prompt,
      signal,
      documents: documents || [],
      // How hard a reasoning model thinks: more for a legal question.
      effort: tier === 'accurate' ? 'medium' : 'low',
    };
    const at = Date.now();
    try {
      const call = c.provider === 'gemini' ? geminiOnce : c.provider === 'groq' ? groqOnce : completeAnthropic;
      const out = await call(args);
      // It answers: whatever it rested for is over.
      resting.delete(restKey(c.provider, c.model));
      usage.record({ provider: c.provider, model: c.model, ok: true, inputTokens: out.inputTokens, outputTokens: out.outputTokens, ms: Date.now() - at, feature });
      return out;
    } catch (err) {
      lastErr = err;
      const code = sanitizeError(err).code;
      // The daily limit Gemini states when it refuses ("limit: 20, model: …").
      // Gemini: "limit: 20, model: …"; Groq: "Limit 1000, Used 1000".
      const limit = Number((/\blimit:?\s*(\d+)/i.exec(String(err?.message || '')) || [])[1]) || null;
      if (!signal?.aborted) usage.record({ provider: c.provider, model: c.model, ok: false, code, ms: Date.now() - at, feature, limit: isDailyQuota(err) ? limit : null });
      failures.push(`${c.model}: ${restFor(err)?.reason || code}`);
      // The caller's own cancel, or a request no model would take (a bad
      // request, a refusal): stop here rather than try the same on the next.
      if (signal?.aborted || !rest(c, err)) break;
    }
  }
  // More than one model tried and none answered: say what each said.
  if (failures.length > 1 && !signal?.aborted) throw toSafe({ code: 'all_resting', reasons: failures });
  throw toSafe(lastErr);
}

/** Why a model is resting, in a few words. */
function restReason(c) {
  const r = resting.get(restKey(c.provider, c.model)) || resting.get(restKey(c.provider, '*'));
  return r && r.until > Date.now() ? r.reason : 'not tried';
}

/** The error a caller of complete() sees: mapped, with the vendor's text gone. */
function toSafe(err) {
  const safe = sanitizeError(err);
  const e = new Error(safe.message);
  e.code = safe.code;
  e.sanitized = true;
  if (err?.status) e.status = err.status;
  if (err?.name === 'AbortError') e.name = 'AbortError';
  return e;
}

/**
 * A minimal round-trip proving the key and model work, for the settings
 * screen. The configured model first, given the share of time a chat gives it
 * before the router moves on; when it fails, the rest of the route — so the
 * screen says both that the chosen model is not answering and which model
 * VERA is answering with instead (`degraded`).
 */
async function testConnection(cfg) {
  const started = Date.now();
  const ping = { prompt: 'Reply with the single word: OK', maxTokens: 16, feature: 'test' };
  const firstShare = Math.max(8000, Math.round(resolveTimeoutMs(cfg) * 0.45));
  let configuredError;
  try {
    const out = await complete(cfg, { ...ping, configuredOnly: true, timeoutMs: firstShare });
    return { ok: true, ...out, durationMs: Date.now() - started };
  } catch (err) {
    // complete() has already rested it, from the raw error. Whatever the
    // failure, the rest of the route is tried: the question is whether VERA
    // can answer at all. (Deciding from this mapped error — "did not respond
    // in time" — once stopped the test at a timeout with a model that worked.)
    configuredError = sanitizeError(err);
    if (configuredError.code === 'not_configured') return { ok: false, ...configuredError, durationMs: Date.now() - started };
  }
  // The rest of the route, resting models included: a test asks what answers
  // now. One that does stops resting (complete clears it).
  try {
    const out = await complete(cfg, { ...ping, ignoreRest: true, exclude: [{ provider: resolveProvider(cfg), model: resolveModel(cfg) }] });
    return { ok: true, degraded: true, configuredModel: resolveModel(cfg), configuredError, ...out, durationMs: Date.now() - started };
  } catch (err) {
    // Nothing answers: every model and why, the configured one first.
    const others = sanitizeError(err);
    const merged = others.code === 'no_model' || others.code === 'quota_exhausted' ? others : configuredError;
    return { ok: false, ...merged, message: `${resolveModel(cfg)}: ${configuredError.message} ${merged === others ? others.message : ''}`.trim(), durationMs: Date.now() - started };
  }
}

// ── What each model is, from the provider ────────────────────────────────────
// For the Models tab: the context window, the longest answer, the display
// name — read from each provider's own models endpoint, never typed in here,
// and kept for 12 hours (a failure for 10 minutes).

const INFO_TTL = 12 * 60 * MIN;
const infoCache = new Map(); // provider|model -> { until, info }

async function fetchInfo(provider, model) {
  const key = ENV.key(provider);
  if (!key) return null;
  const timeout = AbortSignal.timeout(8000);
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': key }, signal: timeout });
    if (!r.ok) return null;
    const b = await r.json();
    return { displayName: b.displayName || null, contextWindow: b.inputTokenLimit || null, maxOutput: b.outputTokenLimit || null, thinking: Boolean(b.thinking) };
  }
  if (provider === 'groq') {
    const r = await fetch(`https://api.groq.com/openai/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${key}` }, signal: timeout });
    if (!r.ok) return null;
    const b = await r.json();
    return { displayName: b.id || model, contextWindow: b.context_window || null, maxOutput: b.max_completion_tokens || null, thinking: /gpt-oss|qwen3|deepseek-r1/i.test(model) };
  }
  if (provider === 'anthropic') {
    const r = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: timeout });
    if (!r.ok) return null;
    const b = await r.json();
    return { displayName: b.display_name || null, contextWindow: b.max_input_tokens || null, maxOutput: b.max_tokens || null, thinking: thinksByDefault(model) };
  }
  return null;
}

/** A model's details, from its provider (cached). Null when the provider will not say. */
async function modelInfo(provider, model) {
  const k = `${provider}|${model}`;
  const hit = infoCache.get(k);
  if (hit && hit.until > Date.now()) return hit.info;
  let info = null;
  try {
    info = await fetchInfo(provider, model);
  } catch {
    info = null;
  }
  infoCache.set(k, { until: Date.now() + (info ? INFO_TTL : 10 * MIN), info });
  return info;
}

// Free-tier limits a provider itself publishes, with where and when they were
// read. Gemini publishes none per model ("actual capacity may vary"): its
// limit shows once it states it in a refusal (modelUsage limitSeen).
const PUBLISHED_LIMITS = {
  'groq|openai/gpt-oss-120b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000, source: 'console.groq.com/docs/rate-limits, read 28 Oct 2026' },
  'groq|openai/gpt-oss-20b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000, source: 'console.groq.com/docs/rate-limits, read 28 Oct 2026' },
};

/** What VERA's integration does with a model: reads scans, reasons, which route it serves. */
const capabilitiesOf = (provider, model) => ({
  readsPdf: Boolean(READS_PDF[provider]),
  accurate: provider === ACCURATE.provider && model === ACCURATE.model(),
  light: model === LIGHT_MODELS[provider]?.(),
  published: PUBLISHED_LIMITS[`${provider}|${model}`] || null,
});

module.exports = {
  PROVIDERS,
  ENV,
  modelInfo,
  capabilitiesOf,
  resolveProvider,
  resolveKey,
  resolveModel,
  resolveMaxTokens,
  resolveTemperature,
  resolveTimeoutMs,
  resolveUserDailyLimit,
  resolveDailyLimit,
  isOperational,
  safeStatus,
  sanitizeError,
  complete,
  testConnection,
  routeFor,
  routerStatus,
  parseRetryDelay,
  // For tests: forget which models are resting.
  _resetRouter: () => resting.clear(),
};
