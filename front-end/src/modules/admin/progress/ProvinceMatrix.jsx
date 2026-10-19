import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Dropdown, Empty, Input, Modal, Progress, Row, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import { BgColorsOutlined, CloudOutlined, DesktopOutlined, DownOutlined, EditOutlined, FileExcelOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { saveLegend } from "./progressService";
import { FamilyChart } from "./charts";
import { DOT_CLASS, FAMILY, KIND_LABEL, MASTERLIST, MASTERLIST_FAMILY, NO_COLOUR, SOURCES, addedOf, kindsShown, n, pct, permitSplit, plus, shadeName, signed, sum, unitLabel } from "./palette";

// ---------------------------------------------------------------------------
// The old UCD Tracking System (the "tracking_v3" sheet of UCD TRACKING
// SYSTEM.xlsx), live and turned on its side so it fits the page: one row per
// province (or per 2027 list), with
//
//   - the firms on its MAIN worksheet: the baseline and those added from ERMS
//     and from ECC Online, as a stacked bar with the numbers beside it;
//   - the permits on them, split the same way;
//   - how many baseline firms are highlighted as updated;
//   - the newly issued permits already written in;
//   - the rows waiting on review sheets and those set aside.
//
// And its "conditional highlighting" legend: per province, what each fill
// colour means and the rows carrying it — the shades of a colour merged into
// one family, with the shades listed under it. White (no fill) is "not yet
// highlighted".
// ---------------------------------------------------------------------------

const { Text } = Typography;

/** A stacked bar: [{ key, value, title }], the segments in order, a 2px gap between. */
export function StackBar({ parts, thin }) {
  const total = parts.reduce((a, p) => a + (p.value || 0), 0);
  return (
    <div className={`pt-stack${thin ? " is-thin" : ""}`} role="img" aria-label={parts.map((p) => `${p.title}: ${n(p.value)}`).join(", ")}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <Tooltip key={p.key} title={`${p.title}: ${n(p.value)} (${pct(p.value, total)}%)`}>
              <span style={{ width: `${(p.value / total) * 100}%`, background: `var(--pt-${p.key === "ecconline" ? "ecc" : p.key})` }} />
            </Tooltip>
          ))}
    </div>
  );
}

/**
 * Open a tracked workbook: in Excel for the web, in the Excel app, or its
 * shared folder. `files`: [{ name, webUrl, appUrl, folderUrl }] — a province
 * has one workbook; a list may span several.
 */
export function OpenFileButton({ files = [], size = "small", label = "Open" }) {
  const list = files.filter((f) => f.webUrl || f.appUrl || f.folderUrl);
  if (!list.length) return null;
  const go = (url) => window.open(url, url.startsWith("ms-excel:") ? "_self" : "_blank", "noopener,noreferrer");
  const itemsFor = (f, prefix = "") => [
    f.webUrl && { key: `${prefix}web`, icon: <CloudOutlined />, label: "Open in Excel for the web", onClick: () => go(f.webUrl) },
    f.appUrl && { key: `${prefix}app`, icon: <DesktopOutlined />, label: "Open in the Excel app", onClick: () => go(f.appUrl) },
    f.folderUrl && { key: `${prefix}folder`, icon: <FolderOpenOutlined />, label: "Open the shared folder", onClick: () => go(f.folderUrl) },
  ].filter(Boolean);
  const items =
    list.length === 1
      ? itemsFor(list[0])
      : list.map((f, i) => ({ key: `f${i}`, type: "group", label: f.name.replace(/\.xls[xm]?$/i, ""), children: itemsFor(f, `f${i}-`) }));
  const first = list[0];
  const tip = "Excel for the web and the app ask you to sign in to SharePoint with access to the file; the shared folder opens with its link.";
  return list.length === 1 && first.webUrl ? (
    <Tooltip title={tip}>
      <Dropdown.Button size={size} menu={{ items }} onClick={() => go(first.webUrl)} icon={<DownOutlined />}>
        <FileExcelOutlined /> {label}
      </Dropdown.Button>
    </Tooltip>
  ) : (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <Tooltip title={tip}>
        <Button size={size} icon={<FileExcelOutlined />}>
          {label} <DownOutlined />
        </Button>
      </Tooltip>
    </Dropdown>
  );
}

/** What violet, green and blue mean — shown once, above the tabs. */
export const ColourKey = () => (
  <div className="pt-key" aria-label="Colour key">
    {SOURCES.map((s) => (
      <Tooltip key={s.key} title={s.hint}>
        <span className="pt-key-item">
          <span className={`pt-dot ${DOT_CLASS[s.key]}`} />
          {s.label}
        </span>
      </Tooltip>
    ))}
  </div>
);

/** Parts of a cell: the number beside each colour, so a segment never rests on colour alone. */
const Parts = ({ items }) => (
  <div className="pt-cell-parts">
    {items.map((p) => (
      <Tooltip key={p.key} title={p.title}>
        <span>
          <span className={`pt-dot ${DOT_CLASS[p.key]}`} />
          <Text type={p.key === "base" ? undefined : "secondary"}>{p.key === "base" ? n(p.value) : plus(p.value)}</Text>
        </span>
      </Tooltip>
    ))}
  </div>
);

const firmParts = (u) => [
  { key: "base", value: u.base, title: "Baseline firms" },
  { key: "erms", value: u.added.erms, title: "Added from ERMS" },
  { key: "ecconline", value: u.added.ecconline, title: "Added from ECC Online" },
  ...(u.added.other ? [{ key: "other", value: u.added.other, title: "Added, other source" }] : []),
];
/** One kind of permit's parts: baseline firms, ERMS additions, ECC Online additions. */
const kindParts = (u, k) => {
  const p = permitSplit(u, k);
  return [
    { key: "base", value: p.base, title: `${KIND_LABEL[k]} on baseline firms` },
    { key: "erms", value: p.erms, title: `${KIND_LABEL[k]} on firms added from ERMS` },
    { key: "ecconline", value: p.ecconline, title: `${KIND_LABEL[k]} on firms added from ECC Online` },
    ...(p.other ? [{ key: "other", value: p.other, title: `${KIND_LABEL[k]} on firms added from other sources` }] : []),
  ];
};

/** Numbers added into `into`, nested objects alike. */
const addInto = (into, from) => {
  for (const [k, v] of Object.entries(from || {})) {
    if (typeof v === "number") into[k] = (into[k] || 0) + v;
    else if (v && typeof v === "object" && !Array.isArray(v)) addInto((into[k] ||= {}), v);
  }
  return into;
};

/** Totals of a set of units, in the same shape. */
export function totalOf(units, name = "Total") {
  const t = { unit: name, rows: 0, base: 0, added: { erms: 0, ecconline: 0, other: 0 }, addedPermitsBy: { erms: 0, ecconline: 0, other: 0 }, addedPermitsByKind: { erms: {}, ecconline: {}, other: {} }, issuedByKind: {}, permits: {}, addedPermits: {}, baselinePermits: {}, coloredBase: 0, notModified: 0, review: 0, duplicate: 0, delisting: 0, deletion: 0, issued: 0, inRaw: 0, baselineRows: 0, reviewSheets: {}, pending: { erms: 0, ecconline: 0, other: 0 }, files: [] };
  for (const u of units) {
    const { unit: _u, group: _g, colours: _c, files: _f, ...counts } = u;
    addInto(t, counts);
  }
  return t;
}

const FirmsCell = ({ u }) => (
  <div className="pt-cell">
    <div className="pt-cell-top">
      <b>{n(u.rows)}</b>
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        {addedOf(u) ? `${pct(addedOf(u), u.rows)}% added` : "none added"}
      </Text>
    </div>
    <StackBar parts={firmParts(u)} />
    <Parts items={firmParts(u).filter((p) => p.key !== "other" || p.value)} />
  </div>
);

/** One kind of permit for a unit: its count, the bar by source, and the parts. */
const KindCell = ({ u, k }) => {
  const parts = kindParts(u, k);
  const total = permitSplit(u, k).total;
  if (!total) return <Text type="secondary">—</Text>;
  return (
    <div className="pt-cell">
      <div className="pt-cell-top">
        <b>{n(total)}</b>
        {u.rows > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {pct(total, u.rows)}% of firms
          </Text>
        )}
      </div>
      <StackBar thin parts={parts} />
      <Parts items={parts.filter((p) => p.key !== "other" || p.value)} />
    </div>
  );
};

const HighlightCell = ({ u, accent }) => (
  <Tooltip title={`${n(u.coloredBase)} of ${n(u.base)} baseline firms coloured as updated · ${n(u.notModified)} untouched`}>
    <div className="pt-cell">
      <Progress percent={pct(u.coloredBase, u.base)} size="small" strokeColor={accent} style={{ margin: 0 }} />
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        {n(u.coloredBase)} / {n(u.base)}
      </Text>
    </div>
  </Tooltip>
);

const EncodedCell = ({ u, accent }) =>
  u.issued ? (
    <Tooltip title={`${n(u.inRaw)} of ${n(u.issued)} newly issued permits are in the RAW data`}>
      <div className="pt-cell">
        <Progress percent={pct(u.inRaw, u.issued)} size="small" strokeColor={accent} style={{ margin: 0 }} />
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {n(u.inRaw)} / {n(u.issued)}
        </Text>
      </div>
    </Tooltip>
  ) : (
    <Text type="secondary">—</Text>
  );

const AsideCell = ({ u }) => (
  <Tooltip
    title={
      <div>
        {Object.entries(u.reviewSheets || {}).map(([s, c]) => (
          <div key={s}>
            {s}: {n(c)}
          </div>
        ))}
        <div>Duplicates: {n(u.duplicate)}</div>
        <div>For delisting: {n(u.delisting)}</div>
        <div>For deletion: {n(u.deletion)}</div>
      </div>
    }
  >
    <div className="pt-cell" style={{ fontSize: 12 }}>
      <span>
        <b>{n(u.review)}</b> <Text type="secondary">to review</Text>
      </span>
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        {n(u.duplicate + u.delisting + u.deletion)} set aside
      </Text>
    </div>
  </Tooltip>
);

/** One unit's permits, kind by kind, split by source: a small table. */
export function KindBreakdown({ u, stale }) {
  const kinds = kindsShown((k) => u.permits?.[k] || u.baselinePermits?.[k]);
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="kind"
      dataSource={kinds.map((k) => ({ kind: k, ...permitSplit(u, k), season: (u.permits?.[k] || 0) - (u.baselinePermits?.[k] || 0) }))}
      columns={[
        { title: "Permit", dataIndex: "kind", render: (k) => <b>{KIND_LABEL[k] || k}</b> },
        { title: <Space size={4}><span className="pt-dot is-base" />Baseline</Space>, dataIndex: "base", align: "right", render: n },
        { title: <Space size={4}><span className="pt-dot is-erms" />ERMS</Space>, dataIndex: "erms", align: "right", render: (v) => (v ? plus(v) : <Text type="secondary">0</Text>) },
        { title: <Space size={4}><span className="pt-dot is-ecc" />ECC Online</Space>, dataIndex: "ecconline", align: "right", render: (v) => (v ? plus(v) : <Text type="secondary">0</Text>) },
        { title: "Now", dataIndex: "total", align: "right", render: (v) => <b>{n(v)}</b> },
        { title: "Split", key: "bar", width: 120, render: (_, r) => <StackBar thin parts={kindParts(u, r.kind)} /> },
        ...(stale ? [] : [{ title: "Since baseline", dataIndex: "season", align: "right", render: (v) => <Text type={v ? undefined : "secondary"}>{signed(v)}</Text> }]),
      ]}
    />
  );
}

/** One unit's permits by kind and its review sheets: the row's expansion. */
function UnitDetail({ u, stale }) {
  return (
    <Row gutter={[16, 12]}>
      <Col xs={24} lg={15}>
        <KindBreakdown u={u} stale={stale} />
      </Col>
      <Col xs={24} lg={9}>
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Text strong>Not on the main sheet</Text>
          {Object.entries(u.reviewSheets || {}).map(([s, c]) => (
            <div key={s} className="pt-summary-row">
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>Review</Tag>
              <span>{s}</span>
              <b>{n(c)}</b>
            </div>
          ))}
          {sum(u.pending) > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Of these, {n(u.pending.erms)} came from ERMS and {n(u.pending.ecconline)} from ECC Online and wait for the duplicate check.
            </Text>
          )}
          {[["Duplicates", u.duplicate], ["For delisting", u.delisting], ["For deletion", u.deletion]].map(([l, v]) => (
            <div key={l} className="pt-summary-row">
              <Tag style={{ marginInlineEnd: 0 }}>Set aside</Tag>
              <span>{l}</span>
              <b>{n(v)}</b>
            </div>
          ))}
        </Space>
      </Col>
    </Row>
  );
}

/** A table's total row: the same cells, over every unit of the group. */
const totalRow = (columns, total, expandable = true) => (
  <Table.Summary fixed>
    <Table.Summary.Row>
      {expandable && <Table.Summary.Cell index={0} />}
      {columns.map((c, i) => (
        <Table.Summary.Cell key={c.key} index={i + (expandable ? 1 : 0)}>
          {c.key === "unit" ? "Total" : c.key === "open" ? null : c.render(null, total)}
        </Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  </Table.Summary>
);
const unitColumn = { title: "Province", key: "unit", width: "14%", render: (_, u) => <span className="pt-unit-name">{unitLabel(u.unit)}</span> };
const openColumn = { title: "Excel", key: "open", width: 112, render: (_, u) => <OpenFileButton files={u.files} /> };

/** The firms table for one group of units, fitted to the page. */
export function UnitTable({ units, accent, stale }) {
  if (!units.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing read in this group yet." />;
  const total = totalOf(units);
  const columns = [
    unitColumn,
    { title: "Firms", key: "firms", width: "30%", render: (_, u) => <FirmsCell u={u} /> },
    { title: "Highlighted", key: "hl", width: "16%", render: (_, u) => <HighlightCell u={u} accent={accent} /> },
    { title: "Newly issued", key: "enc", width: "15%", render: (_, u) => <EncodedCell u={u} accent={accent} /> },
    { title: "Review", key: "aside", width: "13%", render: (_, u) => <AsideCell u={u} /> },
    openColumn,
  ];
  return (
    <Table
      className="pt-units"
      size="small"
      rowKey="unit"
      pagination={false}
      tableLayout="fixed"
      columns={columns}
      dataSource={units}
      scroll={{ x: 900 }}
      expandable={{ expandedRowRender: (u) => <UnitDetail u={u} stale={stale} /> }}
      summary={() => (units.length > 1 ? totalRow(columns, total) : null)}
    />
  );
}

/** Permits per unit, one column per kind — each kind on its own, never added together. */
export function PermitTable({ units }) {
  if (!units.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing read in this group yet." />;
  const total = totalOf(units);
  const kinds = kindsShown((k) => total.permits?.[k]);
  const columns = [
    unitColumn,
    ...kinds.map((k) => ({ title: KIND_LABEL[k] || k, key: k, render: (_, u) => <KindCell u={u} k={k} /> })),
    openColumn,
  ];
  return (
    <Table
      className="pt-units"
      size="small"
      rowKey="unit"
      pagination={false}
      tableLayout="fixed"
      columns={columns}
      dataSource={units}
      scroll={{ x: 160 + kinds.length * 150 + 112 }}
      summary={() => (units.length > 1 ? totalRow(columns, total, false) : null)}
    />
  );
}

/** The newly issued permits per unit, one column per kind: how many are already in the RAW data. */
export function IssuedTable({ units, kinds, accent }) {
  const shown = units.filter((u) => u.issued > 0);
  if (!shown.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No newly issued permits for this group." />;
  const total = totalOf(shown);
  const cell = (x) =>
    x?.issued ? (
      <Tooltip title={`${n(x.inRaw)} of ${n(x.issued)} in the RAW data · ${n(x.issued - x.inRaw)} to encode`}>
        <div className="pt-cell">
          <Progress percent={pct(x.inRaw, x.issued)} size="small" strokeColor={accent} style={{ margin: 0 }} />
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {n(x.inRaw)} / {n(x.issued)}
          </Text>
        </div>
      </Tooltip>
    ) : (
      <Text type="secondary">—</Text>
    );
  const columns = [unitColumn, ...kinds.map((k) => ({ title: KIND_LABEL[k] || k, key: k, render: (_, u) => cell(u.issuedByKind?.[k]) }))];
  return (
    <Table
      className="pt-units"
      size="small"
      rowKey="unit"
      pagination={false}
      tableLayout="fixed"
      columns={columns}
      dataSource={shown}
      scroll={{ x: 160 + kinds.length * 130 }}
      summary={() => (shown.length > 1 ? totalRow(columns, total, false) : null)}
    />
  );
}

const Swatch = ({ rgb, family, small }) => (
  <span className={`pt-swatch${small ? " is-small" : ""}`} style={{ background: rgb ? `#${rgb}` : FAMILY[family]?.hex || "#fff" }} />
);

function LegendModal({ open, onClose, seasonId, matrix, legend, families, queryKey }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (open) setDraft(JSON.parse(JSON.stringify(legend || {})));
  }, [open, legend]);
  const save = useMutation({
    mutationFn: () => saveLegend({ id: seasonId, legend: draft }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      message.success("Colour legend saved.");
      onClose();
    },
    onError: (e) => message.error(e?.response?.data?.message || "The legend could not be saved."),
  });
  // Every province in the matrix, with the colours it uses and those its legend names.
  const units = matrix.map((u) => u.unit);
  for (const u of Object.keys(legend || {})) if (!units.includes(u)) units.push(u);
  const set = (unit, fam, value) => setDraft((d) => ({ ...d, [unit]: { ...(d[unit] || {}), [fam]: value } }));
  return (
    <Modal open={open} title="Colour legend" onCancel={onClose} onOk={() => save.mutate()} okText="Save" confirmLoading={save.isPending} width={760} destroyOnHidden>
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        What each fill colour means in each province&rsquo;s main sheet. Light and dark shades of a colour count as one. Leave a meaning blank to show the colour without one.
      </Text>
      <div style={{ maxHeight: "60vh", overflowY: "auto", paddingInlineEnd: 6 }}>
        {units.map((unit) => {
          const used = (matrix.find((u) => u.unit === unit)?.colours || []).map((c) => c.family);
          const fams = families.filter((f) => used.includes(f) || draft[unit]?.[f] !== undefined);
          const extra = families.filter((f) => !fams.includes(f));
          return (
            <Card key={unit} size="small" title={unitLabel(unit)} style={{ marginBottom: 10 }}>
              <Row gutter={[8, 8]}>
                {fams.map((f) => (
                  <Col key={f} xs={24} md={12}>
                    <Input prefix={<Swatch family={f} small />} addonBefore={FAMILY[f]?.label || f} value={draft[unit]?.[f] || ""} onChange={(e) => set(unit, f, e.target.value)} placeholder={used.includes(f) ? "Meaning" : "Meaning (not used yet)"} />
                  </Col>
                ))}
              </Row>
              {extra.length > 0 && (
                <Space size={4} wrap style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Add a colour:</Text>
                  {extra.map((f) => (
                    <Button key={f} size="small" onClick={() => set(unit, f, "")} icon={<Swatch family={f} small />}>
                      {FAMILY[f]?.label || f}
                    </Button>
                  ))}
                </Space>
              )}
            </Card>
          );
        })}
      </div>
    </Modal>
  );
}

/** One unit's highlighting: progress, then a row per colour family with its shades under it. */
function HighlightCard({ u, accent }) {
  const coloured = u.colours.reduce((a, c) => a + c.rows, 0);
  // No colour first — the firms nobody has touched — then the colours.
  const rows = [
    { key: NO_COLOUR.key, family: NO_COLOUR.key, label: "Not yet highlighted", rows: u.notModified, shades: [], white: true },
    ...u.colours.map((c) => ({ key: c.family, ...c })),
  ];
  return (
    <Card
      size="small"
      className="pt-hl-card"
      title={unitLabel(u.unit)}
      extra={
        <Space size={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>{n(u.base)} baseline firms</Text>
          <OpenFileButton files={u.files} />
        </Space>
      }
    >
      <div className="pt-hl-progress">
        <Progress type="circle" size={58} percent={pct(u.coloredBase, u.base)} strokeColor={accent} format={(p) => <span style={{ fontSize: 13, fontWeight: 600 }}>{Math.round(p)}%</span>} />
        <div className="pt-hl-progress-text">
          <Text>
            <b>{n(u.coloredBase)}</b> highlighted as updated
          </Text>
          <Text type="secondary">{n(u.notModified)} not yet touched</Text>
          {addedOf(u) > 0 && (
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              The marker on the {n(addedOf(u))} added firms is not counted.
            </Text>
          )}
        </div>
      </div>
      <Table
        className="pt-hl-table"
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={rows}
        showHeader
        columns={[
          {
            title: "Colour",
            key: "c",
            width: 130,
            render: (_, r) => (
              <Space size={6}>
                <Swatch rgb={r.white ? "FFFFFF" : r.shades[0]?.rgb} family={r.family} />
                <span>{r.white ? "No colour" : FAMILY[r.family]?.label || r.family}</span>
              </Space>
            ),
          },
          {
            title: "Meaning",
            key: "m",
            render: (_, r) => (r.white ? <Text type="secondary">Not yet highlighted</Text> : r.label ? r.label : <Tag style={{ marginInlineEnd: 0 }}>No meaning set</Tag>),
          },
          {
            title: "Rows",
            key: "r",
            width: 110,
            align: "right",
            render: (_, r) => (
              <Tooltip title={r.white ? `${pct(r.rows, u.base)}% of the baseline firms` : `${pct(r.rows, coloured)}% of the highlighted rows${r.baseline ? ` · ${n(r.baseline)} at the season baseline` : ""}`}>
                <div className="pt-cell" style={{ alignItems: "flex-end" }}>
                  <b>{n(r.rows)}</b>
                  {!r.white && <Progress percent={pct(r.rows, coloured)} showInfo={false} size="small" strokeColor={FAMILY[r.family]?.hex} style={{ margin: 0, width: 80 }} />}
                </div>
              </Tooltip>
            ),
          },
        ]}
        expandable={{
          rowExpandable: (r) => r.shades?.length > 1,
          expandedRowRender: (r) => (
            <div className="pt-shades" aria-label={`Shades of ${r.family}`}>
              {r.shades.map((s) => (
                <div key={s.rgb} className="pt-shade">
                  <Swatch rgb={s.rgb} small />
                  <span style={{ width: 62 }}>{shadeName(s.rgb)}</span>
                  <code>#{s.rgb}</code>
                  <span style={{ flex: 1 }} />
                  <Text>{n(s.rows)} rows</Text>
                </div>
              ))}
            </div>
          ),
        }}
      />
    </Card>
  );
}

/** The conditional-highlighting pane for one group: a chart across the units, then a card each. */
export function HighlightingPanel({ units, legend, families, seasonId, queryKey, accent, dark, matrix, readOnly = false, masterlistNames = {} }) {
  const [editing, setEditing] = useState(false);
  const shown = useMemo(() => units.filter((u) => u.rows > 0), [units]);
  // The chart reads one newly issued list's kind at a time (a province's DP
  // list done is not mixed with its untouched ECC or PTO lists): per province,
  // its permits by the colour the masterlist holder gave them (the workshop's
  // meanings), and the ones not yet highlighted. Until one is picked: the kind
  // furthest along in its highlighting.
  const listKinds = useMemo(() => kindsShown(() => true).filter((k) => units.some((u) => u.issuedByKind?.[k]?.issued)), [units]);
  const [chartPicked, setChartPicked] = useState(null);
  const coloredOf = (k) => units.reduce((a, u) => a + (u.issuedByKind?.[k]?.colored || 0), 0);
  const chartKind = listKinds.includes(chartPicked) ? chartPicked : [...listKinds].sort((a, b) => coloredOf(b) - coloredOf(a))[0] || null;
  const issuedUnits = useMemo(
    () =>
      units
        .map((u) => ({ unit: u.unit, x: u.issuedByKind?.[chartKind] }))
        .filter(({ x }) => x?.issued > 0)
        .map(({ unit, x }) => ({
          unit,
          base: x.issued,
          notModified: Math.max(0, x.issued - (x.colored || 0)),
          colours: Object.entries(x.families || {}).map(([family, f]) => ({ family, rows: f.rows })),
        })),
    [units, chartKind]
  );
  const issuedFamilies = [...MASTERLIST.map((m) => m.family), ...families.filter((f) => !MASTERLIST_FAMILY[f])];
  // The workshop's colours by their meaning; the others by the Developer's name, when named.
  const issuedPalette = useMemo(
    () => ({ ...Object.fromEntries(Object.entries(masterlistNames).map(([f, label]) => [f, { label, hex: FAMILY[f]?.hex }])), ...MASTERLIST_FAMILY }),
    [masterlistNames]
  );
  return (
    <div className="pt-pane">
      <Card
        size="small"
        className="pt-card"
        title={
          <Space size={6}>
            <BgColorsOutlined />
            Highlighted rows by colour{chartKind ? ` · newly issued ${KIND_LABEL[chartKind] || chartKind}` : ""}
          </Space>
        }
        extra={
          listKinds.length > 1 ? (
            <Segmented size="small" value={chartKind} onChange={setChartPicked} options={listKinds.map((k) => ({ value: k, label: KIND_LABEL[k] || k }))} />
          ) : (
            <Text type="secondary" className="pt-card-hint">the newly issued permit list</Text>
          )
        }
      >
        <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
          One kind of permit&rsquo;s list, per province, by the colour the masterlist holder gave each permit — green: permit found; pink: renewed permit; yellow: new permit; red: firm not in the universe. No colour comes first: not yet highlighted.
        </Text>
        <FamilyChart units={issuedUnits} families={issuedFamilies} dark={dark} palette={issuedPalette} noun="permits" />
      </Card>
      <Card
        size="small"
        className="pt-card"
        title={
          <Space size={6}>
            <BgColorsOutlined />
            RAW data files: rows highlighted as updated
          </Space>
        }
        extra={
          !readOnly && (
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} disabled={!seasonId}>
              Edit legend
            </Button>
          )
        }
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Per province, the main sheet&rsquo;s baseline firms by the colour they were given in the RAW file. Light and dark shades count as one colour; open a row to see its shades.
        </Text>
      </Card>
      {shown.length ? (
        <div className="pt-hl-grid">
          {shown.map((u) => (
            <HighlightCard key={u.unit} u={u} accent={accent} />
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing read in this group yet." />
      )}
      {!readOnly && <LegendModal open={editing} onClose={() => setEditing(false)} seasonId={seasonId} matrix={matrix} legend={legend} families={families} queryKey={queryKey} />}
    </div>
  );
}
