import { useMemo, useState } from "react";
import { Alert, Empty, Input, Segmented, Skeleton, Space, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { InfoCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getIssuedDetail } from "./progressService";
import { OpenFileButton } from "./ProvinceMatrix";
import { KIND_LABEL, MASTERLIST, MASTERLIST_FAMILY, NO_COLOUR, PERMIT_STATUS, masterlistHex, masterlistLabel, n, pct, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The Highlighting tab's "See more" for one kind of newly issued permit: what
// is happening on its list(s), against the workshop's colours.
//
//   Developer: list by list — the colours by meaning, then every permit on
//     it: where it sits, whom it was issued to, its colour, whether it is in
//     the RAW data, and where it stands (matches, not yet highlighted,
//     highlighted but not in the RAW data …). Opens on the permits not yet
//     highlighted: what is left to do.
//   Public link: the counts by colour only — no permit numbers or firms.
// ---------------------------------------------------------------------------

// The permits' rows on the list: not yet coloured; coloured, by what the
// colour says against the RAW data; and the healthcare / TSD / TRC firms.
const VIEWS = [
  { value: "todo", label: "Not yet highlighted", has: (s) => s === "todo" || s === "unmarked" },
  // Every row with a colour (the tile's Highlighted), whatever the RAW data says of it.
  { value: "highlighted", label: "Highlighted", has: (s) => s !== "todo" && s !== "unmarked" },
  // The colour says one thing, the RAW data another (the tile's "Colour does not match the RAW data").
  { value: "mismatch", label: "Colour does not match", has: (s) => s === "notEncoded" || s === "redInRaw" },
  { value: "attention", label: "Needs attention", has: (s) => ["notEncoded", "redInRaw", "greenButNew", "otherColour"].includes(s) },
  { value: "done", label: "Matches", has: (s) => s === "ok" },
  // The list's healthcare / TSD / TRC mark: the permits marked, and the marks
  // on an establishment that is not of that universe (offered when there are any).
  { value: "healthcare", label: "Healthcare / TSD / TRC firms", has: (s, r) => r.healthcare === true, optional: true },
  { value: "doubtful", label: "Healthcare mark doubtful", has: (s, r) => r.doubtful, optional: true },
  { value: "all", label: "All", has: () => true },
];

/** A colour's swatch: the cell's fill, else the workshop's or the family's colour. */
const Swatch = ({ fill, family }) => (
  <span
    className="pt-swatch is-small"
    style={{ background: fill ? `#${fill}` : family ? masterlistHex(family) : NO_COLOUR.hex, outline: !fill && !family ? `1px solid ${NO_COLOUR.stroke}` : undefined }}
  />
);

/** A colour outside the workshop's legend that the Developer named has a meaning: "named", not "needs attention". */
const standingOf = (r, names) => (r.status === "otherColour" && names?.[r.family] ? "named" : r.status);

/** The list's permits by colour, the workshop's order first, "No colour" last. */
function FamilyBreakdown({ byFamily = {}, issued, names = {} }) {
  const known = MASTERLIST.map((m) => m.family);
  const rows = [
    ...known.filter((f) => byFamily[f]?.rows).map((f) => ({ family: f, ...byFamily[f] })),
    ...Object.keys(byFamily)
      .filter((f) => f !== "none" && !known.includes(f))
      .map((f) => ({ family: f, ...byFamily[f] })),
    ...(byFamily.none?.rows ? [{ family: null, ...byFamily.none }] : []),
  ];
  return (
    <div className="pt-mlist">
      {rows.map((r) => {
        const rule = MASTERLIST_FAMILY[r.family];
        // What the RAW data should show for the colour: in it, or (red) not.
        const agree = !r.family ? null : rule ? (r.family === "red" ? r.rows - r.inRaw : r.inRaw) : null;
        return (
          <div key={r.family || "none"} className="pt-mlist-row">
            <Swatch family={r.family} />
            <Tooltip title={rule?.hint || (r.family ? "A colour the workshop does not use." : "Not yet highlighted on the list.")}>
              <Text className="pt-mlist-label">{r.family ? masterlistLabel(r.family, names) : "No colour — not yet highlighted"}</Text>
            </Tooltip>
            <b className="pt-mlist-num">{n(r.rows)}</b>
            <Text type="secondary" className="pt-mlist-pct">{pct(r.rows, issued)}%</Text>
            {agree != null && agree < r.rows ? (
              <Tooltip title={r.family === "red" ? "Red, but already in the RAW data" : "Highlighted, but not in the RAW data"}>
                <Tag color="red" style={{ marginInlineEnd: 0 }}>{n(r.rows - agree)} do not match</Tag>
              </Tooltip>
            ) : agree != null ? (
              <Tag color="green" style={{ marginInlineEnd: 0 }}>all match</Tag>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A long text in a narrow cell: one line, the whole of it on hover. */
const Clip = ({ v, width }) =>
  v ? (
    <Tooltip title={v}>
      <Text ellipsis style={{ maxWidth: width, display: "block" }}>
        {v}
      </Text>
    </Tooltip>
  ) : (
    <Text type="secondary">—</Text>
  );

const columnsFor = (names) => [
  { title: "Row", key: "at", width: 120, render: (_, r) => (r.sheet ? <Text code>{`${r.sheet}!${r.row}`}</Text> : "—") },
  { title: "Permit", dataIndex: "permit", width: 190, render: (v) => <Text code>{v}</Text> },
  // What the permit is for and where — as the list writes them.
  { title: "Project title", dataIndex: "title", width: 220, render: (v, r) => <Clip v={v || r.firm} width={204} /> },
  { title: "Proponent", dataIndex: "firm", width: 170, render: (v) => <Clip v={v} width={154} /> },
  { title: "Industry classification", dataIndex: "industry", width: 220, render: (v) => <Clip v={v} width={204} /> },
  { title: "City / municipality", dataIndex: "city", width: 140, render: (v) => (v ? unitLabel(v) : <Text type="secondary">—</Text>) },
  { title: "Province", dataIndex: "province", width: 110, render: (v) => (v ? unitLabel(v) : "—") },
  { title: "Type", dataIndex: "type", width: 90, render: (v) => (v ? <Tag style={{ marginInlineEnd: 0 }}>{v === "renewal" ? "Renewal" : "New"}</Tag> : "—") },
  {
    title: "Colour",
    key: "colour",
    width: 190,
    render: (_, r) => (
      <Space size={6}>
        <Swatch fill={r.fill} family={r.family} />
        <Text style={{ fontSize: 12 }}>{r.family ? masterlistLabel(r.family, names) : "No colour"}</Text>
      </Space>
    ),
  },
  {
    // The list's "Healthcare / TSD / TRC Firm" column, as written: Yes, or blank.
    title: "Healthcare / TSD / TRC firm",
    key: "healthcare",
    width: 150,
    align: "center",
    render: (_, r) =>
      r.healthcare === true ? (
        <Space size={4} wrap>
          <Tag color="purple" style={{ marginInlineEnd: 0 }}>Yes</Tag>
          {r.doubtful && (
            <Tooltip title={`Marked Yes, but its PSIC is “${r.psic}” — not a healthcare, laboratory, TSD or transporter establishment. Check the mark.`}>
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>Check</Tag>
            </Tooltip>
          )}
        </Space>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
  { title: "In RAW", dataIndex: "inRaw", width: 80, align: "center", render: (v) => (v ? <Tag color="green" style={{ marginInlineEnd: 0 }}>Yes</Tag> : <Tag style={{ marginInlineEnd: 0 }}>No</Tag>) },
  {
    title: "Standing",
    key: "status",
    width: 200,
    render: (_, r) => {
      const s = standingOf(r, names);
      if (s === "named") {
        return (
          <Tooltip title="A colour outside the workshop's legend, named for this season. Not checked against the RAW data.">
            <Tag style={{ marginInlineEnd: 0 }}>{names[r.family]}</Tag>
          </Tooltip>
        );
      }
      return (
        <Tooltip title={PERMIT_STATUS[s]?.hint}>
          <Tag color={PERMIT_STATUS[s]?.color} style={{ marginInlineEnd: 0 }}>{PERMIT_STATUS[s]?.label || s}</Tag>
        </Tooltip>
      );
    },
  },
];

/**
 * "Colour does not match the RAW data", explained: what each colour claims,
 * how the claim is checked, how many fail it, and what to do. `counts`:
 * { green, pink, yellow } — coloured but not in the RAW data — and `red` —
 * red but in it.
 */
function MismatchExplainer({ counts, kind }) {
  const what = KIND_LABEL[kind] || kind;
  const missing = (counts.green || 0) + (counts.pink || 0) + (counts.yellow || 0);
  const total = missing + (counts.red || 0);
  const cases = [
    {
      key: "missing",
      colours: ["green", "pink", "yellow"],
      claim: `Green, pink and yellow each say the ${what} is in the RAW data — already there (green), updated to the renewal (pink) or newly added (yellow).`,
      fails: `…but the permit number is on no RAW file.`,
      count: missing,
      parts: ["green", "pink", "yellow"].filter((f) => counts[f]).map((f) => `${n(counts[f])} ${MASTERLIST_FAMILY[f].label.toLowerCase()}`),
      fix: "Write the permit into the RAW data on the firm's row — or, if it was coloured by mistake, take the colour off the list.",
    },
    {
      key: "red",
      colours: ["red"],
      claim: "Red says the firm is not in the universe, so the permit cannot be in the RAW data.",
      fails: "…but the permit number is already on a RAW file.",
      count: counts.red || 0,
      parts: [],
      fix: "If the firm is in the universe, recolour the row green, pink or yellow. If not, the permit was written on the wrong firm: take it off that row.",
    },
  ];
  return (
    <div className="pt-explain">
      <Space size={8} align="start">
        <InfoCircleOutlined className="pt-explain-icon" />
        <div>
          <Text strong>What &ldquo;colour does not match the RAW data&rdquo; means</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              The masterlist holder colours each permit after looking it up in the RAW data, so the colour is a statement about the RAW data. The tracker checks every statement against the permit numbers on the RAW files.{" "}
              {total ? (
                <Text type="danger" strong>{n(total)} {what} fail it.</Text>
              ) : (
                <Text strong style={{ color: "#389e0d" }}>Every coloured {what} matches.</Text>
              )}
            </Text>
          </div>
        </div>
      </Space>
      <div className="pt-explain-cases">
        {cases.map((c) => (
          <div key={c.key} className={`pt-explain-case${c.count ? " is-failing" : ""}`}>
            <div className="pt-explain-swatches">
              {c.colours.map((f) => (
                <span key={f} className="pt-swatch" style={{ background: MASTERLIST_FAMILY[f].hex }} />
              ))}
            </div>
            <div className="pt-explain-text">
              <div>{c.claim}</div>
              <div>
                <Text type={c.count ? "danger" : "secondary"}>{c.fails}</Text>
              </div>
              <div className="pt-explain-fix">
                <Text type="secondary">What to do: {c.fix}</Text>
              </div>
            </div>
            <div className="pt-explain-count">
              <b style={c.count ? { color: "#cf1322" } : undefined}>{n(c.count)}</b>
              {c.parts.length > 0 && <Text type="secondary" style={{ fontSize: 11.5 }}>{c.parts.join(" · ")}</Text>}
            </div>
          </div>
        ))}
      </div>
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        Permit numbers are compared loosely — spaces, dashes, capitals and leading zeros aside. A permit typed in the RAW file with a wrong or missing digit counts as not in it: check the number before encoding it again.
      </Text>
    </div>
  );
}

/**
 * The tile's Highlighted, broken down: each colour, and of its rows how many
 * the RAW data agrees with (green, pink, yellow: the permit is in it; red: it
 * is not) and how many it does not. The rows that do not match are part of
 * the highlighted rows, not extra. `byFamily`: { family: { rows, inRaw } }.
 */
function HighlightedBreakdown({ byFamily = {}, names = {}, kind }) {
  const what = KIND_LABEL[kind] || kind;
  const lines = [
    ...MASTERLIST.map((m) => ({ family: m.family, rule: m, ...(byFamily[m.family] || { rows: 0, inRaw: 0 }) })),
    ...Object.entries(byFamily)
      .filter(([f]) => f !== "none" && !MASTERLIST_FAMILY[f])
      .map(([f, v]) => ({ family: f, rule: null, ...v })),
  ].map((l) => {
    // What agreeing with the RAW data means for the colour; none for a colour the workshop does not use.
    const agree = !l.rule ? null : l.family === "red" ? l.rows - (l.inRaw || 0) : l.inRaw || 0;
    return { ...l, agree, off: agree == null ? null : l.rows - agree };
  });
  const total = lines.reduce((a, l) => a + l.rows, 0);
  const agreeing = lines.reduce((a, l) => a + (l.agree || 0), 0);
  const off = lines.reduce((a, l) => a + (l.off || 0), 0);
  return (
    <div className="pt-explain">
      <Space size={8} align="start">
        <InfoCircleOutlined className="pt-explain-icon" />
        <div>
          <Text strong>
            {n(total)} highlighted {what}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Each colour says something about the RAW data, and the tracker checks it against the permit numbers on the RAW files: green, pink and yellow say the permit is in it; red says it is not. The ones that do not match are part of the highlighted rows, not extra — they need a second look.
            </Text>
          </div>
        </div>
      </Space>
      <table className="pt-hl-breakdown">
        <thead>
          <tr>
            <th>Colour</th>
            <th>Highlighted</th>
            <th>
              <Tooltip title="Green, pink, yellow: the permit is in the RAW data. Red: it is not.">Agrees with the RAW data</Tooltip>
            </th>
            <th>
              <Tooltip title="Green, pink, yellow but not in the RAW data; red but already in it.">Does not match</Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines
            .filter((l) => l.rows > 0 || l.rule)
            .map((l) => (
              <tr key={l.family}>
                <td>
                  <Space size={6}>
                    <span className="pt-swatch is-small" style={{ background: masterlistHex(l.family) }} />
                    <Tooltip title={l.rule?.hint || "A colour the workshop's legend does not use: not checked against the RAW data."}>
                      <span>{masterlistLabel(l.family, names)}</span>
                    </Tooltip>
                  </Space>
                </td>
                <td className="num">{n(l.rows)}</td>
                <td className="num">{l.agree == null ? <Text type="secondary">not checked</Text> : n(l.agree)}</td>
                <td className="num">{l.off == null ? <Text type="secondary">—</Text> : l.off ? <Text type="danger" strong>{n(l.off)}</Text> : "0"}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{n(total)}</td>
            <td className="num">{n(agreeing)}</td>
            <td className="num">{off ? <Text type="danger" strong>{n(off)}</Text> : "0"}</td>
          </tr>
        </tfoot>
      </table>
      {off > 0 && (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          To see the {n(off)} that do not match, pick &ldquo;Colour does not match&rdquo; above the table below. A permit typed in the RAW file with a wrong or missing digit counts as not in it: check the number first.
        </Text>
      )}
    </div>
  );
}

/** The explainer's counts from a list's permits. */
const mismatchCounts = (rows) => {
  const c = { green: 0, pink: 0, yellow: 0, red: 0 };
  for (const r of rows) {
    if (r.status === "notEncoded" && c[r.family] != null) c[r.family] += 1;
    if (r.status === "redInRaw") c.red += 1;
  }
  return c;
};

/** One list: who saved it, its colours, and its permits (filtered). */
function ListPane({ file, names, initialView }) {
  const [view, setView] = useState(initialView || "todo");
  const [q, setQ] = useState("");
  const columns = useMemo(() => columnsFor(names), [names]);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.value, file.rows.filter((r) => v.has(standingOf(r, names), r)).length]));
  const views = VIEWS.filter((v) => !v.optional || counts[v.value] > 0 || v.value === view);
  const rows = useMemo(() => {
    const has = VIEWS.find((v) => v.value === view)?.has || (() => true);
    const text = q.trim().toLowerCase();
    // The search reads the permit number, the project, the proponent, the industry and the place.
    const hay = (r) => [r.permit, r.title, r.firm, r.industry, r.city, r.province].map((v) => String(v || "").toLowerCase());
    return file.rows.filter((r) => has(standingOf(r, names), r) && (!text || hay(r).some((v) => v.includes(text))));
  }, [file.rows, view, q, names]);
  const colored = file.issued - (file.byFamily?.none?.rows || 0);
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Space size={8} wrap style={{ justifyContent: "space-between", width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {n(file.issued)} permits · {n(colored)} highlighted ({pct(colored, file.issued)}%)
          {file.version ? ` · v${file.version}` : ""}
          {file.modifiedBy ? ` · last saved by ${file.modifiedBy}` : ""}
          {file.modifiedAt ? ` ${dayjs(file.modifiedAt).fromNow()}` : ""}
        </Text>
        <OpenFileButton files={[file.open].filter(Boolean)} />
      </Space>
      <FamilyBreakdown byFamily={file.byFamily} issued={file.issued} names={names} />
      {counts.attention > 0 && (
        <Alert type="error" showIcon message={`${n(counts.attention)} permit${counts.attention === 1 ? "" : "s"} on this list need attention`} description="Their colour does not match the RAW data, or is a colour the workshop does not use and nobody has named. Open “Needs attention”." />
      )}
      <Space size={8} wrap>
        <Segmented value={view} onChange={setView} options={views.map((v) => ({ value: v.value, label: `${v.label} (${n(counts[v.value])})` }))} />
        <Input allowClear size="middle" prefix={<SearchOutlined />} placeholder="Permit, project, proponent, industry or city" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} />
      </Space>
      {/* One line per row of the list: a permit number on two rows is two lines. */}
      <Table size="small" rowKey={(r) => `${r.sheet}!${r.row}|${r.permit}`} columns={columns} dataSource={rows} pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 1880 }} />
    </Space>
  );
}

/** The counts by colour for the public link (no permit numbers, no firms). */
function PublicCounts({ x, names, kind, view }) {
  const byFamily = { ...(x?.families || {}), none: { rows: Math.max(0, (x?.issued || 0) - (x?.colored || 0)), inRaw: 0 } };
  if (!x?.issued) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No list yet." />;
  const f = x.families || {};
  const missing = (fam) => Math.max(0, (f[fam]?.rows || 0) - (f[fam]?.inRaw || 0));
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {view === "highlighted" && <HighlightedBreakdown byFamily={f} names={names} kind={kind} />}
      {view === "mismatch" && <MismatchExplainer kind={kind} counts={{ green: missing("green"), pink: missing("pink"), yellow: missing("yellow"), red: f.red?.inRaw || 0 }} />}
      <FamilyBreakdown byFamily={byFamily} issued={x.issued} names={names} />
    </Space>
  );
}

/**
 * A list kept to one universe (the card's switch): its permits marked
 * Healthcare / TSD / TRC, or the others — the colour counts worked out again.
 */
function fileInScope(f, scope) {
  if (!scope || scope === "all") return f;
  const rows = f.rows.filter((r) => (scope === "healthcare" ? r.healthcare === true : r.healthcare !== true));
  const byFamily = {};
  for (const r of rows) {
    const t = (byFamily[r.family || "none"] ||= { rows: 0, inRaw: 0 });
    t.rows += 1;
    if (r.inRaw) t.inRaw += 1;
  }
  return { ...f, rows, issued: rows.length, byFamily };
}

export default function IssuedKindDetail({ kind, x, admin, names: given, view = null, scope = "all" }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "progress-tracker", "issued", kind], queryFn: () => getIssuedDetail(kind), enabled: admin, staleTime: 30 * 1000 });
  // The names the page has (just saved, perhaps) before the list's own copy.
  const names = given || data?.names || {};
  if (!admin) return <PublicCounts x={x} names={names} kind={kind} view={view} />;
  if (isLoading) return <Skeleton active />;
  if (error) return <Alert type="error" showIcon message="The list could not be loaded." />;
  // The card's universe (not for the doubtful marks, which are all marked healthcare anyway).
  const files = (data?.files || []).map((f) => fileInScope(f, view === "doubtful" ? "all" : scope)).filter((f) => f.rows.length);
  if (!files.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data?.ready ? `No newly issued ${KIND_LABEL[kind] || kind} list in the folder.` : "The lists are being read — try again in a minute."} />;
  }
  // Opened from the tile's eye: the explanation first, over every list of the kind.
  // The highlighted rows' colours, over every list of the kind (each row once).
  const highlightedByFamily = () => {
    const out = {};
    for (const r of files.flatMap((f) => f.rows)) {
      if (!r.family) continue;
      const t = (out[r.family] ||= { rows: 0, inRaw: 0 });
      t.rows += 1;
      if (r.inRaw) t.inRaw += 1;
    }
    return out;
  };
  const explainer =
    view === "highlighted" ? (
      <HighlightedBreakdown byFamily={highlightedByFamily()} names={names} kind={kind} />
    ) : view === "mismatch" ? (
      <MismatchExplainer kind={kind} counts={mismatchCounts(files.flatMap((f) => f.rows))} />
    ) : view === "doubtful" ? (
      <Alert
        type="warning"
        showIcon
        message="Marked Healthcare / TSD / TRC, but the establishment is not one"
        description="These permits have Yes in the list's “Healthcare / TSD / TRC Firm” column, yet their PSIC description is not a hospital, clinic, laboratory, TSD or transporter one (a farm, a gas station, a hotel…). Until the Yes is corrected they count as Healthcare / TSD / TRC firms, not the province's Monitoring Plan."
      />
    ) : null;
  // A list with none of the permits the eye opened on opens on those not yet highlighted instead.
  const opened = VIEWS.find((v) => v.value === view);
  const viewOf = (f) => (opened && view !== "all" && !f.rows.some((r) => opened.has(standingOf(r, names), r)) ? null : view);
  const panes =
    files.length === 1 ? (
      <ListPane file={files[0]} names={names} initialView={viewOf(files[0])} />
    ) : (
      <Tabs
        size="small"
        defaultActiveKey={(view && files.find((f) => viewOf(f))?.id) || files[0].id}
        items={files.map((f) => ({
          key: f.id,
          label: `${f.name.replace(/\.xls[xm]?$/i, "")} (${n(f.issued)})`,
          children: <ListPane file={f} names={names} initialView={viewOf(f)} />,
        }))}
      />
    );
  return explainer ? (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {explainer}
      {panes}
    </Space>
  ) : (
    panes
  );
}
