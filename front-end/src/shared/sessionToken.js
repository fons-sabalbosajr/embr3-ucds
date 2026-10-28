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
//   - "Remember me" at sign-in also keeps the token in localStorage until the
//     session expires (14 days, sliding on the server). A new tab, or the
//     browser reopened, then starts as that account instead of signed out.
//     Signing out of it, or signing in without the box ticked, forgets it.
//
// The value is the session cookie's own value, no more; it is stored as is.
// ---------------------------------------------------------------------------

const KEY = "eu.session";
const REMEMBER_KEY = "eu.session.remembered";
const USERNAME_KEY = "eu.login.username";
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

/** The remembered sign-in, if one is stored and has not run out. */
const readRemembered = () =>
  safe(() => {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
    if (saved?.token && Date.parse(saved.until) > Date.now()) return saved;
    localStorage.removeItem(REMEMBER_KEY);
    return null;
  }, null);

const forgetRemembered = () => safe(() => localStorage.removeItem(REMEMBER_KEY), undefined);

export const getSessionToken = () =>
  safe(() => {
    const own = sessionStorage.getItem(KEY);
    if (own) return own;
    // A tab with no sign-in of its own takes on the remembered one.
    const remembered = readRemembered();
    if (!remembered) return null;
    sessionStorage.setItem(KEY, remembered.token);
    return remembered.token;
  }, null);

/**
 * Keep `token` as this tab's sign-in. With `remember` true it is also kept
 * for new tabs until `until`; with `remember` false any remembered sign-in on
 * this browser is forgotten.
 */
export const setSessionToken = (token, { remember, until } = {}) =>
  safe(() => {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
    if (remember === true && token && until) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ token, until }));
    else if (remember === false) forgetRemembered();
  }, undefined);

/** Sign this tab out; the remembered sign-in goes too when it is this one. */
export const clearSessionToken = () =>
  safe(() => {
    const own = sessionStorage.getItem(KEY);
    if (own && readRemembered()?.token === own) forgetRemembered();
    sessionStorage.removeItem(KEY);
  }, undefined);

/** The username last signed in with "Remember me", to fill the form. */
export const getRememberedUsername = () => safe(() => localStorage.getItem(USERNAME_KEY) || "", "");

export const setRememberedUsername = (username) =>
  safe(() => (username ? localStorage.setItem(USERNAME_KEY, username) : localStorage.removeItem(USERNAME_KEY)), undefined);

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
