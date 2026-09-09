import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { DiffOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL, API_BASE } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Duplicate data workspace.
//
// Establishments sharing an ECC/CNC number are almost always the same firm
// entered twice, but "almost always" is why nothing here merges anything on
// its own. The screen's job is to put the conflicting records side by side so
// a person can decide; there is deliberately no automatic merge and no delete.
//
// Detection reuses the existing /api/ucds/duplicates aggregation rather than
// introducing a second, differently-wrong definition of "duplicate".
// ---------------------------------------------------------------------------

const COMPARE_FIELDS = [
  ["sort_key", "Register key"],
  ["name_of_firms", "Establishment"],
  ["project_name", "Project"],
  ["ecc_cnc", "ECC / CNC"],
  ["province", "Province"],
  ["city_municipality", "City / Municipality"],
  ["barangay", "Barangay"],
  ["industry_type", "Industry type"],
  ["date_issued", "Date issued"],
];

const DuplicatesData = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [comparing, setComparing] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/ucds/duplicates`, {
        withCredentials: true,
      });
      setGroups(Array.isArray(data.duplicates) ? data.duplicates : []);
    } catch (err) {
      setError(
        err.response?.status === 403
          ? "Your account is not entitled to the register."
          : "Could not load duplicate groups."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCompare = async (group) => {
    setComparing(group);
    setMembers([]);
    setLoadingMembers(true);
    try {
      // Fetch each member so the comparison shows the actual stored values
      // rather than only the key they collide on.
      const results = await Promise.all(
        (group.idNos || []).map(async (sortKey) => {
          try {
            const { data } = await axios.get(
              `${API_BASE}/ucds/establishments/${encodeURIComponent(sortKey)}`,
              { withCredentials: true }
            );
            return data.establishment || data;
          } catch {
            return { sort_key: sortKey, __unavailable: true };
          }
        })
      );
      setMembers(results);
    } finally {
      setLoadingMembers(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => String(g.ecc_cnc || "").toLowerCase().includes(q));
  }, [groups, search]);

  const columns = [
    {
      title: "ECC / CNC number",
      dataIndex: "ecc_cnc",
      key: "ecc_cnc",
      render: (v) => <Text strong>{v}</Text>,
      sorter: (a, b) => String(a.ecc_cnc).localeCompare(String(b.ecc_cnc)),
    },
    {
      title: "Records",
      dataIndex: "count",
      key: "count",
      width: 110,
      render: (c) => <Tag color={c > 2 ? "red" : "orange"}>{c}</Tag>,
      sorter: (a, b) => a.count - b.count,
      defaultSortOrder: "descend",
    },
    {
      title: "Register keys",
      dataIndex: "idNos",
      key: "idNos",
      render: (keys) => (
        <Space size={4} wrap>
          {(keys || []).map((k) => (
            <Tag key={k} style={{ marginInlineEnd: 0 }}>
              {k}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_, row) => (
        <Button size="small" icon={<DiffOutlined />} onClick={() => openCompare(row)}>
          Compare
        </Button>
      ),
    },
  ];

  // A field differs across the group, so it is what a person has to decide on.
  const conflicting = (field) => {
    const values = members.map((m) => String(m?.[field] ?? "").trim());
    return new Set(values).size > 1;
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        icon={<WarningOutlined />}
        message="Nothing here is merged automatically"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            Establishments sharing an ECC or CNC number are usually the same
            firm entered twice — but not always, and a wrong merge loses
            monitoring history that cannot be reconstructed. This screen shows
            the conflicting values so a person can decide. Corrections are made
            on the establishment record itself.
          </Paragraph>
        }
      />

      <Card
        title={
          <Space>
            <span>Potential duplicates</span>
            <Text type="secondary">{groups.length} group(s)</Text>
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              size="small"
              allowClear
              placeholder="Filter by number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={load}>
              Refresh
            </Button>
          </Space>
        }
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Table
          size="small"
          rowKey="ecc_cnc"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: true, size: "small" }}
          scroll={{ x: 720 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No establishments share an ECC or CNC number"
              />
            ),
          }}
        />
      </Card>

      <Modal
        open={Boolean(comparing)}
        onCancel={() => setComparing(null)}
        title={`Comparing ${comparing?.ecc_cnc || ""}`}
        width={Math.min(360 + (members.length || 2) * 320, 1400)}
        footer={[
          <Button key="close" type="primary" onClick={() => setComparing(null)}>
            Close
          </Button>,
        ]}
        destroyOnClose
      >
        {loadingMembers ? (
          <Card loading />
        ) : (
          <>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              Highlighted rows differ between these records. Matching rows are
              the evidence they are the same firm; differing rows are what has
              to be reconciled before anything is combined.
            </Paragraph>
            <div style={{ overflowX: "auto" }}>
              <Descriptions bordered size="small" column={1} style={{ minWidth: 620 }}>
                {COMPARE_FIELDS.map(([field, label]) => {
                  const differs = conflicting(field);
                  return (
                    <Descriptions.Item
                      key={field}
                      label={
                        <Space size={6}>
                          {label}
                          {differs && <Tag color="orange">differs</Tag>}
                        </Space>
                      }
                    >
                      <Space size={16} wrap>
                        {members.map((m, i) => (
                          <Text
                            key={`${field}-${i}`}
                            type={differs ? "warning" : undefined}
                            style={{ minWidth: 180, display: "inline-block" }}
                          >
                            {m?.__unavailable
                              ? "(not readable in your scope)"
                              : String(m?.[field] ?? "—")}
                          </Text>
                        ))}
                      </Space>
                    </Descriptions.Item>
                  );
                })}
              </Descriptions>
            </div>
          </>
        )}
      </Modal>
    </Space>
  );
};

export default DuplicatesData;
