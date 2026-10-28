// ---------------------------------------------------------------------------
// VERA GUARDRAILS — what may go in, and what may come out.
//
// assistant.js already refuses secrets, internals and out-of-scope questions
// before a model is reached. These are the two checks it lacked:
//
//   IN   Prompt injection: "ignore your instructions", "you are now…",
//        "repeat your system prompt". Refused deterministically, for every
//        role — a Developer has no more reason to rewrite VERA's rules than
//        anyone else, and the rules are what keep data from leaking.
//
//   OUT  Whatever the model writes is checked before anyone sees it:
//        - a value of a secret in this server's environment (an API key, the
//          database URI, the session secret) is cut out wherever it appears;
//        - anything shaped like a credential is cut out: API keys, bearer
//          and JSON web tokens, private keys, connection strings, passwords
//          written as "password: …";
//        - an answer that recites VERA's own instructions is replaced
//          altogether — it means an injection got past the input check;
//        - on the public pages, an email address other than the office's
//          own contact is removed: a visitor is never told who has an account.
// ---------------------------------------------------------------------------

const INJECTION_RE = [
  /\b(ignore|disregard|forget|override|bypass|skip)\b[^.?!]{0,40}\b(previous|prior|above|earlier|all|your|the|these|those|system)\b[^.?!]{0,30}\b(instructions?|rules?|prompts?|guidelines?|guardrails?|restrictions?|polic(y|ies)|directions?)\b/i,
  // "Your" or a word that can only mean VERA's own: "the rules for archive
  // boxes" is a question about E-Universe, "your rules" is not.
  /\b(reveal|show|print|repeat|output|display|tell me|give me|leak|dump|recite|what (are|were|is))\b[^.?!]{0,30}\b(your|system|hidden|initial|original|internal)\b[^.?!]{0,20}\b(prompt|instructions?|rules|configuration|guidelines)\b/i,
  /\byou\s+are\s+(now|no\s+longer)\b/i,
  /\b(act|behave|respond)\s+as\s+(if\s+you\s+(are|were)\s+)?(an?\s+)?(unrestricted|unfiltered|jailbroken|different|new)\b/i,
  /\b(pretend|imagine|roleplay|role-play)\b[^.?!]{0,30}\b(no|without)\s+(rules|restrictions|limits|filters|guardrails)\b/i,
  /\b(developer|god|admin|debug|sudo|dan|jailbreak)\s+mode\b/i,
  /\bjailbreak\w*\b/i,
  /\bdo\s+anything\s+now\b/i,
  /<\s*\/?\s*(system|instructions?|assistant)\s*>/i,
  /\[\s*(system|inst)\s*\]/i,
  /^\s*(system|assistant)\s*:/im,
];

const INJECTION_REPLY =
  "I can't set aside or change the way I work, and I don't share my instructions. " +
  "Ask me how to do something in E-Universe and I'll walk you through it.";

function looksLikeInjection(message) {
  const s = String(message || '');
  return INJECTION_RE.some((re) => re.test(s));
}

// ── Output ───────────────────────────────────────────────────────────────────

/** The environment variables whose values must never appear in an answer. */
const SECRET_ENV_RE = /(KEY|SECRET|TOKEN|PASS|PASSWORD|URI|DSN|CREDENTIAL)S?$/i;

function secretValues() {
  return Object.entries(process.env)
    .filter(([name, value]) => SECRET_ENV_RE.test(name) && typeof value === 'string' && value.trim().length >= 8)
    .map(([, value]) => value.trim());
}

const REDACTED = '[removed]';

const SECRET_SHAPES = [
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic key
  /\bsk-[A-Za-z0-9]{20,}/g, // OpenAI-style key
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub token
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack token
  /\btskey-[A-Za-z0-9-]{10,}/g, // Tailscale key
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JSON web token
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqps?|smb):\/\/[^\s"'`<>]+/gi,
  /\bs:[A-Za-z0-9_-]{20,}\.[A-Za-z0-9+/=]{20,}/g, // a signed session cookie value
];

// "password: hunter2", "pwd = …", "api_key: …" — the value, not the word.
// Only a value with a digit in it: "Password: Enter your new one" is help
// text, not a password.
const LABELLED_SECRET_RE = /\b(password|passwd|pwd|passphrase|api[_\s-]?key|secret|token|otp)(\s*[=:]\s*)(?=[^\s,;'"`]*\d)([^\s,;'"`]{6,})/gi;

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Lines of VERA's own system prompt (assistant.buildSystemPrompt). An answer
// carrying two of them is reciting the instructions.
const PROMPT_MARKERS = [
  /^\s*KNOWLEDGE:\s*$/m,
  /^\s*RULES:\s*$/m,
  /^\s*SCOPE\s+—/m,
  /^\s*TONE\s+—/m,
  /LIVE FIGURES \(as of/,
  /PORTAL FIGURES \(as of/,
  /YOU HAVE NO DATA ACCESS/,
  /Answer ONLY from the KNOWLEDGE below/,
];

const recitesPrompt = (text) => PROMPT_MARKERS.filter((re) => re.test(text)).length >= 2;

/**
 * The answer as it may be shown. `leaked` is true when the whole answer had
 * to be withheld; the caller then answers from the help library instead.
 * @param {string} text
 * @param {{realm?: string, support?: string, website?: string}} ctx
 */
function screenOutput(text, ctx = {}) {
  let out = String(text || '');
  if (recitesPrompt(out)) return { text: '', leaked: true, redactions: 1 };
  let redactions = 0;
  const cut = (re, replace = REDACTED) => {
    out = out.replace(re, (...m) => {
      const next = typeof replace === 'function' ? replace(...m) : replace;
      if (next !== m[0]) redactions += 1;
      return next;
    });
  };
  for (const value of secretValues()) {
    if (out.includes(value)) {
      redactions += 1;
      out = out.split(value).join(REDACTED);
    }
  }
  SECRET_SHAPES.forEach((re) => cut(re));
  cut(LABELLED_SECRET_RE, (_m, label, sep) => `${label}${sep}${REDACTED}`);
  if (ctx.realm === 'public') {
    const allowed = `${ctx.support || ''} ${ctx.website || ''}`.toLowerCase();
    cut(EMAIL_RE, (email) => (allowed.includes(String(email).toLowerCase()) ? email : REDACTED));
  }
  return { text: out, leaked: false, redactions };
}

module.exports = { looksLikeInjection, screenOutput, INJECTION_REPLY, recitesPrompt };
