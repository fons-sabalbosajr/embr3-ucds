import { Alert, Badge, Button, Card, Col, Empty, List, Row, Skeleton, Space, Table, Tag, Typography } from "antd";
import {
  CalendarOutlined,
  CloudUploadOutlined,
  DesktopOutlined,
  FileExclamationOutlined,
  FileSearchOutlined,
  MailOutlined,
  RightOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDashboard } from "../api/ermsService";
import { DonutChart, MagnitudeBars, YearColumns } from "../components/charts";
import ChartCard, { MonthStackCard } from "../components/ChartCard";
import { AttentionTile, StatTile } from "../components/dashboardTiles";
import UnitHeader from "../components/UnitHeader";
import QuickSearch from "../components/QuickSearch";
import { useTheme } from "../../../theme/ThemeProvider";
import { useUnits } from "./useUnits";
import { formatValue, unitTheme } from "./unitTheme";
import { settingsPath } from "../settingsPath";
import PortalSummaryCard from "../../portal/PortalSummaryCard";
import DocTitle from "../../portal/DocTitle";
import { fetchDesk } from "../../portal/portalService";

const { Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

// ---------------------------------------------------------------------------
// A unit's landing page — Legal Services or Laboratory — in the same shape as
// the Records dashboard: the day's work first (file a document, the
// documents), what needs attention — the unit's Document Portal requests
// among it — then the counts: every kind of document the unit keeps, and
// how the collection is made up by kind, province and year.
// ---------------------------------------------------------------------------

const UnitDashboard = () => {
  const { unit } = useParams();
  const navigate = useNavigate();
  const isDark = useTheme().mode === "dark";
  const theme = unitTheme(unit);
  const { unit: unitOf } = useUnits();
  const unitConfig = unitOf(unit);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "unit", unit, "dashboard"],
    queryFn: () => fetchUnitDashboard(unit),
    enabled: Boolean(unitConfig),
  });

  // The unit's own Document Portal requests (the server refuses the desk to
  // anyone who decides none — then there is nothing to show).
  const inbox = useQuery({ queryKey: ["portal", "desk", unit], queryFn: () => fetchDesk({ source: unit }), refetchInterval: 30000, retry: false, enabled: Boolean(unitConfig) });
  const pending = inbox.data?.pending?.length || 0;
  const canDecide = Boolean(inbox.data);

  if (error) return <Alert type="error" showIcon message={describeApiError(error, "Could not load the dashboard.")} />;

  const loading = isLoading || !data;
  const thisYear = new Date().getFullYear();
  const documentsUrl = `/e-universe/erms/${unit}/documents`;

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
    { title: "Uploaded", dataIndex: ["document", "uploadedAt"], key: "uploadedAt", width: 110, render: (d, r) => formatValue({ type: "date" }, d || r.createdAt) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* The day's work first. */}
      <UnitHeader
        unit={unit}
        title={unitConfig?.label || theme.label}
        actions={
          <>
            {unitConfig && <QuickSearch unit={unit} />}
            {unitConfig?.canFile && (
              <Link to={`${documentsUrl}?upload=1`}>
                <Button type="primary" icon={<CloudUploadOutlined />}>Upload document</Button>
              </Link>
            )}
            <Link to={documentsUrl}>
              <Button icon={<FileSearchOutlined />}>Document Library</Button>
            </Link>
            {canDecide && (
              <Link to="/e-universe/erms/portal-requests">
                <Badge count={pending} size="small" offset={[-2, 2]}>
                  <Button icon={<MailOutlined />}>Portal requests</Button>
                </Badge>
              </Link>
            )}
            <Link to={settingsPath(unit)}>
              <Button icon={<SettingOutlined />}>Settings</Button>
            </Link>
          </>
        }
      />

      {/* What needs attention — sharing the row, however many there are. */}
      <Row gutter={[12, 12]}>
        {canDecide && (
          <Col flex="1 1 170px">
            <AttentionTile icon={<MailOutlined />} label="Portal requests waiting" value={pending} tone="warning" to="/e-universe/erms/portal-requests" loading={inbox.isLoading} hint={pending ? "to decide" : "none"} />
          </Col>
        )}
        <Col flex="1 1 170px">
          <AttentionTile icon={<UploadOutlined />} label="Filed here, last 30 days" value={data?.uploadedLast30Days || 0} tone="info" to={documentsUrl} loading={loading} hint="documents" />
        </Col>
        <Col flex="1 1 170px">
          <AttentionTile icon={<CalendarOutlined />} label={`Filed in ${thisYear}`} value={data?.filedThisYear || 0} tone="ok" to={documentsUrl} loading={loading} hint="so far" />
        </Col>
        <Col flex="1 1 170px">
          <AttentionTile icon={<FileExclamationOutlined />} label="Without a file on the share" value={data?.withoutFile || 0} tone="warning" to={documentsUrl} loading={loading} hint={data?.withoutFile ? "to file" : "none"} />
        </Col>
        <Col flex="1 1 170px">
          <AttentionTile icon={<DesktopOutlined />} label="From the desktop system" value={data?.fromDesktop || 0} tone="info" loading={loading} hint="migrated" />
        </Col>
      </Row>

      {/* The Laboratory's reminder: calibration certificates past or near their due date. */}
      {unit === "laboratory" && data?.calibrationDue && (data.calibrationDue.overdue > 0 || data.calibrationDue.soon > 0) && (
        <Card
          size="small"
          title={<Space><CalendarOutlined />Calibration due</Space>}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>{data.calibrationDue.overdue} overdue · {data.calibrationDue.soon} within {data.calibrationDue.windowDays} days</Text>}
        >
          <List
            size="small"
            dataSource={data.calibrationDue.items.slice(0, 8)}
            renderItem={(i) => (
              <List.Item>
                <Space size={8} wrap>
                  <Tag color={i.overdue ? "red" : "gold"}>{i.overdue ? "overdue" : "due"} {i.dateDue}</Tag>
                  <Link to={`${documentsUrl}/${encodeURIComponent(i.serialNo)}`} style={{ fontFamily: "monospace" }}>{i.serialNo}</Link>
                  <Text>{i.unitUnderTest || i.title || ""}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* The public Document Portal, for this unit's documents. */}
      {canDecide && <PortalSummaryCard source={unit} accent={theme.accent} />}

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
          <ChartCard
            title="By document type"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>share of {fmt(data?.total)}</Text>}
            loading={loading}
            labelTitle="Document type"
            rows={(data?.byType || []).map((t) => ({ key: t.docType, label: t.label, count: t.count }))}
            total={data?.total}
            render={(full) => <DonutChart rows={data.byType.map((t) => ({ key: t.docType, label: t.label, count: t.count }))} total={data.total} dark={isDark} height={full ? 380 : undefined} />}
          />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard
            title="By province"
            loading={loading}
            labelTitle="Province"
            rows={(data?.byProvince || []).map((p) => ({ key: p.province || "none", label: p.label, count: p.count }))}
            render={(full) => <MagnitudeBars rows={data.byProvince} color={theme.accent} dark={isDark} height={full ? 380 : undefined} />}
          />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard
            title="By year filed"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 years</Text>}
            loading={loading}
            labelTitle="Year"
            rows={[...(data?.byYear || [])].sort((a, b) => b.year - a.year).map((y) => ({ key: y.year, label: String(y.year), count: y.count }))}
            render={(full) => <YearColumns rows={data.byYear} color={theme.accent} dark={isDark} years={full ? 100 : 12} height={full ? 380 : undefined} />}
          />
        </Col>
      </Row>

      {/* The desktop unit's monthly upload figures. */}
      <MonthStackCard
        title="Uploads per month"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 months, by document type</Text>}
        loading={loading}
        months={data?.byMonth || []}
        kinds={(unitConfig?.docTypes || []).map((t) => ({ code: t.code, label: data?.kindLabels?.[t.code] || t.label }))}
        dark={isDark}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={canDecide ? 15 : 24}>
          <Card
            title="Recently uploaded"
            size="small"
            style={{ height: "100%" }}
            extra={<Link to={documentsUrl}>Open the library <RightOutlined style={{ fontSize: 10 }} /></Link>}
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
              extra={<Link to="/e-universe/erms/portal-requests">Portal requests <RightOutlined style={{ fontSize: 10 }} /></Link>}
            >
              {inbox.isLoading ? (
                <Skeleton active />
              ) : (
                <List
                  size="small"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting" /> }}
                  dataSource={(inbox.data?.pending || []).slice(0, 5)}
                  renderItem={(r) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<DocTitle doc={r} strong={false} />}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {r.requesterName}
                            {r.designation ? ` · ${r.designation}` : ""} · {when(r.createdAt)}
                            {r.purpose ? ` — “${r.purpose}”` : ""}
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

export default UnitDashboard;
