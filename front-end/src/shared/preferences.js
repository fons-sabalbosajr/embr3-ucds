// ---------------------------------------------------------------------------
// Per-device display preferences.
//
// These describe how this browser shows the application — theme, accent, a
// dismissed hint. They are not session data: they identify nobody, grant
// nothing, and are useless to anyone who reads them.
//
// They are kept separate because signing out used to call localStorage.clear(),
// which took the chosen theme and the dismissed "Toggle Theme" hint with it.
// Both came back on the next sign-in, which reads as the setting simply not
// working. Session material is still cleared on the way out; only these
// survive.
// ---------------------------------------------------------------------------

export const PREFERENCE_KEYS = [
  'ucds-theme',
  'hideThemeHint',
  'eu-appearance',
];

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Clear everything except the display preferences.
 *
 * Written as "keep these, drop the rest" rather than "remove these known
 * session keys", so a new key added elsewhere is cleared by default. Getting
 * that backwards is how session data survives a sign-out.
 */
export function clearSessionStorageKeepingPreferences() {
  const keep = PREFERENCE_KEYS.map((key) => [key, read(key)]).filter(
    ([, value]) => value !== null
  );
  try {
    localStorage.clear();
    for (const [key, value] of keep) localStorage.setItem(key, value);
  } catch {
    // A browser with storage disabled has nothing to clear or keep.
  }
}

export const getPreference = (key, fallback = null) => read(key) ?? fallback;

export function setPreference(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // Ignored: a preference that cannot be saved is a lost convenience, not a
    // failure worth interrupting anyone for.
  }
}
