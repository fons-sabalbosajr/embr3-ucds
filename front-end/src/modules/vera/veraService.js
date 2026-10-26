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

// VERA's data corrections (the Developer's): the latest report on the Records
// project types, a fresh check, and applying or undoing what it proposes.
export const getCorrections = async () => (await client.get("/corrections")).data;
export const getCorrectionsPending = async () => (await client.get("/corrections/pending")).data.pending;
export const runCorrectionsCheck = async () => (await client.post("/corrections/scan", null, { timeout: 5 * 60 * 1000 })).data;
export const applyCorrections = async ({ reportId, ids, all }) =>
  (await client.post(`/corrections/${reportId}/apply`, all ? { all: true } : { ids }, { timeout: 5 * 60 * 1000 })).data;
export const undoCorrection = async ({ reportId, proposalId }) =>
  (await client.post(`/corrections/${reportId}/undo`, { proposalId })).data;
/** "Let VERA fix it": a fresh check, and every correction she is certain of applied. */
export const autoFixCorrections = async () => (await client.post("/corrections/auto-fix", null, { timeout: 5 * 60 * 1000 })).data;

// VERA's serial number check across Records, Legal Services and Laboratory.
export const getSerialCheck = async () => (await client.get("/serials")).data.report;
export const runSerialCheck = async () => (await client.post("/serials/scan")).data.report;
export const fixSerials = async () => (await client.post("/serials/fix")).data;

// VERA reads a scan's text, for search: one document, or the next few.
export const readScanText = async (unit, serialNo) => (await client.post(`/scan-text/${unit}/${encodeURIComponent(serialNo)}`, null, { timeout: 3 * 60 * 1000 })).data;
export const readNextScans = async ({ unit, limit }) => (await client.post("/scan-text/next", { unit, limit }, { timeout: 30 * 60 * 1000 })).data;

// VERA's check of each record's project type against its document.
export const getProjectTypeCheck = async () => (await client.get("/project-types")).data;
export const saveProjectTypeSettings = async (settings) => (await client.put("/project-types/settings", settings)).data;
// One model call per document read: allow the time.
export const runProjectTypeCheck = async () => (await client.post("/project-types/scan", null, { timeout: 15 * 60 * 1000 })).data;
export const applyProjectTypes = async ({ serialNos, all }) => (await client.post("/project-types/apply", all ? { all: true } : { serialNos })).data;
export const settleProjectType = async ({ serialNo, action }) => (await client.post(`/project-types/${encodeURIComponent(serialNo)}/${action}`)).data;

// VERA's check of each record's Ref. No. against its scan: the report and the
// next few read. Applying or keeping goes through the record's own endpoint.
export const getRefNumberCheck = async () => (await client.get("/ref-numbers")).data;
export const runRefNumberCheck = async (limit) => (await client.post("/ref-numbers/scan", { limit }, { timeout: 30 * 60 * 1000 })).data;

// VERA's register links (the Developer's): records in the Document Library not
// linked to the central register, and the links she proposes for them.
export const getRegisterLinks = async () => (await client.get("/register-links")).data;
export const getRegisterLinksPending = async () => (await client.get("/register-links/pending")).data.pending;
// Reading with the AI model can take a minute or two.
export const runRegisterLinksCheck = async () => (await client.post("/register-links/scan", null, { timeout: 5 * 60 * 1000 })).data;
export const applyRegisterLinks = async ({ reportId, ids, all }) =>
  (await client.post(`/register-links/${reportId}/apply`, all ? { all: true } : { ids })).data;
export const undoRegisterLink = async ({ reportId, proposalId }) =>
  (await client.post(`/register-links/${reportId}/undo`, { proposalId })).data;

/**
 * Open VERA's chat from a screen, optionally asking a question at once (the
 * Progress Tracker's "Ask VERA" chips). VeraChat listens for it.
 */
export const VERA_ASK_EVENT = "vera:ask";
export const openVera = (message = "") => window.dispatchEvent(new CustomEvent(VERA_ASK_EVENT, { detail: { message } }));

/**
 * A router path as the coarse screen key the server's PAGE_LABELS knows, so
 * VERA can tailor its directions. Never a record id or a query string.
 */
export const pageKeyFromPath = (pathname) => {
  const p = String(pathname || "").toLowerCase();
  const rules = [
    // The public pages first. The Document Portal has VERA as its own guide.
    [/\/document-portal\/?$/, "document-portal"],
    [/\/forgot-password\/?$/, "forgot-password"],
    [/\/reset-password\/?$/, "reset-password"],
    [/\/register\/?$/, "register"],
    [/\/login\/?$/, "signin"],
    [/select-year/, "year-select"],
    [/\/erms\/records\/[^/]+/, "record-detail"],
    [/\/erms\/records/, "document-library"],
    [/\/erms\/portal-requests/, "portal-desk"],
    [/\/erms\/archive/, "archive"],
    [/\/erms\/upload-tally/, "upload-tally"],
    [/\/erms\/legal\/documents/, "legal-documents"],
    [/\/erms\/legal/, "legal-dashboard"],
    [/\/erms\/laboratory\/documents/, "laboratory-documents"],
    [/\/erms\/laboratory/, "laboratory-dashboard"],
    [/\/erms/, "erms-dashboard"],
    [/\/province\//, "province"],
    [/\/datasets\//, "datasets"],
    // A Planning Unit table (or folder) added to the year's menu.
    [/\/custom\/[^/]+/, "custom-table"],
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
    [/\/admin\/progress-tracker/, "progress-tracker"],
    [/\/admin\/posting/, "admin-posting"],
    [/\/storage-config/, "storage-config"],
    [/\/storage/, "storage"],
    [/\/dashboard/, "dashboard"],
  ];
  for (const [re, key] of rules) if (re.test(p)) return key;
  return "";
};

// VERA's check of the Universe Central DB register — always the active
// year's — and applying or undoing the fixes she proposes (Developer, admin).
export const getUcdsCheck = async () => (await client.get("/ucds-check")).data;
export const runUcdsCheck = async () => (await client.post("/ucds-check/scan", null, { timeout: 5 * 60 * 1000 })).data;
export const applyUcdsFixes = async ({ reportId, ids, all }) =>
  (await client.post(`/ucds-check/${reportId}/apply`, all ? { all: true } : { ids }, { timeout: 5 * 60 * 1000 })).data;
export const undoUcdsFix = async ({ reportId, proposalId }) => (await client.post(`/ucds-check/${reportId}/undo`, { proposalId })).data;
export const autoFixUcds = async () => (await client.post("/ucds-check/auto-fix", null, { timeout: 5 * 60 * 1000 })).data;
