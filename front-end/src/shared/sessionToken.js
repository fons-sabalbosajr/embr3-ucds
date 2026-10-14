import { API_BASE_URL, SOCKET_URL } from "../config/api";

// ---------------------------------------------------------------------------
// This tab's sign-in.
//
// The session is a cookie, and a browser has one cookie jar — so on its own,
// signing in as a second account in a new tab turns every other tab into that
// account. To let each tab be its own account, the server hands back a token
// at sign-in (the same signed value the cookie carries) and this tab keeps it
// in sessionStorage, which the browser scopes per tab. Every request to the
// API carries it, and the server answers from that session rather than the
// cookie's. See server/middleware/sessionToken.js.
//
// What that means in practice:
//   - three tabs, three accounts: each tab is the account it signed in as
//   - a new tab (typed address, bookmark) is signed out until someone signs
//     in there, whatever other tabs are signed in as. It used to take on the
//     most recent sign-in silently, and switching it to another account meant
//     signing out — which ended the other tab's session as well
//   - a link opened in a new tab from inside the application (Ctrl/Cmd+click,
//     middle click) keeps this tab's account (shared/sameAccountTabs), as
//     does a duplicated tab
//   - signing out ends only this tab's session
//
// The value is the session cookie's own value, no more; it is stored as is.
// ---------------------------------------------------------------------------

const KEY = "eu.session";
export const HEADER = "X-Session-Token";
export const QUERY = "st";
// What a tab that has not signed in sends instead of a token.
export const NO_SESSION = "none";

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getSessionToken = () => safe(() => sessionStorage.getItem(KEY), null);

export const setSessionToken = (token) =>
  safe(() => (token ? sessionStorage.setItem(KEY, token) : sessionStorage.removeItem(KEY)), undefined);

export const clearSessionToken = () => setSessionToken(null);

const apiOrigins = new Set(
  [API_BASE_URL, SOCKET_URL].map((u) => safe(() => new URL(u, window.location.href).origin, null)).filter(Boolean)
);

/**
 * Whether a request URL goes to this application's API. Socket.IO's polling
 * requests share the origin but not the session (the socket never reads it)
 * and answer through Socket.IO's own CORS setup, so they are left alone.
 */
export const isApiUrl = (url) => {
  const parsed = safe(() => new URL(String(url), window.location.href), null);
  return parsed !== null && apiOrigins.has(parsed.origin) && !parsed.pathname.startsWith("/socket.io/");
};

/**
 * `url` with this tab's token as a query parameter — for URLs the browser
 * loads itself (an <iframe> preview, a download), which cannot carry a header.
 */
export const withSessionToken = (url) => {
  const token = getSessionToken();
  if (!token || !isApiUrl(url)) return url;
  const [base, hash] = String(url).split("#");
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${QUERY}=${encodeURIComponent(token)}${hash ? `#${hash}` : ""}`;
};
