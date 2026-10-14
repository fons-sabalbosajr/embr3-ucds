import { getSessionToken } from "./sessionToken";
import { ROUTES } from "../config/routes";

// ---------------------------------------------------------------------------
// A link opened in a new tab from inside the application keeps this tab's
// account.
//
// Each tab's sign-in lives in its own sessionStorage (shared/sessionToken),
// and a new tab starts signed out. The browser copies sessionStorage into a
// window opened with window.open() from this page — but not into a tab
// opened the browser's own way, by Ctrl/Cmd+click or middle click on a link,
// which would land on the sign-in page. So those clicks on links into the
// application are opened with window.open() instead: same address, same
// account. The new tab then lets go of window.opener, so it holds no handle
// back to this one.
//
// Not covered: the browser's right-click "Open link in new tab", which no
// page can intercept — that tab asks for a sign-in, like any new tab.
// ---------------------------------------------------------------------------

let installed = false;

/** An <a> to a page of the application on this origin, or null. */
function inAppLink(target) {
  const a = target?.closest?.("a[href]");
  if (!a || a.hasAttribute("download")) return null;
  let url;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith(ROUTES.app)) return null;
  return url;
}

function openSameAccount(event) {
  if (!getSessionToken()) return;
  const newTab = event.type === "auxclick" ? event.button === 1 : event.button === 0 && (event.ctrlKey || event.metaKey || event.shiftKey);
  if (!newTab) return;
  const url = inAppLink(event.target);
  if (!url) return;
  event.preventDefault();
  event.stopPropagation();
  // No "noopener": that is what stops the browser copying sessionStorage.
  window.open(url.href, "_blank");
}

export function installSameAccountTabs() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Opened by another tab of this application: keep its account, drop the handle.
  if (window.opener) {
    try {
      window.opener = null;
    } catch {
      /* read-only in some browsers; harmless */
    }
  }
  document.addEventListener("click", openSameAccount, true);
  document.addEventListener("auxclick", openSameAccount, true);
}
