import axios from "axios";
import { API_BASE } from "../../../config/api";

const client = axios.create({ baseURL: `${API_BASE}/erms`, withCredentials: true });

export const fetchDashboard = async () => (await client.get("/dashboard")).data;

export const fetchFilterOptions = async () => (await client.get("/filter-options")).data;

export const fetchRecords = async (params) =>
  (await client.get("/records", { params: pruned(params) })).data;

export const fetchRecord = async (serialNo) =>
  (await client.get(`/records/${encodeURIComponent(serialNo)}`)).data;

export const createRecord = async (payload) => (await client.post("/records", payload)).data.record;

export const updateRecord = async ({ serialNo, ...changes }) =>
  (await client.patch(`/records/${encodeURIComponent(serialNo)}`, changes)).data.record;

// --- the UCDS register ------------------------------------------------------
// Read-only. ERMS never writes to the establishment register: a records clerk
// who finds a firm missing raises it with Planning.

export const searchRegister = async (q) =>
  (await client.get("/register/search", { params: { q } })).data.establishments;

export const resolvePermit = async (number) =>
  (await client.get("/register/resolve", { params: { number } })).data.match;

// --- tracking ---------------------------------------------------------------

export const addTracking = async ({ serialNo, ...entry }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/tracking`, entry)).data.entry;

export const fetchOverdue = async () => (await client.get("/tracking/overdue")).data.overdue;

// --- archive ----------------------------------------------------------------

export const fetchBoxes = async (params) =>
  (await client.get("/boxes", { params: pruned(params) })).data.boxes;

export const createBox = async (payload) => (await client.post("/boxes", payload)).data.box;

export const updateBox = async ({ code, ...changes }) =>
  (await client.patch(`/boxes/${encodeURIComponent(code)}`, changes)).data.box;

export const fetchBoxContents = async (code) =>
  (await client.get(`/boxes/${encodeURIComponent(code)}`)).data.contents;

export const assignToBox = async ({ serialNo, boxCode }) =>
  (await client.put(`/records/${encodeURIComponent(serialNo)}/box`, { boxCode })).data;

export const fetchDisposalDue = async () => (await client.get("/disposal-due")).data.boxes;

// --- reports ----------------------------------------------------------------

export const runReport = async ({ key, limit = 500 }) =>
  (await client.get(`/reports/${key}`, { params: { limit } })).data;

/** The CSV endpoint is a normal authenticated GET; the browser saves it. */
export const reportCsvUrl = (key) => `${API_BASE}/erms/reports/${key}?format=csv`;

/** Drop empty values so they do not reach the API as blank query strings. */
function pruned(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

export const PERMIT_TYPE_COLOR = {
  "ecc-original": "green",
  "ecc-amended": "gold",
  cnc: "blue",
  "hw-generator": "volcano",
  other: "default",
};

export const PROVINCE_LABEL = {
  aurora: "Aurora",
  bataan: "Bataan",
  bulacan: "Bulacan",
  nuevaEcija: "Nueva Ecija",
  pampanga: "Pampanga",
  tarlac: "Tarlac",
  zambales: "Zambales",
};

export const describeApiError = (error, fallback = "Something went wrong.") => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
  }
  return data.message || fallback;
};
