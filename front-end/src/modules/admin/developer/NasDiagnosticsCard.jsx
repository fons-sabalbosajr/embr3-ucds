import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Space, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Every container, tested in one go.
//
// One share failing while two answer is the common case on this NAS — three
// units, three accounts, one server name — so the diagnostics show all of
// them side by side rather than one "the share" verdict. The host and share
// are shown because this tab is elevated; nothing here reaches other screens.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const NasDiagnosticsCard = ({ onTested }) => {
  const [containers, setContainers] = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/nas/containers");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not read the containers.");
        return;
      }
      setContainers(body.containers || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const testAll = async () => {
    setTesting(true);
    const next = {};
    try {
      // Sequential on purpose: SMB sessions to one host share a credential,
      // and hammering three shares at once makes a real failure harder to read.
      for (const c of containers) {
        if (!c.enabled || !c.configured) {
          next[c.key] = { skipped: true };
          continue;
        }
        const res = await api(`/api/nas/containers/${encodeURIComponent(c.key)}/test`, { method: "POST" });
        next[c.key] = await res.json().catch(() => ({ ok: false, reason: "unknown" }));
        setResults({ ...next });
      }
      await load();
      onTested?.(next);
    } finally {
      setTesting(false);
    }
  };

  const columns = [
    {
      title: "Container",
      key: "label",
      width: 200,
      align: "left",
      render: (_, c) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Text strong>{c.label}</Text>
            {c.isRecords && <Tag color="blue">records</Tag>}
            {c.incoming ? <Tag color="gold">incoming</Tag> : !c.enabled && <Tag>off</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{c.unit || c.key}</Text>
        </Space>
      ),
    },
    {
      title: "Share",
      key: "share",
      align: "left",
      render: (_, c) =>
        c.configured ? <Text code>{`\\\\${c.host}\\${c.share}`}</Text> : <Text type="secondary">not configured</Text>,
    },
    {
      title: "Account",
      key: "account",
      align: "left",
      render: (_, c) => (
        <Text>
          {c.domain ? `${c.domain}\\` : ""}
          {c.username || <Text type="secondary">server identity</Text>}
        </Text>
      ),
    },
    {
      title: "Source",
      dataIndex: "source",
      key: "source",
      width: 150,
      align: "left",
      render: (s) => <Tag color={s === "database" ? "blue" : "default"}>{s === "database" ? "Admin Settings" : "environment"}</Tag>,
    },
    {
      title: "Result",
      key: "result",
      width: 400,
      align: "left",
      render: (_, c) => {
        const r = results[c.key];
        if (!r) {
          return c.lastTestAt ? (
            <Text type="secondary">
              last {c.lastTestOk ? "passed" : "failed"} {new Date(c.lastTestAt).toLocaleString()}
            </Text>
          ) : (
            <Text type="secondary">not tested</Text>
          );
        }
        if (r.skipped) return <Text type="secondary">skipped (off or unconfigured)</Text>;
        return r.ok ? (
          <Space size={6}>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text>
              {r.entryCount} entries at the root · {r.ms} ms
            </Text>
          </Space>
        ) : (
          <Space size={6}>
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
            <Text>
              {r.reason || "failed"}
              {r.code ? ` (${r.code})` : ""}
            </Text>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title="Connectivity by container"
      size="small"
      extra={
        <Button icon={<ReloadOutlined />} loading={testing} onClick={testAll} disabled={!containers.length}>
          Test all containers
        </Button>
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Table
        size="small"
        rowKey="key"
        loading={loading}
        columns={columns}
        dataSource={containers}
        pagination={false}
        scroll={{ x: 860 }}
      />
    </Card>
  );
};

export default NasDiagnosticsCard;
