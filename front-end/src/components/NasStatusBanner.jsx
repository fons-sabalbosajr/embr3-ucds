import { useEffect, useRef, useState } from "react";
import { Alert, Typography } from "antd";
import { DisconnectOutlined, FieldTimeOutlined, WifiOutlined } from "@ant-design/icons";
import { initializeSocket, getSocket } from "../api/socketService";
import { API_BASE_URL } from "../config/api";
import visibleInterval from "../shared/visibleInterval";
import { OUTAGE_TITLES } from "../shared/nasWords";

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
// It shows for three things, in plain words (see shared/nasWords):
//
//   outage    the file storage, or the office computer that connects to it,
//             not answering — a power interruption, the office internet
//   slow      answering, but slowly: scans will take longer to open
//   offline   this computer has lost its own internet connection
//
// A schedule or a switch the Developer set is not an outage; the screens
// that open documents explain those where they matter.
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
        slow: payload.slow === true,
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
    // A fallback for a missed push; skipped while the tab is hidden (this
    // banner is on every screen, for everyone).
    const stopPolling = visibleInterval(load, 60000);
    return () => {
      cancelled.current = true;
      socket?.off("nas:availability", apply);
      socket?.off("connect", load);
      stopPolling();
    };
  }, []);

  // This computer's own connection, from the browser.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const outage = state && !state.active && OUTAGE.has(state.reason);
  const kind = !online ? "offline" : outage ? state.reason : state?.active && state.slow ? "slow" : null;
  useEffect(() => {
    if (!kind) setDismissed(null);
  }, [kind]);

  if (!kind || dismissed === kind) return null;

  if (kind === "offline") {
    return (
      <Alert
        banner
        type="error"
        showIcon
        icon={<WifiOutlined />}
        className="nas-status-banner"
        message={
          <span>
            <Text strong>No internet connection.</Text> This computer has lost its connection, so E-Universe cannot save or load anything right now. It will
            carry on by itself when the connection is back.
          </span>
        }
      />
    );
  }

  return (
    <Alert
      banner
      type={kind === "slow" ? "info" : "warning"}
      showIcon
      icon={kind === "slow" ? <FieldTimeOutlined /> : <DisconnectOutlined />}
      closable
      onClose={() => setDismissed(kind)}
      className="nas-status-banner"
      message={
        <span>
          <Text strong>{OUTAGE_TITLES[kind] || "Scanned documents are unavailable."}</Text>{" "}
          {state?.message ||
            "Scanned documents cannot be opened right now. Everything else in E-Universe keeps working."}
          {kind !== "slow" && state?.nextOpensAt && (
            <Text type="secondary"> Expected back: {new Date(state.nextOpensAt).toLocaleString()}.</Text>
          )}
        </span>
      }
    />
  );
};

export default NasStatusBanner;
