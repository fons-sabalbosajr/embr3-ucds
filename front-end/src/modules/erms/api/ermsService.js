import axios from "axios";
import { API_BASE } from "../../../config/api";
import { withSessionToken } from "../../../shared/sessionToken";

const client = axios.create({ baseURL: `${API_BASE}/erms`, withCredentials: true });

export const fetchDashboard = async () => (await client.get("/dashboard")).data;

export const fetchFilterOptions = async () => (await client.get("/filter-options")).data;

/** The desktop ERMS's menus: project types, statuses, and the address lists (per province). */
export const fetchLookups = async (params) =>
  (await client.get("/lookups", { params: pruned(params) })).data;

/** An export download: the workbook and what the server said about it. */
const download = async (path, params) => {
  const res = await client.get(path, { params: pruned(params), responseType: "blob", timeout: 5 * 60 * 1000 });
  const disposition = res.headers["content-disposition"] || "";
  return {
    blob: res.data,
    fileName: /filename="([^"]+)"/.exec(disposition)?.[1] || "ERMS-export.xlsx",
    rows: Number(res.headers["x-export-rows"]) || 0,
    truncated: res.headers["x-export-truncated"] === "1",
  };
};
// The list's own filters; paging is left out — the export is all of them.
const unpaged = ({ page, pageSize, ...rest } = {}) => rest; // eslint-disable-line no-unused-vars

export const exportRecords = (params) => download("/records/export", unpaged(params));
export const exportUnitDocuments = (unit, params) => download(`/units/${unit}/documents/export`, unpaged(params));

// The Records reports (server: reportService).
export const fetchReports = async () => (await client.get("/reports")).data.reports;
export const fetchReport = async (key) => (await client.get(`/reports/${key}`)).data;
export const downloadReportCsv = async (key) => {
  const res = await client.get(`/reports/${key}`, { params: { format: "csv", limit: 20000 }, responseType: "blob" });
  const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || `erms-${key}.csv`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export const fetchRecords = async (params) =>
  (await client.get("/records", { params: pruned(params) })).data;

export const fetchRecord = async (serialNo) =>
  (await client.get(`/records/${encodeURIComponent(serialNo)}`)).data;

export const createRecord = async (payload) => (await client.post("/records", payload)).data.record;

export const updateRecord = async ({ serialNo, ...changes }) =>
  (await client.patch(`/records/${encodeURIComponent(serialNo)}`, changes)).data.record;

/** Take a record off "Needs review": what is left has been looked at and stands. */
export const markRecordReviewed = async ({ serialNo, note }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/reviewed`, pruned({ note }))).data.record;

// VERA's reading of the Ref. No. printed on the scan, against the one encoded.
export const fetchRefCheck = async (serialNo) => (await client.get(`/records/${encodeURIComponent(serialNo)}/ref-check`)).data.check;
// One AI model call reading the scan: allow the time.
export const runRefCheck = async ({ serialNo, force }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/ref-check`, force ? { force: true } : {}, { timeout: 3 * 60 * 1000 })).data.check;
/** action: "apply" (the scan's number onto the record), "undo", or "keep" (the encoded one stands). */
export const settleRefCheck = async ({ serialNo, action }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/ref-check/${action}`)).data;

// --- the UCDS register ------------------------------------------------------
// Read-only. ERMS never writes to the establishment register: a records clerk
// who finds a firm missing raises it with Planning.

export const searchRegister = async (q) =>
  (await client.get("/register/search", { params: { q } })).data.establishments;

export const resolvePermit = async (number) =>
  (await client.get("/register/resolve", { params: { number } })).data.match;

// --- uploads ----------------------------------------------------------------------
// Multipart: the record (or the unit document's values) as JSON alongside the
// file. The server files the scan on the unit's share and numbers the entry.

const multipart = (parts, file) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts)) if (v !== undefined && v !== null) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
  if (file) form.append("file", file, file.name);
  return form;
};

/** axios's upload progress as a whole percentage, for the upload dialogs' bar. */
const progressOf = (onProgress) =>
  onProgress ? { onUploadProgress: (e) => e.total && onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))) } : {};

// Settings › Duplicates: VERA's reading of each group, and her quick fix.
export const fetchDuplicateReview = async (unit) => (await client.get(`/duplicates/${unit}`)).data;
export const fixDuplicates = async ({ unit, keys, all }) => (await client.post(`/duplicates/${unit}/fix`, all ? { all: true } : { keys })).data;
export const dismissDuplicate = async ({ unit, key }) => (await client.post(`/duplicates/${unit}/dismiss`, { key })).data;
export const restoreDuplicate = async ({ unit, serialNo }) => (await client.post(`/duplicates/${unit}/restore`, { serialNo })).data;

/** Move a record's scan to another record (Developer or administrator). */
export const moveRecordFile = async ({ serialNo, toSerialNo }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/file/move`, { toSerialNo })).data;

/** VERA's suggestions for the record a scan belongs to. */
export const fetchMoveSuggestions = async (serialNo) =>
  (await client.get(`/records/${encodeURIComponent(serialNo)}/file/move-suggestions`)).data;

/** The serial the next record will get (claimed on save, not here). */
export const fetchNextSerial = async () => (await client.get("/records/next-serial")).data.serialNo ?? null;

export const uploadRecord = async ({ payload, file, onProgress }) =>
  (await client.post("/records/upload", multipart({ payload }, file), progressOf(onProgress))).data.record;

// Filing a scan against an existing record, opening a document and asking
// to see one live in shared/api/recordDocuments: the establishment panel on
// the planning screens uses them too. Re-exported so ERMS screens import
// from one place.
export { attachRecordFile, attachUnitFile, recordFileBase, unitFileBase, describeApiError } from "../../../shared/api/recordDocuments";

// --- the units: Legal Services and Laboratory --------------------------------------

export const fetchUnits = async () => (await client.get("/units")).data;

export const fetchUnitDashboard = async (unit) => (await client.get(`/units/${unit}/dashboard`)).data;

export const fetchUnitDocuments = async (unit, params) =>
  (await client.get(`/units/${unit}/documents`, { params: pruned(params) })).data;

export const fetchUnitDocument = async (unit, serialNo) =>
  (await client.get(`/units/${unit}/documents/${encodeURIComponent(serialNo)}`)).data;

/** A Legal or Laboratory document's history: its filing, edits, scans and views. */
export const fetchUnitDocumentHistory = async (unit, serialNo) =>
  (await client.get(`/units/${unit}/documents/${encodeURIComponent(serialNo)}/history`)).data.events;

export const uploadUnitDocument = async ({ unit, docType, province, parentSerialNo, folder, subfolder, targetPath, fields, file, onProgress }) =>
  (await client.post(`/units/${unit}/documents`, multipart({ docType, province, parentSerialNo, folder, subfolder, targetPath, fields }, file), progressOf(onProgress))).data.document;

// --- the folder browser --------------------------------------------------------------
// Any folder on the unit's share (relative to its root), and a new one inside
// it; with province and date, also where the layout would file (`standard`).
export const browseFolders = async (unit, params) =>
  (await client.get(`/units/${unit}/browse`, { params: pruned(params) })).data;

export const makeBrowseFolder = async ({ unit, path, name }) =>
  (await client.post(`/units/${unit}/browse`, pruned({ path, name }))).data;

/** Remove an empty folder from the unit's share; one with anything in it is refused (FOLDER_NOT_EMPTY). */
export const removeBrowseFolder = async ({ unit, path }) =>
  (await client.delete(`/units/${unit}/browse`, { data: { path } })).data;

// --- the folder picker ------------------------------------------------------------
// The project/company/station folders at the filing level for a province and
// date, as the desktop system let the clerk choose or make them. `unit` may
// be "records".

export const fetchFolders = async (unit, params) =>
  (await client.get(`/units/${unit}/folders`, { params: pruned(params) })).data;

export const createFolder = async ({ unit, ...body }) =>
  (await client.post(`/units/${unit}/folders`, pruned(body))).data;

export const deleteFolder = async ({ unit, ...body }) =>
  (await client.delete(`/units/${unit}/folders`, { data: pruned(body) })).data;

export const updateUnitDocument = async ({ unit, serialNo, ...changes }) =>
  (await client.patch(`/units/${unit}/documents/${encodeURIComponent(serialNo)}`, changes)).data.document;

// --- the unit's own settings (Settings › ERMS) ----------------------------------------

export const fetchUnitSettings = async (unit) => (await client.get(`/units/${unit}/settings`)).data;
export const saveUnitSettings = async ({ unit, settings }) => (await client.put(`/units/${unit}/settings`, settings)).data;
export const resetUnitSettings = async (unit) => (await client.post(`/units/${unit}/settings/reset`)).data;
export const fetchUnitActivity = async (unit, params) =>
  (await client.get(`/units/${unit}/activity`, { params: pruned(params) })).data;
export const fetchUnitDuplicateGroups = async (unit) => (await client.get(`/units/${unit}/duplicate-groups`)).data.groups;
/** Values already on file, for the upload forms' autocomplete: [{ value, count, fill? }]. */
export const fetchRecordSuggestions = async (field, q, extra = {}) =>
  (await client.get("/records/suggest", { params: pruned({ field, q, ...extra }) })).data.items;

// VERA's upload guide: her suggestions for the form as it stands (by rule),
// and her reading of the scan chosen (one AI call, on request).
export const fetchVeraUploadTips = async (values) => (await client.post("/records/vera/guide", values)).data.tips;
export const veraReadScan = async (file) => (await client.post("/records/vera/read-scan", multipart({}, file), { timeout: 3 * 60 * 1000 })).data;
// The same on the Legal and Laboratory forms, for the document type chosen.
export const fetchUnitVeraTips = async (unit, values) => (await client.post(`/units/${unit}/vera/guide`, values)).data.tips;
export const unitVeraReadScan = async (unit, docType, file) => (await client.post(`/units/${unit}/vera/read-scan`, multipart({ docType }, file), { timeout: 3 * 60 * 1000 })).data;
export const fetchUnitSuggestions = async (unit, field, q) =>
  (await client.get(`/units/${unit}/suggest`, { params: pruned({ field, q }) })).data.items;

// The unit's own menus (Settings › ERMS › Menus).
export const fetchUnitLookups = async (unit) => (await client.get(`/units/${unit}/lookups`)).data;
export const saveUnitLookup = async ({ unit, kind, items }) => (await client.put(`/units/${unit}/lookups/${kind}`, { items })).data;

// Docket numbers (Legal): the next one, claiming it, the register.
export const fetchNextDocket = async ({ province, year }) =>
  (await client.get("/units/legal/dockets/next", { params: pruned({ province, year }) })).data;
export const claimDocket = async ({ province, year, note }) =>
  (await client.post("/units/legal/dockets", pruned({ province, year, note }))).data.docket;
export const fetchDockets = async (params) => (await client.get("/units/legal/dockets", { params: pruned(params) })).data.dockets;

// The upload tally and the supervisor's check.
export const fetchUploadTally = async (unit, params) => (await client.get(`/units/${unit}/upload-tally`, { params: pruned(params) })).data;
// A link the browser follows, so this tab's sign-in travels in the URL (see shared/sessionToken).
export const uploadTallyCsvUrl = (unit, { from, to }) =>
  withSessionToken(`${API_BASE}/erms/units/${unit}/upload-tally?${new URLSearchParams(pruned({ from, to, format: "csv" }))}`);
export const checkUploads = async ({ unit, entries, remarks }) =>
  (await client.post(`/units/${unit}/upload-tally/checks`, pruned({ entries, remarks }))).data;
export const uncheckUploads = async ({ unit, date, uploader }) =>
  (await client.delete(`/units/${unit}/upload-tally/checks`, { data: { date, uploader } })).data;

// The Action Center: messages between ERMS users.
export const fetchMessages = async (params) => (await client.get("/messages", { params: pruned(params) })).data;
export const fetchUnreadMessages = async () => (await client.get("/messages/unread")).data.unread;
export const fetchMessagePeople = async (q) => (await client.get("/messages/people", { params: pruned({ q }) })).data.people;
export const sendMessage = async (message) => (await client.post("/messages", pruned(message))).data.message;
export const markMessage = async ({ id, read }) => (await client.patch(`/messages/${id}`, { read })).data.message;
export const deleteMessage = async (id) => (await client.delete(`/messages/${id}`)).data;

export const checkUnitDuplicates = async (unit, fileName) =>
  (await client.get(`/units/${unit}/duplicates`, { params: pruned({ fileName }) })).data;

/** Records already filed with this permit number or file name (per the unit's duplicate rules). */
export const checkDuplicates = async (params) => (await client.get("/records/duplicates", { params: pruned(params) })).data;
export const fetchDuplicateGroups = async () => (await client.get("/records/duplicate-groups")).data.groups;

// --- configuration (Admin Settings > ERMS Config) -----------------------------------

export const fetchErmsConfig = async () => (await client.get("/config")).data;
export const saveErmsConfig = async (config) => (await client.put("/config", config)).data;
export const resetErmsConfig = async () => (await client.post("/config/reset")).data;
export const fetchLookupList = async (kind) => (await client.get(`/config/lookups/${kind}`)).data;
export const saveLookupList = async ({ kind, items, description }) =>
  (await client.put(`/config/lookups/${kind}`, { items, description })).data;

// --- document access ------------------------------------------------------------
// Documents are view-only. The Records Unit opens them; anyone else asks in
// the Document Portal (modules/portal). There is no sharing from a record.

// --- tracking ---------------------------------------------------------------

export const addTracking = async ({ serialNo, ...entry }) =>
  (await client.post(`/records/${encodeURIComponent(serialNo)}/tracking`, entry)).data.entry;

// A Legal or Laboratory document's custody trail.
export const fetchUnitTracking = async (unit, serialNo) => (await client.get(`/units/${unit}/documents/${encodeURIComponent(serialNo)}/tracking`)).data;
export const addUnitTracking = async ({ unit, serialNo, ...entry }) =>
  (await client.post(`/units/${unit}/documents/${encodeURIComponent(serialNo)}/tracking`, entry)).data.entry;

export const fetchOverdue = async () => (await client.get("/tracking/overdue")).data.overdue;

// --- archive ----------------------------------------------------------------

// `unit`: Legal Services' or the Laboratory's own boxes; omitted, the Records Unit's.
const boxBase = (unit) => (unit && unit !== "records" ? `/units/${unit}/boxes` : "/boxes");

export const fetchBoxes = async (params, unit) =>
  (await client.get(boxBase(unit), { params: pruned(params) })).data.boxes;

export const createBox = async ({ unit, ...payload }) => (await client.post(boxBase(unit), payload)).data.box;

export const updateBox = async ({ unit, code, ...changes }) =>
  (await client.patch(`${boxBase(unit)}/${encodeURIComponent(code)}`, changes)).data.box;

export const fetchBoxContents = async (code, unit) =>
  (await client.get(`${boxBase(unit)}/${encodeURIComponent(code)}`)).data.contents;

export const assignToBox = async ({ unit, serialNo, boxCode }) =>
  unit && unit !== "records"
    ? (await client.put(`/units/${unit}/documents/${encodeURIComponent(serialNo)}/box`, { boxCode })).data
    : (await client.put(`/records/${encodeURIComponent(serialNo)}/box`, { boxCode })).data;

export const fetchDisposalDue = async () => (await client.get("/disposal-due")).data.boxes;

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
  pto: "cyan",
  dp: "geekblue",
  luc: "lime",
  coa: "purple",
  other: "default",
};

/** The permit kinds the Records Unit files, in the order the desktop menu listed them. */
export const PERMIT_OPTIONS = [
  { value: "ecc-original", label: "ECC (Original)" },
  { value: "ecc-amended", label: "ECC (Amended)" },
  { value: "cnc", label: "Certificate of Non-Coverage" },
  { value: "hw-generator", label: "HW Generator Registration" },
  { value: "pto", label: "Permit to Operate" },
  { value: "dp", label: "Discharge Permit" },
  { value: "luc", label: "Land Use Conversion" },
  { value: "coa", label: "Certificate of Accreditation" },
  { value: "other", label: "Other" },
];

// How each permit type's number is written, from the numbers on file (29 Oct
// 2026: these match 93–100% of each type's; the rest are mostly typos — a
// doubled hyphen, a space, "OL-" without "ECC-"). The example is the format
// in use now; the older ones stay accepted, as the register still holds them.
// Types nothing has been filed under yet have no format to hold to.
const ECC_FORMATS = [
  /^ECC-OL-R\d{1,2}[A-Z]?-\d{4}-\d{4}$/, // ECC-OL-R03-2015-0035 (the online system)
  /^(ECC-)?R\d{1,2}[A-Z]?-\d{4}-\d{4}$/, // R03-0908-0039, ECC-R03-2208-0013
  /^R\d{1,2}-\d{8}-\d{4}$/, // R03-01072022-5173
  /^R\d{1,2}-\d{4}-\d{3}-\d{4}$/, // R3-0706-264-9999
  /^III-\d{4}-\d{3}-\d{3}[A-Z]$/, // III-9001-028-303A
  /^\d{2}[A-Z]{2}-?\d{4}(-\d{2,6}){1,3}-\d{3}[A-Z]$/, // 03PA-0203-10-029-120A
];
export const PERMIT_FORMATS = {
  "ecc-original": { label: "ECC Ref No", example: "R03-01072022-5173", also: ["ECC-R03-2208-0013", "ECC-OL-R03-2022-0012"], patterns: ECC_FORMATS },
  "ecc-amended": { label: "ECC Ref No", example: "ECC-OL-R03-2015-0035", also: ["R03-0908-0045", "R03-01082016-3804"], patterns: ECC_FORMATS },
  cnc: {
    label: "CNC No",
    example: "CNC-R03-1201-0003",
    also: ["CNC-R3-0712-426-8492", "CNC-03PA-0501-13-003"],
    patterns: [
      /^CNC-R\d{1,2}-\d{4}-\d{3,4}$/, // CNC-R03-1201-0003
      /^CNC-R\d{1,2}-\d{4}-\d{3}-\d{4}$/, // CNC-R3-0712-426-8492
      /^CNC-\d{2}[A-Z]{2}-\d{4}-\d{2}-\d{3}$/, // CNC-03PA-0501-13-003
      /^CNC-\d{4}(-\d{2})?-\d{2}[A-Z]{2}-\d{3}$/, // CNC-0501-03PA-229
      /^R\d{1,2}-\d{4}-\d{3}-\d{4}$/, // R3-0712-494-3118 (filed without the prefix)
    ],
  },
  "hw-generator": {
    label: "HWID No",
    example: "GR-R3-08-00001",
    also: ["M-GR-R3-14-00382", "GR-03-08-0098"],
    patterns: [/^(M-)?GR-(R\d{1,2}|\d{2})(-\d{2})?-\d{3,6}$/],
  },
  pto: { label: "PTO No", example: null, also: [], patterns: null },
  dp: { label: "DP No", example: null, also: [], patterns: null },
  luc: { label: "LUC No", example: null, also: [], patterns: null },
  coa: { label: "COA No", example: null, also: [], patterns: null },
  other: { label: "Permit number", example: null, also: [], patterns: null },
};

/** The number format of a permit type (the "other" one when unknown). */
export const permitFormatOf = (type) => PERMIT_FORMATS[type] || PERMIT_FORMATS.other;

/** Whether a number is written the way its permit type's numbers are; true where the type has no format. */
export const fitsPermitFormat = (type, number) => {
  const { patterns } = permitFormatOf(type);
  const n = String(number || "").trim().toUpperCase();
  return !patterns || !n || patterns.some((re) => re.test(n));
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

