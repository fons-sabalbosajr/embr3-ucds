import { getItem, setItem, clearExcept } from "./secureStorage";

// ---------------------------------------------------------------------------
// Per-device display preferences.
//
// These describe how this browser shows the application — theme, accent, a
// dismissed hint, the explorer's view. They are not session data: they
// identify nobody, grant nothing, and are useless to anyone who reads them.
// They are still stored through secureStorage like everything else, so the
// browser's storage panel shows nothing legible.
//
// They are kept separate because signing out used to call localStorage.clear(),
// which took the chosen theme and the dismissed "Toggle Theme" hint with it.
// Both came back on the next sign-in, which reads as the setting simply not
// working. Session material is still cleared on the way out; only these
// survive.
// ---------------------------------------------------------------------------

export const PREFERENCE_KEYS = ["ucds-theme", "hideThemeHint", "eu-appearance", "eu-explorer-view"];

/**
 * Clear everything except the display preferences.
 *
 * Written as "keep these, drop the rest" rather than "remove these known
 * session keys", so a new key added elsewhere is cleared by default. Getting
 * that backwards is how session data survives a sign-out.
 */
export function clearSessionStorageKeepingPreferences() {
  clearExcept(PREFERENCE_KEYS);
}

export const getPreference = (key, fallback = null) => {
  const value = getItem(key, null);
  return value === null || value === undefined ? fallback : String(value);
};

export function setPreference(key, value) {
  setItem(key, value === null || value === undefined ? null : String(value));
}
