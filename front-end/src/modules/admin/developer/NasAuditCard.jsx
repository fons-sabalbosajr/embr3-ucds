import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The NAS audit trail.
//
// Every configuration save, container change, activation, verification, PIN
// change, connection test, access grant, file browse and document read is
// written to app-logs with domain "nas" as it happens (services/nasAudit.js).
// This tab reads that trail, newest first, with the same filters the activity
// log uses. It is read-only from everywhere: the developer log editor refuses
// NAS entries, and there is no delete route for them.
//
// What is never here: a share path, a host name, a credential. The container
// key and the file name are enough to know what was read and by whom.
// ---------------------------------------------------------------------------

const api = (path) => fetch(`${API_BASE_URL}${path}`, { credentials: "include" });

const OPERATION_LABELS = {
  "nas-credentials-save": "Records connection saved",
  "nas-credentials-reset": "Records connection reset",
  "nas-container-save": "Container saved",
  "nas-container-remove": "Container removed",
  "nas-test-connection": "Connection test",
  "nas-activation": "Activation changed",
  "nas-elevation-request": "Verification code requested",
  "nas-elevation-verify": "Verification code entered",
  "nas-elevation-end": "Verified session ended",
  "nas-pin-set": "PIN set",
  "nas-pin-verify": "PIN entered",
  "nas-pin-remove": "PIN removed",
  "nas-access-grant": "Storage access changed",
  "nas-browse": "Folder listed (developer)",
  "nas-file-read": "File read (developer)",
  "storage-browse": "Folder listed",
  "storage-file-read": "File read",
  "document-read": "Document read",
};

const labelOf = (op) => OPERATION_LABELS[op] || op;

const NasAuditCard = () => {
  const [data, setData] = useState({ items: [], total: 0, operations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({ q: "", operation: null, success: null, range: null });
  const [applied, setApplied] = useState(filters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (applied.q) p.set("q", applied.q);
      if (applied.operation) p.set("operation", applied.operation);
      if (applied.success != null) p.set("success", String(applied.success));
      if (applied.range?.[0]) p.set("from", applied.range[0].startOf("day").toISOString());
      if (applied.range?.[1]) p.set("to", applied.range[1].endOf("day").toISOString());
      const res = await api(`/api/nas/audit?${p}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.code === "ELEVATION_REQUIRED" || body.code === "ELEVATION_EXPIRED" ? "Verify on this page to read the audit log." : body.message || "Could not load the audit log.");
        return;
      }
      setData(body);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "When",
      dataIndex: "timestamp",
      width: 165,
      render: (t) => <Text style={{ whiteSpace: "nowrap" }}>{dayjs(t).format("D MMM YYYY, HH:mm:ss")}</Text>,
    },
    { title: "Account", dataIndex: "username", width: 130, render: (u) => u || <Text type="secondary">—</Text> },
    {
      title: "Action",
      dataIndex: "operation",
      width: 220,
      render: (op) => <Text strong>{labelOf(op)}</Text>,
    },
    {
      title: "Target",
      key: "target",
      render: (_, r) => (
        <Space size={6} wrap>
          {r.container && <Tag>{r.container}</Tag>}
          {r.serialNo && <Text code>{r.serialNo}</Text>}
          {r.fileName && <Text ellipsis style={{ maxWidth: 320 }}>{r.fileName}</Text>}
          {!r.container && !r.serialNo && !r.fileName && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: "Result",
      dataIndex: "success",
      width: 100,
      render: (ok) =>
        ok ? (
          <Space size={4}><CheckCircleOutlined style={{ color: "#52c41a" }} /> ok</Space>
        ) : (
          <Space size={4}><CloseCircleOutlined style={{ color: "#ff4d4f" }} /> failed</Space>
        ),
    },
    { title: "Details", dataIndex: "detail", ellipsis: true, render: (d, r) => d || (r.bytes ? `${(r.bytes / 1024).toFixed(0)} KB` : <Text type="secondary">—</Text>) },
    { title: "From", dataIndex: "ip", width: 130, render: (ip) => ip ? <Text code>{ip}</Text> : <Text type="secondary">—</Text> },
  ];

  const apply = () => {
    setPage(1);
    setApplied(filters);
  };

  return (
    <Card
      title="Audit log"
      size="small"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      }
    >
      {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 12 }} />}

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Account, container, file, serial, detail"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          onPressEnter={apply}
          style={{ width: 300 }}
        />
        <Select
          allowClear
          placeholder="Any action"
          value={filters.operation}
          onChange={(v) => setFilters({ ...filters, operation: v ?? null })}
          options={data.operations.map((op) => ({ value: op, label: labelOf(op) }))}
          style={{ minWidth: 220 }}
        />
        <Select
          allowClear
          placeholder="Any result"
          value={filters.success}
          onChange={(v) => setFilters({ ...filters, success: v ?? null })}
          options={[
            { value: true, label: "Succeeded" },
            { value: false, label: "Failed" },
          ]}
          style={{ minWidth: 130 }}
        />
        <DatePicker.RangePicker value={filters.range} onChange={(v) => setFilters({ ...filters, range: v })} />
        <Button type="primary" onClick={apply}>
          Apply
        </Button>
        <Button
          onClick={() => {
            const empty = { q: "", operation: null, success: null, range: null };
            setFilters(empty);
            setApplied(empty);
            setPage(1);
          }}
        >
          Clear
        </Button>
      </Space>

      <Table
        size="small"
        rowKey="_id"
        loading={loading}
        columns={columns}
        dataSource={data.items}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100],
          showTotal: (t) => `${t.toLocaleString()} entries`,
          size: "small",
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Entries are written by the server as each action happens and cannot be edited or deleted, by anyone. Share paths and credentials are never recorded.
      </Text>
    </Card>
  );
};

export default NasAuditCard;
