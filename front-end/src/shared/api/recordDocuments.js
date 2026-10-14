import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// A record's scanned document: where it is served from, and how to file one.
// (Asking to see one is done in the E-Universe Document Portal.)
//
// Shared rather than ERMS-owned because two domains open the same document
// under the same rule: the Records Unit views from the records register, and
// a Planning Admin or Encoder asks from the establishment panel on a UCDS
// screen. Each reaches it through the route its own domain holds
// (`domain`: "erms" or "ucds"); the server applies the same province scope,
// the same check and the same audit trail either way.
// ---------------------------------------------------------------------------

const prefix = (domain) => `${API_BASE}/${domain === "ucds" ? "ucds" : "erms"}`;

/** Where a record's document lives for a screen. */
export const recordFileBase = (serialNo, { domain = "erms" } = {}) =>
  `${prefix(domain)}/records/${encodeURIComponent(serialNo)}/file`;

/** A Legal or Laboratory unit document's file. */
export const unitFileBase = (unit, serialNo) =>
  `${API_BASE}/erms/units/${unit}/documents/${encodeURIComponent(serialNo)}/file`;

/**
 * File a scan against a record (Records Unit). `replace`: absent or
 * 'missing' for a record without a scan; 'keep' or 'delete' to re-upload
 * over one that exists, saying what happens to the old file on the share.
 * `folder`, `subfolder`: the project folder, and the folder inside it,
 * chosen on the form, if any.
 */
/** axios's upload progress as a whole percentage, for the upload dialogs' bar. */
const progressOf = (onProgress) =>
  onProgress ? { onUploadProgress: (e) => e.total && onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))) } : {};

export const attachRecordFile = async ({ serialNo, file, replace, folder, subfolder, targetPath, onProgress }) => {
  const form = new FormData();
  if (replace) form.append("replace", replace);
  if (folder) form.append("folder", folder);
  if (subfolder) form.append("subfolder", subfolder);
  if (targetPath) form.append("targetPath", targetPath);
  form.append("file", file, file.name);
  return (
    await axios.post(`${API_BASE}/erms/records/${encodeURIComponent(serialNo)}/upload`, form, { withCredentials: true, ...progressOf(onProgress) })
  ).data;
};

/**
 * File a scan against a Legal or Laboratory document, or replace its scan.
 * The same `replace` rule as a record: 'keep' or 'delete' when the
 * document already has a scan on the share.
 */
export const attachUnitFile = async ({ unit, serialNo, file, replace, folder, subfolder, targetPath, onProgress }) => {
  const form = new FormData();
  if (replace) form.append("replace", replace);
  if (folder) form.append("folder", folder);
  if (subfolder) form.append("subfolder", subfolder);
  if (targetPath) form.append("targetPath", targetPath);
  form.append("file", file, file.name);
  return (
    await axios.post(`${API_BASE}/erms/units/${unit}/documents/${encodeURIComponent(serialNo)}/upload`, form, { withCredentials: true, ...progressOf(onProgress) })
  ).data;
};

export const describeApiError = (error, fallback = "Something went wrong.") => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
  }
  return data.message || fallback;
};
