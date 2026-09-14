import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../config/api";

// ---------------------------------------------------------------------------
// Universe Central DB settings, shared by every UCDS screen.
//
// Each screen used to fetch /api/ucds/settings for itself when it mounted,
// so a change made under Settings reached a screen that was already open only
// after a reload. One copy lives here instead: the settings screen hands the
// saved document to `apply` and every consumer re-renders with it at once.
// The server still enforces the same document on every request; this only
// decides what the screens draw.
// ---------------------------------------------------------------------------

const UcdsSettingsContext = createContext({ settings: null, refresh: async () => null, apply: () => {} });

export const useUcdsSettings = () => useContext(UcdsSettingsContext);

export const UcdsSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ucds/settings`, { credentials: "include" });
      if (!res.ok) return null;
      const body = await res.json();
      setSettings(body);
      return body;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const apply = useCallback((next) => {
    if (next && typeof next === "object") setSettings(next);
  }, []);

  const value = useMemo(() => ({ settings, refresh, apply }), [settings, refresh, apply]);
  return <UcdsSettingsContext.Provider value={value}>{children}</UcdsSettingsContext.Provider>;
};

export default UcdsSettingsContext;
