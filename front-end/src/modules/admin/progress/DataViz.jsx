import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Input, Modal, Segmented, Skeleton, Spin, Table, Tag, Typography } from "antd";
import { ExpandAltOutlined, SearchOutlined } from "@ant-design/icons";
import { Bar, Column, Pie } from "@ant-design/plots";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import embLogo from "../../../assets/emblogo.svg";
import { getVizFirms } from "./progressService";
import { totalOf } from "./ProvinceMatrix";
import { KIND_LABEL, MAIN_KINDS, n, reducedMotion, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Data Visualization: the EMB R3 "Universe of Industries and Projects" Power
// BI report, rebuilt on the season's live RAW data and kept simple.
//
//   left   the title, the firm count, an ECC search (Developer), a button
//          per province (and the healthcare lists) that filters the page,
//          and when the files were last read;
//   charts permits issued by kind; ECC/CNC per province; industry
//          classification (top 15); ECC/CNC per municipality (top 5);
//          ECC/CNC per year; the firms on a map;
//   bottom the firms' table (Developer), and the province counts running
//          along the foot.
//
// On the public link the same charts and the map show — the map's card
// says what and where a firm is, not who — without the firm table.
// ---------------------------------------------------------------------------

const PROVINCES = ["Aurora", "Bataan", "Bulacan", "Nueva_Ecija", "Pampanga", "Tarlac", "Zambales"];
// The dataviz reference palette (shared/components/dashboard/charts.jsx),
// validated for colour-vision deficiency: a province keeps its colour on
// every chart and on the map, whatever the filter.
const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const BAR = { light: "#2a78d6", dark: "#3987e5" };
const compact = (v) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(v || 0);
// The map (Leaflet) in its own chunk: the public link never loads it.
const FirmMap = lazy(() => import("./FirmMap"));

const motion = (type) => (reducedMotion() ? false : { enter: { type, duration: 900 } });
const tip = { tooltip: { css: { ".g2-tooltip": { "font-size": "12px" } } } };
const merge = (units, field) => {
  const out = {};
  for (const u of units) for (const [k, v] of Object.entries(u[field] || {})) out[k] = (out[k] || 0) + v;
  return out;
};
const topOf = (obj, count) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([label, value]) => ({ label: label.replace(/․/g, "."), value }));

/**
 * Draw the children only once the frame is on screen and the browser is
 * idle: six charts and a map at once used to freeze the page as the tab
 * opened. Once drawn they stay.
 */
function useShown(ref) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown || !ref.current) return undefined;
    let idle = null;
    const reveal = () => {
      const run = () => setShown(true);
      idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 600 }) : setTimeout(run, 60);
    };
    if (!("IntersectionObserver" in window)) {
      reveal();
      return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          reveal();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(ref.current);
    return () => {
      io.disconnect();
      if (idle) (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
    };
  }, [shown, ref]);
  return shown;
}

/** One visual's frame: the Power BI report's blue title bar; the visual drawn once in view. */
const Panel = memo(function Panel({ title, area, children, extra, minHeight = 220, onMore }) {
  const ref = useRef(null);
  const shown = useShown(ref);
  return (
    <section ref={ref} className="dv-panel" style={{ gridArea: area }}>
      <header className="dv-panel-head">
        <span>{title}</span>
        <span className="dv-panel-tools">
          {extra}
          {onMore && (
            <button type="button" className="dv-more" onClick={onMore}>
              <ExpandAltOutlined /> See more
            </button>
          )}
        </span>
      </header>
      <div className="dv-panel-body" style={{ minHeight }}>
        {shown ? children : <Skeleton active paragraph={{ rows: 4 }} title={false} />}
      </div>
    </section>
  );
});

/** A permit cell's lines: each permit the firm holds, its kind and number. */
const PERMIT_KINDS = [["ecc", "ECC/CNC"], ["pto", "PTO"], ["wwdp", "WWDP"], ["haz", "HWG ID"], ["chemical", "Chemical"], ["tsd", "TSD"], ["trc", "TP/TRC"], ["pco", "PCO"]];

/**
 * The firms' table (Developer only): the report's bottom table — every firm
 * of the province chosen (all of them under "All"), a page at a time, fitted
 * to the page: the firm and its proponent in one column, its permits in
 * another, so nothing scrolls sideways.
 */
function FirmTable({ scope, query }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => setPage(1), [scope, query]);
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "progress-tracker", "viz-firms", scope, query, page, pageSize],
    queryFn: () => getVizFirms({ unit: scope === "all" ? undefined : scope, q: query || undefined, page, pageSize }),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });
  if (data && !data.ready) return <Alert type="info" showIcon message="The firms appear after the next look at the files (the server keeps them in memory, not in the database)." />;
  return (
    <Table
      size="small"
      rowKey="serial"
      className="dv-firms"
      loading={isFetching}
      tableLayout="fixed"
      dataSource={data?.rows || []}
      pagination={{
        current: page,
        pageSize,
        total: data?.total || 0,
        showSizeChanger: true,
        pageSizeOptions: [10, 25, 50, 100],
        onChange: (p, size) => {
          setPage(size !== pageSize ? 1 : p);
          setPageSize(size);
        },
        showTotal: (t, [a, b]) => `${n(a)}–${n(b)} of ${n(t)} firms`,
      }}
      columns={[
        { title: "Serial No", dataIndex: "serial", width: "10%" },
        { title: "Province", dataIndex: "unit", width: "10%", render: (v) => unitLabel(v) },
        {
          title: "Firm",
          key: "firm",
          width: "24%",
          render: (_, r) => (
            <div className="dv-firm">
              <b>{r.title || "—"}</b>
              {r.name && <Text type="secondary">{r.name}</Text>}
            </div>
          ),
        },
        { title: "Address", dataIndex: "address", width: "20%", render: (v) => v || <Text type="secondary">—</Text> },
        {
          title: "Permits",
          key: "permits",
          width: "28%",
          render: (_, r) => {
            const held = PERMIT_KINDS.filter(([k]) => r[k]);
            return held.length ? (
              <div className="dv-permits">
                {held.map(([k, label]) => (
                  <div key={k}>
                    <span>{label}</span>
                    <span>{r[k]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary">None encoded</Text>
            );
          },
        },
        { title: "Source", dataIndex: "source", width: "8%", render: (v) => (v === "erms" ? <Tag color="green">ERMS</Tag> : v === "ecconline" ? <Tag color="blue">ECC Online</Tag> : <Tag>Baseline</Tag>) },
      ]}
    />
  );
}

/** A pie's values beside it: a dot, the name, the number in full and its share — read without hovering. */
function ValueLegend({ rows, colourOf, faded }) {
  const sum = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ul className="dv-values">
      {rows.map((r) => (
        <li key={r.type} className={faded?.(r) ? "is-faded" : ""}>
          <i style={{ background: colourOf(r) }} />
          <span className="dv-values-name">{r.type}</span>
          <b>{n(r.value)}</b>
          <span className="dv-values-pct">{sum ? Math.round((r.value / sum) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

/** A pie (or a donut) with its values listed beside it; a slice's share written on it only where it fits. */
function PieWithValues({ data, colourOf, inner = 0, dark, faded, name }) {
  const sum = data.reduce((a, r) => a + r.value, 0);
  return (
    <div className="dv-pie">
      <div className="dv-pie-chart">
        <Pie
          data={data}
          angleField="value"
          colorField="type"
          innerRadius={inner}
          radius={0.92}
          height={220}
          theme={dark ? "classicDark" : "classic"}
          scale={{ color: { domain: data.map((d) => d.type), range: data.map(colourOf) } }}
          style={{ stroke: dark ? "#1f1f1f" : "#ffffff", lineWidth: 2, fillOpacity: (d) => (faded?.(d) ? 0.25 : 1) }}
          label={{
            text: (d) => (sum && d.value / sum >= 0.08 ? `${Math.round((d.value / sum) * 100)}%` : ""),
            position: "inside",
            fontSize: 12,
            fontWeight: 700,
            fill: "#ffffff",
            stroke: "rgba(0,0,0,0.35)",
            lineWidth: 2,
          }}
          legend={false}
          tooltip={{ title: (d) => d.type, items: [{ field: "value", name, valueFormatter: (v) => n(v) }] }}
          animate={motion("waveIn")}
          interaction={tip}
        />
      </div>
      <ValueLegend rows={data} colourOf={colourOf} faded={faded} />
    </div>
  );
}

const shorten = (v, max = 24) => (String(v).length > max ? `${String(v).slice(0, max - 1)}…` : String(v));

/** The value written just past the end of each bar — outside it, where it can be read. */
const outsideEnd = (rows, ink, format = n) => [
  {
    type: "text",
    data: rows,
    encode: { x: "label", y: "value", text: (d) => format(d.value) },
    style: { textAlign: "left", textBaseline: "middle", dx: 6, fontSize: 12, fontWeight: 700, fill: ink },
    tooltip: false,
    animate: reducedMotion() ? false : { enter: { type: "fadeIn", delay: 700, duration: 300 } },
  },
];

/**
 * "See more": a panel's whole data — every classification, every
 * municipality, every year — as a chart (scrolling when long) and as a
 * table with each row's share.
 */
function FullData({ open, onClose, title, rows, unit, horizontal = true, dark }) {
  const [view, setView] = useState("chart");
  useEffect(() => {
    if (open) setView("chart");
  }, [open]);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const ink = dark ? "#e6e6e3" : "#2b2b29";
  const axis = { x: { title: false, labelFontSize: 12, labelFill: ink }, y: { title: false, labelFontSize: 11, grid: true, gridLineDash: [3, 3], labelFormatter: (v) => compact(v) } };
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={900} title={title} destroyOnHidden>
      <div className="dv-full-head">
        <Text type="secondary">
          {n(rows.length)} {rows.length === 1 ? "row" : "rows"} · {n(total)} {unit}
        </Text>
        <Segmented size="small" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
      </div>
      {view === "chart" ? (
        <div className="dv-full-chart">
          {horizontal ? (
            <Bar
              data={rows}
              xField="label"
              yField="value"
              height={Math.max(260, rows.length * 26 + 60)}
              paddingRight={64}
              theme={dark ? "classicDark" : "classic"}
              style={{ fill: BAR[dark ? "dark" : "light"], radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 18 }}
              axis={{ ...axis, x: { ...axis.x, labelFormatter: (v) => shorten(v, 34) } }}
              annotations={outsideEnd(rows, ink)}
              tooltip={{ title: (d) => d.label, items: [{ field: "value", name: unit, valueFormatter: (v) => n(v) }] }}
              animate={motion("growInX")}
              interaction={tip}
            />
          ) : (
            <Column
              data={rows}
              xField="label"
              yField="value"
              height={360}
              paddingTop={26}
              theme={dark ? "classicDark" : "classic"}
              style={{ fill: BAR[dark ? "dark" : "light"], radiusTopLeft: 3, radiusTopRight: 3, maxWidth: 22 }}
              axis={{ ...axis, x: { ...axis.x, labelAutoRotate: true } }}
              label={{ text: (d) => n(d.value), position: "top", dy: -4, fontSize: 10, fill: ink }}
              tooltip={{ title: (d) => d.label, items: [{ field: "value", name: unit, valueFormatter: (v) => n(v) }] }}
              animate={motion("growInY")}
              interaction={tip}
            />
          )}
        </div>
      ) : (
        <Table
          size="small"
          rowKey="label"
          dataSource={rows.map((r, i) => ({ ...r, rank: i + 1 }))}
          pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }}
          columns={[
            { title: "#", dataIndex: "rank", width: 56 },
            { title: horizontal ? "Name" : "Year", dataIndex: "label" },
            { title: unit, dataIndex: "value", align: "right", width: 120, render: (v) => <b>{n(v)}</b> },
            { title: "Share", key: "share", align: "right", width: 90, render: (_, r) => `${total ? Math.round((r.value / total) * 1000) / 10 : 0}%` },
          ]}
        />
      )}
    </Modal>
  );
}

export default function DataViz({ matrix, checkedAt, mode = "admin", theme = "light", token = null, mapKey = null }) {
  const admin = mode === "admin";
  const dark = theme === "dark";
  const palette = PALETTE[dark ? "dark" : "light"];
  const [scope, setScope] = useState("all"); // "all" | a province | "healthcare"
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const tableRef = useRef(null);
  const [full, setFull] = useState(null); // which panel's whole data is open

  const provinces = useMemo(() => PROVINCES.map((p) => matrix.find((u) => u.unit === p)).filter(Boolean), [matrix]);
  const healthcare = useMemo(() => matrix.filter((u) => u.group === "healthcare"), [matrix]);
  const inScope = useMemo(() => (scope === "all" ? matrix : scope === "healthcare" ? healthcare : matrix.filter((u) => u.unit === scope)), [scope, matrix, healthcare]);
  const total = useMemo(() => totalOf(inScope), [inScope]);
  const colourOf = useMemo(() => {
    const map = Object.fromEntries(PROVINCES.map((p, i) => [p, palette[i]]));
    healthcare.forEach((u, i) => (map[u.unit] = palette[(i + 2) % palette.length]));
    return (u) => map[u] || palette[0];
  }, [palette, healthcare]);

  // Each chart's data, worked out once per filter or new figures — not on every render.
  const { kindData, donutData, classes, cities, years, allClasses, allCities } = useMemo(() => {
    const donutUnits = scope === "healthcare" ? healthcare : provinces;
    return {
      kindData: MAIN_KINDS.map((k, i) => ({ type: KIND_LABEL[k], slot: i, value: total.permits?.[k] || 0 })).filter((d) => d.value),
      donutData: donutUnits.map((u) => ({ type: unitLabel(u.unit), unit: u.unit, value: u.permits?.ecc || 0 })).filter((d) => d.value),
      classes: topOf(merge(inScope, "classes"), 15),
      cities: topOf(merge(inScope, "cities"), 5),
      allClasses: topOf(merge(inScope, "classes"), 10000),
      allCities: topOf(merge(inScope, "cities"), 10000),
      years: Object.entries(merge(inScope, "eccYears"))
        .map(([y, v]) => ({ year: y, value: v }))
        .sort((a, b) => a.year - b.year),
    };
  }, [scope, healthcare, provinces, total, inScope]);

  if (!matrix.length) return <Empty description="No RAW data read yet." />;
  const ink = dark ? "#e6e6e3" : "#2b2b29";
  const muted = dark ? "#a6a6a3" : "#5f5f5c";
  const axis = { x: { title: false, labelFontSize: 12, labelFill: ink }, y: { title: false, labelFontSize: 11, labelFill: muted, grid: true, gridLineDash: [3, 3], labelFormatter: (v) => compact(v) } };
  const peak = years.reduce((m, y) => (y.value > (m?.value || 0) ? y : m), null);

  const scopeButtons = [{ key: "all", label: "All" }, ...provinces.map((u) => ({ key: u.unit, label: unitLabel(u.unit) })), ...(healthcare.length ? [{ key: "healthcare", label: "Healthcare" }] : [])];
  const runSearch = () => {
    setQuery(search.trim());
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }));
  };

  return (
    <div className="dv has-map">
      <aside className="dv-side">
        <div className="dv-brand">
          <img src={embLogo} alt="" width={44} height={44} />
          <div>Universe of Industries and Projects</div>
        </div>
        <div className="dv-kpi">
          <div className="dv-kpi-value">{compact(total.rows)}</div>
          <div className="dv-kpi-label">Industry count</div>
        </div>
        {admin && (
          <div className="dv-search">
            <label htmlFor="dv-ecc">Search ECC Ref. No</label>
            <Input
              id="dv-ecc"
              allowClear
              value={search}
              placeholder="Search"
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value) setQuery("");
              }}
              onPressEnter={runSearch}
              suffix={<SearchOutlined onClick={runSearch} style={{ cursor: "pointer" }} />}
            />
          </div>
        )}
        <div className="dv-scope-label">Select per province</div>
        <div className="dv-scope" role="group" aria-label="Filter by province">
          {scopeButtons.map((b) => (
            <button key={b.key} type="button" className={`dv-scope-btn${scope === b.key ? " is-on" : ""}`} aria-pressed={scope === b.key} onClick={() => setScope(b.key)}>
              {b.key !== "all" && b.key !== "healthcare" && <i style={{ background: colourOf(b.key) }} />}
              {b.label}
            </button>
          ))}
        </div>
        <div className="dv-updated">
          <div className="dv-updated-date">{checkedAt ? dayjs(checkedAt).format("M/D/YYYY") : "—"}</div>
          <div className="dv-updated-label">Latest update</div>
        </div>
      </aside>

      <div className="dv-main">
        <div className="dv-grid">
          <Panel title="Total permits issued" area="pie" onMore={() => setFull("kinds")}>
            {kindData.length ? <PieWithValues data={kindData} colourOf={(d) => palette[d.slot]} dark={dark} name="Permits" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Panel>

          <Panel title={scope === "healthcare" ? "ECC/CNC per list" : "ECC/CNC per province"} area="donut" onMore={() => setFull("provinces")}>
            {donutData.length ? (
              <PieWithValues
                data={donutData}
                inner={0.58}
                colourOf={(d) => colourOf(d.unit)}
                faded={(d) => !(scope === "all" || scope === "healthcare" || d.unit === scope)}
                dark={dark}
                name="ECC/CNC"
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>

          <Panel title="Industry classification" area="classes" extra={<span className="dv-panel-hint">top 15</span>} minHeight={460} onMore={() => setFull("classes")}>
            {classes.length ? (
              <Bar
                data={classes}
                xField="label"
                yField="value"
                height={Math.max(320, classes.length * 28 + 50)}
                paddingRight={56}
                theme={dark ? "classicDark" : "classic"}
                style={{ fill: BAR[dark ? "dark" : "light"], radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 18 }}
                axis={{ ...axis, x: { ...axis.x, labelFormatter: (v) => shorten(v) } }}
                annotations={outsideEnd(classes, ink)}
                tooltip={{ title: (d) => d.label, items: [{ field: "value", name: "Firms", valueFormatter: (v) => n(v) }] }}
                animate={motion("growInX")}
                interaction={tip}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classification encoded." />
            )}
          </Panel>

          <Panel title="ECC/CNC per municipality" area="city" extra={<span className="dv-panel-hint">top 5</span>} onMore={() => setFull("cities")}>
            {cities.length ? (
              <Bar
                data={cities}
                xField="label"
                yField="value"
                height={210}
                paddingRight={56}
                theme={dark ? "classicDark" : "classic"}
                style={{ fill: BAR[dark ? "dark" : "light"], radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 22 }}
                axis={{ ...axis, x: { ...axis.x, labelFormatter: (v) => shorten(v, 18) } }}
                annotations={outsideEnd(cities, ink)}
                tooltip={{ title: (d) => d.label, items: [{ field: "value", name: "Firms", valueFormatter: (v) => n(v) }] }}
                animate={motion("growInX")}
                interaction={tip}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>

          <Panel title="ECC/CNC per year" area="year" extra={peak && <span className="dv-panel-hint">peak {peak.year}: {n(peak.value)}</span>} onMore={() => setFull("years")}>
            {years.length ? (
              <Column
                data={years}
                xField="year"
                yField="value"
                height={210}
                paddingTop={22}
                theme={dark ? "classicDark" : "classic"}
                style={{ fill: BAR[dark ? "dark" : "light"], radiusTopLeft: 3, radiusTopRight: 3, maxWidth: 16 }}
                // A label every five years: thirty labels side by side cannot be read.
                axis={{ ...axis, x: { ...axis.x, labelFormatter: (v) => (Number(v) % 5 === 0 ? v : "") } }}
                annotations={
                  peak
                    ? [{ type: "text", data: [peak], encode: { x: "year", y: "value", text: (d) => n(d.value) }, style: { textAlign: "center", textBaseline: "bottom", dy: -6, fontSize: 12, fontWeight: 700, fill: ink }, tooltip: false }]
                    : []
                }
                tooltip={{ title: (d) => d.year, items: [{ field: "value", name: "ECC/CNC", valueFormatter: (v) => n(v) }] }}
                animate={motion("growInY")}
                interaction={tip}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>

          <Panel title="Geo-coordinates" area="map" minHeight={480}>
            <Suspense fallback={<div className="dv-center"><Spin /></div>}>
              <FirmMap scope={scope} colourOf={colourOf} dark={dark} token={admin ? null : token} mapKey={mapKey} />
            </Suspense>
          </Panel>
        </div>

        {full && (
          <FullData
            open
            onClose={() => setFull(null)}
            dark={dark}
            {...{
              kinds: { title: "Total permits issued — by kind", rows: kindData.map((d) => ({ label: d.type, value: d.value })), unit: "Permits" },
              provinces: { title: scope === "healthcare" ? "ECC/CNC per list" : "ECC/CNC per province", rows: [...donutData].sort((a, b) => b.value - a.value).map((d) => ({ label: d.type, value: d.value })), unit: "ECC/CNC" },
              classes: { title: "Industry classification — all", rows: allClasses, unit: "Firms" },
              cities: { title: "ECC/CNC per municipality — all", rows: allCities, unit: "Firms" },
              years: { title: "ECC/CNC per year — all years", rows: years.map((y) => ({ label: y.year, value: y.value })), unit: "ECC/CNC", horizontal: false },
            }[full]}
          />
        )}

        {admin && (
          <div ref={tableRef}>
            <Card
              size="small"
              className="dv-table"
              title={query ? `Firms matching “${query}”` : scope === "all" ? "All firms" : `Firms · ${scope === "healthcare" ? "Healthcare" : unitLabel(scope)}`}
              extra={query && <Button size="small" onClick={() => { setQuery(""); setSearch(""); }}>Clear search</Button>}
            >
              <FirmTable scope={scope} query={query} />
            </Card>
          </div>
        )}

        <div className="dv-ticker" aria-label="ECC/CNC per province">
          <div className="dv-ticker-track">
            {[0, 1].map((copy) => (
              <span key={copy} aria-hidden={copy === 1}>
                {[...provinces]
                  .sort((a, b) => (b.permits?.ecc || 0) - (a.permits?.ecc || 0))
                  .map((u) => (
                    <span key={u.unit} className="dv-ticker-item">
                      {unitLabel(u.unit)} <b>▲ {n(u.permits?.ecc)}</b>
                    </span>
                  ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
