import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// The Universe Central DB's own calls: the dashboard figures, the ERMS anchor
// of the Monitoring Plan's permits, the Excel export and the accomplishment
// report. (The register's editing calls stay in api/.)
// ---------------------------------------------------------------------------

const client = axios.create({ baseURL: API_BASE, withCredentials: true });

export const fetchDashboardStats = async () => (await client.get("/ucds/dashboard-stats")).data;
/**
 * Permits expired or expiring within a month, what expires next first:
 * { data: [{ sort_key, title, permits: [{ type, code, expiry, isExpired, isNearExpiry }] }], total, summary: { expired, expiringSoon } }.
 */
export const fetchExpiringPermits = async (pageSize = 8, { page = 1, searchText = "", types = [] } = {}) =>
  (
    await client.get("/permits-summary", {
      params: { page, pageSize, filterEstablishmentsByExpiryStatus: "true", order: "soonest", searchText: searchText || undefined, permitTypesFilter: types.length ? types.join(",") : undefined },
    })
  ).data;

/** sort_key → { status: "found" | "missing" | "none", serials, label, dateApproved } */
export const fetchErmsAnchors = async (sortKeys) => (await client.post("/ucds/erms-anchor", { sortKeys })).data.anchors;

export const fetchAccomplishment = async () => (await client.get("/ucds/reports/accomplishment", { timeout: 120000 })).data.provinces;

/** Establishments whose permit is not in the ERMS Document Library — the list to validate. */
export const fetchNotInErms = async (province) =>
  (await client.get("/ucds/reports/not-in-erms", { params: province ? { province } : undefined, timeout: 120000 })).data.rows;

/** The Monitoring Plan (a province, or all within reach) as Excel; saves the file. */
export const downloadMonitoringPlan = async (province) => {
  const res = await client.get("/ucds/monitoring-plan/export.xlsx", { params: province ? { province } : undefined, responseType: "blob", timeout: 5 * 60 * 1000 });
  const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "Monitoring-Plan.xlsx";
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return Number(res.headers["x-export-rows"]) || 0;
};

// The record view's "Locate from address": { lat, lng, label, precision, inRegion } or null.
export const geocodeAddress = async ({ street, barangay, city, province }) =>
  (await client.get("/ucds/geocode", { params: { street, barangay, city, province } })).data.result;
// The 2026 IIS reference numbers from the RAW files, by serial, for one province.
export const fetchRawIis = async (province) => (await client.get("/ucds/raw-iis", { params: { province } })).data.iis || {};

/** The spreadsheet view's "Excel (this view)": the rows and columns on the screen. Returns the rows written. */
export const downloadSpreadsheetView = async ({ serials, columns, sheet }) => {
  const res = await client.post("/ucds/spreadsheet/export.xlsx", { serials, columns, sheet }, { responseType: "blob", timeout: 5 * 60 * 1000 });
  const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "Monitoring-Plan.xlsx";
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return Number(res.headers["x-export-rows"]) || 0;
};
