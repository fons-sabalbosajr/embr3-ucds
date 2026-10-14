import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../config/api";

// ---------------------------------------------------------------------------
// Which ERMS units are taken down for maintenance (Admin Settings › System ›
// ERMS Units; the server's services/ermsAvailability).
//
// Read once and kept for a minute by every screen that asks — the sidebar,
// the bell's counts, the dashboards — so a unit that is down is simply not
// asked for anything: no request for its documents, its counts, its portal
// desk. That is what makes switching a unit off lighten E-Universe, and it
// is why the server's 503 is rarely seen.
//
// The Developer still reaches a down unit (the server lets them through), so
// it can be checked before it is opened again; `UnitGate`
// (shared/components/UnitGate.jsx) shows everyone else the maintenance
// notice in its place.
// ---------------------------------------------------------------------------

const client = axios.create({ baseURL: API_BASE, withCredentials: true });

export const UNIT_NAMES = { records: "Records Unit", legal: "Legal Services Unit", laboratory: "Laboratory Unit" };

export const fetchErmsAvailability = async () => (await client.get("/erms-availability")).data.units;

/** Switch a unit off (with a reason) or back on — the Developer only. */
export const setErmsAvailability = async ({ unit, down, reason }) =>
  (await client.put(`/dev/erms-availability/${unit}`, { down, ...(reason ? { reason } : {}) })).data.units;

export const AVAILABILITY_KEY = ["erms-availability"];

/** { units, isDown(unit), down: [unit…], isLoading } — nothing is down until the server says so. */
export function useErmsAvailability({ enabled = true } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: AVAILABILITY_KEY,
    queryFn: fetchErmsAvailability,
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const units = data || {};
  return {
    units,
    isLoading,
    isDown: (unit) => Boolean(units[unit]?.down),
    down: Object.entries(units).filter(([, s]) => s?.down).map(([u]) => u),
  };
}
