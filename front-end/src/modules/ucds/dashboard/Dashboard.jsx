import { Button, Col, Row, Space, Typography } from "antd";
import { CalendarOutlined, ExclamationCircleOutlined, FileExcelOutlined, FileTextOutlined, WarningOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UcdsHeader } from "../ucdsTheme";
import { UCDS_ACCENT } from "../ucdsColors";
import { AttentionTile, StatTile } from "../../../shared/components/dashboard/dashboardTiles";
import ChartCard from "../../../shared/components/dashboard/ChartCard";
import { DonutChart, MagnitudeBars } from "../../../shared/components/dashboard/charts";
import { useTheme } from "../../../theme/ThemeProvider";
import MonitoringCalendar from "./MonitoringCalendar";
import ExpiringPermits from "./ExpiringPermits";
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

const Dashboard = () => {
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
  // A year whose monitoring has not started — a new register, loaded from the
  // RAW workbooks with the year's own activity left blank — has no project
  // status and nothing monitored: the cards show what the register does hold
  // (its monitoring history, the permits found in ERMS) instead of zeros.
  const year = data?.year;
  const hasStatus = Object.entries(status).some(([k, v]) => k !== "notYetMonitored" && v > 0);
  const anyMonitored = (accomplishment.data || []).some((p) => p.monitored > 0 || p.scheduled > 0);
  const provinceRows = (accomplishment.data || []).map((p) => ({ key: p.province, label: p.province, count: anyMonitored ? p.monitored : p.inErms, monitored: p.monitored, scheduled: p.scheduled, establishments: p.establishments, inErms: p.inErms, withPermit: p.withPermit }));
  const listRows = (data?.byList || []).map((u) => ({ key: u.unit, label: u.label, count: u.count, group: u.group }));
  const lists = listRows.filter((u) => u.group !== "province");
  const onLists = lists.reduce((a, u) => a + u.count, 0);
  const historyRows = (data?.monitoringHistory || []).map((h) => ({ key: String(h.year), label: `Monitored in ${h.year}`, count: h.count }));

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
          {hasStatus || !onLists ? (
            <StatTile title="Operational" value={status.operational} loading={loading} />
          ) : (
            <StatTile title="Healthcare, TSD / TRC & other lists" value={onLists} loading={loading} />
          )}
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          {hasStatus || !historyRows.length ? (
            <ChartCard title="Project status" loading={loading} labelTitle="Status" countTitle="Establishments" rows={statusRows} render={(full) => <DonutChart rows={statusRows} dark={isDark} height={full ? 380 : undefined} />} />
          ) : (
            // Nothing monitored in the year yet: the years before, by their IIS numbers.
            <ChartCard
              title="Monitoring history"
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{year ? `none yet in ${year}` : ""}</Text>}
              loading={loading}
              labelTitle="Year"
              countTitle="Establishments with an IIS number"
              rows={historyRows}
              render={(full) => <MagnitudeBars rows={historyRows} color={accent} dark={isDark} name="Establishments" height={full ? 380 : undefined} />}
            />
          )}
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

      {/* The register by province of the Monitoring Plan, then the lists kept
          apart (Healthcare Industries, Chemical permits, TSD / TRC, Importers). */}
      {listRows.length > 0 && (
        <ChartCard
          title="Establishments by province and list"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {lists.length ? `${fmt((data?.totalIndustries || 0) - onLists)} Monitoring Plan · ${fmt(onLists)} on the lists` : "Monitoring Plan"}
            </Text>
          }
          loading={loading}
          rows={listRows}
          columns={[
            { title: "Province / list", dataIndex: "label", key: "label", render: (v, r) => (r.group === "province" ? v : <Text strong>{v}</Text>) },
            { title: "Establishments", dataIndex: "count", key: "c", align: "right", render: fmt },
            { title: "Share", dataIndex: "count", key: "p", align: "right", render: (v) => `${data?.totalIndustries ? ((v / data.totalIndustries) * 100).toFixed(1) : 0}%` },
          ]}
          render={(full) => <MagnitudeBars rows={listRows} color={accent} dark={isDark} name="Establishments" height={full ? Math.max(380, listRows.length * 26) : 260} />}
        />
      )}

      <ChartCard
        title={anyMonitored ? "Monitored, by province" : "Permits found in ERMS, by province"}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {anyMonitored ? "monitored of scheduled · permits found in ERMS" : `no monitoring recorded${year ? ` in ${year}` : ""} yet · permits found in ERMS`}
          </Text>
        }
        loading={accomplishment.isLoading}
        rows={provinceRows}
        columns={[
          { title: "Province", dataIndex: "label", key: "label" },
          { title: "Establishments", dataIndex: "establishments", key: "e", align: "right", render: fmt },
          { title: "Scheduled", dataIndex: "scheduled", key: "s", align: "right", render: fmt },
          { title: "Monitored", dataIndex: "monitored", key: "m", align: "right", render: fmt },
          { title: "With a permit", dataIndex: "withPermit", key: "w", align: "right", render: fmt },
          { title: "Found in ERMS", dataIndex: "inErms", key: "i", align: "right", render: (v, r) => `${fmt(v)} (${r.withPermit ? Math.round((v / r.withPermit) * 100) : 0}%)` },
        ]}
        render={(full) => <MagnitudeBars rows={provinceRows} color={accent} dark={isDark} name={anyMonitored ? "Monitored" : "Found in ERMS"} height={full ? 380 : 240} />}
      />

      {/* The monitoring calendar (a month as a heat grid, the day beside it)
          and the permits that expire next. */}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={15}>
          <MonitoringCalendar />
        </Col>
        <Col xs={24} xl={9}>
          <ExpiringPermits />
        </Col>
      </Row>
    </Space>
  );
};

export default Dashboard;
