import React, { useEffect, useState } from "react";
import { Typography, Card, Alert, Space } from "antd";
import { API_BASE_URL } from "../../../config/api";

const DatabaseSettings = () => {
  const [envStatus, setEnvStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Absolute URL: the SPA and the API are separate services on different
    // hosts in a deployed environment, so a relative path would resolve
    // against the static site and never reach the API.
    fetch(`${API_BASE_URL}/api/nas/env-status`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        setEnvStatus({ ok: res.ok, ...data });
      })
      .catch((err) => setEnvStatus({ ok: false, message: err.message }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title="Developer • Database Settings">
        <Typography.Paragraph>
          Database status, connections, logging, error checks, backup/extract operations.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          Placeholder page. Wire actual metrics and actions here.
        </Typography.Paragraph>
      </Card>

      <Card title="NAS Connection (ENV)">
        {loading ? (
          <Typography.Text>Checking NAS status…</Typography.Text>
        ) : envStatus?.ok ? (
          <Alert
            type="success"
            showIcon
            message="Connected to NAS using ENV credentials"
            description={
              envStatus?.share
                ? `Share: ${envStatus.share} (domain: ${envStatus.domain || "n/a"})`
                : null
            }
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            message={envStatus?.message || "Failed to connect to NAS via ENV"}
            description={
              envStatus?.otpLikely
                ? "OTP challenge likely detected from NAS (inform IT Admin)."
                : envStatus?.code
                ? `Error code: ${envStatus.code}`
                : undefined
            }
          />
        )}
      </Card>
    </Space>
  );
};

export default DatabaseSettings;
