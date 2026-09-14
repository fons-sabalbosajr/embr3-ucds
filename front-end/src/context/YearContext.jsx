import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAuthorizedYears,
  selectYearContainer,
  clearYearContainer,
} from "../api/yearService";

// The active year lives in the server session. This context mirrors it for the
// UI only — it is never the source of truth, and it is never sent as a query
// parameter. Changing it here calls the server, which re-checks authorization.

const YearContext = createContext(null);

// A module-level mirror of the active year, for call sites that build request
// URLs outside React (service helpers, event handlers). The server session
// remains authoritative — this only keeps the client from asking for a year it
// is not currently in, which the backend would reject with YEAR_MISMATCH.
let currentActiveYear = null;
export const getActiveYear = () => currentActiveYear;

export const useYear = () => {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error("useYear must be used inside <YearProvider>");
  return ctx;
};

export const YearProvider = ({ children }) => {
  const [years, setYears] = useState([]);
  const [activeYear, setActiveYearState] = useState(null);
  const setActiveYear = useCallback((year) => {
    currentActiveYear = year ?? null;
    setActiveYearState(currentActiveYear);
  }, []);
  const [role, setRole] = useState(null);
  const [canAccessAllYears, setCanAccessAllYears] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    // Only the first load shows the guard's loader. A later refresh — after a
    // year is locked or a setting saved — swaps the list in place; blanking
    // the screen for it made every save look like a navigation.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthorizedYears();
      setYears(data.years || []);
      setActiveYear(data.activeYear ?? null);
      setRole(data.role ?? null);
      setCanAccessAllYears(Boolean(data.canAccessAllYears));
      loadedOnce.current = true;
      return data;
    } catch (e) {
      if (e?.response?.status === 401) {
        // Not signed in — ProtectedRoute handles the redirect.
        setYears([]);
        setActiveYear(null);
      } else {
        setError("Unable to load year containers.");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectYear = useCallback(async (year) => {
    // The server is authoritative; only mirror what it confirms.
    const { activeYear: confirmed } = await selectYearContainer(year);
    setActiveYear(confirmed);
    return confirmed;
  }, []);

  const leaveYear = useCallback(async () => {
    await clearYearContainer();
    setActiveYear(null);
  }, []);

  const value = useMemo(
    () => ({
      years,
      activeYear,
      role,
      canAccessAllYears,
      isDeveloper: role === "developer",
      isAdmin: role === "admin",
      isGuest: role === "guest",
      loading,
      error,
      refresh,
      selectYear,
      leaveYear,
    }),
    [years, activeYear, role, canAccessAllYears, loading, error, refresh, selectYear, leaveYear]
  );

  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
};

export default YearContext;
