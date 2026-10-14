import axios from "axios";
import { API_BASE } from "../../config/api";

// The E-Universe Document Portal's API (server/modules/portal).
//
// The public page talks to /api/portal with no sign-in. Its own request is
// recognised by a ticket the server keeps in an httpOnly cookie, so every
// call carries cookies; changes also carry X-Portal-Request, which the
// server requires so no other site can make a visitor's browser ask or leave.
//
// The desk inside E-Universe — each unit deciding its own documents'
// requests — talks to /api/erms/portal.

const pub = axios.create({ baseURL: `${API_BASE}/portal`, withCredentials: true });
const desk = axios.create({ baseURL: `${API_BASE}/erms/portal`, withCredentials: true });
const changes = { headers: { "X-Portal-Request": "1" } };

export const searchDocuments = async (q) => (await pub.get("/search", { params: { q } })).data.results;
export const fetchRoom = async () => (await pub.get("/room")).data;
/** Who may ask, and the FOI and Data Privacy terms, in the version the server records acceptance of. */
export const fetchTerms = async () => (await pub.get("/terms")).data;
export const sendRequest = async (body) => (await pub.post("/requests", body, changes)).data;
export const leaveRoom = async () => (await pub.post("/leave", {}, changes)).data.request;
// The conversation about this browser's request (deleted after 12 idle hours).
export const fetchMyChat = async () => (await pub.get("/chat")).data;
export const postMyChat = async (text) => (await pub.post("/chat", { text }, changes)).data;
/** Fetched by the viewer itself, with this browser's ticket cookie. */
export const documentUrl = () => `${API_BASE}/portal/document`;

/** The desk, narrowed by its filters (q, requesterType, permitTypes, outcome, from, to). */
export const fetchDesk = async (params = {}) => (await desk.get("/desk", { params })).data;
export const decideRequest = async ({ id, ...body }) => (await desk.patch(`/requests/${id}`, body)).data.request;
export const revokeRequest = async ({ id, note }) => (await desk.post(`/requests/${id}/revoke`, { note })).data.request;
export const fetchPageCount = async (id) => (await desk.get(`/requests/${id}/pages`)).data;
// An approved seat's access — time left, pages, download — changed by the Developer.
export const adjustAccess = async ({ id, ...body }) => (await desk.patch(`/requests/${id}/access`, body)).data.request;

// The conversation with one requester, and which conversations wait unread.
export const fetchChatSummary = async () => (await desk.get("/chats")).data.chats;
export const fetchRequestChat = async (id) => (await desk.get(`/requests/${id}/chat`)).data;
export const postRequestChat = async ({ id, text }) => (await desk.post(`/requests/${id}/chat`, { text })).data;
// The room's settings — weekend closure, watermark — the Developer's to change.
export const fetchRoomSettings = async () => (await desk.get("/settings")).data;
export const saveRoomSettings = async (body) => (await desk.put("/settings", body)).data;

export const describeError = (err, fallback) => err?.response?.data?.message || fallback;

export const durationLabel = (m) =>
  m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
