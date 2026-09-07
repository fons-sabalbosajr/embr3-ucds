import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchDashboard,
} from "../api/ermsService";

const PERMIT_LABEL = {
  "ecc-original": "ECC (Original)",
  "ecc-amended": "ECC (Amended)",
  cnc: "Certificate of Non-Coverage",
  "hw-generator": "HW Generator Registration",
  other: "Other",
};

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

/** A labelled proportion bar — the distributions here are parts of a whole. */
const Distribution = ({ rows, total, labelOf, colorOf }) => {
  if (!rows?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No records" />;
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      {rows.map((r) => (
        <div key={r._id ?? "none"}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <Typography.Text style={{ fontSize: 13 }}>{labelOf(r._id)}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {fmt(r.count)}
            </Typography.Text>
          </div>
          <Progress
            percent={total ? Math.round((r.count / total) * 100) : 0}
            size="small"
            showInfo={false}
            strokeColor={colorOf?.(r._id)}
          />
        </div>
      ))}
    </Space>
  );
};

const ErmsDashboard = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "dashboard"],
    queryFn: fetchDashboard,
  });

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load the records dashboard"
        description={describeApiError(error)}
      />
    );
  }

  if (isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  const linkedPct = data.total ? Math.round((data.linked / data.total) * 100) : 0;

  const recentColumns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      render: (s) => <Link to={`/universe/erms/records/${encodeURIComponent(s)}`}>{s}</Link>,
    },
    { title: "Proponent", dataIndex: "proponentName", key: "proponentName", ellipsis: true },
    {
      title: "Permit",
      dataIndex: ["permit", "type"],
      key: "permit",
      render: (t) => <Tag color={PERMIT_TYPE_COLOR[t]}>{PERMIT_LABEL[t] || t}</Tag>,
    },
    {
      title: "Province",
      dataIndex: ["location", "province"],
      key: "province",
      render: (p) => PROVINCE_LABEL[p] || p || "—",
    },
    {
      title: "Uploaded",
      dataIndex: ["document", "uploadedAt"],
      key: "uploadedAt",
      render: (d) => (d ? new Date(d).toLocaleDateString() : "—"),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Records" value={data.total} formatter={fmt} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Tooltip title="Records whose permit number resolves to an establishment in the UCDS register">
              <Statistic
                title="Linked to the register"
                value={data.linked}
                formatter={fmt}
                suffix={<Typography.Text type="secondary">{`(${linkedPct}%)`}</Typography.Text>}
              />
            </Tooltip>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Tooltip title="No matching permit number in the register. Usually means the register does not cover that record, not that the record is wrong.">
              <Statistic
                title="Not linked"
                value={data.unlinked}
                formatter={fmt}
                valueStyle={{ color: "#9a6b00" }}
              />
            </Tooltip>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Tooltip title="Records with a value that could not be interpreted during migration — usually a date. The original value is preserved.">
              <Statistic
                title="Needs review"
                value={data.flagged}
                formatter={fmt}
                valueStyle={{ color: data.flagged ? "#a9382a" : undefined }}
              />
            </Tooltip>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="By permit type" size="small">
            <Distribution
              rows={data.byType}
              total={data.total}
              labelOf={(id) => PERMIT_LABEL[id] || id || "Unknown"}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="By province" size="small">
            <Distribution
              rows={data.byProvince}
              total={data.total}
              labelOf={(id) => PROVINCE_LABEL[id] || id || "Unknown"}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Recently uploaded"
        size="small"
        extra={<Link to="/universe/erms/records">View all records</Link>}
      >
        <Table
          rowKey="serialNo"
          size="small"
          columns={recentColumns}
          dataSource={data.recent}
          pagination={false}
          scroll={{ x: "max-content" }}
        />
      </Card>
    </Space>
  );
};

export default ErmsDashboard;
