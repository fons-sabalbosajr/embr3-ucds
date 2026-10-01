import CryptoJS from "crypto-js";

// ---------------------------------------------------------------------------
// Browser storage, with neither the key names nor the values readable.
//
// Everything the application keeps in localStorage goes through here: the
// key is replaced by a keyed hash (so the list of entries says nothing about
// what they are) and the value is AES-encrypted. A person opening DevTools
// sees `eu.k5Qm…` = `U2FsdGVkX1…` and nothing else.
//
// Be clear about what this is: the secret ships inside the bundle, because
// the browser has to be able to read its own entries. This keeps the entries
// opaque to a casual look, to browser extensions scanning for obvious keys,
// and to anyone copying storage between machines — it is not a vault, and
// nothing that grants access is stored here in the first place. The session
// is a cookie the page cannot read; the account's real settings live on the
// server.
// ---------------------------------------------------------------------------

const PREFIX = "eu.";
const SECRET = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY || "e-universe-browser-store";

const storageKey = (name) =>
  PREFIX + CryptoJS.HmacSHA256(String(name), SECRET).toString(CryptoJS.enc.Base64url).slice(0, 22);

const encrypt = (value) => CryptoJS.AES.encrypt(JSON.stringify(value), SECRET).toString();

const decrypt = (raw) => {
  const text = CryptoJS.AES.decrypt(raw, SECRET).toString(CryptoJS.enc.Utf8);
  return text ? JSON.parse(text) : null;
};

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** The stored value for `name`, or `fallback`. Legacy plaintext entries under the bare name are migrated on first read. */
export function getItem(name, fallback = null) {
  return safe(() => {
    const raw = localStorage.getItem(storageKey(name));
    if (raw !== null) {
      const value = safe(() => decrypt(raw), null);
      return value === null ? fallback : value;
    }
    // Entries written before this module, under their plain names. Move
    // them across once, then forget the plain copy.
    const legacy = localStorage.getItem(name);
    if (legacy !== null) {
      let value = legacy;
      try {
        value = JSON.parse(legacy);
      } catch {
        /* a plain string */
      }
      setItem(name, value);
      localStorage.removeItem(name);
      return value;
    }
    return fallback;
  }, fallback);
}

export function setItem(name, value) {
  safe(() => {
    if (value === null || value === undefined) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), encrypt(value));
  }, undefined);
}

export function removeItem(name) {
  safe(() => localStorage.removeItem(storageKey(name)), undefined);
}

/** The storage key `name` is written under — for `storage` event listeners. */
export const keyFor = storageKey;

/** Decrypt a raw stored value (from a `storage` event), or null. */
export const readRaw = (raw) => (raw ? safe(() => decrypt(raw), null) : null);

/**
 * Remove everything except the named entries. Anything not written through
 * this module (a stray plain key) goes too.
 */
export function clearExcept(names) {
  safe(() => {
    const keep = names.map((n) => [storageKey(n), localStorage.getItem(storageKey(n))]).filter(([, v]) => v !== null);
    localStorage.clear();
    for (const [k, v] of keep) localStorage.setItem(k, v);
  }, undefined);
}
