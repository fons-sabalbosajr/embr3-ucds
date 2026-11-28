import { useEffect, useState } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../config/api";
import { ROUTES } from "../config/routes";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// "You are viewing as …", on every screen while a Developer views E-Universe
// as an officer (server/services/viewAs.js). It cannot be closed: the whole
// point is that nobody forgets whose view this is. Exit, or the time running
// out, reloads the application as the Developer.
// ---------------------------------------------------------------------------

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const ViewAsBanner = ({ viewAs }) => {
  const [leaving, setLeaving] = useState(false);

  // When the time is up the server has already ended it; reload to match.
  useEffect(() => {
    if (!viewAs?.expiresAt) return undefined;
    const ms = new Date(viewAs.expiresAt).getTime() - Date.now();
    const id = setTimeout(() => window.location.assign(ROUTES.appHome), Math.max(ms, 0) + 1500);
    return () => clearTimeout(id);
  }, [viewAs?.expiresAt]);

  if (!viewAs) return null;

  const exit = async () => {
    setLeaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/developer/view-as/stop`, { method: "POST", credentials: "include" });
    } finally {
      window.location.assign(`${ROUTES.app}/admin/developer/view-as`);
    }
  };

  return (
    <Alert
      type="warning"
      banner
      showIcon
      icon={<EyeOutlined />}
      style={{ position: "sticky", top: 0, zIndex: 20 }}
      message={
        <Space wrap size={[12, 4]}>
          <Text>
            Viewing as <Text strong>{viewAs.name}</Text> ({viewAs.roleLabel}). <Text strong>View only</Text>: nothing can be
            changed. Ends at {time(viewAs.expiresAt)}.
          </Text>
          <Button size="small" type="primary" loading={leaving} onClick={exit}>
            Exit
          </Button>
        </Space>
      }
    />
  );
};

export default ViewAsBanner;
