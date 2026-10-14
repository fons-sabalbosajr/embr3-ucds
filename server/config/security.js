const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
// The live getter, not the snapshot cors.js computes at module load: the
// snapshot cannot reflect an environment set after this file is first required,
// which makes the cookie decision untestable and dependent on import order.
const { getAllowedOrigins } = require('./cors');

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Whether every configured origin is served over HTTPS.
 *
 * This decides the cookie flags, because NODE_ENV cannot: "production" says
 * nothing about the transport. A browser silently discards a Secure cookie
 * sent over plain HTTP, so deriving `secure` from NODE_ENV alone locks every
 * user out of a LAN deployment — the failure looks like "login does nothing".
 */
function originsAreHttps() {
  const list = (getAllowedOrigins() || []).filter(Boolean);
  if (!list.length) return false;
  return list.every((o) => String(o).trim().startsWith('https://'));
}

// ---------------------------------------------------------------------------
// Session cookie
//
// The flags follow the transport, not NODE_ENV:
//
//   origins all https + production   SameSite=None; Secure   (cross-site, e.g.
//                                    a static SPA on one host, API on another)
//   anything else                    SameSite=Lax; not Secure
//
// This matters because "production" says nothing about whether the application
// is served over TLS. Serving a Secure cookie over plain http — a LAN
// deployment, say — makes the browser discard it: sign-in appears to succeed
// and every request afterwards is unauthenticated, with nothing in the log to
// explain it.
//
// SESSION_COOKIE_SAMESITE and SESSION_COOKIE_SECURE override both.
//
// Behind a TLS-terminating proxy, `app.set('trust proxy', 1)` must be in place
// before the session middleware runs or Express will not issue a Secure cookie.
// ---------------------------------------------------------------------------
function sessionCookieOptions() {
  const https = originsAreHttps();

  // SameSite=None is only needed when the cookie travels cross-site, and
  // browsers only accept it together with Secure — so it is offered only when
  // the origins are actually HTTPS. Everything else gets Lax, which is the
  // stricter option and works over plain HTTP.
  const sameSite =
    process.env.SESSION_COOKIE_SAMESITE || (isProduction() && https ? 'none' : 'lax');

  const secure =
    process.env.SESSION_COOKIE_SECURE !== undefined
      ? process.env.SESSION_COOKIE_SECURE === 'true'
      : sameSite === 'none' || (isProduction() && https);

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 1000 * 60 * 60 * 24,
  };
}

/**
 * Report a configuration that will not work, loudly, at startup.
 *
 * A Secure cookie over HTTP is the one that costs an afternoon: the browser
 * accepts the login response and drops the cookie, so every request after it
 * is unauthenticated and nothing in the log says why.
 */
function warnAboutCookieConfig() {
  const { secure, sameSite } = sessionCookieOptions();
  const https = originsAreHttps();

  if (secure && !https) {
    console.warn(
      'WARNING: the session cookie is marked Secure, but ALLOWED_ORIGINS is not\n' +
        '         all https. Browsers discard a Secure cookie sent over http, so\n' +
        '         sign-in will appear to succeed and then every request will be\n' +
        '         unauthenticated. Set SESSION_COOKIE_SECURE=false for a plain-http\n' +
        '         deployment, or serve the application over https.'
    );
  }

  if (sameSite === 'none' && !secure) {
    console.warn(
      'WARNING: SameSite=None requires Secure. Browsers will reject this cookie.'
    );
  }

  if (isProduction() && !https) {
    console.warn(
      `NOTE: running with NODE_ENV=production over non-https origins ` +
        `(${(getAllowedOrigins() || []).join(", ") || "none configured"}).\n` +
        `      The session cookie is ${secure ? 'Secure' : 'not Secure'}, SameSite=${sameSite}.`
    );
  }
}

/**
 * dotenv keeps a trailing semicolon as part of the value, so BYPASS_AUTH=true;
 * reads as the string "true;" — which is not "true", so the bypass is off by
 * accident rather than by intent. Tidying the file would then silently turn it
 * on. Say so rather than leaving it to be discovered.
 */
function warnAboutEnvFormatting() {
  const suspect = Object.entries(process.env)
    .filter(([k, v]) => typeof v === 'string' && /;\s*$/.test(v))
    .filter(([k]) => !k.startsWith('npm_') && k !== 'PATH' && k !== 'PATHEXT')
    .map(([k]) => k);

  if (suspect.length) {
    console.warn(
      `WARNING: these environment values end with a semicolon, which becomes\n` +
        `         part of the value: ${suspect.join(', ')}\n` +
        `         A flag like BYPASS_AUTH=true; is read as "true;" and is therefore\n` +
        `         off — removing the semicolon would turn it on. Remove them and set\n` +
        `         each flag explicitly.`
    );
  }
}

/** Fail fast rather than starting with a weak or missing session secret. */
function assertSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return;

  const message = !secret
    ? 'SESSION_SECRET is not set.'
    : 'SESSION_SECRET is shorter than 16 characters.';

  if (isProduction()) {
    console.error(`FATAL: ${message} Refusing to start.`);
    process.exit(1);
  }
  console.warn(`WARNING: ${message} Sessions are not secure.`);
}

// ---------------------------------------------------------------------------
// Response headers
//
// This process serves a JSON API plus two binary streams: PDFs read from the
// NAS and files under /uploads. Both are fetched and framed by the SPA, which
// is on a different origin, so three of Helmet's defaults have to be relaxed:
//
//   contentSecurityPolicy  a CSP on API responses governs nothing the SPA
//                          renders; the SPA carries its own.
//   frameguard             X-Frame-Options: SAMEORIGIN would stop the SPA
//                          embedding the PDF viewer iframe. Framing a JSON API
//                          is not a clickjacking vector — there is no UI to
//                          click through to.
//   crossOriginResourcePolicy  must allow cross-origin or the SPA cannot read
//                          the PDF or upload responses at all.
//
// Everything else Helmet sets (HSTS, X-Content-Type-Options, Referrer-Policy,
// removing X-Powered-By) applies unchanged.
// ---------------------------------------------------------------------------
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

// ---------------------------------------------------------------------------
// Rate limiting
//
// Applied only to the unauthenticated endpoints, which are the ones worth
// guessing against. Authenticated data routes are left alone: they are already
// behind a session check, and ordinary UCDS use is burst-heavy enough that a
// limit would produce false positives.
// ---------------------------------------------------------------------------
const limiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // The integration suites sign in many times against one in-process app, so
    // a shared IP budget would throttle the tests rather than an attacker.
    // Limited to NODE_ENV=test so a deployed environment is never exempt.
    skip: () => process.env.NODE_ENV === 'test',
    // Behind Render's proxy the client IP arrives in X-Forwarded-For; the app
    // sets `trust proxy`, so express-rate-limit reads req.ip correctly.
    handler: (req, res) => res.status(429).json({ message }),
  });

// Sign-in is limited per account and address, not per address alone. Keyed
// on the IP only, 20 attempts per 15 minutes was shared by everyone behind
// the same address — an office NAT, a proxy, the tailnet bridge — so on a
// busy morning the 21st colleague was locked out for typing nothing wrong.
// Guessing one account's password is still capped at 20; an address trying
// many accounts meets the wider ceiling below.
const loginKey = (req, res) => `${ipKeyGenerator(req, res)}|${String(req.body?.username || '').trim().toLowerCase()}`;
const loginLimiter = [
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: loginKey,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req, res) => res.status(429).json({ message: 'Too many sign-in attempts for this account. Please wait 15 minutes and try again.' }),
  }),
  limiter({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.',
  }),
];

const passwordResetLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many password-reset requests. Please wait an hour and try again.',
});

const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many registration requests. Please wait an hour and try again.',
});

// ---------------------------------------------------------------------------
// Limits for signed-in traffic, sized for ~500 people working at once.
//
// Keyed by the account, not the address: the whole office arrives from one
// NAT address, so an IP budget would throttle everyone for one person's
// behaviour, and a remote laptop on the tailnet would be the only one ever
// limited. Anonymous requests fall back to the address.
//
// Two tiers. Ordinary screens are chatty — the province register makes a
// burst of a dozen requests on open — so the general budget is generous and
// exists to stop a runaway tab or a script, not to shape normal use. The
// expensive tier is for endpoints that aggregate or scan whole collections
// (dashboard statistics, duplicate checks, exports, spreadsheet imports,
// report generation): a handful a minute per person is normal, hundreds is
// an attack or a bug, and either would take the database away from everyone.
// ---------------------------------------------------------------------------
const byAccount = (req, res) => req.session?.user?.userId || ipKeyGenerator(req, res);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: byAccount,
  standardHeaders: true,
  legacyHeaders: false,
  // A PDF read by ranges is one view in many pieces: counting each piece
  // ran a large scan into the limit, a piece was refused, and the viewer
  // stopped at 99%. The first request of a view (no Range) still counts.
  skip: (req) =>
    process.env.NODE_ENV === 'test' ||
    /^\/(healthz|readyz)/.test(req.path) ||
    (req.method === 'GET' && Boolean(req.headers.range) && /\/file\/preview$/.test(req.path)),
  handler: (req, res) => res.status(429).json({ message: 'Too many requests. Please slow down and try again in a moment.' }),
});

const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: byAccount,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) =>
    res.status(429).json({ message: 'This operation is limited to a few times a minute. Please wait and try again.' }),
});

module.exports = {
  isProduction,
  originsAreHttps,
  sessionCookieOptions,
  warnAboutCookieConfig,
  warnAboutEnvFormatting,
  assertSessionSecret,
  securityHeaders,
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
  apiLimiter,
  expensiveLimiter,
};
