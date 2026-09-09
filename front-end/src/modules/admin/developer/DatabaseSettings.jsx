import React, { useEffect, useState } from "react";
import { Typography, Card, Alert, Space } from "antd";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../../config/api";

const DatabaseSettings = () => {
  const [nasStatus, setNasStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Absolute URL: the SPA and the API are separate services on different
    // hosts in a deployed environment, so a relative path would resolve
    // against the static site and never reach the API.
    //
    // /api/nas/status replaced /api/nas/env-status in Phase 7. The old
    // endpoint returned the share name, domain and a directory listing to any
    // signed-in user; this one answers only whether a share is configured, and
    // the details moved behind an emailed code on NAS Settings.
    fetch(`${API_BASE_URL}/api/nas/status`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        setNasStatus({ ok: res.ok, ...data });
      })
      .catch((err) => setNasStatus({ ok: false, message: err.message }))
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

      <Card title="NAS Configuration">
        {loading ? (
          <Typography.Text>Checking the records share…</Typography.Text>
        ) : nasStatus?.configured && nasStatus?.enabled ? (
          <Alert
            type="success"
            showIcon
            message="A records share is configured and enabled"
            description={
              <>
                Host, share and service account are on{" "}
                <Link to="/universe/admin/developer/storage-config">Storage Configuration</Link>, which
                asks for an emailed code before showing them.
              </>
            }
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            message={
              nasStatus?.configured
                ? "The records share is configured but turned off"
                : "No records share is configured"
            }
            description={
              <>
                Documents cannot be opened until this is resolved. See{" "}
                <Link to="/universe/admin/developer/storage-config">Storage Configuration</Link>.
              </>
            }
          />
        )}
      </Card>
    </Space>
  );
};

export default DatabaseSettings;
