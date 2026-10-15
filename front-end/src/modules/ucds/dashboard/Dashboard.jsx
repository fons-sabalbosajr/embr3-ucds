import { Button, Card, Col, Empty, List, Row, Space, Tag, Typography } from "antd";
import { CalendarOutlined, ExclamationCircleOutlined, FileExcelOutlined, FileTextOutlined, WarningOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UcdsHeader } from "../ucdsTheme";
import { UCDS_ACCENT } from "../ucdsColors";
import { AttentionTile, StatTile } from "../../../shared/components/dashboard/dashboardTiles";
import ChartCard from "../../../shared/components/dashboard/ChartCard";
import { DonutChart, MagnitudeBars } from "../../../shared/components/dashboard/charts";
import { useTheme } from "../../../theme/ThemeProvider";
import Calendar from "../../../components/Calendar/SystemCalendar";
import { message } from "../../../shared/feedback";
import { downloadMonitoringPlan, fetchAccomplishment, fetchDashboardStats, fetchExpiringPermits } from "../ucdsService";

const { Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// ---------------------------------------------------------------------------
// The Universe Central DB's landing page, in the ERMS dashboards' shape: what
// needs attention first (permits expired or about to, establishments not yet
// monitored), then the register counted, the charts (each with See more),
// the monitoring calendar and the permits expiring soonest.
// ---------------------------------------------------------------------------

const STATUS_LABEL = { operational: "Operational", nonOperational: "Non-operational", notOperational: "Not operational", notYetMonitored: "Not yet monitored", other: "Other" };
const PERMIT_LABEL = { ecc: "ECC / CNC", pto: "Permit to Operate", wwdp: "Wastewater Discharge Permit", hwg: "Hazardous Waste Generator", pco: "PCO accreditation" };

const Dashboard = ({ theme: themeProp }) => {
  const { isDark } = useTheme();
  const accent = UCDS_ACCENT;
  const stats = useQuery({ queryKey: ["ucds", "dashboard-stats"], queryFn: fetchDashboardStats, staleTime: 60 * 1000 });
  const expiring = useQuery({ queryKey: ["ucds", "expiring"], queryFn: () => fetchExpiringPermits(8), staleTime: 2 * 60 * 1000 });
  const accomplishment = useQuery({ queryKey: ["ucds", "accomplishment"], queryFn: fetchAccomplishment, staleTime: 5 * 60 * 1000 });
  const data = stats.data;
  const loading = stats.isLoading;
  const status = data?.projectStatusBreakdown || {};
  const statusRows = Object.entries(STATUS_LABEL).map(([k, label]) => ({ key: k, label, count: status[k] || 0 }));
  const permitRows = Object.entries(PERMIT_LABEL).map(([k, label]) => ({ key: k, label, count: data?.permitBreakdown?.[k] || 0 }));
  const sectionRows = (data?.sectionBreakdown || []).map((s) => ({ key: s.section, label: s.section.replace(/_/g, " "), count: s.count }));
  const provinceRows = (accomplishment.data || []).map((p) => ({ key: p.province, label: p.province, count: p.monitored, scheduled: p.scheduled, establishments: p.establishments, inErms: p.inErms, withPermit: p.withPermit }));

  const exportAll = async () => {
    try {
      const n = await downloadMonitoringPlan();
      message.success(`Exported ${fmt(n)} establishments.`);
    } catch {
      message.error("The Monitoring Plan could not be exported.");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <UcdsHeader title="Universe Central DB"
        actions={
          <>
            <Link to="/e-universe/report">
              <Button icon={<FileTextOutlined />}>Reports</Button>
            </Link>
            <Button icon={<FileExcelOutlined />} onClick={exportAll}>Export Monitoring Plan</Button>
          </>
        }
      />

      {/* What needs attention. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <AttentionTile icon={<WarningOutlined />} label="Establishments with an expired permit" value={data?.industriesWithAtLeastOneExpiredPermit || 0} tone="danger" loading={loading} hint="PTO, WWDP or PCO" />
        </Col>
        <Col xs={24} sm={8}>
          <AttentionTile icon={<ExclamationCircleOutlined />} label="Permits expired or expiring soon" value={expiring.data?.total || 0} tone="warning" loading={expiring.isLoading} hint="establishments" />
        </Col>
        <Col xs={24} sm={8}>
          <AttentionTile icon={<CalendarOutlined />} label="Not yet monitored" value={status.notYetMonitored || 0} tone="info" loading={loading} hint="no project status" />
        </Col>
      </Row>

      {/* The register, counted. */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatTile title="Establishments" value={data?.totalIndustries} loading={loading} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile title="With a permit" value={data?.industriesWithAnyPermit} loading={loading} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile title="ECC / CNC" value={data?.permitBreakdown?.ecc} loading={loading} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile title="Operational" value={status.operational} loading={loading} />
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <ChartCard title="Project status" loading={loading} labelTitle="Status" countTitle="Establishments" rows={statusRows} render={(full) => <DonutChart rows={statusRows} dark={isDark} height={full ? 380 : undefined} />} />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title="Permits held" loading={loading} labelTitle="Permit" countTitle="Establishments" rows={permitRows} render={(full) => <MagnitudeBars rows={permitRows} color={accent} dark={isDark} name="Establishments" height={full ? 380 : undefined} />} />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard
            title="Section in charge"
            loading={loading}
            labelTitle="Section"
            countTitle="Establishments"
            rows={sectionRows}
            render={(full) => <MagnitudeBars rows={full ? sectionRows : sectionRows.slice(0, 8)} color={accent} dark={isDark} name="Establishments" height={full ? Math.max(380, sectionRows.length * 26) : undefined} />}
          />
        </Col>
      </Row>

      <ChartCard
        title="Monitored, by province"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>monitored of scheduled · permits found in ERMS</Text>}
        loading={accomplishment.isLoading}
        rows={provinceRows}
        columns={[
          { title: "Province", dataIndex: "label", key: "label" },
          { title: "Establishments", dataIndex: "establishments", key: "e", align: "right", render: fmt },
          { title: "Scheduled", dataIndex: "scheduled", key: "s", align: "right", render: fmt },
          { title: "Monitored", dataIndex: "count", key: "m", align: "right", render: fmt },
          { title: "With a permit", dataIndex: "withPermit", key: "w", align: "right", render: fmt },
          { title: "Found in ERMS", dataIndex: "inErms", key: "i", align: "right", render: (v, r) => `${fmt(v)} (${r.withPermit ? Math.round((v / r.withPermit) * 100) : 0}%)` },
        ]}
        render={(full) => <MagnitudeBars rows={provinceRows} color={accent} dark={isDark} name="Monitored" height={full ? 380 : 240} />}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card size="small" title={<Space><CalendarOutlined />Monitoring calendar</Space>} style={{ height: "100%" }}>
            <Calendar theme={themeProp || (isDark ? "dark" : "light")} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="Permits expiring soonest" style={{ height: "100%" }} extra={<Text type="secondary" style={{ fontSize: 12 }}>{fmt(expiring.data?.total)} establishments</Text>}>
            <List
              size="small"
              loading={expiring.isLoading}
              dataSource={expiring.data?.data || []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing expiring" /> }}
              renderItem={(r) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 13 }}>
                      <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.sort_key}</Text> {r.title}
                    </Text>
                    <Space size={4} wrap>
                      {r.permits.map((p) => (
                        <Tag key={p.type} color={p.isExpired ? "red" : "gold"} style={{ marginInlineEnd: 0 }}>
                          {p.type} {p.isExpired ? "expired" : "expires"} {String(p.expiry).slice(0, 10)}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default Dashboard;
