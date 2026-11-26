import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Space, Tag, Typography } from "antd";
import { CloudServerOutlined, ReloadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Storage › SQL Server: E-Universe's own database, db_euniverse
// (services/euSql.js, server/sql/README.md). Read-only status: connected,
// schema version, size, migrations waiting. Its login and password are set up
// by `npm run sql:setup` on the server and are never shown here.
// ---------------------------------------------------------------------------

const EuDatabaseCard = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API_BASE_URL}/api/eu-sql/status`, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    setStatus(res.ok ? body : { configured: true, ok: false, message: body.message || "Could not read the status." });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      size="small"
      title={<Space><CloudServerOutlined />E-Universe database (db_euniverse)</Space>}
      extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load} aria-label="Refresh" />}
    >
      {!status ? null : !status.configured ? (
        <Alert type="info" showIcon message="Not set up yet" description="On the office server, in server/: npm run sql:setup" />
      ) : !status.ok ? (
        <Alert type="error" showIcon message={`Not reachable${status.code ? ` (${status.code})` : ""}`} description={status.message} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }}>
          {status.pending?.length > 0 && (
            <Alert type="warning" showIcon message={`${status.pending.length} table change(s) waiting`} description="On the office server, in server/: npm run sql:migrate" />
          )}
          {status.changed?.length > 0 && <Alert type="error" showIcon message={`Applied migration changed since: ${status.changed.join(", ")}`} />}
          <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label="Connected as">{status.login} <Tag color="green">own login</Tag></Descriptions.Item>
            <Descriptions.Item label="Schema version">{status.schemaVersion || "none"}</Descriptions.Item>
            <Descriptions.Item label="Tables">{status.tables}</Descriptions.Item>
            <Descriptions.Item label="Size">{status.sizeMb} MB</Descriptions.Item>
            <Descriptions.Item label="Server">SQL Server {status.version}</Descriptions.Item>
            <Descriptions.Item label="Answered in">{status.ms} ms</Descriptions.Item>
          </Descriptions>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Data moves here from MongoDB phase by phase; accounts and ERMS records stay in MongoDB. Back this database up nightly with the office server&rsquo;s SQL Server backups.
          </Text>
        </Space>
      )}
    </Card>
  );
};

export default EuDatabaseCard;
