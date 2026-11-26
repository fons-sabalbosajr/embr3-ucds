/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useEffect, useState } from "react";
import { Button, Card, DatePicker, Descriptions, Empty, Input, Popconfirm, Segmented, Space, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, ReloadOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../../../config/api";
import { fetchCurrentUser } from "../../../api/universeService";
import { updateActivityLog, deleteActivityLog } from "../../../api/developerService";
import { message, modal } from "../../../shared/feedback";

const { Text, Title, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › Audit Logs: the audit trail, one tab per sub-application.
//
// Replaces two screens: System Settings › Activity History (one long table of
// everything) and the unlisted /admin/audit page, whose endpoint handed the
// whole trail, request bodies included, to any signed-in account. The server
// decides which tab an entry belongs to and redacts what it returns
// (services/auditLog.js); this screen only displays it.
//
// The Developer keeps the old screen's two actions, a note on an entry and
// deleting one, except on NAS entries: those are the record of who opened
// which document and the server refuses to change them.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "erms", label: "ERMS", intro: "Records, Legal Services and Laboratory: filing, record edits, searches, access requests and unit settings." },
  { key: "ucds", label: "UCDS", intro: "The Universe Central Database: register edits, surveys, postings, colours and menu changes." },
  { key: "portal", label: "Document Portal", intro: "Requests for scanned documents: requests, decisions, messages, withdrawals and room settings." },
  { key: "nas", label: "NAS", intro: "Every document opened, refused or managed on the shared storage. The security record of file access; it cannot be edited." },
  { key: "admin", label: "Admin", intro: "Accounts, organisation units, profiles and Admin Settings." },
  { key: "vera", label: "VERA", intro: "The assistant: chats, scans, checks and the corrections applied from them." },
];

const UNIT = {
  records: { label: "Records", color: "#b45248" },
  legal: { label: "Legal", color: "#4a2250" },
  laboratory: { label: "Laboratory", color: "#415e20" },
};

/** "portal-decision" -> "Decision", "vera:corrections:apply" -> "Corrections apply". */
const actionName = (type) => {
  if (!type) return "—";
  const words = String(type).replace(/^(portal|vera|nas)[-:]/i, "").replace(/[-:_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const fetchSummary = async () => (await axios.get(`${API_BASE}/audit/summary`, { withCredentials: true })).data;
const fetchLogs = async (category, params) =>
  (await axios.get(`${API_BASE}/audit/logs/${category}`, { params, withCredentials: true })).data;

const Details = ({ row }) => (
  <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered style={{ maxWidth: 1100 }}>
    {row.method && <Descriptions.Item label="Request">{row.method} <Text code>{row.path || "—"}</Text></Descriptions.Item>}
    {row.serialNo && <Descriptions.Item label="Record">{row.serialNo}</Descriptions.Item>}
    {row.fileName && <Descriptions.Item label="File">{row.fileName}</Descriptions.Item>}
    {row.container && <Descriptions.Item label="Container">{row.container}</Descriptions.Item>}
    {row.ip && <Descriptions.Item label="From">{row.ip}</Descriptions.Item>}
    {row.detail && <Descriptions.Item label="Detail" span={2}>{row.detail}</Descriptions.Item>}
    {row.actionLabel && <Descriptions.Item label="Description" span={2}>{row.actionLabel}</Descriptions.Item>}
    {row.message && <Descriptions.Item label="Developer's note" span={2}>{row.message}</Descriptions.Item>}
    {row.requestData && (
      <Descriptions.Item label="Data sent" span={2}>
        <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {JSON.stringify(row.requestData, null, 2)}
        </pre>
        <Text type="secondary" style={{ fontSize: 12 }}>Passwords, codes and keys are hidden by the server.</Text>
      </Descriptions.Item>
    )}
  </Descriptions>
);

const LogTab = ({ category, intro, isDeveloper }) => {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const [range, setRange] = useState(null);
  const [outcome, setOutcome] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // A new filter starts from the first page.
  useEffect(() => setPage(1), [q, username, range, outcome]);

  const params = {
    q: q || undefined,
    username: username || undefined,
    start: range?.[0] ? range[0].startOf("day").toISOString() : undefined,
    end: range?.[1] ? range[1].endOf("day").toISOString() : undefined,
    outcome: category === "nas" && outcome !== "all" ? outcome : undefined,
    page,
    pageSize,
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["audit", category, params],
    queryFn: () => fetchLogs(category, params),
    placeholderData: (prev) => prev,
  });

  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const editNote = (row) => {
    let note = row.message || "";
    modal.confirm({
      title: "Note on this entry",
      content: <Input.TextArea rows={4} defaultValue={note} placeholder="Shown with the entry in its details" onChange={(e) => (note = e.target.value)} />,
      okText: "Save",
      onOk: async () => {
        try {
          await updateActivityLog(row._id, { message: note });
          message.success("Note saved");
          changed();
        } catch (e) {
          message.error(e?.response?.data?.message || "Could not save the note");
        }
      },
    });
  };

  const remove = async (row) => {
    try {
      await deleteActivityLog(row._id);
      message.success("Entry deleted");
      changed();
    } catch (e) {
      message.error(e?.response?.data?.message || "Could not delete the entry");
    }
  };

  const columns = [
    {
      title: "When",
      dataIndex: "timestamp",
      width: 190,
      render: (d) => (d ? dayjs(d).format("D MMM YYYY, h:mm A") : "—"),
    },
    { title: "Who", dataIndex: "username", width: 150, render: (v) => v || <Text type="secondary">system</Text> },
    category === "erms" && {
      title: "Unit",
      dataIndex: "unit",
      width: 110,
      render: (u) => (UNIT[u] ? <Tag color={UNIT[u].color}>{UNIT[u].label}</Tag> : <Text type="secondary">—</Text>),
    },
    category === "nas" && {
      title: "Result",
      dataIndex: "success",
      width: 100,
      render: (s) => (s === false ? <Tag color="red">Refused</Tag> : <Tag color="green">OK</Tag>),
    },
    { title: "Action", dataIndex: "actionType", width: 190, render: (t) => <Text strong>{actionName(t)}</Text> },
    {
      title: "Details",
      key: "details",
      ellipsis: true,
      render: (_, r) => {
        const text = [r.serialNo, r.container, r.detail || r.actionLabel].filter(Boolean).join(" · ");
        return text ? <Tooltip title={text}><span>{text}</span></Tooltip> : <Text type="secondary">—</Text>;
      },
    },
    isDeveloper && category !== "nas" && {
      title: "",
      key: "actions",
      width: 90,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="Add or edit a note">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => editNote(r)} aria-label="Edit note" />
          </Tooltip>
          <Popconfirm title="Delete this entry from the audit trail?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(r)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete entry" />
          </Popconfirm>
        </Space>
      ),
    },
  ].filter(Boolean);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>{intro}</Paragraph>
      <Space wrap>
        <Input.Search allowClear placeholder="Search descriptions, records, files" onSearch={setQ} style={{ width: 280 }} />
        <Input.Search allowClear placeholder="Username" onSearch={setUsername} style={{ width: 180 }} />
        <DatePicker.RangePicker value={range} onChange={setRange} allowEmpty={[true, true]} />
        {category === "nas" && (
          <Segmented
            value={outcome}
            onChange={setOutcome}
            options={[
              { label: "All", value: "all" },
              { label: "OK", value: "ok" },
              { label: "Refused", value: "failed" },
            ]}
          />
        )}
        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
      </Space>
      {error && <Text type="danger">{error?.response?.data?.message || "Could not load this log."}</Text>}
      <Table
        size="small"
        rowKey="_id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items || []}
        expandable={{ expandedRowRender: (row) => <Details row={row} /> }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200],
          showTotal: (t) => `${t.toLocaleString()} entr${t === 1 ? "y" : "ies"}`,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No entries match" /> }}
        scroll={{ x: "max-content" }}
      />
    </Space>
  );
};

const AuditLogs = () => {
  const [params, setParams] = useSearchParams();
  const [isDeveloper, setIsDeveloper] = useState(false);
  useEffect(() => {
    fetchCurrentUser().then((me) => setIsDeveloper(me?.role === "developer")).catch(() => {});
  }, []);
  const { data: summary } = useQuery({ queryKey: ["audit", "summary"], queryFn: fetchSummary });

  const active = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "erms";

  return (
    <Card
      title={
        <Space direction="vertical" size={0}>
          <Title level={4} style={{ margin: 0 }}>Audit logs</Title>
          <Text type="secondary">Who did what, and when, in each part of E-Universe. Newest first.</Text>
        </Space>
      }
    >
      <Tabs
        activeKey={active}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
        destroyInactiveTabPane
        items={TABS.map((t) => {
          const s = summary?.[t.key];
          return {
            key: t.key,
            label: (
              <Space size={6}>
                <span>{t.label}</span>
                {s && (
                  <Tooltip title={`${s.total.toLocaleString()} in all, ${s.week.toLocaleString()} in the last 7 days`}>
                    <Tag style={{ marginInlineEnd: 0 }} color={s.week ? "blue" : "default"}>{s.total.toLocaleString()}</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
            children: <LogTab category={t.key} intro={t.intro} isDeveloper={isDeveloper} />,
          };
        })}
      />
    </Card>
  );
};

export default AuditLogs;
