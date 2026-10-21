import { useEffect, useState } from "react";
import { Button, Card, Col, Empty, Input, Modal, Progress, Row, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { saveMasterlistNames } from "./progressService";
import { EditOutlined, EyeInvisibleOutlined, EyeOutlined, FileDoneOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import IssuedKindDetail from "./IssuedKindDetail";
import { FoldCard, FoldTitle, setFoldAll, useFold } from "./Fold";
import { FAMILY, HEALTHCARE, KIND_LABEL, MASTERLIST, MASTERLIST_FAMILY, NO_COLOUR, SCOPES, inScope, isOtherColour, masterlistHex, n, pct, unitLabel } from "./palette";

dayjs.extend(relativeTime);
const { Text } = Typography;

// ---------------------------------------------------------------------------
// The Highlighting tab's newly issued lists. The masterlist holder colours
// each permit's row on its list by what they found in the RAW data (the
// workshop's legend, palette.js MASTERLIST): green — permit found; pink —
// renewed, updated; yellow — new, added; red — firm not in the universe. No
// colour: not yet worked on.
//
// Per kind of permit: how far the highlighting has come, the colours by
// meaning, how many are not yet highlighted, and how many colours the RAW
// data contradicts; "See more" opens the list(s) themselves
// (IssuedKindDetail). Then the same per province and list.
// ---------------------------------------------------------------------------

/** How many of a colour the RAW data contradicts: red in it, or green/pink/yellow not. */
const mismatchOf = (family, f) => (!MASTERLIST_FAMILY[family] ? 0 : family === "red" ? f.inRaw : f.rows - f.inRaw);

/** The permits whose row on the list has no colour yet: Issued − Highlighted. */
const notYetOf = (x) => Math.max(0, (x?.issued || 0) - (x?.colored || 0));

/** A province's or a municipality's row of the table: Issued = Highlighted (by colour) + Not yet highlighted, and the check. */
const figuresOf = (x) => {
  const families = x?.families || {};
  return {
    issued: x?.issued || 0,
    colored: x?.colored || 0,
    byColour: Object.fromEntries(MASTERLIST.map((m) => [m.family, families[m.family]?.rows || 0])),
    // Any colour outside the workshop's four, so the row's colours add up to Highlighted.
    otherColours: Object.entries(families).reduce((a, [f, v]) => a + (isOtherColour(f) ? v.rows || 0 : 0), 0),
    left: notYetOf(x),
    mismatched: Object.entries(families).reduce((a, [f, v]) => a + mismatchOf(f, v), 0),
  };
};

/**
 * What is happening to a kind of permit right now, for its tile's live mark:
 *   highlighting  its newly issued list is being edited (the masterlist holder colouring rows)
 *   encoding      a RAW data file being edited had permits of this kind
 *                 written in by its saves of the last minutes (the server's
 *                 `encoded`) — a RAW file merely open, or writing other
 *                 kinds, does not count
 *   watching      the tracker is reading the folders; nobody is at this kind
 *   idle          the season is not running: nothing is read
 * "Being edited" is a workbook Excel saved in the last few minutes (the
 * server's editingNow).
 */
function activityOf(k, editing, watching) {
  const lists = editing.filter((e) => e.kind === "permits" && e.permitKinds?.includes(k));
  const raws = editing.filter((e) => e.kind === "raw" && e.encoded?.[k] > 0);
  if (lists.length) return { state: "highlighting", items: lists };
  if (raws.length) return { state: "encoding", items: raws };
  return { state: watching ? "watching" : "idle", items: [] };
}

const whoOf = (items, k) =>
  items
    .map((e) =>
      [e.units?.length ? e.units.map(unitLabel).join(", ") : null, e.encoded?.[k] ? `${n(e.encoded[k])} ${KIND_LABEL[k] || k} written in` : null, e.by]
        .filter(Boolean)
        .join(" — ") || "a workbook"
    )
    .join("; ");

/** The tile's live mark: a writing pencil while someone works on it, a pulsing dot while the tracker watches. */
function LiveMark({ k, editing, watching, checkedAt }) {
  const { state, items } = activityOf(k, editing, watching);
  const last = items[0]?.at ? ` · saved ${dayjs(items[0].at).fromNow()}` : "";
  const checked = checkedAt ? ` Files last checked ${dayjs(checkedAt).fromNow()}.` : "";
  if (state === "highlighting" || state === "encoding") {
    const what = state === "highlighting" ? `Highlighting the newly issued ${KIND_LABEL[k] || k} list now` : `Encoding ${KIND_LABEL[k] || k} in the RAW data now`;
    return (
      <Tooltip title={`${what}: ${whoOf(items, k)}${last}.${checked}`}>
        <span className={`pt-tile-live is-${state}`} role="status" aria-label={what}>
          <span className="pt-tile-pen" aria-hidden="true">
            <span className="pt-editing-ring" />
            <EditOutlined className="pt-editing-pen" />
          </span>
          {state === "highlighting" ? "Highlighting" : "Encoding"}
          <span className="pt-editing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={state === "watching" ? `The tracker is watching the folders; no ${KIND_LABEL[k] || k} is being highlighted or written in right now.${checked}` : "The season is not running: the files are not being read."}>
      <span className={`pt-live${state === "watching" ? " is-live" : ""} pt-tile-idle`} role="status">
        <span className="pt-live-dot" />
        {state === "watching" ? "Live" : "Not watching"}
      </span>
    </Tooltip>
  );
}

/** A colour's shades as used on the lists, each its own swatch (hex and count on hover). */
const Shades = ({ shades = {}, family }) => {
  const list = Object.entries(shades).sort((a, b) => b[1] - a[1]);
  if (!list.length) return <span className="pt-swatch is-small" style={{ background: masterlistHex(family) }} />;
  return (
    <span className="pt-shade-set">
      {list.slice(0, 4).map(([rgb, count]) => (
        <Tooltip key={rgb} title={`#${rgb} · ${n(count)} permit${count === 1 ? "" : "s"}`}>
          <span className="pt-swatch is-small" style={{ background: `#${rgb}` }} />
        </Tooltip>
      ))}
      {list.length > 4 && <span className="pt-shade-more">+{list.length - 4}</span>}
    </span>
  );
};

/** One kind of permit's list(s): highlighted of issued, by colour, and what is left. */
function KindCard({ k, x, accent, onMore, live, names, onName, scope = "all", mark = null }) {
  // Folded: the percentage and its bar only, the breakdown hidden.
  const [open, setOpen] = useFold(`hl-kind-${k}`, true, "hl-kinds");
  const families = x.families || {};
  const left = notYetOf(x);
  const others = Object.entries(families).filter(([f]) => isOtherColour(f));
  return (
    <Card size="small" className={`pt-summary pt-tile-in${open ? "" : " is-folded"}`}>
      <div className="pt-summary-head pt-tile-head">
        <Text type="secondary" className="pt-summary-title">
          <FoldTitle open={open} onToggle={setOpen}>
            <FileDoneOutlined />
            {KIND_LABEL[k] || k}
          </FoldTitle>
          {!open && (
            <span className="pt-fold-summary">
              {" "}
              · {n(x.colored)} / {n(x.issued)}
            </span>
          )}
        </Text>
        <LiveMark k={k} {...live} />
      </div>
      <div className="pt-summary-value">
        {pct(x.colored, x.issued)}%<Text type="secondary"><small>highlighted</small></Text>
      </div>
      <Progress percent={pct(x.colored, x.issued)} showInfo={false} strokeColor={accent} style={{ margin: 0 }} />
      {/* Issued = Highlighted (by colour, each row below it) + Not yet highlighted. */}
      <div className="pt-summary-rows">
        <Tooltip title="Permits on the newly issued list(s), each counted once.">
          <div className="pt-summary-row"><span style={{ width: 10 }} /><Text type="secondary">Issued</Text><b>{n(x.issued)}</b></div>
        </Tooltip>
        <div className="pt-summary-row has-divider">
          <span style={{ width: 10 }} />
          <Tooltip title="Permits whose row on the list has a colour — the colours below add up to it.">
            <Text>Highlighted</Text>
          </Tooltip>
          <Tooltip title="See the breakdown: each colour, and how many the RAW data agrees with">
            <Button type="text" size="small" className="pt-eye" icon={<EyeOutlined />} onClick={() => onMore("highlighted")} aria-label={`See the breakdown of the highlighted ${KIND_LABEL[k] || k}`} />
          </Tooltip>
          <b>{n(x.colored)}</b>
        </div>
        {MASTERLIST.map((m) => (
          <Tooltip key={m.family} title={m.hint}>
            <div className="pt-summary-row is-sub">
              <span className="pt-swatch is-small" style={{ background: m.hex }} />
              <Text type="secondary">{m.label}</Text>
              <b>{n(families[m.family]?.rows)}</b>
            </div>
          </Tooltip>
        ))}
        {/* The colours the workshop does not use, each on its own: its shades, and its name. */}
        {others.map(([f, v]) => (
          <div key={f} className="pt-summary-row is-sub pt-other-colour">
            <Shades shades={v.shades} family={f} />
            <Tooltip title={names?.[f] ? `Named by the Developer. Not judged against the RAW data. ${n(v.inRaw)} of ${n(v.rows)} are in it.` : `${FAMILY[f]?.label || f}: a colour the workshop's legend does not use. ${n(v.inRaw)} of ${n(v.rows)} are in the RAW data.`}>
              <Text type="secondary" className="pt-other-name">
                {names?.[f] || <i>{FAMILY[f]?.label || f} — unnamed</i>}
              </Text>
            </Tooltip>
            {onName && (
              <Button type="link" size="small" className="pt-other-edit" icon={<EditOutlined />} onClick={() => onName(f)} aria-label={`Name the ${FAMILY[f]?.label || f} colour`}>
                {names?.[f] ? "" : "Name it"}
              </Button>
            )}
            <b>{n(v.rows)}</b>
          </div>
        ))}
        <Tooltip title="Permits whose row on the list has no colour yet: still to be looked up in the RAW data.">
          <div className="pt-summary-row has-divider">
            <span className="pt-swatch is-small" style={{ background: NO_COLOUR.hex, outline: `1px solid ${NO_COLOUR.stroke}` }} />
            <Text>Not yet highlighted</Text>
            <b>{n(left)}</b>
          </div>
        </Tooltip>
        {/* The healthcare / TSD / TRC firms: Yes in the list's column — beside the colours, not one of them. */}
        {scope === "all" && mark?.healthcare > 0 && (
          <Tooltip title={HEALTHCARE.hint}>
            <div className="pt-summary-row has-divider">
              <span className="pt-dot pt-dot-healthcare" />
              <Text type="secondary">{HEALTHCARE.label}</Text>
              <b>{n(mark.healthcare)}</b>
            </div>
          </Tooltip>
        )}
        {scope === "all" && mark?.healthcareDoubtful > 0 && (
          <div className="pt-summary-row is-sub">
            <span style={{ width: 10 }} />
            <Tooltip title="Marked Yes in the list's “Healthcare / TSD / TRC Firm” column, but the permit's own PSIC Code on the masterlist is, in the RAW data's standard Industry Classification list, not a healthcare classification (healthcare: hospital, clinic, dental, diagnostic, dialysis, laboratory, nursing home, blood service, ultrasound, treatment and disposal of hazardous waste). E.g. “Animal production” is Animal Production. Kept under the Monitoring Plan; open the eye to see each one.">
              <Text type="warning">…marked, but not a healthcare establishment</Text>
            </Tooltip>
            <Tooltip title="See these permits">
              <Button type="text" size="small" className="pt-eye" icon={<EyeOutlined />} onClick={() => onMore("doubtful")} aria-label={`See the ${KIND_LABEL[k] || k} permits marked healthcare on a non-healthcare firm`} />
            </Tooltip>
            <b style={{ color: "#d48806" }}>{n(mark.healthcareDoubtful)}</b>
          </div>
        )}
      </div>
      <Button type="link" size="small" className="pt-more" onClick={() => onMore()}>
        See more <RightOutlined />
      </Button>
    </Card>
  );
}

// The kinds hidden on this card, remembered per browser (a convenience only).
const HIDDEN_KEY = "pt.issuedHighlighting.hidden";
const readHidden = () => {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const saveHidden = (list) => {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
};

/** A province's newly issued permits of the kinds shown, within a universe, added up (each kind's counts, per kind). */
function unitOfKinds(u, kinds, scope = "all") {
  const out = { unit: u.unit, issued: 0, inRaw: 0, colored: 0, coloredInRaw: 0, families: {} };
  for (const k of kinds) {
    const x = u.issuedByKind?.[k] && inScope(u.issuedByKind[k], scope);
    if (!x) continue;
    out.issued += x.issued || 0;
    out.inRaw += x.inRaw || 0;
    out.colored += x.colored || 0;
    out.coloredInRaw += x.coloredInRaw || 0;
    for (const [f, v] of Object.entries(x.families || {})) {
      const t = (out.families[f] ||= { rows: 0, inRaw: 0 });
      t.rows += v.rows || 0;
      t.inRaw += v.inRaw || 0;
    }
  }
  return out;
}

/**
 * The Developer names the colours on the newly issued lists that the
 * workshop's legend does not use — every such colour found on any list, with
 * its shades. Named, not judged: the RAW data is not held against them.
 */
function NameColours({ open, focus, colours, names, seasonId, queryKey, onClose }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (open) setDraft({ ...names });
  }, [open, names]);
  const save = useMutation({
    mutationFn: () => saveMasterlistNames({ id: seasonId, names: draft }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      message.success("Colour names saved.");
      onClose();
    },
    onError: (e) => message.error(e?.response?.data?.message || "The names could not be saved."),
  });
  return (
    <Modal open={open} title="Name the other colours" okText="Save" onOk={() => save.mutate()} confirmLoading={save.isPending} onCancel={onClose} destroyOnHidden>
      <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 12 }}>
        Colours on the newly issued lists that the workshop&rsquo;s legend (green, pink, yellow, red) does not use. Give each what it means for this season; the name shows on the tiles, the charts and the summary. These colours are not checked against the RAW data.
      </Text>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {colours.map(([f, v]) => (
          <div key={f} className="pt-name-colour">
            <Shades shades={v.shades} family={f} />
            <Text style={{ width: 110, flex: "none" }}>
              {FAMILY[f]?.label || f} <Text type="secondary">({n(v.rows)})</Text>
            </Text>
            <Input
              autoFocus={f === focus}
              maxLength={60}
              placeholder="What this colour means"
              value={draft[f] || ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
              onPressEnter={() => save.mutate()}
            />
          </div>
        ))}
      </Space>
    </Modal>
  );
}

export default function IssuedHighlighting({ byKind = {}, kinds = [], units = [], accent, admin = false, editing = [], watching = false, checkedAt = null, names = {}, seasonId = null, queryKey = null }) {
  const live = { editing, watching, checkedAt };
  const [more, setMore] = useState(null); // { kind, view }: the See more window, on a view (e.g. "mismatch") or its default
  const [naming, setNaming] = useState(null); // the colour family the naming window opened on
  // Every colour outside the workshop's legend, on any list, its shades added up.
  const otherColours = Object.entries(
    Object.values(byKind).reduce((acc, x) => {
      for (const [f, v] of Object.entries(x?.families || {})) {
        if (!isOtherColour(f)) continue;
        const t = (acc[f] ||= { rows: 0, shades: {} });
        t.rows += v.rows || 0;
        for (const [rgb, c] of Object.entries(v.shades || {})) t.shades[rgb] = (t.shades[rgb] || 0) + c;
      }
      return acc;
    }, {})
  );
  const canName = admin && seasonId && queryKey;
  const [hidden, setHidden] = useState(readHidden);
  const toggle = (k) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    saveHidden(next);
  };
  // The universe the tiles and the table count: every permit, the Monitoring
  // Plan's, or Healthcare / TSD / TRC's (as the lists mark them).
  const [scope, setScope] = useState("all");
  const marked = Object.values(byKind).some((x) => x?.healthcare > 0);
  const scoped = (k) => inScope(byKind[k], scope);
  const listed = kinds.filter((k) => byKind[k]?.issued);
  // Hidden by the Show row, or with nothing in the universe picked.
  const shown = listed.filter((k) => !hidden.includes(k) && scoped(k).issued > 0);
  // The province table shows one kind of permit at a time — the kinds are
  // different things and never added together — picked among those shown.
  const [picked, setPicked] = useState(null);
  // Until one is picked: the kind furthest along in its highlighting (the list being worked on).
  const tableKind = shown.includes(picked) ? picked : [...shown].sort((a, b) => (scoped(b).colored || 0) - (scoped(a).colored || 0))[0] || null;
  // Each province's figures worked out once, so every column can sort on them;
  // `order` keeps the provinces' own order (Aurora first) when no sort is set.
  // Each opens into its cities and municipalities, counted the same way.
  // With All permits, each row's Issued — the province sheet's count (AURORA
  // (44) is 44) — split into its Monitoring Plan firms and its healthcare /
  // TSD / TRC firms, the two adding up to it.
  const split = (x) => ({ plan: inScope(x, "plan").issued || 0, hc: inScope(x, "healthcare").issued || 0 });
  const rows = units
    .map((u, order) => {
      const cities = Object.entries(u.issuedByKind?.[tableKind]?.cities || {})
        .map(([city, c]) => ({ unit: `${u.unit}|${city}`, ...figuresOf(inScope(c, scope)), ...split(c), name: unitLabel(city.replace(/․/g, ".")), order: 0, city: true }))
        .filter((c) => c.issued > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      // `children`: the table's tree rows — the municipalities open under their province.
      return {
        unit: u.unit,
        ...figuresOf(unitOfKinds(u, tableKind ? [tableKind] : [], scope)),
        ...split(u.issuedByKind?.[tableKind]),
        order,
        name: unitLabel(u.unit),
        ...(cities.length ? { children: cities } : {}),
      };
    })
    .filter((u) => u.issued > 0);
  // The table's Total: every province and healthcare list, each counted once.
  const tableTotal = rows.reduce(
    (t, r) => {
      for (const k of ["issued", "colored", "plan", "hc", "otherColours", "left", "mismatched"]) t[k] += r[k] || 0;
      for (const m of MASTERLIST) t.byColour[m.family] += r.byColour?.[m.family] || 0;
      return t;
    },
    { issued: 0, colored: 0, plan: 0, hc: 0, otherColours: 0, left: 0, mismatched: 0, byColour: Object.fromEntries(MASTERLIST.map((m) => [m.family, 0])) }
  );
  const byNumber = (get) => (a, b) => get(a) - get(b) || a.order - b.order;
  const tableColumns = [
    {
      title: "Province / municipality",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v, r) => (r.city ? <span>{v}</span> : <span className="pt-issued-name">{v}</span>),
    },
    // As on the tiles: Issued = Highlighted (the colours after it) + Not yet highlighted.
    { title: <Tooltip title="As the list's province sheet counts it — AURORA (44) is 44">Issued</Tooltip>, dataIndex: "issued", align: "right", sorter: byNumber((u) => u.issued), render: (v) => <b>{n(v)}</b> },
    // All permits: Issued = Monitoring Plan + Healthcare / TSD / TRC.
    ...(scope === "all"
      ? [
          { title: <Tooltip title="Permits of the Monitoring Plan's firms">Monitoring Plan</Tooltip>, dataIndex: "plan", align: "right", sorter: byNumber((u) => u.plan), render: n },
          { title: <Tooltip title={HEALTHCARE.hint}>Healthcare / TSD / TRC</Tooltip>, dataIndex: "hc", align: "right", sorter: byNumber((u) => u.hc), render: n },
        ]
      : []),
    { title: "Highlighted", dataIndex: "colored", align: "right", sorter: byNumber((u) => u.colored), render: (v) => <b>{n(v)}</b> },
    ...MASTERLIST.map((m) => ({
      title: (
        <Tooltip title={m.hint}>
          <Space size={4}>
            <span className="pt-swatch is-small" style={{ background: m.hex }} />
            {m.label}
          </Space>
        </Tooltip>
      ),
      key: m.family,
      align: "right",
      sorter: byNumber((u) => u.byColour[m.family]),
      render: (_, u) => n(u.byColour[m.family]),
    })),
    ...(rows.some((u) => u.otherColours || u.children?.some((c) => c.otherColours))
      ? [{ title: <Tooltip title="Colours the workshop's legend does not use">Other colours</Tooltip>, dataIndex: "otherColours", align: "right", sorter: byNumber((u) => u.otherColours), render: n }]
      : []),
    { title: "Not yet highlighted", dataIndex: "left", align: "right", sorter: byNumber((u) => u.left), render: (v) => <b>{n(v)}</b> },
    {
      title: "Does not match",
      dataIndex: "mismatched",
      align: "right",
      sorter: byNumber((u) => u.mismatched),
      render: (v) => (v ? <Text type="danger" strong>{n(v)}</Text> : <Text type="secondary">0</Text>),
    },
  ];
  const allIssued = shown.reduce((a, k) => a + (scoped(k).issued || 0), 0);
  const allColored = shown.reduce((a, k) => a + (scoped(k).colored || 0), 0);
  return (
    <FoldCard
      id="hl-issued-lists"
      title={
        <Space size={6}>
          <FileDoneOutlined />
          Highlighted on the newly issued lists
        </Space>
      }
      summary={
        allIssued > 0 && (
          <Text type="secondary" className="pt-fold-summary">
            {pct(allColored, allIssued)}% highlighted · {shown.length} {shown.length === 1 ? "kind" : "kinds"}
          </Text>
        )
      }
      extra={
        <Space size={6}>
          {shown.length > 1 && (
            <>
              <Button size="small" onClick={() => setFoldAll("hl-kinds", true)}>
                Expand tiles
              </Button>
              <Button size="small" onClick={() => setFoldAll("hl-kinds", false)}>
                Collapse tiles
              </Button>
            </>
          )}
          {canName && otherColours.length > 0 ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => setNaming(otherColours[0][0])}>
              Name other colours
            </Button>
          ) : (
            <Text type="secondary" className="pt-card-hint">the newly issued permit folder</Text>
          )}
        </Space>
      }
    >
      <div className="pt-mlist-key">
        {MASTERLIST.map((m) => (
          <Tooltip key={m.family} title={m.hint}>
            <span className="pt-mlist-chip">
              <span className="pt-swatch is-small" style={{ background: m.hex }} />
              {m.label}
            </span>
          </Tooltip>
        ))}
        {otherColours.map(([f, v]) => (
          <Tooltip key={f} title={names[f] ? `Named for this season. Not checked against the RAW data.` : "A colour the workshop's legend does not use."}>
            <span className="pt-mlist-chip">
              <Shades shades={v.shades} family={f} />
              {names[f] || <i>{FAMILY[f]?.label || f} — unnamed</i>}
            </span>
          </Tooltip>
        ))}
        <span className="pt-mlist-chip">
          <span className="pt-swatch is-small" style={{ background: NO_COLOUR.hex, outline: `1px solid ${NO_COLOUR.stroke}` }} />
          Not yet highlighted
        </span>
      </div>
      <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 10 }}>
        The masterlist holder looks each permit up in the RAW data and colours its row by what they found. Each colour is held against the RAW data: green, pink and yellow must be in it; red must not be.
      </Text>
      {marked && (
        <div className="pt-mlist-show">
          <Text type="secondary" style={{ fontSize: 12 }}>
            Universe:
          </Text>
          <Segmented
            size="small"
            value={scope}
            onChange={setScope}
            options={SCOPES.map((s) => ({ value: s.key, label: s.hint ? <Tooltip title={s.hint}>{s.label}</Tooltip> : s.label }))}
          />
        </div>
      )}
      {listed.length > 1 && (
        <div className="pt-mlist-show">
          <Text type="secondary" style={{ fontSize: 12 }}>
            Show:
          </Text>
          {listed.map((k) => (
            <Tag.CheckableTag key={k} checked={!hidden.includes(k)} onChange={() => toggle(k)}>
              {hidden.includes(k) ? <EyeInvisibleOutlined /> : <EyeOutlined />} {KIND_LABEL[k] || k}
            </Tag.CheckableTag>
          ))}
          {hidden.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {hidden.filter((k) => listed.includes(k)).length} hidden — not offered in the table below either
            </Text>
          )}
        </div>
      )}
      {shown.length ? (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Row gutter={[12, 12]}>
            {shown.map((k) => (
              <Col key={k} flex="1 1 220px">
                <KindCard
                  k={k}
                  x={scoped(k)}
                  mark={byKind[k]}
                  scope={scope}
                  accent={accent}
                  onMore={(view) => setMore({ kind: k, view: view || null, scope })}
                  live={live}
                  names={names}
                  onName={canName ? setNaming : null}
                />
              </Col>
            ))}
          </Row>
          {tableKind && (
            <div className="pt-issued-by">
              <div className="pt-issued-head">
                <Text strong className="pt-issued-title">
                  {KIND_LABEL[tableKind] || tableKind} per province and municipality
                  {scope !== "all" && <Text type="secondary" style={{ fontWeight: 400 }}> · {SCOPES.find((s) => s.key === scope).label}</Text>}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Open a province (＋) for its municipalities.
                </Text>
                {shown.length > 1 && (
                  <Segmented size="small" value={tableKind} onChange={setPicked} options={shown.map((k) => ({ value: k, label: KIND_LABEL[k] || k }))} />
                )}
              </div>
              {rows.length ? (
                <Table
                  className="pt-issued-table"
                  size="small"
                  rowKey="unit"
                  pagination={false}
                  dataSource={rows}
                  scroll={{ x: scope === "all" ? 1120 : 900 }}
                  expandable={{ indentSize: 18 }}
                  rowClassName={(r) => (r.city ? "pt-issued-city" : "")}
                  // Click a heading: ascending, descending, then back to the provinces' order
                  // (the municipalities sort the same way under their province).
                  sortDirections={["ascend", "descend"]}
                  showSorterTooltip={{ title: "Sort" }}
                  columns={tableColumns}
                  summary={() =>
                    rows.length > 1 && (
                      <Table.Summary fixed>
                        <Table.Summary.Row className="pt-row-total">
                          {tableColumns.map((c, i) => (
                            <Table.Summary.Cell key={c.key || c.dataIndex} index={i} align={c.align}>
                              {i === 0 ? <b>Total</b> : c.render(tableTotal[c.dataIndex], tableTotal)}
                            </Table.Summary.Cell>
                          ))}
                        </Table.Summary.Row>
                      </Table.Summary>
                    )
                  }
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No newly issued ${KIND_LABEL[tableKind] || tableKind} with a province.`} />
              )}
            </div>
          )}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            !listed.length
              ? "No newly issued list read yet."
              : listed.every((k) => hidden.includes(k))
                ? "Every kind of permit is hidden — pick one under Show."
                : `No permit of the kinds shown is in ${SCOPES.find((s) => s.key === scope).label} yet.`
          }
        />
      )}
      <Modal
        open={Boolean(more)}
        title={
          more
            ? `${
                more.view === "highlighted"
                  ? `Newly issued ${KIND_LABEL[more.kind] || more.kind}: the highlighted rows`
                  : more.view === "mismatch"
                  ? `Newly issued ${KIND_LABEL[more.kind] || more.kind}: colour does not match the RAW data`
                  : more.view === "doubtful"
                    ? `Newly issued ${KIND_LABEL[more.kind] || more.kind}: marked healthcare on a non-healthcare firm`
                    : `Newly issued ${KIND_LABEL[more.kind] || more.kind}: the list${admin ? "s" : ""} as highlighted`
              }${more.scope && more.scope !== "all" && more.view !== "doubtful" ? ` · ${SCOPES.find((s) => s.key === more.scope).label}` : ""}`
            : ""
        }
        onCancel={() => setMore(null)}
        footer={null}
        // Wide: the permit table has eight columns. Up to 1440px, never past the screen.
        width="min(1440px, 96vw)"
        style={{ top: 32 }}
        destroyOnHidden
      >
        {more && <IssuedKindDetail kind={more.kind} x={inScope(byKind[more.kind], more.scope)} admin={admin} names={names} view={more.view} scope={more.scope} />}
      </Modal>
      {canName && <NameColours open={Boolean(naming)} focus={naming} colours={otherColours} names={names} seasonId={seasonId} queryKey={queryKey} onClose={() => setNaming(null)} />}
    </FoldCard>
  );
}
