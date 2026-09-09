import { useEffect, useState } from "react";
import { Alert, Card, Space, Spin, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../../config/api";

const { Paragraph, Text } = Typography;

// Overview of the records share. Deliberately thin: /api/nas/status says only
// whether a share is configured and enabled, because that is all this screen
// needs and it names nothing about the host. Anything that would identify the
// server, share or account lives on NAS Settings, behind an emailed code.

const NasDashboard = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/nas/status`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => !cancelled && setStatus(data))
      .catch(() => !cancelled && setStatus({ configured: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  const live = status?.configured && status?.enabled;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title="Records share">
        <Space direction="vertical" size="middle">
          <Space>
            <Text strong>Status</Text>
            {live ? (
              <Tag color="green">Available</Tag>
            ) : status?.configured ? (
              <Tag color="orange">Configured but turned off</Tag>
            ) : (
              <Tag color="red">Not configured</Tag>
            )}
          </Space>

          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 640 }}>
            Scanned documents live on the records share. The server reads them
            over the office network and streams them to whoever is entitled to
            the record — so no workstation needs the drive mapped, and no share
            credential ever reaches a browser.
          </Paragraph>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Configuration and diagnostics are on{" "}
            <Link to="/universe/nas/settings">NAS Settings</Link>.
          </Text>
        </Space>
      </Card>

      {!live && (
        <Alert
          type={status?.configured ? "warning" : "info"}
          showIcon
          message={
            status?.configured
              ? "Document access is turned off"
              : "No records share is configured"
          }
          description={
            status?.configured
              ? "Records screens will show metadata but cannot open documents until it is turned back on."
              : "Set NAS_ROOT, NAS_USERNAME and NAS_PASSWORD in server/.env, then restart the server."
          }
        />
      )}
    </Space>
  );
};

export default NasDashboard;
