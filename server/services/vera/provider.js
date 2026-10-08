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
});

const ENV = {
  key: (provider) => env(PROVIDERS[provider].envKey),
  // Master switch. No model call is made unless this is "true", whatever the
  // stored settings say — so a mis-click in the UI can never start spending.
  masterEnabled: () => env('VERA_ENABLED', 'AUTOMATION_AGENT_ENABLED').toLowerCase() === 'true',
  maxTokens: (p) => num(env('VERA_MAX_TOKENS', `${PROVIDERS[p].prefix}_MAX_TOKENS`), 1024),
  temperature: (p) => num(env('VERA_TEMPERATURE', `${PROVIDERS[p].prefix}_TEMPERATURE`), 0.2),
  timeoutMs: (p) => num(env('VERA_TIMEOUT_MS', `${PROVIDERS[p].prefix}_TIMEOUT_MS`), 30000),
  userDailyLimit: () => num(env('VERA_USER_DAILY_LIMIT', 'AUTOMATION_AGENT_USER_LIMIT'), 20),
  dailyLimit: () => num(env('VERA_DAILY_LIMIT', 'AUTOMATION_AGENT_DAILY_LIMIT'), 0),
};

function resolveProvider(cfg) {
  return String(cfg?.provider || '').trim().toLowerCase() === 'gemini' ? 'gemini' : 'anthropic';
}

/** The key for the selected provider. Environment only — no database fallback. */
function resolveKey(cfg) {
  const key = ENV.key(resolveProvider(cfg));
  return key ? { key, source: 'env' } : { key: '', source: '' };
}

const resolveModel = (cfg) => String(cfg?.model || '').trim() || PROVIDERS[resolveProvider(cfg)].defaultModel();
const resolveMaxTokens = (cfg) => num(cfg?.maxTokens, ENV.maxTokens(resolveProvider(cfg)));
const resolveTemperature = (cfg) => num(cfg?.temperature, ENV.temperature(resolveProvider(cfg)));
const resolveTimeoutMs = (cfg) => num(cfg?.requestTimeoutMs, ENV.timeoutMs(resolveProvider(cfg)));
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
  };
}

// ── What each Claude model accepts ───────────────────────────────────────────
// Sampling parameters (temperature) are rejected by the current generation
// (Opus 4.7 and later, Sonnet 5 and later, Fable); older models and Haiku 4.5
// still take them. Effort is accepted from Opus 4.5 / Sonnet 4.6 on and errors
// on Haiku 4.5. Adaptive thinking is on by default on the 5-series, so those
// get room for it in max_tokens. Server-side refusal fallbacks are opted into
// for the models that support them.
const isCurrentGen = (m) => /claude-(opus-(4-[78]|5)|sonnet-5|fable|mythos)/.test(m);
const acceptsSampling = (m) => !isCurrentGen(m);
const acceptsEffort = (m) => /claude-(opus-(4-[5-8]|5)|sonnet-(4-6|5)|fable|mythos)/.test(m);
const thinksByDefault = (m) => /claude-(opus-5|sonnet-5|fable|mythos)/.test(m);
const usesServerFallback = (m) => /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/.test(m);

/** Map a failure to a safe, provider-neutral shape. Never the key or the raw payload. */
function sanitizeError(err) {
  let out = { code: 'unknown', message: 'The assistant request failed. Please try again.' };
  const status = err?.status;
  const raw = String(err?.message || err || '');

  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || status === 401 || status === 403) {
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
  } else if (err instanceof Anthropic.APIError && status >= 500) {
    out = { code: 'provider_error', message: 'The model provider had a problem. Please try again shortly.' };
  }

  for (const p of Object.keys(PROVIDERS)) {
    const k = ENV.key(p);
    if (k) out.message = out.message.split(k).join('****');
  }
  return out;
}

async function completeAnthropic({ key, model, maxTokens, temperature, timeoutMs, system, prompt, signal }) {
  const client = new Anthropic({ apiKey: key, timeout: timeoutMs, maxRetries: 1 });
  const params = {
    model,
    // Models that think by default spend part of the budget thinking; leave
    // room for it so the visible answer is not cut short.
    max_tokens: thinksByDefault(model) ? Math.max(maxTokens, 4096) : maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: String(prompt || '') }],
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

async function completeGemini({ key, model, maxTokens, temperature, timeoutMs, system, prompt, signal }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(GEMINI_URL(model), {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
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
async function complete(cfg, { system, prompt, maxTokens, signal } = {}) {
  const provider = resolveProvider(cfg);
  const { key } = resolveKey(cfg);
  if (!key) {
    const err = new Error('not_configured');
    err.code = 'not_configured';
    throw err;
  }
  const args = {
    key,
    model: resolveModel(cfg),
    maxTokens: num(maxTokens, resolveMaxTokens(cfg)),
    temperature: resolveTemperature(cfg),
    timeoutMs: resolveTimeoutMs(cfg),
    system,
    prompt,
    signal,
  };
  return provider === 'gemini' ? completeGemini(args) : completeAnthropic(args);
}

/** A minimal round-trip proving the key and model work, for the settings screen. */
async function testConnection(cfg) {
  const started = Date.now();
  try {
    const out = await complete(cfg, { prompt: 'Reply with the single word: OK', maxTokens: 16 });
    return { ok: true, ...out, durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, ...sanitizeError(err), durationMs: Date.now() - started };
  }
}

module.exports = {
  PROVIDERS,
  ENV,
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
};
