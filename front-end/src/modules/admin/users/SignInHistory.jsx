import { useState } from "react";
import { Alert, Button, Card, Empty, Input, Space, Table, Tag, Typography } from "antd";
import { LoginOutlined, LogoutOutlined, ReloadOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../../../config/api";

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › Sign-in History: who signed in and out, when and from
// which address — what the desktop ERMS kept per unit as "Logged In" /
// "Logged Out" with the IP. Each unit's own staff see theirs in Settings ›
// ERMS › Log History; this is every account's. Entries are kept for the
// period the server is configured with (two years by default).
// ---------------------------------------------------------------------------

const fetchHistory = async (q) =>
  (await axios.get(`${API_BASE}/sign-in-history`, { params: q ? { q, limit: 500 } : { limit: 500 }, withCredentials: true })).data;

const SignInHistory = () => {
  const [q, setQ] = useState("");
  const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: ["admin", "sign-in-history", q], queryFn: () => fetchHistory(q) });

  const columns = [
    { title: "When", dataIndex: "at", key: "at", width: 200, render: (d) => dayjs(d).format("D MMM YYYY, h:mm:ss A") },
    {
      title: "Event",
      dataIndex: "event",
      key: "event",
      width: 130,
      render: (e) => (e === "sign-in" ? <Tag color="green" icon={<LoginOutlined />}>Signed in</Tag> : <Tag icon={<LogoutOutlined />}>Signed out</Tag>),
    },
    { title: "Account", key: "who", render: (_, r) => <Space size={6}><Text>{r.name || r.username}</Text>{r.name && <Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Text>}</Space> },
    { title: "Address", dataIndex: "ip", key: "ip", width: 160, render: (v) => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{v || "—"}</Text> },
    { title: "Browser", dataIndex: "userAgent", key: "ua", ellipsis: true, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v || "—"}</Text> },
  ];

  return (
    <Card
      title={<Space direction="vertical" size={0}><Title level={4} style={{ margin: 0 }}>Sign-in history</Title><Text type="secondary">Every sign-in and sign-out, newest first{data ? `, kept for ${data.retentionDays} days` : ""}.</Text></Space>}
      extra={
        <Space>
          <Input.Search allowClear placeholder="Name, username or address" onSearch={setQ} style={{ width: 280 }} />
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
        </Space>
      }
    >
      {error && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={error?.response?.data?.message || "Could not load the sign-in history."} />}
      <Table
        size="small"
        rowKey={(r) => `${r.at}-${r.username}-${r.event}`}
        loading={isLoading}
        columns={columns}
        dataSource={data?.events || []}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sign-ins recorded yet" /> }}
        scroll={{ x: "max-content" }}
      />
    </Card>
  );
};

export default SignInHistory;
