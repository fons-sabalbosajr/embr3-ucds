import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Col, Empty, Row, Segmented, Space, Statistic, Table, Tooltip, Typography, theme as antdTheme } from "antd";
import { Line } from "@ant-design/plots";
import { API_BASE_URL } from "../../../config/api";
import { useTheme } from "../../../theme/ThemeProvider";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// NAS activity, drawn from the audit trail.
//
// Four views of the same counts: reads per day (successful and failed), the
// hour of day they happen, and how they split by operation, container and
// person. Everything here is a count of audit entries — nothing is read from
// the share to draw it, and nothing appears that is not already in the log.
//
// The per-day chart is Ant Design Charts (@ant-design/plots), as the ERMS
// dashboards are, so its type sits at the application's sizes whatever the
// card's width — the hand-drawn SVG before it scaled its 10px labels up with
// the card. Two series only, successful and failed, in a blue/orange pair
// that stays apart for colour-blind readers; the legend and the tooltip carry
// the numbers, so colour is never the only cue.
// ---------------------------------------------------------------------------

const api = (path) => fetch(`${API_BASE_URL}${path}`, { credentials: "include" });

const RANGES = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const fmtBytes = (n) => {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const OPERATION_LABELS = {
  "storage-browse": "Browse (staff)",
  "storage-file-read": "Open file (staff)",
  "nas-browse": "Browse (developer)",
  "nas-file-read": "Open file (developer)",
  "document-view": "View record document",
  "document-read": "Download record document",
  "nas-activate": "Access switched on",
  "nas-deactivate": "Access switched off",
  "nas-availability-set": "Availability changed",
  "nas-access-grant": "Container shared",
  "nas-test-connection": "Connection test",
  "nas-credentials-save": "Credentials saved",
  "nas-credentials-reset": "Credentials reset",
  "nas-container-save": "Container saved",
  "nas-container-remove": "Container removed",
  "nas-elevation-request": "Verification requested",
  "nas-elevation-verify": "Verification passed",
  "nas-elevation-end": "Verified session ended",
  "nas-pin-set": "PIN set",
  "nas-pin-verify": "PIN used",
  "nas-pin-remove": "PIN removed",
  "nas-report-files-move": "Reports moved to share",
  "nas-report-files-remove": "Reports removed from DB",
};
const opLabel = (op) => OPERATION_LABELS[op] || (op ? op.replace(/^(nas|storage)-/, "").replace(/-/g, " ") : "—");

// Validated pairs (dataviz six checks, light and dark surfaces).
const usePalette = () => {
  const { token } = antdTheme.useToken();
  const { mode } = useTheme();
  const dark = mode === "dark";
  return {
    dark,
    ok: dark ? "#4d96dc" : "#2f7ecb",
    failed: dark ? "#e0562a" : "#d4380d",
    grid: token.colorBorderSecondary,
    ink: token.colorText,
    muted: token.colorTextTertiary,
    surface: token.colorBgContainer,
  };
};

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const SERIES = ["Successful", "Failed"];

/** Two lines per day — successful and failed — with a shared tooltip. */
const DailyLines = ({ rows, palette }) => {
  const data = useMemo(
    () => rows.flatMap((r) => [
      { day: r.day, series: "Successful", count: r.ok },
      { day: r.day, series: "Failed", count: r.failed },
    ]),
    [rows]
  );
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity in this range." />;
  return (
    <Line
      data={data}
      xField="day"
      yField="count"
      colorField="series"
      height={240}
      theme={palette.dark ? "classicDark" : "classic"}
      scale={{ color: { domain: SERIES, range: [palette.ok, palette.failed] }, y: { nice: true, domainMin: 0 } }}
      style={{ lineWidth: 2 }}
      point={{ shapeField: "circle", sizeField: 2.5 }}
      axis={{
        x: { title: false, labelFontSize: 11, labelAutoHide: true, labelFormatter: (d) => String(d).slice(5) },
        y: { title: false, grid: true, labelFontSize: 11, tickCount: 4, labelFormatter: (v) => fmt(v) },
      }}
      legend={{ color: { position: "top", layout: { justifyContent: "flex-end" }, itemLabelFontSize: 12 } }}
      tooltip={{ title: (d) => d.day, items: [{ channel: "y", valueFormatter: (v) => fmt(v) }] }}
      interaction={{ tooltip: { crosshairs: true } }}
    />
  );
};

/** Horizontal bars, one hue, value labelled at the end. */
const HorizontalBars = ({ rows, labelOf, palette, title }) => {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${title.toLowerCase()} yet.`} />;
  return (
    <div>
      {rows.map((r) => {
        const okW = (r.ok / max) * 100;
        const failW = (r.failed / max) * 100;
        return (
          <Tooltip key={labelOf(r)} title={`${labelOf(r)}: ${r.ok} successful, ${r.failed} failed${r.bytes ? `, ${fmtBytes(r.bytes)}` : ""}`}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 48px", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <Text ellipsis style={{ fontSize: 12 }}>{labelOf(r)}</Text>
              <div style={{ display: "flex", height: 10, gap: 2 }}>
                <div style={{ width: `${okW}%`, background: palette.ok, borderRadius: 2, minWidth: r.ok ? 2 : 0 }} />
                <div style={{ width: `${failW}%`, background: palette.failed, borderRadius: 2, minWidth: r.failed ? 2 : 0 }} />
              </div>
              <Text type="secondary" style={{ fontSize: 12, textAlign: "right" }}>{r.total}</Text>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

/** 24 cells, darker where the NAS is busier. */
const HourStrip = ({ rows, palette }) => {
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
        {Array.from({ length: 24 }, (_, h) => {
          const r = byHour.get(h);
          const v = r ? r.total : 0;
          const alpha = v ? 0.2 + 0.8 * (v / max) : 0;
          return (
            <Tooltip key={h} title={`${String(h).padStart(2, "0")}:00 — ${v} request(s)${r?.failed ? `, ${r.failed} failed` : ""}`}>
              <div
                style={{
                  height: 22,
                  borderRadius: 3,
                  background: v ? palette.ok : "transparent",
                  opacity: v ? alpha : 1,
                  border: `1px solid ${palette.grid}`,
                }}
              />
            </Tooltip>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {[0, 6, 12, 18, 23].map((h) => (
          <Text key={h} type="secondary" style={{ fontSize: 10 }}>{String(h).padStart(2, "0")}:00</Text>
        ))}
      </div>
    </div>
  );
};

const NasActivityCard = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const palette = usePalette();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/nas/audit/summary?days=${days}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not load the activity summary.");
        return;
      }
      setData(body);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Fill the days with no entries so the columns keep their spacing.
  const daily = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.byDay.map((r) => [r.day, r]));
    return (data.dayKeys || []).map((key) => map.get(key) || { day: key, total: 0, ok: 0, failed: 0, bytes: 0 });
  }, [data]);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="What the NAS is used for"
        description="Counts from the audit trail: who opened what, when, and whether it worked. No file content and no share path is involved — the same entries the Audit Log lists, rolled up."
      />
      {error && <Alert type="error" showIcon message={error} />}

      <Card
        size="small"
        title="Activity"
        loading={loading && !data}
        extra={<Segmented size="small" options={RANGES} value={days} onChange={setDays} />}
      >
        {data && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Row gutter={[24, 12]}>
              <Col xs={12} md={6}><Statistic title="Requests" value={data.totals.total} /></Col>
              <Col xs={12} md={6}><Statistic title="Failed" value={data.totals.failed} valueStyle={{ color: data.totals.failed ? palette.failed : undefined }} /></Col>
              <Col xs={12} md={6}><Statistic title="People" value={data.totals.users} /></Col>
              <Col xs={12} md={6}><Statistic title="Data served" value={fmtBytes(data.totals.bytes)} /></Col>
            </Row>

            <div>
              <Text strong style={{ display: "block", marginBottom: 6 }}>Per day</Text>
              <DailyLines rows={daily} palette={palette} />
            </div>

            <div>
              <Text strong style={{ display: "block", marginBottom: 6 }}>By hour of day ({data.timeZone})</Text>
              <HourStrip rows={data.byHour} palette={palette} />
            </div>

            <Row gutter={[24, 24]}>
              <Col xs={24} md={8}>
                <Text strong style={{ display: "block", marginBottom: 6 }}>By operation</Text>
                <HorizontalBars rows={data.byOperation} labelOf={(r) => opLabel(r.operation)} palette={palette} title="Operations" />
              </Col>
              <Col xs={24} md={8}>
                <Text strong style={{ display: "block", marginBottom: 6 }}>By container</Text>
                <HorizontalBars rows={data.byContainer} labelOf={(r) => r.container || "—"} palette={palette} title="Containers" />
              </Col>
              <Col xs={24} md={8}>
                <Text strong style={{ display: "block", marginBottom: 6 }}>Most active people</Text>
                <HorizontalBars rows={data.byUser} labelOf={(r) => r.username || "—"} palette={palette} title="People" />
              </Col>
            </Row>

            <Table
              size="small"
              rowKey="day"
              pagination={{ defaultPageSize: 10, size: "small" }}
              dataSource={[...data.byDay].reverse()}
              columns={[
                { title: "Day", dataIndex: "day", width: 120 },
                { title: "Requests", dataIndex: "total", width: 100, align: "right" },
                { title: "Successful", dataIndex: "ok", width: 100, align: "right" },
                { title: "Failed", dataIndex: "failed", width: 100, align: "right" },
                { title: "Data served", dataIndex: "bytes", width: 120, align: "right", render: fmtBytes },
              ]}
            />
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default NasActivityCard;
