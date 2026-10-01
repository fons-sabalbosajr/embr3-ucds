const signature = require('cookie-signature');

// ---------------------------------------------------------------------------
// One sign-in per browser tab.
//
// The session is an express-session cookie, and a browser has one cookie jar:
// on its own, signing in as a second account in a new tab turns every other
// tab into that account. So each tab also holds its own copy of the session
// reference — the same signed value the cookie carries — in sessionStorage,
// which the browser keeps per tab, and sends it on every request:
//
//   X-Session-Token: s:<sid>.<signature>     fetch / axios (the normal path)
//   ?st=s:<sid>.<signature>                  URLs the browser loads itself:
//                                            an <iframe> preview, a download
//
// When a request carries one, it replaces the cookie before express-session
// reads it, so the session that answers is the tab's, whatever the cookie
// says. Nothing else changes: the store, the expiry, every check that reads
// req.session.user. Sign-in creates a fresh session rather than reusing the
// cookie's (which may be another tab's), and hands the token back in the
// response body. The cookie remains as the fallback for a tab that has no
// token yet — a freshly opened one — which adopts the token from
// /api/auth/me on its first load.
//
// A request that presents no token behaves exactly as before — and, when it
// is signed in by the cookie, is answered with an X-Session-Token header so
// the tab can pin itself on its first response, whichever screen it landed on.
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'connect.sid';
const HEADER = 'x-session-token';
const RESPONSE_HEADER = 'X-Session-Token';
const QUERY = 'st';
const TOKEN_RE = /^s:[A-Za-z0-9_-]+\.[A-Za-z0-9+/=]+$/;

/** Something that looks like a signed session cookie value, or null. */
function presentedToken(req) {
  const fromHeader = req.get(HEADER);
  const fromQuery = req.query && typeof req.query[QUERY] === 'string' ? req.query[QUERY] : null;
  const token = fromHeader || fromQuery || null;
  return token && TOKEN_RE.test(token) && token.length < 256 ? token : null;
}

/** Mount before session(): substitutes the tab's token for the session cookie. */
function sessionFromToken(req, res, next) {
  const token = presentedToken(req);
  if (!token) return next();

  const pairs = String(req.headers.cookie || '').split(';').map((s) => s.trim()).filter(Boolean);
  const others = pairs.filter((s) => !s.startsWith(`${COOKIE_NAME}=`));
  const cookieValue = pairs.find((s) => s.startsWith(`${COOKIE_NAME}=`));
  req.headers.cookie = [...others, `${COOKIE_NAME}=${encodeURIComponent(token)}`].join('; ');

  // For sign-out: whether the browser's cookie names this same session, and
  // so should be cleared along with it.
  let matchesCookie = false;
  try {
    matchesCookie = Boolean(cookieValue) && decodeURIComponent(cookieValue.slice(COOKIE_NAME.length + 1)) === token;
  } catch {
    matchesCookie = false;
  }
  req.sessionToken = { token, matchesCookie };
  return next();
}

/** The token for the current session — what the cookie would carry. */
function tokenFor(req) {
  if (!req.sessionID) return null;
  return `s:${signature.sign(req.sessionID, process.env.SESSION_SECRET)}`;
}

/** Mount after session(): offers the cookie's session to a tab that has none. */
function offerSessionToken(req, res, next) {
  if (!req.sessionToken && req.session && req.session.user) {
    res.set(RESPONSE_HEADER, tokenFor(req));
  }
  next();
}

/**
 * Start a new session for a sign-in, leaving the one the request arrived with
 * intact. express-session's regenerate() destroys the current session; here
 * that session may well be another tab's — a tab opened on the sign-in page
 * adopts the cookie's session from its first API call, so even a token names
 * a session some other tab may be using. Nothing is destroyed: the previous
 * session simply expires with its cookie. store.generate() only creates.
 */
function beginFreshSession(req) {
  req.sessionStore.generate(req);
}

module.exports = { sessionFromToken, offerSessionToken, tokenFor, beginFreshSession, COOKIE_NAME, HEADER, RESPONSE_HEADER, QUERY };
