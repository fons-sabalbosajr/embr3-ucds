import { Alert, Button, Card, Col, Row, Skeleton, Space, Table, Tag, Typography, theme as antdTheme } from "antd";
import {
  CalendarOutlined,
  DesktopOutlined,
  FileExclamationOutlined,
  FileTextOutlined,
  RightOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDashboard } from "../api/ermsService";
import { DonutChart, MagnitudeBars, YearColumns } from "../components/charts";
import { AttentionTile, StatTile } from "../components/dashboardTiles";
import { useTheme } from "../../../theme/ThemeProvider";
import { useUnits } from "./useUnits";
import { formatValue, unitTheme } from "./unitTheme";

const { Title, Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// ---------------------------------------------------------------------------
// A unit's landing page — Legal Services or Laboratory — in the same shape as
// the Records dashboard: the day's work first (file a document, the
// documents), what needs attention, then the counts: every kind of document
// the unit keeps, and how the collection is made up by kind, province and
// year.
// ---------------------------------------------------------------------------

const UnitDashboard = () => {
  const { unit } = useParams();
  const navigate = useNavigate();
  const { token } = antdTheme.useToken();
  const isDark = useTheme().mode === "dark";
  const theme = unitTheme(unit);
  const { unit: unitOf } = useUnits();
  const unitConfig = unitOf(unit);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "unit", unit, "dashboard"],
    queryFn: () => fetchUnitDashboard(unit),
    enabled: Boolean(unitConfig),
  });

  if (error) return <Alert type="error" showIcon message={describeApiError(error, "Could not load the dashboard.")} />;

  const loading = isLoading || !data;
  const thisYear = new Date().getFullYear();
  const documentsUrl = `/universe/erms/${unit}/documents`;

  const recentColumns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 150,
      render: (s) => <Link to={`${documentsUrl}/${encodeURIComponent(s)}`}>{s}</Link>,
    },
    { title: "Title", dataIndex: "title", key: "title", ellipsis: true },
    {
      title: "Type",
      dataIndex: "docType",
      key: "docType",
      width: 180,
      render: (t, d) => <Tag color={theme.color}>{d.docTypeLabel || t}</Tag>,
    },
    { title: "Province", dataIndex: "provinceLabel", key: "province", width: 120, render: (p, d) => p || d.province || "—" },
    { title: "Filed", dataIndex: "createdAt", key: "createdAt", width: 110, render: (d) => formatValue({ type: "date" }, d) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* The day's work first. */}
      <Card
        size="small"
        styles={{ body: { padding: "16px 20px" } }}
        style={{ background: token.colorFillQuaternary, borderTop: `3px solid ${theme.accent}` }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <span style={{ color: theme.accent, marginRight: 8 }}>{theme.icon}</span>
              {unitConfig?.label || theme.label}
            </Title>
            <Text type="secondary">{theme.description}</Text>
          </div>
          <Space wrap>
            {unitConfig?.canFile && (
              <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate(`${documentsUrl}?upload=1`)}>
                File a document
              </Button>
            )}
            <Button icon={<FileTextOutlined />} onClick={() => navigate(documentsUrl)}>
              Documents
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate("/universe/settings/erms")}>
              Unit settings
            </Button>
          </Space>
        </div>
      </Card>

      {/* What needs attention. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <AttentionTile icon={<UploadOutlined />} label="Filed here, last 30 days" value={data?.uploadedLast30Days || 0} tone="info" to={documentsUrl} loading={loading} hint="documents" />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile icon={<CalendarOutlined />} label={`Filed in ${thisYear}`} value={data?.filedThisYear || 0} tone="ok" to={documentsUrl} loading={loading} hint="so far" />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile icon={<FileExclamationOutlined />} label="Without a file on the share" value={data?.withoutFile || 0} tone="warning" to={documentsUrl} loading={loading} hint={data?.withoutFile ? "to file" : "none"} />
        </Col>
        <Col xs={12} md={6}>
          <AttentionTile icon={<DesktopOutlined />} label="From the desktop system" value={data?.fromDesktop || 0} tone="info" loading={loading} hint="migrated" />
        </Col>
      </Row>

      {/* Every kind of document the unit keeps, counted. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatTile title="Documents filed" value={data?.total} loading={loading} onClick={() => navigate(documentsUrl)} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile title="Provinces with documents" value={data?.byProvince?.filter((p) => p.province).length || 0} suffix={<Text type="secondary" style={{ fontSize: 14 }}>of 7</Text>} loading={loading} />
        </Col>
        {(data?.byType || []).map((t) => (
          <Col xs={12} md={6} key={t.docType}>
            <StatTile title={t.label} value={t.count} loading={loading} onClick={() => navigate(`${documentsUrl}?docType=${encodeURIComponent(t.docType)}`)} />
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card title="By document type" size="small" style={{ height: "100%" }} extra={<Text type="secondary" style={{ fontSize: 12 }}>share of {fmt(data?.total)}</Text>}>
            {loading ? <Skeleton active /> : <DonutChart rows={data.byType.map((t) => ({ key: t.docType, label: t.label, count: t.count }))} total={data.total} dark={isDark} />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By province" size="small" style={{ height: "100%" }}>
            {loading ? <Skeleton active /> : <MagnitudeBars rows={data.byProvince} color={theme.accent} dark={isDark} />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="By year filed" size="small" style={{ height: "100%" }} extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 years</Text>}>
            {loading ? <Skeleton active /> : <YearColumns rows={data.byYear} color={theme.accent} dark={isDark} />}
          </Card>
        </Col>
      </Row>

      <Card
        title="Most recently filed"
        size="small"
        extra={<Link to={documentsUrl}>All documents <RightOutlined style={{ fontSize: 10 }} /></Link>}
      >
        {loading ? (
          <Skeleton active />
        ) : (
          <Table rowKey="serialNo" size="small" columns={recentColumns} dataSource={data.recent} pagination={false} scroll={{ x: "max-content" }} />
        )}
      </Card>
    </Space>
  );
};

export default UnitDashboard;
