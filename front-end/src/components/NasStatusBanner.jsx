import { useEffect, useRef, useState } from "react";
import { Alert, Typography } from "antd";
import { DisconnectOutlined } from "@ant-design/icons";
import { initializeSocket, getSocket } from "../api/socketService";
import { API_BASE_URL } from "../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// "The NAS is not connected", said once across the whole application.
//
// The server watches the NAS (services/nasBridge.js) and pushes every change
// over the socket; the Storage page already reacts to it, but someone on the
// dashboard or a record would otherwise learn of the outage only when a
// document failed to open. This strip sits under the header on every screen
// and says two things: the files are unavailable, and nothing else is —
// the database is reached over the internet, not through the office, so the
// register, the records and the reports keep working.
//
// It shows only for the outage reasons (the NAS or the bridge to it not
// answering). A schedule or a switch the Developer set is not an outage;
// the Storage page explains those where they matter.
// ---------------------------------------------------------------------------

const OUTAGE = new Set(["nas-offline", "bridge-offline"]);

const NasStatusBanner = () => {
  const [state, setState] = useState(null);
  // Closed by the person stays closed for this outage; a new outage shows again.
  const [dismissed, setDismissed] = useState(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const apply = (payload) => {
      if (cancelled.current || !payload || typeof payload !== "object") return;
      setState({
        active: payload.active === true,
        reason: payload.reason || null,
        message: payload.message || null,
        nextOpensAt: payload.nextOpensAt || null,
      });
    };
    const load = () =>
      fetch(`${API_BASE_URL}/api/nas/activation`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then(apply)
        .catch(() => {});

    load();
    const socket = getSocket() || initializeSocket();
    socket?.on("nas:availability", apply);
    // After a reconnect the socket may have missed a change; ask again.
    socket?.on("connect", load);
    const poll = setInterval(load, 60000);
    return () => {
      cancelled.current = true;
      socket?.off("nas:availability", apply);
      socket?.off("connect", load);
      clearInterval(poll);
    };
  }, []);

  const outage = state && !state.active && OUTAGE.has(state.reason);
  useEffect(() => {
    if (!outage) setDismissed(null);
  }, [outage]);

  if (!outage || dismissed === state.reason) return null;

  return (
    <Alert
      banner
      type="warning"
      showIcon
      icon={<DisconnectOutlined />}
      closable
      onClose={() => setDismissed(state.reason)}
      className="nas-status-banner"
      message={
        <span>
          <Text strong>NAS not connected.</Text>{" "}
          {state.message ||
            "Files stored on the NAS cannot be opened right now. The database and everything else keep working."}
          {state.nextOpensAt && (
            <Text type="secondary"> Next available: {new Date(state.nextOpensAt).toLocaleString()}.</Text>
          )}
        </span>
      }
    />
  );
};

export default NasStatusBanner;
