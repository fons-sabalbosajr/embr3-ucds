// src/api/socketService.js
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config/api";
let socket = null;

export const initializeSocket = (options = { withCredentials: true }) => {
  if (socket && socket.connected) {
    // console.log("[SocketService] Socket already initialized and connected.");
    return socket;
  }
  if (socket) {
    // console.log("[SocketService] Socket exists but not connected, re-initializing.");
    socket.disconnect();
  }
  // console.log("[SocketService] Initializing new socket connection.");
  socket = io(SOCKET_URL, options);

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
export const emitJoinSurvey = (user) => emitEvent("joinSurvey", { user });
export const emitLeaveSurvey = () => emitEvent("leaveSurvey"); // Assuming you might need this
export const emitJoinMbu = (user) => emitEvent("joinMbu", { user }); // Removed path, MBU is a single route
export const emitLeaveMbu = () => emitEvent("leaveMbu"); // Removed path
// Added Planning Unit specific events
export const emitJoinHealthcare = (user) => emitEvent("joinHealthcare", { user });
export const emitLeaveHealthcare = () => emitEvent("leaveHealthcare");
export const emitJoinChemicals = (user) => emitEvent("joinChemicals", { user });
export const emitLeaveChemicals = () => emitEvent("leaveChemicals");
export const emitJoinTsd = (user) => emitEvent("joinTsd", { user });
export const emitLeaveTsd = () => emitEvent("leaveTsd");
export const emitJoinTrc = (user) => emitEvent("joinTrc", { user });
export const emitLeaveTrc = () => emitEvent("leaveTrc");


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
export const onSurveyViewersUpdate = (callback) => setupListener("surveyViewers", callback);
export const onMbuViewersUpdate = (callback) => setupListener("mbuViewers", callback);
// Added Planning Unit specific listeners
export const onHealthcareViewersUpdate = (callback) => setupListener("healthcareViewers", callback);
export const onChemicalsViewersUpdate = (callback) => setupListener("chemicalsViewers", callback);
export const onTsdViewersUpdate = (callback) => setupListener("tsdViewers", callback);
export const onTrcViewersUpdate = (callback) => setupListener("trcViewers", callback);

// Special listeners for connect/disconnect if component needs to react to these
export const onSocketConnect = (callback) => setupListener("connect", callback);
export const onSocketDisconnect = (callback) => setupListener("disconnect", callback);
