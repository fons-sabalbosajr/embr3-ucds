import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// The Universe Central DB's own calls: the dashboard figures, the ERMS anchor
// of the Monitoring Plan's permits, the Excel export and the accomplishment
// report. (The register's editing calls stay in api/.)
// ---------------------------------------------------------------------------

const client = axios.create({ baseURL: API_BASE, withCredentials: true });

export const fetchDashboardStats = async () => (await client.get("/ucds/dashboard-stats")).data;
export const fetchExpiringPermits = async (pageSize = 8) =>
  (await client.get("/permits-summary", { params: { page: 1, pageSize, filterEstablishmentsByExpiryStatus: "true" } })).data;

/** sort_key → { status: "found" | "missing" | "none", serials, label, dateApproved } */
export const fetchErmsAnchors = async (sortKeys) => (await client.post("/ucds/erms-anchor", { sortKeys })).data.anchors;

export const fetchAccomplishment = async () => (await client.get("/ucds/reports/accomplishment", { timeout: 120000 })).data.provinces;

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
