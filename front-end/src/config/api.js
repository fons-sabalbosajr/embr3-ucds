// Centralized API and Socket URLs derived from environment variables
// Use Vite-compatible env vars. These are populated via server/.env -> front-end/.env.local sync.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.__API_BASE_URL__ || "http://localhost:8081";
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.__SOCKET_URL__ || API_BASE_URL;

// Common REST base under /api
export const API_BASE = `${API_BASE_URL}/api`;
