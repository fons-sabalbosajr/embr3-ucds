import axios from "axios";
import { API_BASE } from "../../../config/api";
import { withSessionToken } from "../../../shared/sessionToken";

const client = axios.create({ baseURL: `${API_BASE}/erms`, withCredentials: true });

export const fetchDashboard = async () => (await client.get("/dashboard")).data;

export const fetchFilterOptions = async () => (await client.get("/filter-options")).data;

/** The desktop ERMS's menus: project types, statuses, and the address lists (per province). */
export const fetchLookups = async (params) =>
  (await client.get("/lookups", { params: pruned(params) })).data;

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

export const PROVINCE_LABEL = {
  aurora: "Aurora",
  bataan: "Bataan",
  bulacan: "Bulacan",
  nuevaEcija: "Nueva Ecija",
  pampanga: "Pampanga",
  tarlac: "Tarlac",
  zambales: "Zambales",
};

