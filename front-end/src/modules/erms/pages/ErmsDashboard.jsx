import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme as antdTheme,
} from "antd";
import {
  ClockCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  InboxOutlined,
  LinkOutlined,
  MailOutlined,
  RightOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DonutChart, MagnitudeBars, YearColumns } from "../components/charts";
import { AttentionTile } from "../components/dashboardTiles";
import { useTheme } from "../../../theme/ThemeProvider";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchAccessRequests,
  fetchDashboard,
  fetchOverdue,
} from "../api/ermsService";

// ---------------------------------------------------------------------------
// The Records Unit's landing page.
//
// For an ERMS User this is the main Dashboard — they have no planning
// dashboard — so it opens on what the day's work is: the upload, the inbox
// of document requests, loans that are overdue, records that need review.
// The counts and distributions that describe the collection follow.
//
// The charts below say how the collection is made up; the status colours
// on the tiles (pending, overdue, needs review) always come with an icon
// and a word, never on their own.
// ---------------------------------------------------------------------------

const { Text, Title } = Typography;

const PERMIT_LABEL = {
  "ecc-original": "ECC (Original)",
  "ecc-amended": "ECC (Amended)",
  cnc: "Certificate of Non-Coverage",
  "hw-generator": "HW Generator Registration",
  dp: "Discharge Permit",
  pto: "Permit to Operate",
  other: "Other",
};

const TYPE_ORDER = ["ecc-original", "ecc-amended", "cnc", "hw-generator", "dp", "pto", "other"];

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const ErmsDashboard = () => {
  const { token } = antdTheme.useToken();
  const isDark = useTheme().mode === "dark";
  const stats = useQuery({ queryKey: ["erms", "dashboard"], queryFn: fetchDashboard });
  // The inbox and the loans are the Records Unit's work; for anyone else the
  // inbox is their own requests, which is still worth a glance.
  const inbox = useQuery({
    queryKey: ["erms", "access-requests", "pending", "dashboard"],
    queryFn: () => fetchAccessRequests({ status: "pending", limit: 5 }),
    refetchInterval: 60000,
  });
  const overdue = useQuery({ queryKey: ["erms", "overdue"], queryFn: fetchOverdue });

  if (stats.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load the records dashboard"
        description={describeApiError(stats.error)}
      />
    );
  }

  const data = stats.data;
  const loading = stats.isLoading;
  const thisYear = new Date().getFullYear();
  const approvedThisYear = data?.byYear?.find((y) => y._id === thisYear)?.count || 0;
  const linkedPct = data?.total ? Math.round((data.linked / data.total) * 100) : 0;
  const pending = inbox.data?.pending || 0;
  const canDecide = inbox.data?.canDecide === true;

  const recentColumns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 130,
      render: (s) => <Link to={`/universe/erms/records/${encodeURIComponent(s)}`}>{s}</Link>,
    },
    { title: "Proponent", dataIndex: "proponentName", key: "proponentName", ellipsis: true },
    {
      title: "Permit",
      dataIndex: ["permit", "type"],
      key: "permit",
      width: 200,
      render: (t) => <Tag color={PERMIT_TYPE_COLOR[t]}>{PERMIT_LABEL[t] || t}</Tag>,
    },
    {
      title: "Province",
      dataIndex: ["location", "province"],
      key: "province",
      width: 120,
      render: (p) => PROVINCE_LABEL[p] || p || "—",
    },
    {
      title: "Uploaded",
      dataIndex: ["document", "uploadedAt"],
      key: "uploadedAt",
      width: 110,
      render: when,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* The day's work first. */}
      <Card
        size="small"
        styles={{ body: { padding: "16px 20px" } }}
        style={{ background: token.colorFillQuaternary }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Records Unit</Title>
            <Text type="secondary">Environmental records: permits, clearances and the scans filed against them.</Text>
          </div>
          <Space wrap>
            <Link to="/universe/erms/records?new=1">
              <Button type="primary" icon={<CloudUploadOutlined />}>Upload record</Button>
            </Link>
            <Link to="/universe/erms/records">
              <Button icon={<FileSearchOutlined />}>Document Library</Button>
            </Link>
            <Link to="/universe/erms/archive">
              <Button icon={<InboxOutlined />}>Archive boxes</Button>
            </Link>
            <Link to="/universe/erms/access-requests">
              <Badge count={canDecide ? pending : 0} size="small" offset={[-2, 2]}>
                <Button icon={<MailOutlined />}>Document requests</Button>
              </Badge>
            </Link>
          </Space>
        </div>
      </Card>

      {/* What needs attention. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <AttentionTile
            icon={<MailOutlined />}
            label={canDecide ? "Document requests waiting" : "My pending requests"}
            value={pending}
            tone="warning"
            to="/universe/erms/access-requests"
            loading={inbox.isLoading}
            hint={pending ? "to decide" : "none"}
          />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile
            icon={<ClockCircleOutlined />}
            label="Overdue loans"
            value={overdue.data?.length || 0}
            tone="danger"
            to="/universe/erms/records"
            loading={overdue.isLoading}
            hint={overdue.data?.length ? "not returned" : "none"}
          />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile
            icon={<ExclamationCircleOutlined />}
            label="Needs review"
            value={data?.flagged || 0}
            tone="danger"
            to="/universe/erms/records?flagged=1"
            loading={loading}
            hint="values to check"
          />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile
            icon={<WarningOutlined />}
            label="Not linked to the register"
            value={data?.unlinked || 0}
            tone="warning"
            to="/universe/erms/records?linked=unlinked"
            loading={loading}
            hint="no matching permit"
          />
        </Col>
      </Row>

      {/* The collection. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            {loading ? <Skeleton active paragraph={false} /> : <Statistic title="Records" value={data.total} formatter={fmt} />}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            {loading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Tooltip title="Records whose permit number resolves to an establishment in the Universe register">
                <Statistic
                  title="Linked to the register"
                  value={data.linked}
                  formatter={fmt}
                  prefix={<LinkOutlined style={{ fontSize: 16, color: token.colorTextTertiary }} />}
                  suffix={<Text type="secondary" style={{ fontSize: 14 }}>{`${linkedPct}%`}</Text>}
                />
              </Tooltip>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            {loading ? <Skeleton active paragraph={false} /> : <Statistic title={`Permits approved in ${thisYear}`} value={approvedThisYear} formatter={fmt} />}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            {loading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Statistic title="Provinces with records" value={data.byProvince?.filter((p) => p._id).length || 0} suffix={<Text type="secondary" style={{ fontSize: 14 }}>of 7</Text>} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card title="By permit type" size="small" style={{ height: "100%" }} extra={<Text type="secondary" style={{ fontSize: 12 }}>share of {fmt(data?.total)}</Text>}>
            {loading ? <Skeleton active /> : <DonutChart rows={[...data.byType].sort((a, b) => TYPE_ORDER.indexOf(a._id) - TYPE_ORDER.indexOf(b._id)).map((r) => ({ key: r._id, label: PERMIT_LABEL[r._id] || r._id || "Unknown", count: r.count }))} total={data.total} dark={isDark} />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By province" size="small" style={{ height: "100%" }}>
            {loading ? <Skeleton active /> : <MagnitudeBars rows={data.byProvince.map((r) => ({ label: PROVINCE_LABEL[r._id] || r._id || "Unknown", count: r.count }))} color={token.colorPrimary} dark={isDark} name="Records" />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By year approved" size="small" style={{ height: "100%" }} extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 years</Text>}>
            {loading ? <Skeleton active /> : <YearColumns rows={(data.byYear || []).map((y) => ({ year: y._id, count: y.count }))} color={token.colorPrimary} dark={isDark} name="Permits approved" />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={canDecide ? 15 : 24}>
          <Card
            title="Recently uploaded"
            size="small"
            extra={<Link to="/universe/erms/records">Open the library <RightOutlined style={{ fontSize: 10 }} /></Link>}
          >
            {loading ? (
              <Skeleton active />
            ) : (
              <Table rowKey="serialNo" size="small" columns={recentColumns} dataSource={data.recent} pagination={false} scroll={{ x: "max-content" }} />
            )}
          </Card>
        </Col>
        {canDecide && (
          <Col xs={24} lg={9}>
            <Card
              title="Waiting for a decision"
              size="small"
              style={{ height: "100%" }}
              extra={<Link to="/universe/erms/access-requests">Inbox <RightOutlined style={{ fontSize: 10 }} /></Link>}
            >
              {inbox.isLoading ? (
                <Skeleton active />
              ) : (
                <List
                  size="small"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting" /> }}
                  dataSource={inbox.data?.requests || []}
                  renderItem={(r) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space size={6}>
                            <Link to={`/universe/erms/records/${encodeURIComponent(r.serialNo)}`}>{r.serialNo}</Link>
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.proponentName}</Text>
                          </Space>
                        }
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {r.requestedBy?.name || r.requestedBy?.username}
                            {r.requestedBy?.division ? ` · ${r.requestedBy.division}` : ""} · {when(r.requestedAt)}
                            {r.reason ? ` — “${r.reason}”` : ""}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  );
};

export default ErmsDashboard;
