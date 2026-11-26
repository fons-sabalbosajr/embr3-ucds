import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// Notices on this device — the PC or phone's own notifications, which appear
// even with E-Universe closed (server/services/notifier.js, public/sw.js).
//
// The browser asks the person once; when they allow it, this device's push
// subscription is registered with the server for the account signed in on
// this tab. Each tab can be a different account, and each turns notices on
// for itself; turning them off here affects this account on this device only.
// Signing out pauses them; signing back in as the same account resumes them.
//
// What a browser needs:
//   - a secure page: https://, or localhost while developing. Opened by a
//     plain http:// office address, the browser offers no push at all.
//   - on an iPhone or iPad: E-Universe added to the Home Screen and opened
//     from there (iOS 16.4 or later). Safari tabs cannot receive pushes.
// ---------------------------------------------------------------------------

// Under the site's base (/e-universe/ in production), with that as its scope:
// registered at the root it would claim every page of embr3-onlinesystems.cloud.
const BASE = import.meta.env.BASE_URL || "/";
const SW_URL = `${BASE}sw.js`;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

/**
 * Whether this browser can take notices, and if not, why — in words a person
 * can act on.
 */
export function pushSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "Not available here." };
  if (!window.isSecureContext) {
    return { supported: false, reason: "This address is not secure (http://). Open E-Universe by its https:// address to get notices on this device." };
  }
  if (isIos() && !isStandalone()) {
    return {
      supported: false,
      reason: "On an iPhone or iPad: tap Share, then “Add to Home Screen”, open E-Universe from the new icon, and turn notices on there.",
    };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "This browser cannot show notices. Use a current Chrome, Edge, Firefox or Safari." };
  }
  if (Notification.permission === "denied") {
    return { supported: false, blocked: true, reason: "Notices are blocked for this site. Allow them in the browser's site settings (the lock icon beside the address), then try again." };
  }
  return { supported: true, reason: null };
}

function keyBytes(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration(BASE);
  if (existing) return existing;
  await navigator.serviceWorker.register(SW_URL, { scope: BASE });
  return navigator.serviceWorker.ready;
}

/** This device's subscription, when there is one. */
export async function currentSubscription() {
  if (!pushSupport().supported) return null;
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Whether the account signed in on THIS TAB gets notices on this browser.
 * A browser has one push subscription but may serve several accounts — one
 * per tab — so the server is asked about this account in particular.
 */
export async function isPushOn() {
  try {
    const sub = await currentSubscription();
    if (!sub || Notification.permission !== "granted") return false;
    const { data } = await axios.get(`${API_BASE}/notifications/push`, { params: { endpoint: sub.endpoint }, withCredentials: true });
    return Boolean(data?.on);
  } catch {
    return false;
  }
}

/**
 * Ask, subscribe and register this tab's account. Resolves to { ok, reason }.
 * Must be called from a click: browsers only ask in answer to one.
 */
export async function enablePush() {
  const support = pushSupport();
  if (!support.supported) return { ok: false, reason: support.reason };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notices were not allowed on this device." };

  const { data } = await axios.get(`${API_BASE}/notifications/push`, { withCredentials: true });
  if (!data?.available || !data.publicKey) {
    return { ok: false, reason: "The server is not set up to send notices yet. Please tell the system developer." };
  }
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (the server's key changed) is replaced.
  const sameKey = sub?.options?.applicationServerKey
    ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") === data.publicKey
    : Boolean(sub);
  if (sub && !sameKey) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
  await axios.post(`${API_BASE}/notifications/push/subscribe`, { subscription: sub.toJSON() }, { withCredentials: true });
  return { ok: true };
}

/**
 * Stop notices for this tab's account on this browser. Other accounts signed
 * in on other tabs keep theirs; the browser lets go of its subscription only
 * when no account is left on it.
 */
export async function disablePush() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return { ok: true };
  const { data } = await axios
    .post(`${API_BASE}/notifications/push/unsubscribe`, { endpoint: sub.endpoint }, { withCredentials: true })
    .catch(() => ({ data: { remaining: 1 } }));
  if (!data?.remaining) await sub.unsubscribe().catch(() => {});
  return { ok: true };
}

/** A test notice to this account, through the server. */
export const sendTestNotice = async () => (await axios.post(`${API_BASE}/notifications/test`, {}, { withCredentials: true })).data;

async function setPaused(paused) {
  try {
    const sub = await currentSubscription();
    if (sub) await axios.post(`${API_BASE}/notifications/push/${paused ? "pause" : "resume"}`, { endpoint: sub.endpoint }, { withCredentials: true, timeout: 3000 });
  } catch {
    /* notices still arrive on open screens */
  }
}

/**
 * After sign-in: an account that had notices on for this browser gets them
 * again. One that never turned them on here is not signed up by this.
 */
export const refreshPushRegistration = () => setPaused(false);

/** Before sign-out: no notices for this account on this browser until it signs in here again. */
export const pausePushForSignOut = () => setPaused(true);
