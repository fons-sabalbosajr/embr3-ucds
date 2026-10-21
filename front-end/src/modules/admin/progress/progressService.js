import axios from "axios";
import { API_BASE_URL } from "../../../config/api";

// Admin Settings › Progress Tracker — the server reads the SharePoint working
// files; the page only ever asks the server.
const client = axios.create({ baseURL: `${API_BASE_URL}/api/admin/progress-tracker`, withCredentials: true });

export const getProgress = async (season) => (await client.get("", { params: season ? { season } : undefined })).data;
export const getProgressFile = async (id) => (await client.get(`/files/${encodeURIComponent(id)}`)).data.file;
export const createSeason = async (season) => (await client.post("/seasons", season)).data;
export const updateSeason = async ({ id, ...season }) => (await client.put(`/seasons/${id}`, season)).data;
export const rebaselineSeason = async (id) => (await client.post(`/seasons/${id}/rebaseline`)).data;
export const saveLegend = async ({ id, legend }) => (await client.put(`/seasons/${id}/legend`, { legend })).data;
/** Names for the newly issued lists' colours outside the workshop's legend: { family: name }. */
export const saveMasterlistNames = async ({ id, names }) => (await client.put(`/seasons/${id}/masterlist-names`, { names })).data;
/** A name for one colour of the RAW files' main sheets: { unit, rgb, label, allUnits } (an empty label takes it off). */
export const saveRawColourName = async ({ id, ...body }) => (await client.put(`/seasons/${id}/raw-colour-names`, body)).data;
// The public link's settings: { enabled, expiresAt (ISO or null), regenerate }.
export const saveShare = async ({ id, ...share }) => (await client.put(`/seasons/${id}/share`, share)).data;
// The Data Visualization tab's firm table and map (Developer only).
export const getVizFirms = async (params) => (await client.get("/viz/firms", { params })).data;
export const getVizPoints = async (unit) => (await client.get("/viz/points", { params: unit ? { unit } : undefined })).data;
export const getVizFirm = async (serial) => (await client.get(`/viz/firms/${encodeURIComponent(serial)}`)).data.firm;
// The public page: no session, the figures only.
export const getPublicProgress = async (token) =>
  (await axios.get(`${API_BASE_URL}/api/public/progress/${encodeURIComponent(token)}`, { withCredentials: false })).data;
// The public page's map: the dots, and one firm's card (what and where only).
const publicBase = (token) => `${API_BASE_URL}/api/public/progress/${encodeURIComponent(token)}`;
export const getPublicPoints = async (token, unit) => (await axios.get(`${publicBase(token)}/points`, { params: unit ? { unit } : undefined, withCredentials: false })).data;
export const getPublicFirm = async (token, serial) => (await axios.get(`${publicBase(token)}/firms/${encodeURIComponent(serial)}`, { withCredentials: false })).data.firm;
// The first look at a season reads every file (about a minute); later ones only what changed.
export const checkNow = async () => (await client.post("/refresh", null, { timeout: 5 * 60 * 1000 })).data;

// ---------------------------------------------------------------------------
// The last figures a screen saw, kept in the browser so it paints at once and
// refreshes quietly (react-query then fetches the current ones). The
// Developer's in sessionStorage — gone when the tab closes; the public page's
// (figures only) in localStorage. Every read and write may fail (a private
// window, storage full): the screen then simply loads as before.
// ---------------------------------------------------------------------------
const SNAPSHOT_VERSION = 1;
const store = (kind) => {
  try {
    return kind === "public" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
export function readSnapshot(kind, key) {
  try {
    const raw = store(kind)?.getItem(`pt.snapshot.${key}`);
    if (!raw) return undefined;
    const snap = JSON.parse(raw);
    return snap?.v === SNAPSHOT_VERSION ? snap : undefined;
  } catch {
    return undefined;
  }
}
export function writeSnapshot(kind, key, data) {
  try {
    store(kind)?.setItem(`pt.snapshot.${key}`, JSON.stringify({ v: SNAPSHOT_VERSION, at: Date.now(), data }));
  } catch {
    /* storage full or blocked: the next visit loads as before */
  }
}

// Per RAW file, the cells holding a newly issued permit already encoded (Developer only).
export const getColourTargets = async () => (await client.get("/colour-targets")).data;
/** One kind of newly issued permit, list by list: each permit's colour and standing (Developer only). */
export const getIssuedDetail = async (kind) => (await client.get(`/issued/${encodeURIComponent(kind)}`)).data;
