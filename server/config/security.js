const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProduction = () => process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Session cookie
//
// The front-end is a static site and the API is a separate service, so in a
// deployed environment they sit on different hosts and the session cookie is
// sent cross-site. Browsers only accept a cross-site cookie when it is marked
// SameSite=None *and* Secure, so those two travel together.
//
// `app.set('trust proxy', 1)` must be in place before the session middleware
// runs, otherwise Express does not see Render's TLS termination and refuses to
// set a Secure cookie.
//
// Both values can be overridden for a deployment where the SPA and the API
// share an origin, which can then use the stricter SameSite=Lax.
// ---------------------------------------------------------------------------
function sessionCookieOptions() {
  const sameSite =
    process.env.SESSION_COOKIE_SAMESITE || (isProduction() ? 'none' : 'lax');

  const secure = process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : isProduction() || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 1000 * 60 * 60 * 24,
  };
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
    // Behind Render's proxy the client IP arrives in X-Forwarded-For; the app
    // sets `trust proxy`, so express-rate-limit reads req.ip correctly.
    handler: (req, res) => res.status(429).json({ message }),
  });

const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

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

module.exports = {
  isProduction,
  sessionCookieOptions,
  assertSessionSecret,
  securityHeaders,
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
};
