import { getSessionToken, isApiUrl, HEADER, NO_SESSION } from "./sessionToken";

// ---------------------------------------------------------------------------
// Attach this tab's session token to every request to the API.
//
// Done once at the transport, not at each call: the application makes its
// requests through bare fetch(), the default axios instance and several
// axios.create() clients, spread over dozens of files, and a call site that
// forgot the header would quietly act as the cookie's account — the exact
// confusion the token exists to end. In the browser axios sends through
// XMLHttpRequest, so wrapping fetch and XMLHttpRequest covers all of it.
//
// A tab that has not signed in says so (`X-Session-Token: none`), and the
// server answers it as signed out rather than by the browser's cookie — so a
// new tab is never silently another tab's account (shared/sessionToken).
//
// Only requests to the API origin get the header. Anything else — Google
// Maps, a CDN — is left exactly as it was.
// ---------------------------------------------------------------------------

let installed = false;

export function installSessionTransport() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? input : input?.url;
    if (!isApiUrl(url)) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(HEADER, getSessionToken() || NO_SESSION);
    return originalFetch(input, { ...init, headers });
  };

  const { open, send } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__euApiRequest = isApiUrl(url);
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    if (this.__euApiRequest) this.setRequestHeader(HEADER, getSessionToken() || NO_SESSION);
    return send.apply(this, args);
  };
}
