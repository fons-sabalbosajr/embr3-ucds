// ---------------------------------------------------------------------------
// VERA CONTROLLER
//
// Two surfaces:
//   STAFF   (/api/vera/status, /chat) — signed in. Knowledge scoped by the
//           account's domains and role (services/vera/assistant.js).
//   PUBLIC  (/api/vera/public-status, /public-chat) — the sign-in pages, no
//           session. A separate, tiny knowledge base; every account or record
//           lookup refused; rate limited by address; off unless enabled.
// and administration (/config, /test, /usage, /logs) for the admin domain.
//
// Security posture
//   - Input sanitized and capped; output stripped of control characters and
//     rendered as text on the client, never HTML.
//   - The model key never leaves the server environment: /config reports
//     booleans and the variable NAME, never a value.
//   - A per-user daily cap, a daily cap for everyone, and a duplicate guard
//     sit above the provider's own timeout, so a stuck or spammed client
//     cannot run up cost.
//   - The question and the answer are never stored. The log holds metadata:
//     when, who, which screen, which articles matched, model or library,
//     tokens, duration.
//
// Settings live in app-config (`vera-settings`); the log rows in app-logs,
// beside the rest of the audit trail, with domain "vera".
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const { connectToMongo, getDb } = require('../config/db');
const { principalOf } = require('../middleware/auth');
const { roleOf, domainsOf, ROLES } = require('../services/authorization');
const provider = require('../services/vera/provider');
const vera = require('../services/vera/assistant');
const veraFigures = require('../services/vera/figures');
const K = require('../services/vera/knowledge');

const CONFIG_COLLECTION = 'app-config';
const CONFIG_ID = 'vera-settings';
const LOG_COLLECTION = 'app-logs';

const VERA_ACTIONS = Object.freeze({
  'vera:chat': 'Chat (staff)',
  'vera:public-chat': 'Chat (sign-in page)',
  'vera:test': 'Connection test',
  'vera:settings:updated': 'Settings changed',
});

async function loadConfig() {
  await connectToMongo();
  const doc = await getDb().collection(CONFIG_COLLECTION).findOne({ _id: CONFIG_ID });
  const { _id, ...cfg } = doc || {};
  return cfg;
}

async function patchConfig(set) {
  await getDb().collection(CONFIG_COLLECTION).updateOne({ _id: CONFIG_ID }, { $set: set }, { upsert: true });
}

/**
 * The counts behind a "how many…" question, for this person only (see
 * services/vera/figures). Null when the question asks for none, and never
 * fatal: VERA answers without them rather than not at all.
 */
async function countsFor(req, message, viewer, cfg) {
  try {
    if (!veraFigures.wantsFigures(message)) return null;
    const ctx = vera.contextFor(viewer, '', cfg);
    return await veraFigures.figuresFor(message, principalOf(req), { activeYear: req.session?.activeYear, pageLabels: ctx.pageLabels });
  } catch (err) {
    console.warn('[VERA] figures unavailable:', err.message);
    return null;
  }
}

/** Who VERA is talking to: the account's role and domains, from the session. */
function viewerFor(req, cfg) {
  const user = principalOf(req);
  if (!user) return { realm: 'staff', role: 'staff', domains: [] };
  const role = roleOf(user);
  return {
    realm: 'staff',
    role: role === ROLES.DEVELOPER && cfg?.developerMode !== false ? 'developer' : role,
    domains: domainsOf(user),
  };
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** One metadata row. Never the question or the answer. */
async function log(req, action, details) {
  try {
    const user = principalOf(req);
    await getDb().collection(LOG_COLLECTION).insertOne({
      domain: 'vera',
      actionType: action,
      actionLabel: VERA_ACTIONS[action] || action,
      userId: action === 'vera:public-chat' ? null : user?.userId || null,
      username: action === 'vera:public-chat' ? null : user?.username || null,
      method: req.method,
      path: req.path,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('VERA log write failed:', error.message);
  }
}

// ── GET /api/vera/status ─────────────────────────────────────────────────────
async function getStatus(req, res) {
  try {
    const cfg = await loadConfig();
    const viewer = viewerFor(req, cfg);
    const ctx = vera.contextFor(viewer, '', cfg);
    return res.json({
      success: true,
      name: K.ASSISTANT_NAME,
      fullName: K.ASSISTANT_FULL_NAME,
      // `available` means the chat works at all — it still answers from the
      // help library without a model — so this is not `operational`.
      available: cfg.enabled !== false,
      showLauncher: cfg.showLauncher !== false,
      modelAvailable: provider.isOperational(cfg),
      role: ctx.role,
      starters: ctx.starters,
      welcomeMessage: String(cfg.welcomeMessage || '').trim() || K.GREETING_REPLY,
      maxInputChars: vera.MAX_INPUT_CHARS,
      sendPageContext: cfg.sendPageContext !== false,
    });
  } catch (error) {
    console.error('vera getStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assistant status' });
  }
}

/** Today's messages, for one user (staff) or everyone (both surfaces). */
function countToday(filter) {
  return getDb()
    .collection(LOG_COLLECTION)
    .countDocuments({ timestamp: { $gte: startOfToday() }, ...filter });
}

// ── POST /api/vera/chat ──────────────────────────────────────────────────────
async function chat(req, res) {
  const message = vera.sanitizeInput(req.body?.message);
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message) return res.status(400).json({ success: false, code: 'empty', message: `Please type a question for ${K.ASSISTANT_NAME}.` });

  let cfg = {};
  try {
    cfg = await loadConfig();
  } catch {
    cfg = {};
  }
  if (cfg.enabled === false) {
    return res.json({ success: false, code: 'disabled', message: `${K.ASSISTANT_NAME} is turned off. Contact your administrator.` });
  }

  const viewer = viewerFor(req, cfg);
  const page = cfg.sendPageContext === false ? '' : String(req.body?.page || '').slice(0, 60);
  const userId = principalOf(req)?.userId || null;

  // Caps. Best-effort: a counting failure must not block an answer, and the
  // help-library path costs nothing anyway.
  try {
    const perUser = provider.resolveUserDailyLimit(cfg);
    if (perUser > 0 && userId && (await countToday({ actionType: 'vera:chat', userId })) >= perUser) {
      return res.status(429).json({ success: false, code: 'user_limit', message: `You have reached today's assistant limit (${perUser} messages). Please try again tomorrow.` });
    }
    const everyone = provider.resolveDailyLimit(cfg);
    if (everyone > 0 && (await countToday({ actionType: { $in: ['vera:chat', 'vera:public-chat'] } })) >= everyone) {
      return res.status(429).json({ success: false, code: 'daily_limit', message: `${K.ASSISTANT_NAME} has reached today's limit for the office. Please try again tomorrow.` });
    }
  } catch {
    /* counting is best-effort */
  }

  // The same message from the same person within a few seconds is a
  // double-submit, not a second question.
  const requestHash = crypto.createHash('sha256').update(`${userId}|vera|${message}`).digest('hex');
  try {
    const dupe = await getDb().collection(LOG_COLLECTION).findOne({
      actionType: 'vera:chat',
      'details.requestHash': requestHash,
      timestamp: { $gte: new Date(Date.now() - 6000) },
    });
    if (dupe) return res.status(429).json({ success: false, code: 'duplicate', message: 'That question was just sent — one moment.' });
  } catch {
    /* ignore */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.resolveTimeoutMs(cfg) + 2000);
  const started = Date.now();
  // Kept outside the try so the help-library answer on failure can use them.
  let figures = null;
  try {
    figures = await countsFor(req, message, viewer, cfg);
    const result = await vera.answer({ message, history, page, config: cfg, viewer, figures, signal: controller.signal });
    log(req, 'vera:chat', {
      requestHash,
      source: result.source,
      usedModel: result.usedModel,
      hitIds: result.hitIds,
      page,
      role: viewer.role,
      chars: message.length,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      durationMs: Date.now() - started,
    });
    if (result.usedModel) {
      patchConfig({ lastSuccessfulConnectionAt: new Date(), lastError: '' }).catch(() => {});
    }
    return res.json({ success: true, answer: result.answer, source: result.source, usedModel: result.usedModel });
  } catch (error) {
    const safe = provider.sanitizeError(error);
    console.error('vera chat error:', safe.code);
    patchConfig({ lastError: safe.message, lastErrorAt: new Date() }).catch(() => {});
    log(req, 'vera:chat', { requestHash, source: 'fallback', usedModel: false, page, role: viewer.role, chars: message.length, code: safe.code, durationMs: Date.now() - started });
    // A provider failure still leaves the person with an answer. The reason
    // (no credit, a rejected key) is for administrators — it is recorded on
    // the settings screen — not for everyone who asks a question.
    return res.json({
      success: true,
      answer: vera.fallbackFor(message, viewer, page, cfg, figures),
      source: 'fallback',
      usedModel: false,
      notice: 'The AI model is unavailable right now, so this answer is from the help library.',
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── GET /api/vera/config ─────────────────────────────────────────────────────
async function getConfig(req, res) {
  try {
    const cfg = await loadConfig();
    return res.json({
      success: true,
      config: {
        enabled: cfg.enabled !== false,
        provider: provider.resolveProvider(cfg),
        model: cfg.model || '',
        maxTokens: cfg.maxTokens ?? null,
        temperature: cfg.temperature ?? null,
        requestTimeoutMs: cfg.requestTimeoutMs ?? null,
        perUserDailyLimit: cfg.perUserDailyLimit ?? null,
        dailyLimit: cfg.dailyLimit ?? null,
        showLauncher: cfg.showLauncher !== false,
        sendPageContext: cfg.sendPageContext !== false,
        developerMode: cfg.developerMode !== false,
        publicEnabled: cfg.publicEnabled === true,
        welcomeMessage: cfg.welcomeMessage || '',
        publicWelcomeMessage: cfg.publicWelcomeMessage || '',
        supportContact: cfg.supportContact || '',
        updatedAt: cfg.updatedAt || null,
      },
      status: provider.safeStatus(cfg),
      providers: Object.values(provider.PROVIDERS).map((p) => ({ value: p.id, label: p.label, envKey: p.envKey, defaultModel: p.defaultModel() })),
    });
  } catch (error) {
    console.error('vera getConfig error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assistant settings' });
  }
}

// ── PUT /api/vera/config ─────────────────────────────────────────────────────
async function updateConfig(req, res) {
  try {
    const b = req.body || {};
    // A key typed into the screen is refused outright rather than dropped, so
    // nobody believes one was saved. Keys live in the server environment only.
    if (b.apiKey) {
      const envKey = provider.PROVIDERS[provider.resolveProvider(b)].envKey;
      return res.status(400).json({ success: false, message: `The API key is not set here. Put it in the server environment (${envKey}) and restart the server.` });
    }
    const errors = [];
    const next = {};
    const unset = {};
    const bool = (k) => {
      if (b[k] !== undefined) next[k] = Boolean(b[k]);
    };
    // A blank number means "use the server environment's value".
    const number = (k, min, max) => {
      if (b[k] === undefined) return;
      if (b[k] === null || b[k] === '') {
        unset[k] = '';
        return;
      }
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < min || n > max) errors.push(`${k} must be between ${min} and ${max}`);
      else next[k] = n;
    };
    const text = (k, max) => {
      if (b[k] !== undefined) next[k] = String(b[k] || '').trim().slice(0, max);
    };

    ['enabled', 'showLauncher', 'sendPageContext', 'developerMode', 'publicEnabled'].forEach(bool);
    number('maxTokens', 64, 8192);
    number('temperature', 0, 1);
    number('requestTimeoutMs', 5000, 120000);
    number('perUserDailyLimit', 0, 10000);
    number('dailyLimit', 0, 100000);
    text('model', 120);
    text('welcomeMessage', 600);
    text('publicWelcomeMessage', 600);
    text('supportContact', 160);
    if (b.provider !== undefined) {
      if (!provider.PROVIDERS[b.provider]) errors.push('provider must be one of: anthropic, gemini');
      else next.provider = b.provider;
    }
    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    const before = await loadConfig();
    next.updatedAt = new Date();
    next.updatedBy = principalOf(req)?.username || null;
    await getDb().collection(CONFIG_COLLECTION).updateOne(
      { _id: CONFIG_ID },
      { $set: next, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true }
    );
    const cfg = await loadConfig();
    await log(req, 'vera:settings:updated', {
      changedKeys: [...Object.keys(next), ...Object.keys(unset)].filter((k) => !['updatedAt', 'updatedBy'].includes(k)),
      enabledBefore: before.enabled !== false,
      enabledAfter: cfg.enabled !== false,
    });
    return res.json({ success: true, status: provider.safeStatus(cfg) });
  } catch (error) {
    console.error('vera updateConfig error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save assistant settings' });
  }
}

// ── POST /api/vera/test ──────────────────────────────────────────────────────
async function testConnection(req, res) {
  try {
    const cfg = await loadConfig();
    if (!provider.resolveKey(cfg).key) {
      const envVar = provider.PROVIDERS[provider.resolveProvider(cfg)].envKey;
      return res.status(400).json({ success: false, code: 'not_configured', message: `No API key found. Set ${envVar} in the server environment and restart the server.` });
    }
    const result = await provider.testConnection(cfg);
    await patchConfig(
      result.ok ? { lastSuccessfulConnectionAt: new Date(), lastError: '' } : { lastError: result.message, lastErrorAt: new Date() }
    ).catch(() => {});
    await log(req, 'vera:test', {
      ok: result.ok,
      provider: result.provider || provider.resolveProvider(cfg),
      model: result.model || provider.resolveModel(cfg),
      code: result.code || '',
      durationMs: result.durationMs,
    });
    if (!result.ok) return res.status(502).json({ success: false, code: result.code, message: result.message });
    return res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      reply: result.text,
      durationMs: result.durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      // The master switch is separate from whether the key works.
      masterEnabled: provider.ENV.masterEnabled(),
    });
  } catch (error) {
    const safe = provider.sanitizeError(error);
    return res.status(502).json({ success: false, code: safe.code, message: safe.message });
  }
}

// ── GET /api/vera/usage ──────────────────────────────────────────────────────
async function getUsage(req, res) {
  try {
    await connectToMongo();
    const col = getDb().collection(LOG_COLLECTION);
    const since = startOfToday();
    const chats = { actionType: { $in: ['vera:chat', 'vera:public-chat'] } };
    const [today, total, byRole, tokens, failures] = await Promise.all([
      col.countDocuments({ ...chats, timestamp: { $gte: since } }),
      col.countDocuments(chats),
      col.aggregate([{ $match: { ...chats, timestamp: { $gte: since } } }, { $group: { _id: '$details.role', count: { $sum: 1 } } }]).toArray(),
      col
        .aggregate([
          { $match: { ...chats, timestamp: { $gte: since } } },
          {
            $group: {
              _id: null,
              inputTokens: { $sum: '$details.inputTokens' },
              outputTokens: { $sum: '$details.outputTokens' },
              modelAnswers: { $sum: { $cond: ['$details.usedModel', 1, 0] } },
            },
          },
        ])
        .toArray(),
      col.find({ actionType: 'vera:test', 'details.ok': false }).sort({ timestamp: -1 }).limit(5).toArray(),
    ]);
    return res.json({
      success: true,
      data: {
        messagesToday: today,
        messagesTotal: total,
        byRole: byRole.reduce((m, r) => ({ ...m, [r._id || 'unknown']: r.count }), {}),
        modelAnswersToday: tokens[0]?.modelAnswers || 0,
        inputTokensToday: tokens[0]?.inputTokens || 0,
        outputTokensToday: tokens[0]?.outputTokens || 0,
        recentFailures: failures.map((f) => ({ at: f.timestamp, by: f.username, code: f.details?.code || '' })),
      },
    });
  } catch (error) {
    console.error('vera getUsage error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assistant usage' });
  }
}

// ── GET /api/vera/logs ───────────────────────────────────────────────────────
async function getLogs(req, res) {
  try {
    await connectToMongo();
    const { action, role, source, usedModel, page: pageFilter, dateFrom, dateTo, search, pageNum, pageSize } = req.query;
    const q = { actionType: { $in: Object.keys(VERA_ACTIONS) } };
    if (action) {
      const wanted = String(action).split(',').map((a) => a.trim()).filter((a) => VERA_ACTIONS[a]);
      if (wanted.length) q.actionType = { $in: wanted };
    }
    if (role) q['details.role'] = String(role);
    if (source) q['details.source'] = String(source);
    if (usedModel === 'true') q['details.usedModel'] = true;
    if (usedModel === 'false') q['details.usedModel'] = { $ne: true };
    if (pageFilter) q['details.page'] = String(pageFilter);
    if (dateFrom || dateTo) {
      q.timestamp = {};
      if (dateFrom) q.timestamp.$gte = new Date(dateFrom);
      if (dateTo) q.timestamp.$lte = new Date(dateTo);
    }
    if (search) {
      // Who and what matched — never message content, because none is stored.
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ username: rx }, { 'details.hitIds': rx }, { 'details.page': rx }];
    }
    const size = Math.min(200, Math.max(1, Number(pageSize) || 25));
    const current = Math.max(1, Number(pageNum) || 1);
    const col = getDb().collection(LOG_COLLECTION);
    const [rows, total] = await Promise.all([
      col.find(q).sort({ timestamp: -1 }).skip((current - 1) * size).limit(size).toArray(),
      col.countDocuments(q),
    ]);
    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: String(r._id),
        at: r.timestamp,
        action: r.actionType,
        actionLabel: VERA_ACTIONS[r.actionType] || r.actionType,
        user: r.actionType === 'vera:public-chat' ? 'Sign-in page visitor' : r.username || '—',
        role: r.details?.role || '',
        page: r.details?.page || '',
        source: r.details?.source || '',
        usedModel: Boolean(r.details?.usedModel),
        hitIds: r.details?.hitIds || [],
        chars: r.details?.chars ?? null,
        inputTokens: r.details?.inputTokens || 0,
        outputTokens: r.details?.outputTokens || 0,
        durationMs: r.details?.durationMs ?? null,
        ok: r.details?.ok,
        code: r.details?.code || '',
        changedKeys: r.details?.changedKeys || [],
      })),
      pagination: { page: current, pageSize: size, total, pages: Math.ceil(total / size) || 1 },
      actions: Object.entries(VERA_ACTIONS).map(([value, label]) => ({ value, label })),
    });
  } catch (error) {
    console.error('vera getLogs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assistant logs' });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC — the sign-in pages, no session
// ────────────────────────────────────────────────────────────────────────────

// Process-local buckets: they exist to stop one browser or script running up
// cost, not as a distributed quota.
const publicBuckets = new Map();
const PUBLIC_WINDOW_MS = 60 * 1000;
const publicRateLimit = () => Number(process.env.VERA_PUBLIC_RATE_MAX) || 8;
const publicDayLimit = () => Number(process.env.VERA_PUBLIC_DAILY_MAX) || 60;

function checkPublicRate(ip) {
  const now = Date.now();
  if (publicBuckets.size > 500) {
    for (const [k, b] of publicBuckets) if (now - b.dayStart > 86400000) publicBuckets.delete(k);
  }
  let b = publicBuckets.get(ip);
  if (!b) {
    b = { windowStart: now, count: 0, dayStart: now, dayCount: 0 };
    publicBuckets.set(ip, b);
  }
  if (now - b.windowStart >= PUBLIC_WINDOW_MS) Object.assign(b, { windowStart: now, count: 0 });
  if (now - b.dayStart >= 86400000) Object.assign(b, { dayStart: now, dayCount: 0 });
  if (b.dayCount >= publicDayLimit()) return { ok: false, code: 'daily_limit', retryAfter: 3600 };
  if (b.count >= publicRateLimit()) return { ok: false, code: 'rate_limit', retryAfter: Math.ceil((PUBLIC_WINDOW_MS - (now - b.windowStart)) / 1000) };
  b.count += 1;
  b.dayCount += 1;
  return { ok: true };
}

const publicEnabled = (cfg) => cfg.enabled !== false && cfg.publicEnabled === true;

// ── GET /api/vera/public-status ──────────────────────────────────────────────
async function getPublicStatus(req, res) {
  try {
    const cfg = await loadConfig();
    if (!publicEnabled(cfg)) return res.json({ success: true, available: false, showLauncher: false });
    const ctx = vera.contextFor({ realm: 'public' }, req.query?.page, cfg);
    return res.json({
      success: true,
      name: K.ASSISTANT_NAME,
      fullName: K.ASSISTANT_FULL_NAME,
      available: true,
      showLauncher: cfg.showLauncher !== false,
      modelAvailable: provider.isOperational(cfg),
      role: 'public',
      starters: ctx.starters,
      welcomeMessage: String(cfg.publicWelcomeMessage || '').trim() || ctx.greeting,
      maxInputChars: vera.MAX_INPUT_CHARS,
      sendPageContext: true,
    });
  } catch {
    // An optional feature never breaks the sign-in page.
    return res.json({ success: true, available: false, showLauncher: false });
  }
}

// ── POST /api/vera/public-chat ───────────────────────────────────────────────
async function publicChat(req, res) {
  const message = vera.sanitizeInput(req.body?.message);
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message) return res.status(400).json({ success: false, code: 'empty', message: `Please type a question for ${K.ASSISTANT_NAME}.` });

  let cfg = {};
  try {
    cfg = await loadConfig();
  } catch {
    cfg = {};
  }
  if (!publicEnabled(cfg)) return res.status(404).json({ success: false, code: 'disabled', message: 'The assistant is not available on this page.' });

  const gate = checkPublicRate(req.ip || 'unknown');
  if (!gate.ok) {
    res.set('Retry-After', String(gate.retryAfter));
    return res.status(429).json({
      success: false,
      code: gate.code,
      message:
        gate.code === 'daily_limit'
          ? 'The assistant has reached today\'s limit for this connection. Please contact the administrator directly.'
          : "You're sending messages very quickly. Please wait a moment and try again.",
    });
  }
  try {
    const everyone = provider.resolveDailyLimit(cfg);
    if (everyone > 0 && (await countToday({ actionType: { $in: ['vera:chat', 'vera:public-chat'] } })) >= everyone) {
      return res.status(429).json({ success: false, code: 'daily_limit', message: 'The assistant has reached today\'s limit. Please contact the administrator directly.' });
    }
  } catch {
    /* best-effort */
  }

  const page = String(req.body?.page || '').slice(0, 60);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.resolveTimeoutMs(cfg) + 2000);
  const started = Date.now();
  const viewer = { realm: 'public' };
  try {
    const result = await vera.answer({ message, history, page, config: cfg, viewer, signal: controller.signal });
    // No user to attribute it to, and the address is NOT stored.
    log(req, 'vera:public-chat', {
      source: result.source,
      usedModel: result.usedModel,
      hitIds: result.hitIds,
      page,
      role: 'public',
      chars: message.length,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      durationMs: Date.now() - started,
    });
    return res.json({ success: true, answer: result.answer, source: result.source, usedModel: result.usedModel });
  } catch (error) {
    const safe = provider.sanitizeError(error);
    console.error('vera publicChat error:', safe.code);
    return res.json({ success: true, answer: vera.fallbackFor(message, viewer, page, cfg), source: 'fallback', usedModel: false });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getStatus,
  chat,
  getConfig,
  updateConfig,
  testConnection,
  getUsage,
  getLogs,
  getPublicStatus,
  publicChat,
  VERA_ACTIONS,
};
