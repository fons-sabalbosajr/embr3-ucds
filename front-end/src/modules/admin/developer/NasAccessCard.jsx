import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import { message } from "../../../shared/feedback";
import { accountType, STORAGE_TYPES } from "../../../shared/accountTypes";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Who may open which container.
//
// The Developer shares the NAS inside the application: a container is put on
// an account here, and that person opens it under Storage in their sidebar —
// while document access is switched on. No drive letter, no credential, no
// path ever reaches them, and every read is audited with their name and the
// container.
//
// A change here applies on the person's next request. Nothing about it is
// cached in their session.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const NasAccessCard = ({ refreshKey }) => {
  const [data, setData] = useState({ containers: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/nas/access");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not load storage access.");
        return;
      }
      setData({ containers: body.containers || [], users: body.users || [] });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const grant = async (user, keys) => {
    setSaving(user.userId);
    try {
      const res = await api(`/api/nas/access/${encodeURIComponent(user.userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nasContainers: keys }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(body.message || "Could not update access.");
        return;
      }
      message.success(`${user.name || user.username}: ${keys.length ? keys.join(", ") : "no storage"}.`);
      setData((d) => ({
        ...d,
        users: d.users.map((u) => (u.userId === user.userId ? { ...u, stored: keys, effective: keys } : u)),
      }));
    } finally {
      setSaving(null);
    }
  };

  const options = useMemo(
    () => data.containers.map((c) => ({ value: c.key, label: c.label })),
    [data.containers]
  );

  const rows = data.users.filter((u) =>
    filter
      ? `${u.name} ${u.username} ${u.division || ""}`.toLowerCase().includes(filter.toLowerCase())
      : true
  );

  const columns = [
    {
      title: "Account",
      key: "account",
      width: 300,
      align: "left",
      render: (_, u) => (
        <Space direction="vertical" size={0}>
          <Text strong>{u.name || u.username}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {u.username}
            {u.division ? ` · ${u.division}` : ""}
          </Text>
        </Space>
      ),
      sorter: (a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username)),
    },
    {
      title: "Type",
      dataIndex: "role",
      key: "role",
      align: "left",
      width: 250,
      render: (role) => <Tag color={accountType(role).color}>{accountType(role).label}</Tag>,
      filters: [...new Set(data.users.map((u) => u.role))].map((r) => ({ text: accountType(r).label, value: r })),
      onFilter: (v, u) => u.role === v,
    },
    {
      title: "Containers shared",
      key: "containers",
      render: (_, u) => {
        if (u.implicit) return <Text type="secondary">every container (Developer)</Text>;
        if (!STORAGE_TYPES.has(u.role) || u.role === "viewer") {
          return <Text type="secondary">none — Encoders have no storage access</Text>;
        }
        return (
          <Select
            mode="multiple"
            size="small"
            value={u.effective}
            options={options}
            loading={saving === u.userId}
            disabled={saving === u.userId}
            placeholder={options.length ? "None shared" : "No containers are on"}
            onChange={(keys) => grant(u, keys)}
            style={{ minWidth: 260, width: "100%" }}
          />
        );
      },
    },
  ];

  return (
    <Card
      title="Who can open storage"
      size="small"
      extra={
        <Space>
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Find an account"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 200 }}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={load}>
            Refresh
          </Button>
        </Space>
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Choose the containers each Planning or Records admin may open. They see them under{" "}
        <strong>Storage</strong> in the sidebar while document access is on. Changes apply at once.
      </Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Text type="secondary">Containers switched on:</Text>
        {data.containers.length ? (
          data.containers.map((c) => <Tag key={c.key}>{c.label}</Tag>)
        ) : (
          <Text type="warning">none — switch one on under Containers</Text>
        )}
      </Space>
      <Table
        size="small"
        rowKey="userId"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ defaultPageSize: 20, size: "small", hideOnSinglePage: true }}
        scroll={{ x: 720 }}
      />
    </Card>
  );
};

export default NasAccessCard;
