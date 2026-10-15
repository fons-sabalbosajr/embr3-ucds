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
// The first look at a season reads every file (about a minute); later ones only what changed.
export const checkNow = async () => (await client.post("/refresh", null, { timeout: 5 * 60 * 1000 })).data;
