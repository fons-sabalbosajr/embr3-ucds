import { useCallback, useEffect, useState } from "react";
import { Card, Empty, Table, Tag, Typography, Button, Space } from "antd";
import { HistoryOutlined, ReloadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The credential rotation log.
//
// It answers one question, months later: when was the share password last
// changed, by whom, and did the connection work afterwards. That is what
// somebody needs when a rotation is disputed or when access breaks and nobody
// remembers what was touched.
//
// It records field names only. Never a value, never any part of the password,
// not even its length — this is read on screen and pasted into tickets.
// ---------------------------------------------------------------------------

const FIELD_COLOUR = {
  password: "volcano",
  "share path": "blue",
  username: "geekblue",
  domain: "purple",
  "base directory": "cyan",
};

const NasHistoryCard = ({ refreshKey }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/nas/config/history`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      setRows(Array.isArray(body.history) ? body.history : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const columns = [
    {
      title: "When",
      dataIndex: "at",
      key: "at",
      width: 190,
      render: (v) => (v ? new Date(v).toLocaleString() : "—"),
    },
    { title: "By", dataIndex: "by", key: "by", width: 160 },
    {
      title: "Changed",
      dataIndex: "changed",
      key: "changed",
      render: (fields) =>
        fields?.length ? (
          <Space size={4} wrap>
            {fields.map((f) => (
              <Tag key={f} color={FIELD_COLOUR[f]} style={{ marginInlineEnd: 0 }}>
                {f}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">no change</Text>
        ),
    },
    {
      title: "Connection after",
      dataIndex: "testOk",
      key: "testOk",
      width: 170,
      render: (ok, row) =>
        ok == null ? (
          <Text type="secondary">not tested</Text>
        ) : (
          <Space size={6}>
            <Tag color={ok ? "green" : "red"} style={{ marginInlineEnd: 0 }}>
              {ok ? "passed" : "failed"}
            </Tag>
            {row.testDetail && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {row.testDetail}
              </Text>
            )}
          </Space>
        ),
    },
  ];

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <HistoryOutlined />
          <span>Credential history</span>
        </Space>
      }
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      }
    >
      <Table
        size="small"
        rowKey={(r, i) => `${r.at}-${i}`}
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={rows.length > 10 ? { pageSize: 10, size: "small" } : false}
        scroll={{ x: 640 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No changes recorded yet. Saving the connection adds an entry here."
            />
          ),
        }}
      />
      <Text type="secondary" style={{ fontSize: 11 }}>
        Records which fields changed, never their values.
      </Text>
    </Card>
  );
};

export default NasHistoryCard;
