import { Empty } from "antd";
import { Bar, Column, Pie } from "@ant-design/plots";
import useScreen from "../../../shared/useScreen";

// ---------------------------------------------------------------------------
// The ERMS dashboards' charts (@ant-design/plots), shared by the Records,
// Legal Services and Laboratory dashboards.
//
// Kinds of document are identities, so they get a fixed categorical palette
// in a fixed order — the same hue for the same kind whatever is filtered
// out — validated for colour-vision deficiency in both modes (the dataviz
// reference palette). Province and year are magnitudes: one hue, the
// theme's primary or the unit's accent. Every chart carries visible labels
// or an axis, and a tooltip; colour never stands alone.
// ---------------------------------------------------------------------------

const CATEGORICAL = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// The floating labels — tooltips — wrap instead of running off the card: a
// project type or a document kind can be sixty characters long, and G2 keeps
// its tooltip title on one line, cut with an ellipsis, by default. Narrower
// than the screen on a phone.
const WRAP = { "white-space": "normal", "overflow-wrap": "anywhere", "word-break": "break-word", "text-overflow": "clip", overflow: "visible" };
const interaction = {
  tooltip: {
    css: {
      ".g2-tooltip": { "max-width": "min(280px, 80vw)", "white-space": "normal" },
      ".g2-tooltip-title": WRAP,
      ".g2-tooltip-list-item-name-label": WRAP,
    },
  },
};

// A category axis whose labels are names, not numbers: wrapped onto up to
// three lines, then cut — never laid over the bars or each other.
/** A chart's height: as asked on a larger screen, no more than 220px on a phone. */
const useHeight = (height) => {
  const { phone } = useScreen();
  return phone ? Math.min(height, 220) : height;
};

const nameAxis = { title: false, labelFontSize: 11, labelAutoWrap: { wordWrapWidth: 110, maxLines: 3 }, labelAutoEllipsis: true };

/**
 * A donut of parts of a whole. `rows`: [{ key, label, count }] in the fixed
 * order the palette follows; beyond seven, the rest fold into "Other".
 */
export const DonutChart = ({ rows, total, dark, height: asked = 260 }) => {
  const height = useHeight(asked);
  const nonEmpty = (rows || []).filter((r) => r.count > 0);
  if (!nonEmpty.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing filed yet" />;
  const head = nonEmpty.slice(0, 6);
  const rest = nonEmpty.slice(6).reduce((s, r) => s + r.count, 0);
  const data = [...head.map((r) => ({ type: r.label, value: r.count })), ...(rest ? [{ type: "Other", value: rest }] : [])];
  const palette = CATEGORICAL[dark ? "dark" : "light"];
  const whole = total || data.reduce((s, d) => s + d.value, 0);
  return (
    <Pie
      data={data}
      angleField="value"
      colorField="type"
      innerRadius={0.62}
      radius={0.9}
      height={height}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: data.map((d) => d.type), range: palette.slice(0, data.length) } }}
      style={{ stroke: dark ? "#1a1a19" : "#ffffff", lineWidth: 2 }}
      label={{ text: (d) => `${Math.round((d.value / whole) * 100)}%`, position: "outside", fontSize: 11, connector: true }}
      legend={{ color: { position: "bottom", itemLabelFontSize: 11 } }}
      tooltip={{ title: (d) => d.type, items: [{ field: "value", name: "Documents", valueFormatter: (v) => fmt(v) }] }}
      animate={false}
      interaction={interaction}
    />
  );
};

/** Horizontal bars, largest first. `rows`: [{ label, count }]. */
export const MagnitudeBars = ({ rows, color, dark, height: asked = 260, name = "Documents" }) => {
  const height = useHeight(asked);
  if (!rows?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing filed yet" />;
  const data = [...rows].map((r) => ({ label: r.label, count: r.count })).sort((a, b) => b.count - a.count);
  return (
    <Bar
      data={data}
      xField="label"
      yField="count"
      height={height}
      theme={dark ? "classicDark" : "classic"}
      style={{ fill: color, radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 22 }}
      axis={{ x: nameAxis, y: { title: false, grid: true, labelFormatter: (v) => fmt(v), labelFontSize: 11 } }}
      tooltip={{ title: (d) => d.label, items: [{ field: "count", name, valueFormatter: (v) => fmt(v) }] }}
      animate={false}
      interaction={interaction}
    />
  );
};

/**
 * Uploads per month, stacked by kind — the desktop system's monthly upload
 * views. `months`: [{ month: "2026-09", total, kinds: { <code>: n } }];
 * `kinds`: [{ code, label }] in the fixed order the palette follows (beyond
 * six, the rest fold into "Other", as the donut does). Each column's total
 * is labelled over it, so the counts never rest on colour alone.
 */
export const MonthStack = ({ months, kinds, dark, height: asked = 280, name = "Uploads" }) => {
  const height = useHeight(asked);
  const rows = months || [];
  if (!rows.some((m) => m.total > 0)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing uploaded in the last twelve months" />;
  // A kind's colour is its slot in the fixed order, whatever else was filed
  // that year, so it matches the donut above: ECC (Amended) is never blue
  // because no ECC (Original) happened to be filed. Kinds past the sixth
  // slot, and any not in the list, share "Other".
  const present = new Set(rows.flatMap((m) => Object.keys(m.kinds || {}).filter((c) => m.kinds[c] > 0)));
  const fixed = kinds || [];
  const head = fixed.slice(0, 6).map((k, slot) => ({ ...k, slot })).filter((k) => present.has(k.code));
  const fold = new Set([...present].filter((c) => !head.some((k) => k.code === c)));
  const series = [...head.map((k) => k.label), ...(fold.size ? ["Other"] : [])];
  const labelOf = Object.fromEntries(head.map((k) => [k.code, k.label]));
  const short = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

  const data = [];
  for (const m of rows) {
    const other = [...fold].reduce((s, c) => s + (m.kinds?.[c] || 0), 0);
    for (const k of head) data.push({ month: short(m.month), kind: labelOf[k.code], count: m.kinds?.[k.code] || 0 });
    if (fold.size) data.push({ month: short(m.month), kind: "Other", count: other });
  }
  const totals = rows.map((m) => ({ month: short(m.month), total: m.total }));
  const palette = CATEGORICAL[dark ? "dark" : "light"];

  return (
    <Column
      data={data}
      xField="month"
      yField="count"
      colorField="kind"
      stack
      height={height}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: series, range: [...head.map((k) => palette[k.slot]), ...(fold.size ? [palette[6]] : [])] } }}
      // A 2px surface gap between stacked segments.
      style={{ stroke: dark ? "#1a1a19" : "#ffffff", lineWidth: 2, maxWidth: 28 }}
      axis={{ x: { title: false, labelFontSize: 11 }, y: { title: false, grid: true, labelFormatter: (v) => fmt(v), labelFontSize: 11 } }}
      legend={{ color: { position: "bottom", itemLabelFontSize: 11 } }}
      tooltip={{ items: [{ channel: "y", valueFormatter: (v) => fmt(v) }] }}
      annotations={[
        {
          type: "text",
          data: totals.filter((t) => t.total > 0),
          encode: { x: "month", y: "total", text: (d) => fmt(d.total) },
          style: { textAlign: "center", textBaseline: "bottom", dy: -4, fontSize: 11, fill: dark ? "#d9d9d6" : "#4a4a47" },
          tooltip: false,
        },
      ]}
      animate={false}
      interaction={interaction}
      aria-label={`${name} per month`}
    />
  );
};

/** Columns per year, the most recent `years`. `rows`: [{ year, count }]. */
export const YearColumns = ({ rows, color, dark, height: asked = 260, years = 12, name = "Documents" }) => {
  const height = useHeight(asked);
  const data = [...(rows || [])]
    .filter((y) => y.year)
    .sort((a, b) => b.year - a.year)
    .slice(0, years)
    .reverse()
    .map((y) => ({ year: String(y.year), count: y.count }));
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No dated documents" />;
  return (
    <Column
      data={data}
      xField="year"
      yField="count"
      height={height}
      theme={dark ? "classicDark" : "classic"}
      style={{ fill: color, radiusTopLeft: 4, radiusTopRight: 4, maxWidth: 28 }}
      axis={{ x: { title: false, labelFontSize: 11 }, y: { title: false, grid: true, labelFormatter: (v) => fmt(v), labelFontSize: 11 } }}
      tooltip={{ title: (d) => d.year, items: [{ field: "count", name, valueFormatter: (v) => fmt(v) }] }}
      animate={false}
      interaction={interaction}
    />
  );
};
