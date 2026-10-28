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
const { roleOf, domainsOf, ermsUnitsOf, ROLES } = require('../services/authorization');
const provider = require('../services/vera/provider');
const vera = require('../services/vera/assistant');
const veraFigures = require('../services/vera/figures');
const veraLookup = require('../services/vera/lookup');
const K = require('../services/vera/knowledge');
const veraPolicy = require('../services/vera/policy');
const veraCache = require('../services/vera/semanticCache');
const modelUsage = require('../services/vera/modelUsage');
const tableBuilder = require('../services/vera/tableBuilder');

const CONFIG_COLLECTION = 'app-config';
const CONFIG_ID = 'vera-settings';
const LOG_COLLECTION = 'app-logs';

const VERA_ACTIONS = Object.freeze({
  'vera:chat': 'Chat (staff)',
  'vera:public-chat': 'Chat (sign-in page)',
  'vera:test': 'Connection test',
  'vera:settings:updated': 'Settings changed',
  'vera:corrections:scan': 'Data check (project types)',
  'vera:corrections:apply': 'Corrections applied',
  'vera:corrections:undo': 'Correction undone',
  'vera:corrections:auto-fix': 'Data fixed by VERA',
  'vera:serials:scan': 'Serial number check',
  'vera:serials:fix': 'Serial counters fixed',
  'vera:project-types:scan': 'Project type check',
  'vera:scan-text': 'Scan text read',
  'vera:ref-check': 'Ref. No. checked against the scan',
  'vera:ref-check:apply': 'Ref. No. corrected from the scan',
  'vera:ref-check:undo': 'Ref. No. correction undone',
  'vera:ref-check:keep': 'Encoded Ref. No. kept',
  'vera:project-types:settings': 'Project type check settings',
  'vera:project-types:apply': 'Project types corrected',
  'vera:project-types:undo': 'Project type correction undone',
  'vera:project-types:dismiss': 'Project type proposal set aside',
  'vera:links:scan': 'Data check (register links)',
  'vera:links:apply': 'Register links applied',
  'vera:links:undo': 'Register link undone',
  'vera:ucds-check:scan': 'Universe Central DB checked',
  'vera:ucds-check:apply': 'Universe Central DB fixes applied',
  'vera:ucds-check:undo': 'Universe Central DB fix undone',
  'vera:ucds-check:auto-fix': 'Universe Central DB fixed by VERA',
  'vera:table-draft': 'Table drafted by VERA',
  'vera:table-build': 'Table built by VERA from the register',
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
async function countsFor(req, message, viewer, cfg, page = '', history = []) {
  const user = principalOf(req);
  const activeYear = req.session?.activeYear;
  // "How many WWDP in San Fernando?" — and "how about in 2024?" after it:
  // counted on the register and answered by rule, exact, no model call
  // (services/vera/tableBuilder countFor).
  try {
    const counted = await registerCountFor(user, message, activeYear, history);
    if (counted) return { registerAnswer: counted.answer, text: counted.answer, asOf: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }), lookup: true };
  } catch (err) {
    console.warn('[VERA] register count unavailable:', err.message);
  }
  const counting = (async () => {
    if (!veraFigures.wantsFigures(message, page)) return null;
    const ctx = vera.contextFor(viewer, '', cfg);
    return veraFigures.figuresFor(message, user, { activeYear, pageLabels: ctx.pageLabels, page });
  })().catch((err) => {
    console.warn('[VERA] figures unavailable:', err.message);
    return null;
  });
  // "Find the file of…": the matching documents and establishments this person may see (services/vera/lookup).
  const finding = veraLookup.lookupFor(message, user, { activeYear }).catch((err) => {
    console.warn('[VERA] lookup unavailable:', err.message);
    return null;
  });
  const [figures, found] = await Promise.all([counting, finding]);
  if (!found) return figures;
  return {
    text: [found.text, figures?.text].filter(Boolean).join('\n\n'),
    asOf: figures?.asOf || new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }),
    role: figures?.role,
    lookup: true,
    // A firm's permit file: the law sections its findings rest on.
    ...(found.permitFiles ? { permits: found.permitFiles, lawRefs: found.lawRefs } : {}),
  };
}

/** "2024, 25 and 26", "2024-26": every year a question names, in full. */
function yearsIn(message) {
  const s = String(message || '');
  const out = [];
  let century = null;
  for (const m of s.matchAll(/\b(20\d{2}|\d{2})\b/g)) {
    if (m[1].length === 4) {
      out.push(Number(m[1]));
      century = Number(m[1].slice(0, 2)) * 100;
    } else if (century && /(?:,|\band\b|&|-|\bto\b|\bat\b)\s*$/i.test(s.slice(0, m.index))) {
      out.push(century + Number(m[1]));
    }
  }
  return [...new Set(out)];
}

// "How about in 2024?", "and Tarlac?", "paano sa 2025": a follow-up to a count.
const FOLLOW_UP_RE = /^\s*(?:(?:how|what)\s+about|and|also|paano|eh|sa|in|for|then|same|ganun|yung)\b/i;
const PROVINCE_NAMES_RE = /\b(aurora|bataan|bulacan|nueva\s+ecija|pampanga|tarlac|zambales)\b/gi;

/** A follow-up read onto the count it follows: its own years and province win, the rest carries over. */
function followUp(message, earlier) {
  if (String(message).length > 160 || (!FOLLOW_UP_RE.test(message) && !yearsIn(message).length && !new RegExp(PROVINCE_NAMES_RE.source, 'i').test(message))) return null;
  let carried = earlier;
  // Years named again replace the earlier ones (two-digit ones too: "2024, 25 and 26").
  if (yearsIn(message).length) carried = carried.replace(/\b20\d{2}\b(?:\s*(?:,|and|&|-|to)\s*\d{2}\b)*/gi, ' ');
  if (new RegExp(PROVINCE_NAMES_RE.source, 'i').test(message)) carried = carried.replace(PROVINCE_NAMES_RE, ' ');
  return `${message} ${carried}`;
}

/**
 * The count question to answer: the message itself, or — for a short
 * follow-up ("how about in 2024?", then "and Tarlac?") — the count it follows,
 * carried through the whole chain of follow-ups.
 */
function countQuestionOf(message, history) {
  if (tableBuilder.wantsCount(message)) return message;
  if (!Array.isArray(history)) return null;
  // The chat sends the new message as the last turn: the ones before are what it follows.
  const asked = history.filter((h) => h?.role === 'user' && typeof h.content === 'string').map((h) => h.content);
  if (asked.length && asked[asked.length - 1].trim() === String(message).trim()) asked.pop();
  let current = null;
  for (const t of asked) current = tableBuilder.wantsCount(t) ? t : current ? followUp(t, current) : null;
  return current ? followUp(message, current) : null;
}

const listYears = (ys) => (ys.length < 2 ? String(ys[0]) : `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`);

/**
 * A count of the register's establishments, for an account on the Universe
 * Central DB: in each year the question names that the account may enter
 * (else the active year), within the account's provinces. Years that keep
 * one register between them (up to 2026) are counted once and said so.
 */
async function registerCountFor(user, message, activeYear, history = []) {
  if (!user || !domainsOf(user).includes('ucds')) return null;
  const question = countQuestionOf(message, history);
  if (!question) return null;
  const { authorizedYears } = require('../services/authorization');
  const yearService = require('../services/yearService');
  const { collections } = require('../config/db');
  const named = yearsIn(message).length ? yearsIn(message) : yearsIn(question);
  const years = (named.length ? named : [Number(activeYear) || new Date().getFullYear()]).sort((a, b) => a - b);
  const may = await authorizedYears(user);
  const open = years.filter((y) => may.includes(y));
  const shut = years.filter((y) => !may.includes(y));
  if (!open.length) return { answer: `There is no ${listYears(shut)} Monitoring Plan your account may open, so I cannot count it. The years you may open: ${listYears(may.sort((a, b) => a - b))}.` };

  // One count per register: the years before 2027 share theirs.
  const registers = new Map();
  for (const y of open) {
    const container = await yearService.getYear(y).catch(() => null);
    const name = container?.register && /^ucds-data-\d{4}$/.test(container.register) ? container.register : collections.ucds.collectionName;
    if (!registers.has(name)) registers.set(name, { col: name === collections.ucds.collectionName ? collections.ucds : getDb().collection(name), container, years: [] });
    registers.get(name).years.push(y);
  }
  const counts = [];
  for (const g of registers.values()) {
    const r = await tableBuilder.countFor(question, { col: g.col, user, container: g.container, year: listYears(g.years) });
    if (!r) return null;
    counts.push({ ...g, ...r });
  }
  if (counts.length === 1 && counts[0].years.length === 1 && !shut.length) return counts[0];

  const n = (x) => new Intl.NumberFormat('en-PH').format(x);
  const lines = ['By year — counted just now from every record you may see:', ''];
  for (const c of counts) {
    lines.push(
      `- **${listYears(c.years)}**: **${n(c.total)}** establishment${c.total === 1 ? '' : 's'}${c.numbers != null && c.numbers !== c.total ? `, ${n(c.numbers)} ${c.kindName} number${c.numbers === 1 ? '' : 's'}` : ''}` +
        (c.years.length > 1 ? ` — these years share one register (the Monitoring Plan as kept before 2027, with no year on its rows), so the count is the same for each` : '')
    );
  }
  lines.push('', `Conditions: ${counts[0].where}.`);
  if (shut.length) lines.push('', `Not counted: ${listYears(shut)} — there is no Monitoring Plan for ${shut.length === 1 ? 'that year' : 'those years'} that your account may open.`);
  return { answer: lines.join('\n'), total: counts.reduce((s, c) => s + c.total, 0) };
}

/** The public Document Portal: its search and its totals, nothing more (services/vera/lookup). */
async function portalFiguresFor(message, page) {
  if (String(page || '').toLowerCase() !== 'document-portal') return null;
  try {
    const found = await veraLookup.portalLookupFor(message);
    if (!found) return null;
    return { text: found.text, asOf: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }), lookup: Boolean(found.terms), portal: true };
  } catch (err) {
    console.warn('[VERA] portal lookup unavailable:', err.message);
    return null;
  }
}

/** Who VERA is talking to: the account's role and domains, from the session. */
function viewerFor(req, cfg) {
  const user = principalOf(req);
  if (!user) return { realm: 'staff', role: 'staff', domains: [], access: { model: false, figures: false } };
  const role = roleOf(user);
  return {
    realm: 'staff',
    role: role === ROLES.DEVELOPER && cfg?.developerMode !== false ? 'developer' : role,
    domains: domainsOf(user),
    // Records, Legal Services or Laboratory: the suggestions and articles follow it.
    ermsUnits: ermsUnitsOf(user),
    // What the administrator lets this account type use (services/vera/policy).
    access: veraPolicy.accessFor(cfg, role),
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
    // A chat — by the model, the cache or the library — changes the Models
    // tab's counts: open tabs reload (at most every 5 seconds).
    if (action === 'vera:chat' || action === 'vera:public-chat') modelUsage.changed();
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
  let timer = null;
  const started = Date.now();
  // Kept outside the try so the help-library answer on failure can use them.
  let figures = null;
  try {
    figures = viewer.access?.figures === false ? null : await countsFor(req, message, viewer, cfg, page, history);
    // The model's time starts once the figures are counted: counting on a
    // busy database used to eat into it and time the answer out.
    timer = setTimeout(() => controller.abort(), provider.resolveTimeoutMs(cfg) + 2000);
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
      // Which model the router chose, and whether a guardrail acted.
      model: result.model || null,
      tier: result.tier || null,
      guardrail: result.guardrail || null,
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
        perUserDailyLimit: cfg.perUserDailyLimit ?? null,
        dailyLimit: cfg.dailyLimit ?? null,
        showLauncher: cfg.showLauncher !== false,
        sendPageContext: cfg.sendPageContext !== false,
        developerMode: cfg.developerMode !== false,
        publicEnabled: cfg.publicEnabled === true,
        // The public Document Portal: on unless turned off.
        portalEnabled: cfg.portalEnabled !== false,
        welcomeMessage: cfg.welcomeMessage || '',
        publicWelcomeMessage: cfg.publicWelcomeMessage || '',
        supportContact: cfg.supportContact || '',
        // Where public visitors asking for counts are sent (blank: the default).
        officeWebsite: cfg.officeWebsite || '',
        // Cost and safety: the semantic cache, the model router, failover to
        // the other provider, and what each account type may use.
        semanticCache: cfg.semanticCache !== false,
        modelRouting: cfg.modelRouting !== false,
        crossProviderFallback: cfg.crossProviderFallback !== false,
        roleAccess: veraPolicy.describe(cfg),
        updatedAt: cfg.updatedAt || null,
      },
      cache: veraCache.stats(),
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

    ['enabled', 'showLauncher', 'sendPageContext', 'developerMode', 'publicEnabled', 'portalEnabled', 'semanticCache', 'modelRouting', 'crossProviderFallback'].forEach(bool);
    // The form sends the table it shows: [{ role, model, figures }, …].
    if (b.roleAccess !== undefined) {
      const rows = Array.isArray(b.roleAccess)
        ? Object.fromEntries(b.roleAccess.filter((r) => r && r.role).map(({ role, model, figures }) => [role, { model, figures }]))
        : b.roleAccess;
      const parsed = veraPolicy.parse(rows);
      if (parsed.error) errors.push(parsed.error);
      else next.roleAccess = parsed.value;
    }
    number('maxTokens', 64, 8192);
    // No longer settings (services/vera/provider resolveTemperature): a value
    // saved before goes on the next save, so none lingers out of sight.
    unset.temperature = '';
    unset.requestTimeoutMs = '';
    number('perUserDailyLimit', 0, 10000);
    number('dailyLimit', 0, 100000);
    text('model', 120);
    text('welcomeMessage', 600);
    text('publicWelcomeMessage', 600);
    text('supportContact', 160);
    if (b.officeWebsite !== undefined) {
      const site = String(b.officeWebsite || '').trim().slice(0, 200);
      if (site && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(site)) errors.push('officeWebsite must be a web address starting with http:// or https://');
      else next.officeWebsite = site;
    }
    if (b.provider !== undefined) {
      if (!provider.PROVIDERS[b.provider]) errors.push(`provider must be one of: ${Object.keys(provider.PROVIDERS).join(', ')}`);
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
    // Cached answers were written under the old settings.
    veraCache.clear();
    await log(req, 'vera:settings:updated', {
      changedKeys: [...Object.keys(next), ...Object.keys(unset)].filter((k) => !['updatedAt', 'updatedBy', 'temperature', 'requestTimeoutMs'].includes(k)),
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
    // Degraded: VERA answers, but not with the chosen model — both recorded.
    await patchConfig(
      result.ok
        ? {
            lastSuccessfulConnectionAt: new Date(),
            ...(result.degraded ? { lastError: `${result.configuredModel}: ${result.configuredError.message}`, lastErrorAt: new Date() } : { lastError: '' }),
          }
        : { lastError: result.message, lastErrorAt: new Date() }
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
      // The chosen model did not answer; `model` is the one that did.
      degraded: Boolean(result.degraded),
      configuredModel: result.configuredModel || null,
      configuredError: result.configuredError?.message || null,
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
              cacheAnswers: { $sum: { $cond: [{ $eq: ['$details.source', 'cache'] }, 1, 0] } },
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
        // Answered from the semantic cache: requests and tokens not spent.
        cacheAnswersToday: tokens[0]?.cacheAnswers || 0,
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

// ── GET /api/vera/models ─────────────────────────────────────────────────────
// The Models tab: each model VERA may use — its place in the route, whether it
// is answering or resting and until when, its use today and in the provider's
// quota window, and 14 days of history per model (services/vera/modelUsage).
async function getModels(req, res) {
  try {
    const cfg = await loadConfig();
    const status = provider.routerStatus(cfg);
    const roles = Object.fromEntries(status.route.map((c) => [`${c.provider}|${c.model}`, c.role]));
    const keys = Object.fromEntries(Object.keys(provider.PROVIDERS).map((p) => [p, Boolean(provider.ENV.key(p))]));
    // What each model is (context window, longest answer) from its provider,
    // cached there for hours; and what VERA's integration does with it.
    const ids = status.route.map((c) => `${c.provider}|${c.model}`);
    const info = Object.fromEntries(await Promise.all(status.route.map(async (c) => [`${c.provider}|${c.model}`, await provider.modelInfo(c.provider, c.model)])));
    const caps = Object.fromEntries(ids.map((k) => [k, provider.capabilitiesOf(...k.split('|'))]));
    const data = await modelUsage.report({ route: status.route, roles, keys, days: 14, info, caps });
    return res.json({
      success: true,
      data: {
        ...data,
        router: { routing: status.routing, crossProvider: status.crossProvider, lightModel: status.lightModel },
        masterEnabled: provider.ENV.masterEnabled(),
        // Providers VERA can use, and which have a key — so the screen can say what adding one would bring.
        providers: Object.values(provider.PROVIDERS).map((p) => ({ id: p.id, label: p.label, envKey: p.envKey, keyPresent: keys[p.id], defaultModel: p.defaultModel() })),
        // The environmental laws VERA answers from (services/vera/lawRetrieval).
        laws: require('../services/vera/lawRetrieval').summary(),
        cache: veraCache.stats(),
      },
    });
  } catch (error) {
    console.error('vera getModels error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load the model usage' });
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
        user: r.actionType === 'vera:public-chat' ? (isPortalPage(r.details?.page) ? 'Document Portal visitor' : 'Sign-in page visitor') : r.username || '—',
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

// The sign-in pages need an administrator to turn VERA on for them; the
// Document Portal has her whenever VERA is on, unless it is turned off there
// (Admin Settings › VERA Assistant › Document Portal).
const PORTAL_PAGE = 'document-portal';
const isPortalPage = (page) => String(page || '').toLowerCase() === PORTAL_PAGE;
const publicEnabled = (cfg, page) =>
  cfg.enabled !== false && (isPortalPage(page) ? cfg.portalEnabled !== false : cfg.publicEnabled === true);

// ── GET /api/vera/public-status ──────────────────────────────────────────────
async function getPublicStatus(req, res) {
  try {
    const cfg = await loadConfig();
    if (!publicEnabled(cfg, req.query?.page)) return res.json({ success: true, available: false, showLauncher: false });
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
      // The portal introduces her in its own words; the sign-in pages may use the administrator's.
      welcomeMessage: (ctx.portal ? '' : String(cfg.publicWelcomeMessage || '').trim()) || ctx.greeting,
      // On the portal she says hello by herself (front-end VeraChat introduce).
      introduce: Boolean(ctx.portal),
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
  if (!publicEnabled(cfg, req.body?.page)) return res.status(404).json({ success: false, code: 'disabled', message: 'The assistant is not available on this page.' });

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
  let figures = null;
  try {
    figures = await portalFiguresFor(message, page);
    const result = await vera.answer({ message, history, page, config: cfg, viewer, figures, signal: controller.signal });
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
    return res.json({ success: true, answer: vera.fallbackFor(message, viewer, page, cfg, figures), source: 'fallback', usedModel: false });
  } finally {
    clearTimeout(timer);
  }
}

// ── Data corrections (Developer) ─────────────────────────────────────────────
// VERA's report on the Records project types and specific project types, and
// applying or undoing what it proposes. See services/vera/dataCorrections.

const corrections = require('../services/vera/dataCorrections');

async function correctionsReport(req, res, next) {
  try {
    return res.json(await corrections.latest());
  } catch (err) {
    return next(err);
  }
}

async function correctionsScan(req, res, next) {
  try {
    const cfg = await loadConfig();
    const run = await corrections.scan({ cfg, by: principalOf(req)?.username || null });
    await log(req, 'vera:corrections:scan', { proposals: run.totals.proposals, records: run.totals.records });
    return res.json(await corrections.latest());
  } catch (err) {
    return next(err);
  }
}

async function correctionsApply(req, res, next) {
  try {
    const ids = req.body?.all === true ? 'all' : (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (ids !== 'all' && !ids.length) return res.status(400).json({ message: 'Choose the corrections to apply.' });
    const result = await corrections.apply(req.params.id, ids, principalOf(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:corrections:apply', { report: req.params.id, applied: result.applied, records: result.changed });
    return res.json({ ...result, report: await corrections.latest() });
  } catch (err) {
    return next(err);
  }
}

async function correctionsUndo(req, res, next) {
  try {
    const result = await corrections.undo(req.params.id, Number(req.body?.proposalId), principalOf(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:corrections:undo', { report: req.params.id, proposal: Number(req.body?.proposalId), records: result.restored });
    return res.json({ ...result, report: await corrections.latest() });
  } catch (err) {
    return next(err);
  }
}

async function correctionsAutoFix(req, res, next) {
  try {
    const cfg = await loadConfig();
    const who = principalOf(req);
    const result = await corrections.autoFix({ cfg, by: who?.username || null, user: who });
    await log(req, 'vera:corrections:auto-fix', { applied: result.applied, records: result.changed, left: result.left });
    return res.json({ ...result, report: await corrections.latest() });
  } catch (err) {
    return next(err);
  }
}

// ── Serial numbers (Developer) ── see services/vera/serialCheck ─────────────
const serialCheck = require('../services/vera/serialCheck');

async function serialsReport(req, res, next) {
  try {
    return res.json({ report: await serialCheck.latest() });
  } catch (err) {
    return next(err);
  }
}

async function serialsScan(req, res, next) {
  try {
    const report = await serialCheck.scan({ by: principalOf(req)?.username || null });
    await log(req, 'vera:serials:scan', report.totals);
    return res.json({ report });
  } catch (err) {
    return next(err);
  }
}

async function serialsFix(req, res, next) {
  try {
    const { fixed, report } = await serialCheck.fix({ by: principalOf(req)?.username || null });
    await log(req, 'vera:serials:fix', { fixed, ...report.totals });
    return res.json({ fixed, report });
  } catch (err) {
    return next(err);
  }
}

// ── Project types from the document (Developer) ── services/vera/projectTypeCheck ─
const projectTypeCheck = require('../services/vera/projectTypeCheck');

async function projectTypesReport(req, res, next) {
  try {
    const cfg = await loadConfig();
    return res.json({ settings: projectTypeCheck.settingsOf(cfg), operational: provider.isOperational(cfg), ...(await projectTypeCheck.report()) });
  } catch (err) {
    return next(err);
  }
}

async function projectTypesSettings(req, res, next) {
  try {
    const settings = projectTypeCheck.cleanSettings(req.body || {});
    await patchConfig({ projectTypeCheck: settings });
    await log(req, 'vera:project-types:settings', settings);
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
}

async function projectTypesScan(req, res, next) {
  try {
    const result = await projectTypeCheck.scan({ cfg: await loadConfig(), by: principalOf(req)?.username || null });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:project-types:scan', result.totals);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function projectTypesApply(req, res, next) {
  try {
    const serials = req.body?.all === true ? 'all' : (Array.isArray(req.body?.serialNos) ? req.body.serialNos : []).map(String).slice(0, 500);
    if (serials !== 'all' && !serials.length) return res.status(400).json({ message: 'Choose the proposals to apply.' });
    const result = await projectTypeCheck.apply(serials, principalOf(req));
    await log(req, 'vera:project-types:apply', result);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function projectTypesSettle(req, res, next) {
  try {
    const action = req.params.action === 'undo' ? 'undo' : 'dismiss';
    const result = await projectTypeCheck.settle(String(req.params.serialNo), action, principalOf(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, `vera:project-types:${action}`, { serialNo: req.params.serialNo });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// ── Reading scans' text, for search (services/vera/scanText) ──────────────
const scanText = require('../services/vera/scanText');
const { canAccessAllYears: allYears } = require('../services/authorization');

async function scanTextOne(req, res, next) {
  try {
    if (!allYears(principalOf(req))) return res.status(403).json({ message: 'Only the Developer or an administrator has scans read.' });
    const unit = String(req.params.unit || 'records');
    const result = await scanText.readOne(await loadConfig(), unit, String(req.params.serialNo), principalOf(req)?.username || null);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:scan-text', { unit, serialNo: req.params.serialNo, chars: result.text.length });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function scanTextNext(req, res, next) {
  try {
    const unit = ['records', 'legal', 'laboratory'].includes(req.body?.unit) ? req.body.unit : 'records';
    const result = await scanText.readNext(await loadConfig(), unit, Number(req.body?.limit) || 10, principalOf(req)?.username || null);
    await log(req, 'vera:scan-text', { unit, ...result });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// ── Ref. Nos. against the scan (services/vera/refNoCheck) ─────────────────
// The report and the next few read here (the Developer's); one record is
// checked, applied or kept from its own page (modules/erms recordController),
// under the record's own access rules.
const refNoCheck = require('../services/vera/refNoCheck');

async function refNumbersReport(req, res, next) {
  try {
    return res.json({ operational: provider.isOperational(await loadConfig()), ...(await refNoCheck.report()) });
  } catch (err) {
    return next(err);
  }
}

async function refNumbersScan(req, res, next) {
  try {
    const result = await refNoCheck.checkNext(await loadConfig(), Number(req.body?.limit) || 20, principalOf(req)?.username || null);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:ref-check', { batch: true, ...result.totals, left: result.left });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

/** For the bell: how many proposals wait. */
async function correctionsPending(req, res, next) {
  try {
    return res.json({ pending: await corrections.pendingCount() });
  } catch (err) {
    return next(err);
  }
}

// ── Register links (Developer) ───────────────────────────────────────────────
// VERA's report on Records Document Library entries not linked to their
// establishment in the central register. See services/vera/registerLinks.

const registerLinks = require('../services/vera/registerLinks');

async function linksReport(req, res, next) {
  try {
    return res.json(await registerLinks.latest());
  } catch (err) {
    return next(err);
  }
}

async function linksScan(req, res, next) {
  try {
    const cfg = await loadConfig();
    const run = await registerLinks.scan({ cfg, by: principalOf(req)?.username || null });
    await log(req, 'vera:links:scan', { unlinked: run.totals.unlinked, proposals: run.totals.proposals });
    return res.json(await registerLinks.latest());
  } catch (err) {
    return next(err);
  }
}

async function linksApply(req, res, next) {
  try {
    const ids = req.body?.all === true ? 'all' : (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (ids !== 'all' && !ids.length) return res.status(400).json({ message: 'Choose the links to apply.' });
    const result = await registerLinks.apply(req.params.id, ids, principalOf(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:links:apply', { report: req.params.id, applied: result.applied, skipped: result.skipped });
    return res.json({ ...result, report: await registerLinks.latest() });
  } catch (err) {
    return next(err);
  }
}

async function linksUndo(req, res, next) {
  try {
    const result = await registerLinks.undo(req.params.id, Number(req.body?.proposalId), principalOf(req));
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:links:undo', { report: req.params.id, proposal: Number(req.body?.proposalId), records: result.restored });
    return res.json({ ...result, report: await registerLinks.latest() });
  } catch (err) {
    return next(err);
  }
}

/** For the bell: how many links wait. */
async function linksPending(req, res, next) {
  try {
    return res.json({ pending: await registerLinks.pendingCount() });
  } catch (err) {
    return next(err);
  }
}

// ── The Universe Central DB register ── see modules/ucds/services/registerCheck
// Always the active year's register (2027 onward has its own), never one
// named in the request.
const registerCheck = require('../modules/ucds/services/registerCheck');
const { registerOf } = require('../services/yearScope');
const registerTarget = (req) => {
  const col = registerOf(req);
  return { col, register: col.collectionName };
};

// ── The bell: what VERA repaired, and what waits ─────────────────────────────
const notifier = require('../services/notifier');
const REPAIRS_DAYS = 7;

/**
 * VERA changed the register (fixes applied, an undo, "Let VERA fix it"):
 * every open bell counts again, and the other maintainers are told.
 */
function announceRepair(req, register, changed, what) {
  notifier.broadcast('vera:repaired', { register });
  if (!changed) return;
  const by = principalOf(req)?.username || null;
  notifier.notifyLater(
    async () =>
      (await getDb().collection('users').find({ permission: { $in: ['developer', 'admin'] }, username: { $ne: by } }, { projection: { username: 1, domains: 1, permission: 1 } }).toArray())
        .filter((u) => u.permission === 'developer' || domainsOf(u).includes('ucds'))
        .map((u) => u.username),
    { title: 'VERA repaired the register', body: `${what}: ${changed} record(s) in ${register}${by ? `, approved by ${by}` : ''}.`, url: '/e-universe/vera-check', kind: 'vera-repaired', tag: 'vera-repaired' }
  );
}

/** GET /api/vera/repairs — for the bell: the latest register check of the active year, summed up. */
async function repairsSummary(req, res, next) {
  try {
    const { register } = registerTarget(req);
    const run = await getDb().collection(registerCheck.COLLECTION).find({ register }).sort({ startedAt: -1 }).limit(1).next();
    if (!run) return res.json({ register, checkedAt: null, repaired: null, waiting: 0, review: [] });
    const since = new Date(Date.now() - REPAIRS_DAYS * 24 * 3600 * 1000);
    const applied = (run.proposals || []).filter((p) => p.applied && !p.superseded && p.appliedAt && new Date(p.appliedAt) >= since);
    const byField = new Map();
    for (const p of applied) {
      const label = p.field === 'coordinates' ? 'Coordinates' : p.field === 'ecc_cnc' ? 'ECC/CNC (from ERMS)' : registerCheck.FIELDS[p.field]?.label || p.field;
      byField.set(label, (byField.get(label) || 0) + (p.changed || 0));
    }
    return res.json({
      register,
      checkedAt: run.finishedAt,
      repaired: { since, fixes: applied.length, records: applied.reduce((s, p) => s + (p.changed || 0), 0), byField: [...byField].map(([label, records]) => ({ label, records })).sort((a, b) => b.records - a.records) },
      waiting: (run.proposals || []).filter((p) => !p.applied).length,
      review: (run.review || []).filter((r) => r.count).map((r) => ({ key: r.key, label: r.label, count: r.count })),
    });
  } catch (err) {
    return next(err);
  }
}

async function ucdsCheckReport(req, res, next) {
  try {
    return res.json(await registerCheck.latest(registerTarget(req).register));
  } catch (err) {
    return next(err);
  }
}

async function ucdsCheckScan(req, res, next) {
  try {
    const target = registerTarget(req);
    const run = await registerCheck.scan({ ...target, cfg: await loadConfig(), by: principalOf(req)?.username || null });
    await log(req, 'vera:ucds-check:scan', { register: target.register, ...run.totals });
    return res.json(await registerCheck.latest(target.register));
  } catch (err) {
    return next(err);
  }
}

async function ucdsCheckApply(req, res, next) {
  try {
    const ids = req.body?.all === true ? 'all' : (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (ids !== 'all' && !ids.length) return res.status(400).json({ message: 'Choose the fixes to apply.' });
    const target = registerTarget(req);
    const result = await registerCheck.apply({ ...target, runId: req.params.id, ids, user: principalOf(req) });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:ucds-check:apply', { register: target.register, applied: result.applied, records: result.changed });
    announceRepair(req, target.register, result.changed, `${result.applied} fix(es) applied`);
    return res.json({ ...result, report: await registerCheck.latest(target.register) });
  } catch (err) {
    return next(err);
  }
}

async function ucdsCheckUndo(req, res, next) {
  try {
    const target = registerTarget(req);
    const result = await registerCheck.undo({ ...target, runId: req.params.id, id: Number(req.body?.proposalId), user: principalOf(req) });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    await log(req, 'vera:ucds-check:undo', { register: target.register, proposal: Number(req.body?.proposalId), records: result.restored });
    announceRepair(req, target.register, 0);
    return res.json({ ...result, report: await registerCheck.latest(target.register) });
  } catch (err) {
    return next(err);
  }
}

async function ucdsCheckAutoFix(req, res, next) {
  try {
    const target = registerTarget(req);
    const who = principalOf(req);
    const result = await registerCheck.autoFix({ ...target, cfg: await loadConfig(), by: who?.username || null, user: who });
    await log(req, 'vera:ucds-check:auto-fix', { register: target.register, applied: result.applied, records: result.changed, left: result.left });
    announceRepair(req, target.register, result.changed, 'Fixed by VERA (certain fixes only)');
    return res.json({ ...result, report: await registerCheck.latest(target.register) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/vera/permit-analysis ───────────────────────────────────────────
// One record's clearances and permits against the laws, for its Clearances
// and Permits tab — from the record the screen holds (edits included), so it
// reads nothing the viewer does not already have (services/vera/permitAnalysis).
const permitAnalysis = require('../services/vera/permitAnalysis');

function analyzePermits(req, res) {
  const record = req.body?.record;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return res.status(400).json({ success: false, message: 'Send the record to analyse.' });
  const row = Object.fromEntries(permitAnalysis.FIELDS.map((f) => [f, typeof record[f] === 'object' ? null : record[f] ?? null]));
  const { permits, findings, summary, nov } = permitAnalysis.analyze(row);
  return res.json({
    success: true,
    asOf: new Date().toISOString(),
    permits,
    summary,
    nov,
    findings: findings.map((f) => ({ ...f, refs: f.refs.map(([law, section]) => `${law}:${section}`), citation: f.refs.length ? permitAnalysis.citation(f.refs) : '' })),
    law: permitAnalysis.lawTextOf(permitAnalysis.refsOf(findings)),
  });
}

module.exports = {
  analyzePermits,
  repairsSummary,
  // For tests: reading the years and the follow-ups of a count question.
  yearsIn,
  countQuestionOf,
  registerCountFor,
  getModels,
  ucdsCheckReport,
  ucdsCheckScan,
  ucdsCheckApply,
  ucdsCheckUndo,
  ucdsCheckAutoFix,
  scanTextOne,
  scanTextNext,
  refNumbersReport,
  refNumbersScan,
  // For the record page's Ref. No. check (modules/erms recordController).
  loadConfig,
  log,
  projectTypesReport,
  projectTypesSettings,
  projectTypesScan,
  projectTypesApply,
  projectTypesSettle,
  correctionsAutoFix,
  serialsReport,
  serialsScan,
  serialsFix,
  linksReport,
  linksScan,
  linksApply,
  linksUndo,
  linksPending,
  correctionsReport,
  correctionsScan,
  correctionsApply,
  correctionsUndo,
  correctionsPending,
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
