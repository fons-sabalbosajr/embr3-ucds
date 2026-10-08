import { useCallback, useEffect, useState } from "react";
import { Card, Table, Tag, Space, Typography, Select, DatePicker, Input, Button, Tooltip, Alert, Badge } from "antd";
import {
  ReloadOutlined,
  SearchOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  GlobalOutlined,
  ApiOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import { getVeraLogs } from "./veraService";
import { message } from "../../shared/feedback";
import "./vera.css";

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const ACTION_META = {
  "vera:chat": { label: "Chat (staff)", color: "blue", icon: <RobotOutlined /> },
  "vera:public-chat": { label: "Chat (sign-in page)", color: "cyan", icon: <GlobalOutlined /> },
  "vera:test": { label: "Connection test", color: "purple", icon: <ApiOutlined /> },
  "vera:settings:updated": { label: "Settings changed", color: "gold", icon: <SettingOutlined /> },
};

const SOURCE_META = {
  model: { label: "AI model", color: "green", icon: <ThunderboltOutlined /> },
  fallback: { label: "Help library", color: "default", icon: <BookOutlined /> },
  guard: { label: "Refused by guard", color: "red", icon: <SafetyCertificateOutlined /> },
};

const ROLE_OPTIONS = [
  { value: "public", label: "Sign-in page visitor", color: "cyan" },
  { value: "planning", label: "Planning", color: "geekblue" },
  { value: "records", label: "ERMS User", color: "blue" },
  { value: "viewer", label: "Viewer", color: "default" },
  { value: "admin", label: "Administrator", color: "gold" },
  { value: "developer", label: "Developer", color: "purple" },
];
const roleColor = (r) => ROLE_OPTIONS.find((o) => o.value === r)?.color || "default";

// ---------------------------------------------------------------------------
// VERA's activity log. METADATA ONLY: the question and the answer are never
// stored, so they cannot be shown. Each row is when, who, which role and
// screen, which help articles matched, whether the model answered or a guard
// refused, and the cost. A log holding message content would become a second
// copy of whatever staff typed into the assistant.
// ---------------------------------------------------------------------------

const EMPTY = { action: undefined, role: undefined, source: undefined, usedModel: undefined, range: null, search: "" };

export default function VeraLogs() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [filters, setFilters] = useState(EMPTY);

  const load = useCallback(async (pageNum = 1, pageSize = 25, f = EMPTY) => {
    setLoading(true);
    try {
      const res = await getVeraLogs({
        pageNum,
        pageSize,
        action: f.action || undefined,
        role: f.role || undefined,
        source: f.source || undefined,
        usedModel: f.usedModel || undefined,
        search: f.search?.trim() || undefined,
        dateFrom: f.range?.[0] ? f.range[0].startOf("day").toISOString() : undefined,
        dateTo: f.range?.[1] ? f.range[1].endOf("day").toISOString() : undefined,
      });
      setRows(res.data || []);
      setPagination({ page: res.pagination?.page || 1, pageSize: res.pagination?.pageSize || 25, total: res.pagination?.total || 0 });
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to load assistant logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, 25, EMPTY);
  }, [load]);

  const applyFilters = (next) => {
    setFilters(next);
    load(1, pagination.pageSize, next);
  };
  const activeFilterCount = [filters.action, filters.role, filters.source, filters.usedModel, filters.range, filters.search?.trim() || null].filter(Boolean).length;

  const columns = [
    {
      title: "When",
      dataIndex: "at",
      key: "at",
      width: 140,
      render: (v) => (
        <Tooltip title={dayjs(v).format("dddd, MMMM D, YYYY h:mm:ss A")}>
          <div style={{ fontSize: 12, lineHeight: 1.35 }}>
            <div>{dayjs(v).format("MMM D, h:mm A")}</div>
            <Text type="secondary" style={{ fontSize: 10 }}>{dayjs(v).format("ddd")}</Text>
          </div>
        </Tooltip>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      width: 170,
      render: (v, r) => {
        const m = ACTION_META[v] || { label: r.actionLabel || v, color: "default" };
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: "User",
      dataIndex: "user",
      key: "user",
      width: 160,
      render: (v, r) => (
        <div style={{ fontSize: 12, lineHeight: 1.35 }}>
          <div>{v || "—"}</div>
          {r.role ? <Tag color={roleColor(r.role)} style={{ fontSize: 10, marginTop: 2 }}>{ROLE_OPTIONS.find((o) => o.value === r.role)?.label || r.role}</Tag> : null}
        </div>
      ),
    },
    {
      title: "Screen",
      dataIndex: "page",
      key: "page",
      width: 150,
      render: (v) => (v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: "Answered by",
      dataIndex: "source",
      key: "source",
      width: 150,
      render: (v, r) => {
        if (r.action === "vera:settings:updated") {
          const n = (r.changedKeys || []).length;
          return (
            <Tooltip title={(r.changedKeys || []).join(", ") || "no fields listed"}>
              <Text style={{ fontSize: 12 }}>{n} field{n === 1 ? "" : "s"} changed</Text>
            </Tooltip>
          );
        }
        if (r.action === "vera:test") {
          return r.ok ? <Tag color="green">succeeded</Tag> : <Tooltip title={r.code}><Tag color="red">failed</Tag></Tooltip>;
        }
        const m = SOURCE_META[v] || { label: v || "—", color: "default" };
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: "Matched articles",
      dataIndex: "hitIds",
      key: "hitIds",
      render: (v) =>
        v?.length ? (
          <Tooltip title={v.join(", ")}>
            <Space size={2} wrap>
              {v.slice(0, 3).map((id) => <Tag key={id} style={{ fontSize: 10 }}>{id}</Tag>)}
              {v.length > 3 ? <Text type="secondary" style={{ fontSize: 11 }}>+{v.length - 3}</Text> : null}
            </Space>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>none</Text>
        ),
    },
    {
      title: "Length",
      dataIndex: "chars",
      key: "chars",
      width: 80,
      align: "right",
      render: (v) =>
        v == null ? <Text type="secondary">—</Text> : (
          <Tooltip title="Characters typed. The message itself is not stored.">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </Tooltip>
        ),
    },
    {
      title: "Tokens",
      key: "tokens",
      width: 90,
      align: "right",
      render: (_, r) => {
        const total = (r.inputTokens || 0) + (r.outputTokens || 0);
        return total ? (
          <Tooltip title={`${r.inputTokens} in / ${r.outputTokens} out`}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{total}</span>
          </Tooltip>
        ) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: "Time",
      dataIndex: "durationMs",
      key: "durationMs",
      width: 90,
      align: "right",
      render: (v) => (v == null ? <Text type="secondary">—</Text> : <span style={{ fontVariantNumeric: "tabular-nums" }}>{v} ms</span>),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>VERA Activity Log</span>
          <Badge count={pagination.total} overflowCount={99999} showZero color="#1f3864" />
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => load(pagination.page, pagination.pageSize, filters)} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Metadata only"
        description={
          <span>
            Questions and answers are <Text strong>never stored</Text>, so they cannot be listed here. Each row records when a message happened,
            which role and screen it came from, which help articles matched, whether the AI model answered or a guard refused, and what it cost.
            Sign-in page messages are attributed to "Sign-in page visitor" — no visitor address is kept.
          </span>
        }
      />

      <div className="vera-logs-toolbar">
        <Select allowClear className="vera-logs-toolbar__f" placeholder="Action" value={filters.action} onChange={(v) => applyFilters({ ...filters, action: v })}
          options={Object.entries(ACTION_META).map(([value, m]) => ({ value, label: m.label }))} />
        <Select allowClear className="vera-logs-toolbar__f" placeholder="Role" value={filters.role} onChange={(v) => applyFilters({ ...filters, role: v })}
          options={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))} />
        <Select allowClear className="vera-logs-toolbar__f" placeholder="Answered by" value={filters.source} onChange={(v) => applyFilters({ ...filters, source: v })}
          options={Object.entries(SOURCE_META).map(([value, m]) => ({ value, label: m.label }))} />
        <Select allowClear className="vera-logs-toolbar__f" placeholder="Model used" value={filters.usedModel} onChange={(v) => applyFilters({ ...filters, usedModel: v })}
          options={[{ value: "true", label: "Model answers only" }, { value: "false", label: "No model" }]} />
        <RangePicker className="vera-logs-toolbar__range" value={filters.range} onChange={(v) => applyFilters({ ...filters, range: v })} />
        <Input
          allowClear
          className="vera-logs-toolbar__search"
          prefix={<SearchOutlined />}
          placeholder="User, screen or article"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          onPressEnter={() => applyFilters(filters)}
        />
        {activeFilterCount > 0 ? (
          <Tooltip title="Clear all filters">
            <Button type="text" icon={<CloseCircleOutlined />} onClick={() => applyFilters(EMPTY)} />
          </Tooltip>
        ) : null}
      </div>

      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100],
          showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}`,
          onChange: (p, s) => load(p, s, filters),
        }}
        locale={{ emptyText: <Paragraph type="secondary" style={{ margin: "16px 0" }}>No assistant activity matches these filters yet.</Paragraph> }}
      />
    </Card>
  );
}
