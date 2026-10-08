import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// VERA API client.
//
// The browser never talks to a model vendor — every call goes to this server,
// which holds the key in its environment. Nothing here sends a record: only
// the typed question, the recent conversation, and the NAME of the screen.
// ---------------------------------------------------------------------------

const client = axios.create({ baseURL: `${API_BASE}/vera`, withCredentials: true });

/** Launcher state, starters and whether answers are model-phrased. */
export const getVeraStatus = async () => (await client.get("/status")).data;

/** @param {{message: string, history?: Array<{role, content}>, page?: string}} payload */
export const askVera = async ({ message, history = [], page = "" }) =>
  (await client.post("/chat", { message, history, page })).data;

// ── The sign-in pages (no session) ───────────────────────────────────────────

export const getVeraPublicStatus = async (page = "") =>
  (await client.get("/public-status", { params: page ? { page } : undefined })).data;

export const askVeraPublic = async ({ message, history = [], page = "" }) =>
  (await client.post("/public-chat", { message, history, page })).data;

// ── Administration ───────────────────────────────────────────────────────────

export const getVeraConfig = async () => (await client.get("/config")).data;
export const updateVeraConfig = async (config) => (await client.put("/config", config)).data;
/** A low-token round trip proving the server's key and model work. */
export const testVeraConnection = async () => (await client.post("/test")).data;
export const getVeraUsage = async () => (await client.get("/usage")).data;
/** Metadata only — no question or answer is ever stored, so none can be listed. */
export const getVeraLogs = async (params) => (await client.get("/logs", { params })).data;

/**
 * A router path as the coarse screen key the server's PAGE_LABELS knows, so
 * VERA can tailor its directions. Never a record id or a query string.
 */
export const pageKeyFromPath = (pathname) => {
  const p = String(pathname || "").toLowerCase();
  const rules = [
    // The sign-in pages first: they are the public surface.
    [/\/forgot-password\/?$/, "forgot-password"],
    [/\/reset-password\/?$/, "reset-password"],
    [/\/register\/?$/, "register"],
    [/\/login\/?$/, "signin"],
    [/select-year/, "year-select"],
    [/\/erms\/records\/[^/]+/, "record-detail"],
    [/\/erms\/records/, "document-library"],
    [/\/erms\/access-requests/, "access-requests"],
    [/\/erms\/archive/, "archive"],
    [/\/erms\/upload-tally/, "upload-tally"],
    [/\/erms\/legal\/documents/, "legal-documents"],
    [/\/erms\/legal/, "legal-dashboard"],
    [/\/erms\/laboratory\/documents/, "laboratory-documents"],
    [/\/erms\/laboratory/, "laboratory-dashboard"],
    [/\/erms/, "erms-dashboard"],
    [/\/province\//, "province"],
    [/\/datasets\//, "datasets"],
    [/\/report/, "report"],
    [/\/settings\/general/, "settings-general"],
    [/\/settings\/erms/, "settings-erms"],
    [/\/settings\/ucds/, "settings-ucds"],
    [/\/admin\/users/, "admin-users"],
    [/\/admin\/sign-in-history/, "admin-sign-in-history"],
    [/\/admin\/org-units/, "admin-org-units"],
    [/\/admin\/register/, "admin-register"],
    [/\/admin\/system/, "admin-system"],
    [/\/admin\/erms-config/, "admin-erms-config"],
    [/\/admin\/vera/, "admin-vera"],
    [/\/admin\/posting/, "admin-posting"],
    [/\/storage-config/, "storage-config"],
    [/\/storage/, "storage"],
    [/\/dashboard/, "dashboard"],
  ];
  for (const [re, key] of rules) if (re.test(p)) return key;
  return "";
};
