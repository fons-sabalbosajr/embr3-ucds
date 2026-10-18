import { Empty } from "antd";
import { Bar, Column } from "@ant-design/plots";
import { FAMILY, KIND_LABEL, NO_COLOUR, REMAINING, SOURCES, n, pct, permitSplit, reducedMotion, unitLabel } from "./palette";

// ---------------------------------------------------------------------------
// The Progress Tracker's charts. Province charts are horizontal bars, one row
// per province or list, so long names read without tilting; the permit charts
// are columns, one per kind of permit — never one bar of all permits, as an
// ECC and a PTO are different things. Sources stack in a fixed order
// (baseline, ERMS, ECC Online) and keep their colour whatever is filtered;
// the highlighting chart uses the workbooks' own fill families, "No colour"
// first.
//
// Readable first: 12px text, the legend under the chart, each bar's total
// written at its end, a tooltip on every segment. The bars grow in when the
// chart appears — not for someone who asked their system for less motion.
// ---------------------------------------------------------------------------

const interaction = { tooltip: { css: { ".g2-tooltip": { "max-width": "min(300px, 80vw)", "white-space": "normal", "font-size": "12px" } } } };
const axisOf = (dark) => ({
  x: { title: false, labelFontSize: 12, labelFill: dark ? "#d9d9d6" : "#3a3a38" },
  y: { title: false, grid: true, gridLineDash: [3, 3], labelFormatter: (v) => n(v), labelFontSize: 11, labelFill: dark ? "#a6a6a3" : "#6b6b68" },
});
const legend = { color: { position: "bottom", itemLabelFontSize: 12, itemMarkerSize: 10, layout: { justifyContent: "center" } } };
const heightFor = (rows) => Math.max(180, rows * 40 + 90);
const surface = (dark) => (dark ? "#1f1f1f" : "#ffffff");
const ink = (dark) => (dark ? "#e6e6e3" : "#2b2b29");
const grow = (dir) => (reducedMotion() ? false : { enter: { type: dir === "x" ? "growInX" : "growInY", duration: 900, easing: "ease-out" } });
/** A total written at the end of each bar (horizontal) or over each column. */
const totalsAt = (rows, xKey, dark, horizontal) => ({
  type: "text",
  data: rows.filter((r) => r.total > 0),
  encode: { x: xKey, y: "total", text: (d) => n(d.total) },
  style: horizontal ? { textAlign: "left", textBaseline: "middle", dx: 6, fontSize: 12, fontWeight: 600, fill: ink(dark) } : { textAlign: "center", textBaseline: "bottom", dy: -6, fontSize: 12, fontWeight: 600, fill: ink(dark) },
  tooltip: false,
  animate: reducedMotion() ? false : { enter: { type: "fadeIn", delay: 700, duration: 400 } },
});

/** Firms per unit, stacked by source. */
export function CompositionChart({ units, dark }) {
  const rows = units.filter((u) => u.rows > 0);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No RAW data read yet." />;
  const data = rows.flatMap((u) => {
    const p = { base: u.base, erms: u.added.erms, ecconline: u.added.ecconline };
    return SOURCES.map((s) => ({ unit: unitLabel(u.unit), source: s.label, value: Math.max(0, p[s.key] || 0) }));
  });
  const totals = rows.map((u) => ({ unit: unitLabel(u.unit), total: u.rows }));
  return (
    <Bar
      data={data}
      paddingRight={64}
      xField="unit"
      yField="value"
      colorField="source"
      stack
      height={heightFor(rows.length)}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: SOURCES.map((s) => s.label), range: SOURCES.map((s) => (dark ? s.dark : s.light)) }, y: { nice: true } }}
      style={{ stroke: surface(dark), lineWidth: 2, maxWidth: 26, radius: 3 }}
      axis={axisOf(dark)}
      legend={legend}
      annotations={[totalsAt(totals, "unit", dark, true)]}
      tooltip={{ items: [{ channel: "y", valueFormatter: (v) => n(v) }] }}
      animate={grow("x")}
      interaction={interaction}
      aria-label="Firms per province by source"
    />
  );
}

/** Permits on the main sheets, one column per kind, stacked by source. `total`: a unit-shaped total. */
export function PermitKindChart({ total, kinds, dark }) {
  const data = kinds.flatMap((k) => {
    const p = permitSplit(total, k);
    return SOURCES.map((s) => ({ kind: KIND_LABEL[k] || k, source: s.label, value: p[s.key] || 0 }));
  });
  if (!data.some((d) => d.value)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No permits on the main sheets." />;
  const totals = kinds.map((k) => ({ kind: KIND_LABEL[k] || k, total: permitSplit(total, k).total }));
  return (
    <Column
      data={data}
      paddingTop={26}
      xField="kind"
      yField="value"
      colorField="source"
      stack
      height={320}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: SOURCES.map((s) => s.label), range: SOURCES.map((s) => (dark ? s.dark : s.light)) }, y: { nice: true } }}
      style={{ stroke: surface(dark), lineWidth: 2, maxWidth: 56, radiusTopLeft: 4, radiusTopRight: 4 }}
      axis={axisOf(dark)}
      legend={legend}
      annotations={[totalsAt(totals, "kind", dark, false)]}
      tooltip={{ items: [{ channel: "y", valueFormatter: (v) => n(v) }] }}
      animate={grow("y")}
      interaction={interaction}
      aria-label="Permits on the main sheets by kind and source"
    />
  );
}

/**
 * The newly issued permits, one column per kind: those already in the RAW
 * data (on baseline firms, with ERMS additions, with ECC Online additions)
 * and those not yet encoded. `byKind`: { kind: { issued, inRaw, bySource } }.
 */
export function IssuedKindChart({ byKind, kinds, dark }) {
  const parts = [
    ...SOURCES.map((s) => ({ key: s.key, label: s.key === "base" ? "Encoded · baseline" : `Encoded · ${s.label}`, colour: dark ? s.dark : s.light })),
    { key: "left", label: REMAINING.label, colour: dark ? REMAINING.dark : REMAINING.light },
  ];
  const data = kinds.flatMap((k) => {
    const x = byKind?.[k] || { issued: 0, inRaw: 0, bySource: {} };
    return parts.map((p) => ({ kind: KIND_LABEL[k] || k, part: p.label, value: p.key === "left" ? Math.max(0, x.issued - x.inRaw) : x.bySource?.[p.key] || 0 }));
  });
  if (!data.some((d) => d.value)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No newly issued permit lists read yet." />;
  const totals = kinds.map((k) => ({ kind: KIND_LABEL[k] || k, total: byKind?.[k]?.issued || 0, done: pct(byKind?.[k]?.inRaw || 0, byKind?.[k]?.issued || 0) }));
  return (
    <Column
      data={data}
      paddingTop={26}
      xField="kind"
      yField="value"
      colorField="part"
      stack
      height={340}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: parts.map((p) => p.label), range: parts.map((p) => p.colour) }, y: { nice: true } }}
      style={{ stroke: surface(dark), lineWidth: 2, maxWidth: 56, radiusTopLeft: 4, radiusTopRight: 4 }}
      axis={axisOf(dark)}
      legend={legend}
      tooltip={{ items: [{ channel: "y", valueFormatter: (v) => n(v) }] }}
      annotations={[{ ...totalsAt(totals, "kind", dark, false), encode: { x: "kind", y: "total", text: (d) => `${d.done}% of ${n(d.total)}` } }]}
      animate={grow("y")}
      interaction={interaction}
      aria-label="Newly issued permits by kind: encoded and still to encode"
    />
  );
}

/** The share of each unit's baseline firms highlighted as updated, as a percentage. */
export function ReviewedChart({ units, color, dark }) {
  const rows = units.filter((u) => u.base > 0);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No RAW data read yet." />;
  const data = rows.map((u) => ({ unit: unitLabel(u.unit), value: pct(u.coloredBase, u.base), done: u.coloredBase, of: u.base }));
  return (
    <Bar
      data={data}
      paddingRight={64}
      xField="unit"
      yField="value"
      height={heightFor(rows.length)}
      theme={dark ? "classicDark" : "classic"}
      scale={{ y: { domain: [0, 100] } }}
      style={{ fill: color, radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 20 }}
      axis={{ ...axisOf(dark), y: { ...axisOf(dark).y, labelFormatter: (v) => `${v}%` } }}
      label={{ text: (d) => `${d.value}%`, position: "right", dx: 6, fontSize: 12, fontWeight: 600, fill: ink(dark) }}
      tooltip={{ title: (d) => d.unit, items: [{ field: "done", name: "Highlighted", valueFormatter: (v) => n(v) }, { field: "of", name: "Baseline firms", valueFormatter: (v) => n(v) }] }}
      animate={grow("x")}
      interaction={interaction}
      aria-label="Baseline firms highlighted, per province"
    />
  );
}

/**
 * Rows per unit by the workbooks' colour: "No colour" (baseline firms not yet
 * highlighted) first, then each colour family in the legend's order.
 */
export function FamilyChart({ units, families, dark }) {
  const rows = units.filter((u) => u.base > 0 || u.colours?.length);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No highlighting yet." />;
  const used = families.filter((f) => rows.some((u) => u.colours.some((c) => c.family === f)));
  const series = [{ key: NO_COLOUR.key, label: NO_COLOUR.label, hex: NO_COLOUR.hex }, ...used.map((f) => ({ key: f, label: FAMILY[f]?.label || f, hex: FAMILY[f]?.hex || "#bfbfbf" }))];
  const data = rows.flatMap((u) =>
    series.map((s) => ({ unit: unitLabel(u.unit), family: s.label, white: s.key === NO_COLOUR.key, value: s.key === NO_COLOUR.key ? u.notModified : u.colours.find((c) => c.family === s.key)?.rows || 0 }))
  );
  return (
    <Bar
      data={data}
      paddingRight={64}
      xField="unit"
      yField="value"
      colorField="family"
      stack
      height={heightFor(rows.length)}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: series.map((s) => s.label), range: series.map((s) => s.hex) }, y: { nice: true } }}
      // White on a white card needs an outline; the colours keep the 2px surface gap.
      style={{ stroke: (d) => (d.white ? NO_COLOUR.stroke : surface(dark)), lineWidth: (d) => (d.white ? 1 : 2), maxWidth: 26 }}
      axis={axisOf(dark)}
      legend={legend}
      tooltip={{ items: [{ channel: "y", valueFormatter: (v) => `${n(v)} rows` }] }}
      animate={grow("x")}
      interaction={interaction}
      aria-label="Rows per province by colour, no colour first"
    />
  );
}
