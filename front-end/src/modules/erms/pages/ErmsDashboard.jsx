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
  Table,
  Tag,
  Tooltip,
  Typography,
  theme as antdTheme,
} from "antd";
import {
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  InboxOutlined,
  LinkOutlined,
  MailOutlined,
  RightOutlined,
  SettingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DonutChart, MagnitudeBars, YearColumns } from "../components/charts";
import ChartCard, { MonthStackCard } from "../components/ChartCard";
import { AttentionTile, StatTile } from "../components/dashboardTiles";
import UnitHeader from "../components/UnitHeader";
import { unitTheme } from "../units/unitTheme";
import { settingsPath } from "../settingsPath";
import { useTheme } from "../../../theme/ThemeProvider";
import PortalSummaryCard from "../../portal/PortalSummaryCard";
import DocTitle from "../../portal/DocTitle";
import { fetchDesk } from "../../portal/portalService";
import {
  PERMIT_OPTIONS,
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchDashboard,
} from "../api/ermsService";

// ---------------------------------------------------------------------------
// The Records Unit's landing page.
//
// For an ERMS User this is the main Dashboard — they have no planning
// dashboard — so it opens on what the day's work is: the upload, the
// Document Portal requests waiting for a decision, records that need review. (The "overdue loans" tile
// was removed: the office no longer tracks paper loans from here.)
// The counts and distributions that describe the collection follow.
//
// The charts below say how the collection is made up; the status colours
// on the tiles (pending, needs review) always come with an icon
// and a word, never on their own.
// ---------------------------------------------------------------------------

const { Text } = Typography;

const PERMIT_LABEL = Object.fromEntries(PERMIT_OPTIONS.map((o) => [o.value, o.label]));
const TYPE_ORDER = PERMIT_OPTIONS.map((o) => o.value);
const PERMIT_KINDS = PERMIT_OPTIONS.map((o) => ({ code: o.value, label: o.label }));

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const ErmsDashboard = () => {
  const { token } = antdTheme.useToken();
  const navigate = useNavigate();
  const isDark = useTheme().mode === "dark";
  // The charts in the unit's own colour, as Legal and Laboratory draw theirs.
  const { accent } = unitTheme("records");
  const stats = useQuery({ queryKey: ["erms", "dashboard"], queryFn: fetchDashboard });
  // Document Portal requests waiting for this unit (the server refuses the
  // desk to anyone who decides none — then there is nothing to show).
  // The Records Unit's own: a Developer, who decides for every unit, sees
  // Legal's and the Laboratory's on their dashboards.
  const inbox = useQuery({ queryKey: ["portal", "desk", "records"], queryFn: () => fetchDesk({ source: "records" }), refetchInterval: 30000, retry: false });

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
  const pending = inbox.data?.pending?.length || 0;
  const canDecide = Boolean(inbox.data);
  const typeRows = [...(data?.byType || [])].sort((a, b) => TYPE_ORDER.indexOf(a._id) - TYPE_ORDER.indexOf(b._id)).map((r) => ({ key: r._id || "none", label: PERMIT_LABEL[r._id] || r._id || "Unknown", count: r.count }));
  const provinceRows = (data?.byProvince || []).map((r) => ({ key: r._id || "none", label: PROVINCE_LABEL[r._id] || r._id || "Unknown", count: r.count }));
  const yearRows = (data?.byYear || []).map((y) => ({ year: y._id, count: y.count }));

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
      <UnitHeader
        unit="records"
        actions={
          <>
            <Link to="/universe/erms/records?new=1">
              <Button type="primary" icon={<CloudUploadOutlined />}>Upload record</Button>
            </Link>
            <Link to="/universe/erms/records">
              <Button icon={<FileSearchOutlined />}>Document Library</Button>
            </Link>
            <Link to="/universe/erms/archive">
              <Button icon={<InboxOutlined />}>Archive boxes</Button>
            </Link>
            {canDecide && (
              <Link to="/universe/erms/portal-requests">
                <Badge count={pending} size="small" offset={[-2, 2]}>
                  <Button icon={<MailOutlined />}>Portal requests</Button>
                </Badge>
              </Link>
            )}
            <Link to={settingsPath("records")}>
              <Button icon={<SettingOutlined />}>Settings</Button>
            </Link>
          </>
        }
      />

      {/* What needs attention. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <AttentionTile
            icon={<MailOutlined />}
            label="Portal requests waiting"
            value={pending}
            tone="warning"
            to="/universe/erms/portal-requests"
            loading={inbox.isLoading}
            hint={pending ? "to decide" : "none"}
          />
        </Col>
        <Col xs={24} sm={8}>
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
        <Col xs={24} sm={8}>
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

      {/* The public Document Portal: who is in the room, what waits, the day's figures. */}
      {canDecide && <PortalSummaryCard source="records" accent={accent} />}

      {/* The collection. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatTile title="Records" value={data?.total} loading={loading} onClick={() => navigate("/universe/erms/records")} />
        </Col>
        <Col xs={12} md={6}>
          <Tooltip title="Records whose permit number resolves to an establishment in the Universe register">
            <div style={{ height: "100%" }}>
              <StatTile
                title="Linked to the register"
                value={data?.linked}
                loading={loading}
                prefix={<LinkOutlined style={{ fontSize: 16, color: token.colorTextTertiary }} />}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>{`${linkedPct}%`}</Text>}
                onClick={() => navigate("/universe/erms/records?linked=linked")}
              />
            </div>
          </Tooltip>
        </Col>
        <Col xs={12} md={6}>
          <StatTile title={`Permits approved in ${thisYear}`} value={approvedThisYear} loading={loading} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile title="Provinces with records" value={data?.byProvince?.filter((p) => p._id).length || 0} suffix={<Text type="secondary" style={{ fontSize: 14 }}>of 7</Text>} loading={loading} />
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <ChartCard
            title="By permit type"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>share of {fmt(data?.total)}</Text>}
            loading={loading}
            labelTitle="Permit type"
            countTitle="Records"
            rows={typeRows}
            total={data?.total}
            render={(full) => <DonutChart rows={typeRows} total={data.total} dark={isDark} height={full ? 380 : undefined} />}
          />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard
            title="By province"
            loading={loading}
            labelTitle="Province"
            countTitle="Records"
            rows={provinceRows}
            render={(full) => <MagnitudeBars rows={provinceRows} color={accent} dark={isDark} name="Records" height={full ? 380 : undefined} />}
          />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard
            title="By year approved"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 years</Text>}
            loading={loading}
            labelTitle="Year approved"
            countTitle="Permits approved"
            rows={[...yearRows].sort((a, b) => b.year - a.year).map((y) => ({ key: y.year, label: String(y.year), count: y.count }))}
            render={(full) => <YearColumns rows={yearRows} color={accent} dark={isDark} name="Permits approved" years={full ? 100 : 12} height={full ? 380 : undefined} />}
          />
        </Col>
      </Row>

      {/* The desktop system's monthly upload figures and its project-type chart. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={15}>
          <MonthStackCard
            title="Uploads per month"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>last 12 months, by permit type</Text>}
            loading={loading}
            months={data?.byMonth || []}
            kinds={PERMIT_KINDS}
            dark={isDark}
          />
        </Col>
        <Col xs={24} lg={9}>
          {/* The card shows the top ten; See more, all the server sends (fifty). */}
          <ChartCard
            title="Most filed project types"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>top 10</Text>}
            loading={loading}
            labelTitle="Project type"
            countTitle="Records"
            rows={data?.byProjectType || []}
            render={(full) => <MagnitudeBars rows={full ? data.byProjectType || [] : (data.byProjectType || []).slice(0, 10)} color={accent} dark={isDark} height={full ? Math.max(380, (data.byProjectType || []).length * 26) : 280} name="Records" />}
          />
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
              extra={<Link to="/universe/erms/portal-requests">Portal requests <RightOutlined style={{ fontSize: 10 }} /></Link>}
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

export default ErmsDashboard;
