import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, Col, Empty, Modal, Progress, Row, Segmented, Space, Table, Tabs, Tooltip, Typography } from "antd";
import {
  BgColorsOutlined, CheckCircleOutlined, DashboardOutlined, FileDoneOutlined, InfoCircleOutlined, MessageOutlined, PieChartOutlined, ProfileOutlined, RightOutlined, SafetyCertificateOutlined, TableOutlined, TeamOutlined, WarningOutlined,
} from "@ant-design/icons";
import { openVera } from "../../vera/veraService";
import { VeraFlame } from "../../vera/VeraMark";
import DataViz from "./DataViz";
import TrackingSummary from "./TrackingSummary";
import ColourEncoded from "./ColourEncoded";
import IssuedHighlighting from "./IssuedHighlighting";
import HealthcarePermits from "./HealthcarePermits";
import EditingNow from "./EditingNow";
import { ColourKey, HighlightingPanel, IssuedTable, PermitTable, StackBar, UnitTable, totalOf } from "./ProvinceMatrix";
import { CompositionChart, IssuedKindChart, PermitKindChart, ReviewedChart } from "./charts";
import { DOT_CLASS, EXTRA_KINDS, GROUPS, KIND_LABEL, MAIN_KINDS, kindsShown, n, pct, permitSplit, plus, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The Progress Tracker's figures, as both the Developer's screen and the
// public link show them: the summary tiles — firms, highlighting, newly
// issued, and one tile per kind of permit, each with "See more" for
// its breakdown per province and healthcare list — then a tab per question.
//
// `mode` "admin" adds VERA's buttons and the workbooks' Excel buttons (the
// matrix carries the files only for the admin), and lets the legend be
// edited; "public" is read-only. `extraTabs` are the admin's own (files,
// activity).
// ---------------------------------------------------------------------------

export const ACCENT = "#2f7ecb";
const TAB_KEYS = ["overview", "summary", "dataviz", "firms", "permits", "highlighting", "issued"];
// The queries the tabs make for themselves, under the screen's prefix (the
// Developer's ["admin", "progress-tracker", …] or the public link's
// ["public-progress", token, …]): fetched again when the figures change.
const DEPENDENT = new Set(["issued", "viz-firms", "viz-points", "viz-firm", "colour-targets", "points", "firm"]);

/** A summary tile: a short title, the number, a bar, a few parts, and "See more". */
function Tile({ icon, title, value, suffix, bar, rows, onMore, moreLabel = "See more" }) {
  return (
    <Card size="small" className="pt-summary pt-tile-in">
      <div className="pt-summary-head">
        <Text type="secondary" className="pt-summary-title">
          {icon}
          {title}
        </Text>
      </div>
      {value != null && (
        <div className="pt-summary-value">
          {value}
          {suffix && <Text type="secondary"><small>{suffix}</small></Text>}
        </div>
      )}
      {bar}
      {rows?.length > 0 && (
        <div className="pt-summary-rows">
          {rows.map((r) => (
            <div key={r.label} className={`pt-summary-row${r.divider ? " has-divider" : ""}`}>
              {r.dot ? <span className={`pt-dot ${DOT_CLASS[r.dot]}`} /> : <span style={{ width: 10 }} />}
              <Text type="secondary">{r.label}</Text>
              <b>{r.value}</b>
            </div>
          ))}
        </div>
      )}
      {onMore && (
        <Button type="link" size="small" className="pt-more" onClick={onMore}>
          {moreLabel} <RightOutlined />
        </Button>
      )}
    </Card>
  );
}

const sourceParts = (p) => [
  { key: "base", value: p.base, title: "Baseline" },
  { key: "erms", value: p.erms, title: "ERMS" },
  { key: "ecconline", value: p.ecconline, title: "ECC Online" },
];

/** A breakdown table: a row per province / list, a subtotal per group. */
function GroupedTable({ byGroup, columns, rowOf }) {
  const rows = [];
  for (const g of GROUPS) {
    const units = byGroup[g.key] || [];
    if (!units.length) continue;
    rows.push({ key: `h-${g.key}`, heading: g.label, ...rowOf(totalOf(units, g.label)) });
    for (const u of units) rows.push({ key: u.unit, name: unitLabel(u.unit), ...rowOf(u) });
  }
  const all = [...(byGroup.province || []), ...(byGroup.healthcare || [])];
  rows.push({ key: "total", heading: "Total", total: true, ...rowOf(totalOf(all)) });
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="key"
      dataSource={rows}
      rowClassName={(r) => (r.total ? "pt-row-total" : r.heading ? "pt-row-group" : "")}
      columns={[{ title: "Province / list", key: "name", render: (_, r) => (r.heading ? <b>{r.heading}</b> : <span style={{ paddingInlineStart: 12 }}>{r.name}</span>) }, ...columns]}
      scroll={{ x: 640 }}
    />
  );
}

const num = (key, title, signedPlus) => ({ title, dataIndex: key, align: "right", render: (v) => (signedPlus ? plus(v) : n(v)) });
const dotTitle = (key, label) => (
  <Space size={4}>
    <span className={`pt-dot ${DOT_CLASS[key]}`} />
    {label}
  </Space>
);

const NOTE_ICON = {
  warn: <WarningOutlined style={{ color: "#d48806" }} />,
  good: <CheckCircleOutlined style={{ color: "#389e0d" }} />,
  info: <InfoCircleOutlined style={{ color: ACCENT }} />,
};
const VERA_QUESTIONS = ["Summarise the season's progress.", "Which province is furthest behind?", "Compare ERMS and ECC Online additions per province."];

/** The tracking notes; on the Developer's screen, each with its question for VERA. */
function Notes({ notes, mode, admin }) {
  return (
    <Card
      size="small"
      className="pt-card"
      title={
        <Space size={8}>
          {admin ? <VeraFlame size={22} state="burning" theme={mode} glow={false} label="" /> : <InfoCircleOutlined />}
          {admin ? "VERA's notes" : "Notes"}
        </Space>
      }
      extra={
        admin && (
          <Button size="small" icon={<MessageOutlined />} onClick={() => openVera()}>
            Ask VERA
          </Button>
        )
      }
    >
      {notes.length ? (
        <div className="pt-notes">
          {notes.map((note) => (
            <div key={note.text} className="pt-note">
              <span className="pt-note-icon">{NOTE_ICON[note.tone] || NOTE_ICON.info}</span>
              <div className="pt-note-body">
                <div>{note.text}</div>
                {admin && note.ask && (
                  <Button type="link" size="small" className="pt-note-ask" style={{ padding: 0, height: "auto" }} onClick={() => openVera(note.ask)}>
                    Ask VERA
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing stands out yet." />
      )}
      {admin && (
        <Space size={[6, 6]} wrap style={{ marginTop: 12 }}>
          {VERA_QUESTIONS.map((q) => (
            <Button key={q} size="small" shape="round" onClick={() => openVera(q)}>
              {q}
            </Button>
          ))}
        </Space>
      )}
    </Card>
  );
}

/** The newly issued permits of one kind: issued, encoded (and on which firms), to go. */
const IssuedKindCard = ({ k, x }) => (
  <Card size="small" className="pt-summary pt-tile-in">
    <Text type="secondary" className="pt-summary-title">
      <FileDoneOutlined />
      {KIND_LABEL[k] || k}
    </Text>
    {x?.issued ? (
      <>
        <div className="pt-summary-value">
          {pct(x.inRaw, x.issued)}%<Text type="secondary"><small>encoded</small></Text>
        </div>
        <Progress percent={pct(x.inRaw, x.issued)} showInfo={false} strokeColor={ACCENT} style={{ margin: 0 }} />
        <div className="pt-summary-rows">
          <div className="pt-summary-row"><span style={{ width: 10 }} /><Text type="secondary">Issued</Text><b>{n(x.issued)}</b></div>
          <div className="pt-summary-row"><span style={{ width: 10 }} /><Text type="secondary">To encode</Text><b>{n(x.issued - x.inRaw)}</b></div>
          {[["base", "On baseline"], ["erms", "With ERMS"], ["ecconline", "With ECC Online"]].map(([key, label]) => (
            <div key={key} className="pt-summary-row">
              <span className={`pt-dot ${DOT_CLASS[key]}`} />
              <Text type="secondary">{label}</Text>
              <b>{n(x.bySource?.[key])}</b>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div style={{ marginTop: 8 }}>
        <Text type="secondary">No list yet.</Text>
      </div>
    )}
  </Card>
);

export default function TrackerView({ data, mode = "admin", theme = "light", queryKey, extraTabs = [], token = null }) {
  const admin = mode === "admin";
  const dark = theme === "dark";
  const [params, setParams] = useSearchParams();
  const keys = [...TAB_KEYS, ...extraTabs.map((t) => t.key)];
  const tab = keys.includes(params.get("tab")) ? params.get("tab") : "overview";
  const setTab = (t) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("tab", t);
        return next;
      },
      { replace: true }
    );
  const [group, setGroup] = useState("province");
  // Which "See more" is open — { of: "firms" | "kind" | "highlight" | "issued", k } —
  // not its contents: they are drawn from the current figures, so an open
  // window follows a save like the rest of the page.
  const [more, setMore] = useState(null);

  // The tabs that fetch their own data (the eye's permit lists, the Data
  // Visualization's firms and map, the encoded cells) fetched again whenever
  // the figures change — a save to a masterlist or a RAW file — whether the
  // server's live message reached this screen or the minute's refresh found it.
  const queryClient = useQueryClient();
  const seen = useRef(null);
  const files = data?.files;
  useEffect(() => {
    if (!data?.summary) return;
    const now = [data.matrix, data.summary, files];
    const before = seen.current;
    seen.current = now;
    if (!before || now.every((v, i) => v === before[i])) return;
    const prefix = token ? ["public-progress", token] : ["admin", "progress-tracker"];
    queryClient.invalidateQueries({ queryKey: prefix, predicate: (q) => DEPENDENT.has(q.queryKey[2]) });
  }, [data?.matrix, data?.summary, files, token, queryClient]);

  const s = data?.summary;
  const matrix = useMemo(() => data?.matrix || [], [data?.matrix]);
  const stale = Boolean(data?.season?.baselineStale);
  const byGroup = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, matrix.filter((u) => u.group === g.key)])), [matrix]);
  const tracked = useMemo(() => [...(byGroup.province || []), ...(byGroup.healthcare || [])], [byGroup]);
  const total = useMemo(() => totalOf(tracked), [tracked]);
  const groupOptions = GROUPS.filter((g) => byGroup[g.key]?.length).map((g) => ({ value: g.key, label: `${g.label} (${byGroup[g.key].length})` }));
  const currentGroup = byGroup[group]?.length ? group : groupOptions[0]?.value || "province";
  const groupSwitch = groupOptions.length > 1 && <Segmented options={groupOptions} value={currentGroup} onChange={setGroup} />;
  // Worked out once per set of figures, so the charts (memo) redraw only when these change.
  const provinceTotal = useMemo(() => totalOf(byGroup.province || []), [byGroup]);
  const groupTotal = useMemo(() => totalOf(byGroup[currentGroup] || []), [byGroup, currentGroup]);
  const groupKinds = useMemo(() => kindsShown((k) => groupTotal.permits?.[k]), [groupTotal]);
  const issuedKinds = useMemo(() => [...MAIN_KINDS, ...EXTRA_KINDS.filter((k) => s?.permits?.byKind?.[k]?.issued)], [s?.permits?.byKind]);
  if (!s) return null;

  // --- the "See more" breakdowns -------------------------------------------------
  const firmsMore = () => ({
    title: "Firms by province and list",
    body: (
      <GroupedTable
        byGroup={byGroup}
        rowOf={(u) => ({ rows: u.rows, base: u.base, erms: u.added.erms, ecconline: u.added.ecconline, parts: { base: u.base, erms: u.added.erms, ecconline: u.added.ecconline } })}
        columns={[
          num("rows", "Firms"),
          { ...num("base"), title: dotTitle("base", "Baseline") },
          { ...num("erms", null, true), title: dotTitle("erms", "ERMS") },
          { ...num("ecconline", null, true), title: dotTitle("ecconline", "ECC Online") },
          { title: "Split", key: "bar", width: 140, render: (_, r) => <StackBar thin parts={sourceParts(r.parts)} /> },
        ]}
      />
    ),
  });
  const kindMore = (k) => ({
    title: `${KIND_LABEL[k]} by province and list`,
    body: (
      <GroupedTable
        byGroup={byGroup}
        rowOf={(u) => ({ ...permitSplit(u, k), firms: u.rows })}
        columns={[
          num("total", "Now"),
          { ...num("base"), title: dotTitle("base", "Baseline") },
          { ...num("erms", null, true), title: dotTitle("erms", "ERMS") },
          { ...num("ecconline", null, true), title: dotTitle("ecconline", "ECC Online") },
          { title: "% of firms", key: "share", align: "right", render: (_, r) => `${pct(r.total, r.firms)}%` },
          { title: "Split", key: "bar", width: 140, render: (_, r) => <StackBar thin parts={sourceParts(r)} /> },
        ]}
      />
    ),
  });
  const highlightMore = () => ({
    title: "Highlighting by province and list",
    body: (
      <GroupedTable
        byGroup={byGroup}
        rowOf={(u) => ({ base: u.base, coloredBase: u.coloredBase, notModified: u.notModified })}
        columns={[
          num("base", "Baseline firms"),
          num("coloredBase", "Highlighted"),
          num("notModified", "No colour"),
          { title: "Progress", key: "p", width: 180, render: (_, r) => <Progress percent={pct(r.coloredBase, r.base)} size="small" strokeColor={ACCENT} style={{ margin: 0 }} /> },
        ]}
      />
    ),
  });
  const issuedMore = () => ({
    title: "Newly issued permits by province and kind",
    body: <IssuedTable units={tracked} kinds={issuedKinds} accent={ACCENT} />,
  });
  const moreOf = { firms: firmsMore, kind: kindMore, highlight: highlightMore, issued: issuedMore };
  const moreShown = more ? moreOf[more.of](more.k) : null;

  // --- the summary tiles ---------------------------------------------------------
  const tiles = (
    <div className="pt-tiles">
      <Row gutter={[12, 12]} align="stretch">
        <Col xs={24} md={12} xl={8}>
          <Tile
            icon={<TeamOutlined />}
            title="Firms"
            value={n(total.rows)}
            bar={<StackBar parts={sourceParts({ base: total.base, erms: total.added.erms, ecconline: total.added.ecconline })} />}
            rows={[
              { dot: "base", label: "Baseline", value: n(total.base) },
              { dot: "erms", label: "ERMS", value: plus(total.added.erms) },
              { dot: "ecconline", label: "ECC Online", value: plus(total.added.ecconline) },
              ...GROUPS.filter((g) => byGroup[g.key]?.length).map((g, i) => ({ label: g.label, value: n(totalOf(byGroup[g.key]).rows), divider: i === 0 })),
            ]}
            onMore={() => setMore({ of: "firms" })}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Tile
            icon={<BgColorsOutlined />}
            title="Highlighted"
            value={`${pct(total.coloredBase, total.base)}%`}
            suffix="of baseline"
            bar={<Progress percent={pct(total.coloredBase, total.base)} showInfo={false} strokeColor={ACCENT} style={{ margin: 0 }} />}
            rows={[
              { label: "Highlighted", value: n(total.coloredBase) },
              { label: "No colour", value: n(total.notModified) },
            ]}
            onMore={() => setMore({ of: "highlight" })}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Tile
            icon={<FileDoneOutlined />}
            title="Newly issued, encoded"
            bar={
              <div className="pt-kinds">
                {MAIN_KINDS.map((k) => {
                  const x = s.permits.byKind?.[k];
                  return (
                    <Tooltip key={k} title={x?.issued ? `${n(x.inRaw)} of ${n(x.issued)} newly issued ${KIND_LABEL[k]} are in the RAW data` : `No newly issued ${KIND_LABEL[k]} list yet`}>
                      <div className="pt-kind">
                        <Text strong className="pt-kind-name">{KIND_LABEL[k]}</Text>
                        <b className="pt-kind-value">{x?.issued ? `${pct(x.inRaw, x.issued)}%` : "—"}</b>
                        <Progress percent={x?.issued ? pct(x.inRaw, x.issued) : 0} showInfo={false} size="small" strokeColor={ACCENT} style={{ margin: 0 }} />
                        <Text type="secondary" className="pt-kind-added">{x?.issued ? `${n(x.inRaw)}/${n(x.issued)}` : "no list"}</Text>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            }
            onMore={() => setMore({ of: "issued" })}
          />
        </Col>
      </Row>
      <Row gutter={[12, 12]} align="stretch">
        {MAIN_KINDS.map((k) => {
          const p = permitSplit(total, k);
          return (
            <Col key={k} flex="1 1 200px">
              <Tile
                icon={<SafetyCertificateOutlined />}
                title={KIND_LABEL[k]}
                value={n(p.total)}
                bar={<StackBar parts={sourceParts(p)} />}
                rows={[
                  { dot: "base", label: "Baseline", value: n(p.base) },
                  { dot: "erms", label: "ERMS", value: plus(p.erms) },
                  { dot: "ecconline", label: "ECC Online", value: plus(p.ecconline) },
                ]}
                onMore={() => setMore({ of: "kind", k })}
              />
            </Col>
          );
        })}
      </Row>
    </div>
  );

  // --- the tabs -------------------------------------------------------------------
  const overview = (
    <div className="pt-pane">
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={10}>
          <Notes notes={data?.notes || []} mode={theme} admin={admin} />
        </Col>
        <Col xs={24} xl={14}>
          <Card size="small" className="pt-card" title="Firms by source" extra={<Text type="secondary" className="pt-card-hint">Monitoring Plan</Text>}>
            <CompositionChart units={byGroup.province || []} dark={dark} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <Card size="small" className="pt-card" title="Permits by kind" extra={<Text type="secondary" className="pt-card-hint">Monitoring Plan</Text>}>
            <PermitKindChart total={provinceTotal} kinds={MAIN_KINDS} dark={dark} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" className="pt-card" title="Highlighted" extra={<Text type="secondary" className="pt-card-hint">% of baseline firms</Text>}>
            <ReviewedChart units={byGroup.province || []} color={ACCENT} dark={dark} />
          </Card>
        </Col>
      </Row>
      {byGroup.healthcare?.length > 0 && (
        <Card size="small" className="pt-card" title="Healthcare: firms by source">
          <CompositionChart units={byGroup.healthcare} dark={dark} />
        </Card>
      )}
    </div>
  );

  const firms = (
    <Card size="small" className="pt-card" title="Firms" extra={groupSwitch}>
      <Text type="secondary" className="pt-card-hint" style={{ display: "block", marginBottom: 8 }}>
        Open a row for its permits and the rows not on the main sheet.
      </Text>
      <UnitTable units={byGroup[currentGroup] || []} accent={ACCENT} stale={stale} />
    </Card>
  );

  const permits = (
    <div className="pt-pane">
      {groupSwitch && <div>{groupSwitch}</div>}
      <Card size="small" className="pt-card" title="Permits by kind" extra={<Text type="secondary" className="pt-card-hint">Each kind on its own</Text>}>
        <PermitKindChart total={groupTotal} kinds={groupKinds} dark={dark} />
      </Card>
      {/* The healthcare lists overlap (one establishment on several): their
          permits by kind, each counted once. */}
      {currentGroup === "healthcare" && <HealthcarePermits data={data?.healthcarePermits} admin={admin} />}
      <Card size="small" className="pt-card" title="Permits per province">
        <PermitTable units={byGroup[currentGroup] || []} />
      </Card>
    </div>
  );

  const highlighting = (
    <div className="pt-pane">
      {groupSwitch && <div>{groupSwitch}</div>}
      <HighlightingPanel
        units={byGroup[currentGroup] || []}
        matrix={matrix}
        families={data?.families || []}
        seasonId={admin ? data?.season?.id : null}
        queryKey={queryKey}
        accent={ACCENT}
        dark={dark}
        readOnly={!admin}
        masterlistNames={data?.masterlistNames || {}}
      />
      {/* The permits the masterlist holder coloured on the newly issued lists. */}
      <IssuedHighlighting
        byKind={s.permits.byKind}
        kinds={[...MAIN_KINDS, ...EXTRA_KINDS]}
        // The seven provinces: each as its sheet counts it, Monitoring Plan + healthcare firms.
        units={byGroup.province || []}
        accent={ACCENT}
        admin={admin}
        // Live: the workbooks being edited now, and whether the tracker is reading the folders.
        editing={data?.editing || []}
        watching={Boolean(data?.season?.watched ?? (data?.season?.open || data?.season?.preSeason))}
        checkedAt={data?.season?.lastPoll?.at || data?.season?.checkedAt || null}
        // The Developer's names for the colours outside the workshop's legend (named here, admin only).
        names={data?.masterlistNames || {}}
        seasonId={admin ? data?.season?.id : null}
        queryKey={queryKey}
      />
    </div>
  );

  const provinceRows = Object.entries(s.permits.byProvince || {})
    .filter(([p]) => p !== "(none)")
    .sort((a, b) => a[0].localeCompare(b[0]));
  const issued = (
    <div className="pt-pane">
      <Row gutter={[12, 12]}>
        {issuedKinds.map((k) => (
          <Col key={k} flex="1 1 190px">
            <IssuedKindCard k={k} x={s.permits.byKind?.[k]} />
          </Col>
        ))}
      </Row>
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={14}>
          <Card size="small" title="Encoded and to encode" className="pt-card" extra={<Text type="secondary" className="pt-card-hint">by kind</Text>}>
            <IssuedKindChart byKind={s.permits.byKind} kinds={issuedKinds} dark={dark} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card size="small" title="By province" className="pt-card" extra={<Text type="secondary" className="pt-card-hint">all lists</Text>}>
            <div className="pt-provinces">
              {provinceRows.map(([p, v]) => (
                <div key={p} className="pt-province">
                  <Text className="pt-province-name">{unitLabel(p)}</Text>
                  <Progress percent={pct(v.inRaw, v.issued)} size="small" strokeColor={ACCENT} style={{ margin: 0, flex: 1 }} />
                  <Text type="secondary" className="pt-province-count">
                    {n(v.inRaw)}/{n(v.issued)}
                  </Text>
                </div>
              ))}
              {!provinceRows.length && <Text type="secondary">No permit lists read yet.</Text>}
            </div>
          </Card>
        </Col>
      </Row>
      <Card size="small" title="Per province and kind" className="pt-card" extra={groupSwitch}>
        <IssuedTable units={byGroup[currentGroup] || []} kinds={issuedKinds} accent={ACCENT} />
      </Card>
      {/* The Developer's: colour the encoded permits in the RAW files (an Office Script per file). */}
      {admin && <ColourEncoded />}
    </div>
  );

  const items = [
    { key: "overview", label: <span><DashboardOutlined /> Overview</span>, children: overview },
    {
      // The UCD Tracking System's summary sheet, live.
      key: "summary",
      label: <span><ProfileOutlined /> Tracking summary</span>,
      children: <TrackingSummary matrix={tracked} checkedAt={data?.season?.lastPoll?.at || data?.season?.checkedAt} seasonName={data?.season?.name} names={data?.masterlistNames || {}} landfills={s.permits.landfills || 0} />,
    },
    {
      key: "dataviz",
      label: <span><PieChartOutlined /> Data Visualization</span>,
      children: <DataViz matrix={tracked} checkedAt={data?.season?.lastPoll?.at || data?.season?.checkedAt} mode={mode} theme={theme} token={token} mapKey={data?.map?.maptilerKey} />,
    },
    { key: "firms", label: <span><TableOutlined /> Firms</span>, children: firms },
    { key: "permits", label: <span><SafetyCertificateOutlined /> Permits</span>, children: permits },
    { key: "highlighting", label: <span><BgColorsOutlined /> Highlighting</span>, children: highlighting },
    { key: "issued", label: <span><FileDoneOutlined /> Newly issued</span>, children: issued },
    ...extraTabs,
  ];

  return (
    <div className="pt-view">
      <EditingNow editing={data?.editing || []} admin={admin} />
      {tiles}
      <ColourKey />
      {/* Only the open tab is mounted: the charts of the others cost nothing
          until they are opened (and nothing on each refresh). */}
      <Tabs className="pt-tabs" activeKey={tab} onChange={setTab} items={items} destroyOnHidden />
      <Modal open={Boolean(moreShown)} title={moreShown?.title} onCancel={() => setMore(null)} footer={null} width={860} destroyOnHidden>
        {moreShown?.body}
      </Modal>
    </div>
  );
}
