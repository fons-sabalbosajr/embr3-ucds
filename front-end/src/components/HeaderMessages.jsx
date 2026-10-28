import { useEffect, useState } from "react";
import { Badge, Tooltip } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import visibleInterval from "../shared/visibleInterval";

// ---------------------------------------------------------------------------
// Messages (the ERMS Action Center), as an icon in the header beside the bell.
//
// It was an entry in the side menu; it sits with the notifications now, where
// people look for something waiting for them. The unread count is fetched
// every two minutes, only while the tab is in view (shared/visibleInterval),
// and again on opening or leaving the Messages page.
// ---------------------------------------------------------------------------

const MESSAGES_PATH = "/e-universe/erms/messages";

export default function HeaderMessages({ domains = [] }) {
  const hasErms = domains.includes("erms");
  const location = useLocation();
  const navigate = useNavigate();
  const onMessages = location.pathname === MESSAGES_PATH;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!hasErms) return undefined;
    let cancelled = false;
    const load = () =>
      fetch(`${API_BASE_URL}/api/erms/messages/unread`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((body) => {
          if (!cancelled) setUnread(Number(body.unread) || 0);
        })
        .catch(() => {});
    load();
    const stop = visibleInterval(load, 120000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [hasErms, onMessages]);

  if (!hasErms) return null;
  const label = unread ? `Messages — ${unread} unread` : "Messages";
  return (
    <Tooltip title={label}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <Badge className="header-bell-badge" size="small" count={unread} overflowCount={99} offset={[-3, 3]} title={label}>
          <button
            type="button"
            aria-label={label}
            aria-current={onMessages ? "page" : undefined}
            className="header-control"
            style={{ cursor: "pointer" }}
            onClick={() => navigate(MESSAGES_PATH)}
          >
            <MessageOutlined style={{ fontSize: 16 }} />
          </button>
        </Badge>
      </span>
    </Tooltip>
  );
}
