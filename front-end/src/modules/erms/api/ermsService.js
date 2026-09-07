import axios from "axios";
import { API_BASE } from "../../../config/api";

const client = axios.create({ baseURL: `${API_BASE}/erms`, withCredentials: true });

export const fetchDashboard = async () => (await client.get("/dashboard")).data;

export const fetchFilterOptions = async () => (await client.get("/filter-options")).data;

export const fetchRecords = async (params) =>
  (await client.get("/records", { params: pruned(params) })).data;

export const fetchRecord = async (serialNo) =>
  (await client.get(`/records/${encodeURIComponent(serialNo)}`)).data;

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
