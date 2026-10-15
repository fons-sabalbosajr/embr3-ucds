/* E-Universe service worker — notices only.
 *
 * It does one job: show the notices the server pushes (server/services/
 * notifier.js) as operating-system notifications, and open the right screen
 * when one is clicked. It has no fetch handler and caches nothing, so it never
 * stands between the browser and the application.
 *
 * Several accounts can be signed in on one browser, one per tab. Each notice
 * names the account it is for (`to`), and the worker asks every open tab
 * which account it is (a "whoami" message answered by the page), so that:
 *
 *   - a notice is not shown when that account's own tab is in front — the
 *     tab shows it itself — but IS shown when someone else's tab is;
 *   - clicking it brings that account's tab forward, not just any tab;
 *   - on a browser serving several accounts, it says whom it is for.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** The account each open E-Universe window holds: [{ client, username }]. */
async function accountsOfWindows() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return Promise.all(
    windows.map(
      (client) =>
        new Promise((resolve) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolve({ client, username: null }), 400);
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve({ client, username: event.data?.username || null });
          };
          try {
            client.postMessage({ type: "eu:whoami" }, [channel.port2]);
          } catch {
            clearTimeout(timer);
            resolve({ client, username: null });
          }
        })
    )
  );
}

self.addEventListener("push", (event) => {
  let notice = {};
  try {
    notice = event.data ? event.data.json() : {};
  } catch {
    notice = { title: "E-Universe", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    accountsOfWindows().then((windows) => {
      const ownInFront = windows.some(
        ({ client, username }) => client.visibilityState === "visible" && client.focused && (!notice.to || username === notice.to)
      );
      if (ownInFront) return undefined;
      const title = notice.shared && notice.forName ? `${notice.title || "E-Universe"} · for ${notice.forName}` : notice.title || "E-Universe";
      return self.registration.showNotification(title, {
        body: notice.body || "",
        // One per account and subject: two accounts' notices never replace each other.
        tag: `${notice.to || ""}:${notice.tag || "e-universe"}`,
        renotify: true,
        icon: "/notice-icon.png",
        badge: "/notice-badge.png",
        data: { url: notice.url || "/e-universe/home", to: notice.to || null, shared: Boolean(notice.shared) },
        requireInteraction: notice.kind === "document-request",
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url: path = "/e-universe/home", to = null, shared = false } = event.notification.data || {};
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    accountsOfWindows().then(async (windows) => {
      const sameOrigin = windows.filter(({ client }) => new URL(client.url).origin === self.location.origin);
      // That account's own tab, if one is open.
      const own = to ? sameOrigin.find((w) => w.username === to) : sameOrigin[0];
      if (own) {
        const focused = await own.client.focus().catch(() => null);
        if (focused && "navigate" in focused) return focused.navigate(url).catch(() => undefined);
        return undefined;
      }
      // No tab of that account. On a browser with one account, opening the
      // page signs in by the browser's own session; with several, the tab
      // could open as someone else, so it goes by the sign-in page with the
      // account filled in and the page to return to.
      if (to && (shared || sameOrigin.some((w) => w.username && w.username !== to))) {
        const login = new URL("/e-universe/login", self.location.origin);
        login.searchParams.set("user", to);
        login.searchParams.set("next", path);
        return self.clients.openWindow(login.href);
      }
      return self.clients.openWindow(url);
    })
  );
});
