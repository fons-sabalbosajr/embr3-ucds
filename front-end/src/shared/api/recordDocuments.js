import axios from "axios";
import { API_BASE } from "../../config/api";

// ---------------------------------------------------------------------------
// A record's scanned document: where it is served from, how to ask to see
// it, how to file one.
//
// Shared rather than ERMS-owned because two domains open the same document
// under the same rule: the Records Unit views from the records register, and
// a Planning Admin or Encoder asks from the establishment panel on a UCDS
// screen. Each reaches it through the route its own domain holds
// (`domain`: "erms" or "ucds"); the server applies the same province scope,
// the same approval check and the same audit trail either way.
// ---------------------------------------------------------------------------

const prefix = (domain) => `${API_BASE}/${domain === "ucds" ? "ucds" : "erms"}`;

/** Where a record's document lives for a screen. */
export const recordFileBase = (serialNo, { domain = "erms" } = {}) =>
  `${prefix(domain)}/records/${encodeURIComponent(serialNo)}/file`;

/** A Legal or Laboratory unit document's file. */
export const unitFileBase = (unit, serialNo) =>
  `${API_BASE}/erms/units/${unit}/documents/${encodeURIComponent(serialNo)}/file`;

/** Ask the Records Unit to open one record's document for the caller. */
export const requestDocumentAccess = async ({ serialNo, reason, domain = "erms" }) =>
  (
    await axios.post(
      `${prefix(domain)}/records/${encodeURIComponent(serialNo)}/access-request`,
      { reason },
      { withCredentials: true }
    )
  ).data;

/**
 * File a scan against a record (Records Unit). `replace`: absent or
 * 'missing' for a record without a scan; 'keep' or 'delete' to re-upload
 * over one that exists, saying what happens to the old file on the share.
 * `folder`: the project folder chosen on the form, if any.
 */
export const attachRecordFile = async ({ serialNo, file, replace, folder }) => {
  const form = new FormData();
  if (replace) form.append("replace", replace);
  if (folder) form.append("folder", folder);
  form.append("file", file, file.name);
  return (
    await axios.post(`${API_BASE}/erms/records/${encodeURIComponent(serialNo)}/upload`, form, { withCredentials: true })
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
