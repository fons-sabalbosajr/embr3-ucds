import { useMemo, useState } from "react";
import { Alert, Button, Checkbox, Empty, Input, Segmented, Skeleton, Space, Table, Tabs, Tag, Tooltip, Typography } from "antd";
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
  { value: "healthcare", label: "Healthcare / TSD / TRC firms", has: (s, r) => Boolean(r.hcUnit) || r.healthcare === true, optional: true },
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

/** A long text in a narrow cell: wrapped onto as many lines as it needs, never cut. */
const Clip = ({ v, width }) => (v ? <span className="pt-wrap-text" style={{ maxWidth: width }}>{v}</span> : <Text type="secondary">—</Text>);

// --- the table's column filters ---------------------------------------------------

const BLANK = "\u0000blank";

/**
 * A column filtered by the values its rows hold: each value once, with how
 * many rows of the list hold it, searchable when there are many. `of(r)`: the
 * row's value (null: blank); `label(v)`: how a value reads.
 */
const pickFilter = (rows, of, label = (v) => v) => {
  const counts = new Map();
  for (const r of rows) {
    const v = of(r) ?? BLANK;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const text = (v) => (v === BLANK ? "(blank)" : String(label(v)));
  return {
    filters: [...counts].sort((a, b) => text(a[0]).localeCompare(text(b[0]))).map(([v, c]) => ({ text: `${text(v)} (${n(c)})`, value: v })),
    onFilter: (value, r) => (of(r) ?? BLANK) === value,
    filterSearch: counts.size > 8,
  };
};

/** A column filtered by the text in it ("contains"), for the permit numbers and the names. */
const textFilter = (of, placeholder) => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
    <div style={{ padding: 8, width: 240 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        allowClear
        size="small"
        placeholder={placeholder}
        value={selectedKeys[0]}
        onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
        onPressEnter={() => confirm()}
        style={{ marginBottom: 8 }}
      />
      <Space size={6} style={{ width: "100%", justifyContent: "flex-end" }}>
        <Button
          size="small"
          onClick={() => {
            clearFilters?.();
            confirm();
          }}
        >
          Reset
        </Button>
        <Button size="small" type="primary" icon={<SearchOutlined />} onClick={() => confirm()}>
          Filter
        </Button>
      </Space>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
  onFilter: (value, r) => String(of(r) || "").toLowerCase().includes(String(value).trim().toLowerCase()),
});

/**
 * A column holding two values, filtered by both: each outer value (with how
 * many rows hold it) opens onto the inner values found under it. Ticking an
 * outer value takes all of its rows. `outer(r)`, `inner(r)`: the row's values
 * (null: blank); `outerLabel`, `innerLabel`: how they read.
 */
const SEP = "\u0001";
const treeFilter = (rows, outer, inner, outerLabel = (v) => v, innerLabel = (v) => v) => {
  const tree = new Map(); // outer -> { count, inner: Map(inner -> count) }
  for (const r of rows) {
    const o = String(outer(r) ?? BLANK);
    const i = String(inner(r) ?? BLANK);
    const t = tree.get(o) || { count: 0, inner: new Map() };
    t.count += 1;
    t.inner.set(i, (t.inner.get(i) || 0) + 1);
    tree.set(o, t);
  }
  const text = (label) => (v) => (v === BLANK ? "(blank)" : String(label(v)));
  const ot = text(outerLabel);
  const it = text(innerLabel);
  const byText = (f) => (a, b) => f(a[0]).localeCompare(f(b[0]));
  return {
    filterMode: "tree",
    filterSearch: [...tree.values()].reduce((a, t) => a + 1 + t.inner.size, 0) > 8,
    filters: [...tree].sort(byText(ot)).map(([o, t]) => ({
      text: `${ot(o)} (${n(t.count)})`,
      value: `o${SEP}${o}`,
      children: [...t.inner].sort(byText(it)).map(([i, c]) => ({ text: `${it(i)} (${n(c)})`, value: `i${SEP}${o}${SEP}${i}` })),
    })),
    onFilter: (value, r) => {
      const [level, o, i] = String(value).split(SEP);
      const same = String(outer(r) ?? BLANK) === o;
      return level === "o" ? same : same && String(inner(r) ?? BLANK) === i;
    },
  };
};

/** The newly issued list's Type, as the Permit column shows it under the number. */
const typeLabel = (v) => (v === "renewal" ? "Renewal" : v ? "New" : "(blank)");

/**
 * The Permit column's filter: the permit number ("contains") and the Type
 * (New / Renewal), together. Both are kept in the one filter key, as JSON.
 */
const permitFilter = (rows) => {
  const types = new Map();
  for (const r of rows) types.set(r.type || BLANK, (types.get(r.type || BLANK) || 0) + 1);
  const read = (key) => {
    try {
      return JSON.parse(key || "{}");
    } catch {
      return {};
    }
  };
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
      const f = read(selectedKeys[0]);
      const set = (next) => {
        const v = { ...f, ...next };
        setSelectedKeys(v.q || v.types?.length ? [JSON.stringify(v)] : []);
      };
      return (
        <div style={{ padding: 8, width: 240 }} onKeyDown={(e) => e.stopPropagation()}>
          <Input autoFocus allowClear size="small" placeholder="Permit number contains…" value={f.q} onChange={(e) => set({ q: e.target.value })} onPressEnter={() => confirm()} style={{ marginBottom: 8 }} />
          {types.size > 1 && (
            <Checkbox.Group
              style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}
              value={f.types || []}
              onChange={(v) => set({ types: v })}
              options={[...types].map(([t, c]) => ({ label: `${typeLabel(t === BLANK ? null : t)} (${n(c)})`, value: t }))}
            />
          )}
          <Space size={6} style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button
              size="small"
              onClick={() => {
                clearFilters?.();
                confirm();
              }}
            >
              Reset
            </Button>
            <Button size="small" type="primary" icon={<SearchOutlined />} onClick={() => confirm()}>
              Filter
            </Button>
          </Space>
        </div>
      );
    },
    filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilter: (value, r) => {
      const f = read(value);
      const q = String(f.q || "").trim().toLowerCase();
      return (!q || String(r.permit || "").toLowerCase().includes(q)) && (!f.types?.length || f.types.includes(r.type || BLANK));
    },
  };
};

/** A second value under a cell's first, smaller and grey. */
const Under = ({ children }) => (
  <Text type="secondary" style={{ fontSize: 11.5, display: "block" }}>
    {children}
  </Text>
);

/** Where a permit stands on the healthcare / TSD / TRC mark, as the column shows it. */
const healthcareOf = (r) => (r.hcUnit ? unitLabel(r.hcUnit) : r.healthcare === true ? (r.doubtful ? "Marked — PSIC not healthcare" : "Marked") : null);

const columnsFor = (names, rows = []) => [
  { title: "Row", key: "at", width: 120, render: (_, r) => (r.sheet ? <Text code>{`${r.sheet}!${r.row}`}</Text> : "—"), ...pickFilter(rows, (r) => r.sheet) },
  // The permit number, and under it the list's Type (new or renewal).
  {
    title: "Permit / Type",
    dataIndex: "permit",
    width: 200,
    ...permitFilter(rows),
    render: (v, r) => (
      <>
        <Text code>{v}</Text>
        {r.type && (
          <div style={{ marginTop: 4 }}>
            <Tag style={{ marginInlineEnd: 0 }}>{typeLabel(r.type)}</Tag>
          </div>
        )}
      </>
    ),
  },
  // What the permit is for and whose — as the list writes them.
  {
    title: "Project title / Proponent",
    dataIndex: "title",
    width: 300,
    render: (v, r) =>
      v ? (
        <>
          <Clip v={v} width={284} />
          {r.firm && r.firm !== v && <Under>{r.firm}</Under>}
        </>
      ) : (
        <Clip v={r.firm} width={284} />
      ),
    ...textFilter((r) => `${r.title || ""} ${r.firm || ""}`, "Project title or proponent contains…"),
  },
  {
    ...pickFilter(rows, (r) => r.industry),
    // The list's own PSIC Code, and the RAW data's classification it matched (the healthcare basis).
    title: "PSIC Code → RAW classification",
    dataIndex: "industry",
    width: 240,
    render: (v, r) => (
      <>
        <Clip v={v} width={224} />
        {r.psicClass && (
          <Text type="secondary" style={{ fontSize: 11.5, display: "block" }}>
            → {r.psicClass}
          </Text>
        )}
      </>
    ),
  },
  // The city or municipality, and under it the province; filtered province by province.
  {
    title: "City / municipality, Province",
    key: "place",
    width: 170,
    render: (_, r) => (
      <>
        {r.city ? unitLabel(r.city) : <Text type="secondary">—</Text>}
        {r.province && <Under>{unitLabel(r.province)}</Under>}
      </>
    ),
    ...treeFilter(rows, (r) => r.province, (r) => r.city, unitLabel, unitLabel),
  },
  {
    title: "Colour",
    key: "colour",
    width: 190,
    ...pickFilter(rows, (r) => r.family || "none", (v) => (v === "none" ? "No colour" : masterlistLabel(v, names))),
    render: (_, r) => (
      <Space size={6}>
        <Swatch fill={r.fill} family={r.family} />
        <Text style={{ fontSize: 12 }}>{r.family ? masterlistLabel(r.family, names) : "No colour"}</Text>
      </Space>
    ),
  },
  {
    // The healthcare list it is counted under: marked on the list, or found in the healthcare RAW lists.
    title: "Healthcare / TSD / TRC firm",
    key: "healthcare",
    width: 170,
    align: "center",
    ...pickFilter(rows, healthcareOf),
    render: (_, r) =>
      r.hcUnit || r.healthcare === true ? (
        <Space size={4} wrap>
          {r.hcUnit ? (
            <Tooltip title={r.healthcare === true ? "Marked on the list (its Healthcare column or sheet)" : "Its PSIC Code is a healthcare classification of the RAW data, it is on the healthcare RAW lists, or a TSD / TRC permit"}>
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>{unitLabel(r.hcUnit)}</Tag>
            </Tooltip>
          ) : (
            <Tag style={{ marginInlineEnd: 0 }}>Marked</Tag>
          )}
          {r.doubtful && (
            <Tooltip title={`Marked healthcare, but its PSIC Code “${r.psic}” matches the RAW data's classification “${r.psicClass || r.psic}”, which is not a healthcare one. Not counted as healthcare; check the mark.`}>
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>Check</Tag>
            </Tooltip>
          )}
        </Space>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
  // Where the permit stands, and under it whether it is in the RAW data;
  // filtered by "in the RAW data" or not, then by standing.
  {
    title: "Standing / In RAW",
    key: "status",
    width: 210,
    ...treeFilter(
      rows,
      (r) => (r.inRaw ? "Yes" : "No"),
      (r) => standingOf(r, names),
      (v) => (v === "Yes" ? "In the RAW data" : "Not in the RAW data"),
      (s) => (s === "named" ? "Named colour" : PERMIT_STATUS[s]?.label || s)
    ),
    render: (_, r) => {
      const s = standingOf(r, names);
      const standing =
        s === "named" ? (
          <Tooltip title="A colour outside the workshop's legend, named for this season. Not checked against the RAW data.">
            <Tag style={{ marginInlineEnd: 0 }}>{names[r.family]}</Tag>
          </Tooltip>
        ) : (
          <Tooltip title={PERMIT_STATUS[s]?.hint}>
            <Tag color={PERMIT_STATUS[s]?.color} style={{ marginInlineEnd: 0 }}>{PERMIT_STATUS[s]?.label || s}</Tag>
          </Tooltip>
        );
      return (
        <>
          {standing}
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11.5 }}>In RAW: </Text>
            {r.inRaw ? <Tag color="green" style={{ marginInlineEnd: 0 }}>Yes</Tag> : <Tag style={{ marginInlineEnd: 0 }}>No</Tag>}
          </div>
        </>
      );
    },
  },
];

/**
 * "Colour does not match the RAW data", explained: what each colour claims,
 * how the claim is checked, how many fail it, and what to do. `counts`:
 * { green, pink, yellow, orange } — coloured but not in the RAW data — and
 * `red` — red but in it.
 */
const IN_RAW_COLOURS = ["green", "pink", "yellow", "orange"];
function MismatchExplainer({ counts, kind }) {
  const what = KIND_LABEL[kind] || kind;
  const missing = IN_RAW_COLOURS.reduce((a, f) => a + (counts[f] || 0), 0);
  const total = missing + (counts.red || 0);
  const cases = [
    {
      key: "missing",
      colours: IN_RAW_COLOURS,
      claim: `Green, pink, yellow and orange each say the ${what} is in the RAW data — already there (green), updated to the renewal (pink), newly added (yellow), or added with its firm (orange).`,
      fails: `…but the permit number is on no RAW file.`,
      count: missing,
      parts: IN_RAW_COLOURS.filter((f) => counts[f]).map((f) => `${n(counts[f])} ${MASTERLIST_FAMILY[f].label.toLowerCase()}`),
      fix: "Write the permit into the RAW data on the firm's row — or, if it was coloured by mistake, take the colour off the list.",
    },
    {
      key: "red",
      colours: ["red"],
      claim: "Red says the firm is not in the universe, so the permit cannot be in the RAW data.",
      fails: "…but the permit number is already on a RAW file.",
      count: counts.red || 0,
      parts: [],
      fix: "The firm has been added to the universe: turn the row orange (firm added in the universe RAW) — orange rises as red falls. If the firm was already there, recolour it green, pink or yellow; if the permit was written on the wrong firm, take it off that row.",
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
  const c = { green: 0, pink: 0, yellow: 0, orange: 0, red: 0 };
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
  // The filters offer what the whole list holds, whatever the view picked.
  const columns = useMemo(() => columnsFor(names, file.rows), [names, file.rows]);
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
      <Table
        className="pt-wrap-table"
        size="small"
        tableLayout="fixed"
        rowKey={(r) => `${r.sheet}!${r.row}|${r.permit}`}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true, showTotal: (total) => `${n(total)} row${total === 1 ? "" : "s"}` }}
        scroll={{ x: 1600 }}
      />
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
      {view === "mismatch" && <MismatchExplainer kind={kind} counts={{ green: missing("green"), pink: missing("pink"), yellow: missing("yellow"), orange: missing("orange"), red: f.red?.inRaw || 0 }} />}
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
  const rows = f.rows.filter((r) => (scope === "healthcare" ? Boolean(r.hcUnit) : !r.hcUnit));
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
        message="Marked Healthcare / TSD / TRC, but its PSIC Code is not a healthcare one"
        description={
          <Space direction="vertical" size={6}>
            <span>
              The basis: each permit&rsquo;s own <b>PSIC Code</b> on this masterlist, looked up in the RAW data&rsquo;s standard Industry Classification list. These rows
              are marked Yes in the &ldquo;Healthcare / TSD / TRC Firm&rdquo; column, but their PSIC Code is a classification that is not a healthcare one — e.g.
              &ldquo;Animal production&rdquo; is the RAW data&rsquo;s Animal Production. They stay in their province&rsquo;s count, under the Monitoring Plan, until the Yes or
              the PSIC Code is corrected. Each row shows its PSIC Code and the classification it matched.
            </span>
            {data?.healthcareClasses?.length > 0 && (
              <span>
                <b>Healthcare classifications:</b> {data.healthcareClasses.join(", ")}.
              </span>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              A PSIC Code matching none of the list is not judged: the Yes stands. The HWG ID list has no PSIC Code column; its healthcare firms are those on its Healthcare sheet.
            </Text>
          </Space>
        }
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
