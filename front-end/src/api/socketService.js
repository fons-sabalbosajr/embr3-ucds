// src/api/socketService.js
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config/api";
import { getSessionToken } from "../shared/sessionToken";
let socket = null;

export const initializeSocket = (options = {}) => {
  // One connection per tab. A socket still connecting (or reconnecting) is
  // reused: tearing it down and starting another — what this did whenever a
  // second screen asked before the first connection finished — meant several
  // connections per page load and a stream of polling requests to match.
  if (socket && (socket.connected || socket.active)) {
    return socket;
  }
  if (socket) {
    socket.disconnect();
  }
  // WebSocket first: one long-lived connection rather than long-polling
  // requests every few seconds. Polling stays as the fallback for a network
  // that blocks WebSockets.
  // The tab's own sign-in (shared/sessionToken), read on every (re)connect,
  // so notices meant for this account reach this tab and no other account's
  // (server/services/notifier.js). A tab without one falls back to the cookie.
  socket = io(SOCKET_URL, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    // perTab: with no token this tab is signed out — the server must not
    // fall back to the browser's cookie, which is another tab's account.
    auth: (cb) => cb({ token: getSessionToken(), perTab: true }),
    ...options,
  });

  socket.on("connect", () => {
    //console.log("[SocketService] Connected to socket server");
  });

  socket.on("disconnect", (reason) => {
    //console.log("[SocketService] Disconnected from socket server:", reason);
  });

  socket.on("connect_error", (err) => {
    //console.error("[SocketService] Connection error:", err.message);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    //console.log("[SocketService] Socket disconnected and instance cleared.");
  }
};

export const getSocket = () => {
  return socket;
};

// --- Event Emitters ---
const emitEvent = (eventName, data) => {
  if (socket && socket.connected) {
    socket.emit(eventName, data);
  } else {
    //console.warn(`[SocketService] Socket not connected. Cannot emit ${eventName}.`);
  }
};

export const emitJoinProvince = (province, user) => emitEvent("joinProvince", { province, user });
export const emitLeaveProvince = () => emitEvent("leaveProvince");
export const emitJoinMbu = (user) => emitEvent("joinMbu", { user }); // Removed path, MBU is a single route
export const emitLeaveMbu = () => emitEvent("leaveMbu"); // Removed path
// Added Planning Unit specific events


// --- Event Listeners ---
const setupListener = (eventName, callback) => {
  if (!socket) {
    // Attempt to initialize if not already
    console.warn(`[SocketService] Socket not initialized when trying to listen to ${eventName}. Initializing now.`);
    initializeSocket();
    if (!socket) {
        console.error(`[SocketService] Failed to initialize socket. Cannot listen to ${eventName}.`);
        return () => {};
    }
  }
  socket.on(eventName, callback);
  return () => {
    if (socket) {
      socket.off(eventName, callback);
    }
  };
};

export const onProvinceViewersUpdate = (callback) => setupListener("provinceViewers", callback);
export const onMbuViewersUpdate = (callback) => setupListener("mbuViewers", callback);
// Added Planning Unit specific listeners

// Special listeners for connect/disconnect if component needs to react to these
export const onSocketConnect = (callback) => setupListener("connect", callback);
export const onSocketDisconnect = (callback) => setupListener("disconnect", callback);
