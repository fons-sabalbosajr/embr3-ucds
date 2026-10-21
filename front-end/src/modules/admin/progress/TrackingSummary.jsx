import { useState } from "react";
import { Button, Empty, Segmented, Space, Tooltip, Typography } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import Papa from "papaparse";
import { message } from "../../../shared/feedback";
import { copyText } from "../../../shared/copyText";
import { totalOf } from "./ProvinceMatrix";
import { MASTERLIST, MASTERLIST_FAMILY, NO_COLOUR, masterlistHex, masterlistLabel, n, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The UCD Tracking System's summary (the "tracking_v1" sheet of
// UCD_Document_Tracking.xlsx), live from the season's RAW files and newly
// issued permit lists — one column per province, their TOTAL (the Monitoring
// Plan), and the healthcare lists (Healthcare Industries, Chemical permits,
// TSD / TRC, Importers) in a HEALTHCARE column of their own, apart from it:
//
//   1. the count before the updating, the current count, added, duplicates;
//      the permits by kind (ECC/CNC with its share of the firms) — counted
//      as the sheet counts them: "In-process", "Interconnected" and
//      "App No." entries are not permits yet (shown apart, as pending). PTO,
//      WWDP and HWG ID alike: the newly issued ones added, renewed and new;
//   2. the masterlist: the newly issued lists' sizes, as their province
//      sheets count them — AURORA (44) is 44: every row on the sheet, the
//      healthcare firms marked in its column and the sanitary landfills
//      alike, each shown under it ("of which"); HEALTHCARE: the firms the
//      lists keep apart (the HWG ID list's Healthcare sheet, TSD, TP/TRC);
//   3. "Added permits to universe": of each list, the permits already in the
//      RAW data — NEW, UPDATED (a renewal), FIRM NEW (with a firm added this
//      updating) — their sum, the list's count and the share done;
//   4. the conditional highlights' interpretation, colour by colour — from
//      the newly issued lists, as the workshop's legend reads them (green:
//      permit found; pink: renewed; yellow: new; red: firm not in the
//      universe), with the permits not yet highlighted.
//
// The sheet's hand counts (NEW / UPDATE / FIRM NEW typed against each row)
// are worked out here: the list says new or renewal, the RAW data says on
// which firm a permit sits.
// ---------------------------------------------------------------------------

const PROVINCES = ["Aurora", "Bataan", "Bulacan", "Nueva_Ecija", "Pampanga", "Tarlac", "Zambales"];
const HC = "Healthcare";
const SHORT = { Aurora: "AU", Bataan: "BA", Bulacan: "BU", Nueva_Ecija: "NE", Pampanga: "PA", Tarlac: "TA", Zambales: "ZA", [HC]: "HC" };
// The kinds of newly issued list the "Added permits to universe" block reads.
const LISTS = [
  { key: "wwdp", label: "DP", name: "WWDP" },
  { key: "pto", label: "PTO", name: "PTO" },
  { key: "haz", label: "HAZ", name: "HWG ID" },
  { key: "ecc", label: "ECC", name: "ECC/CNC" },
];
const sumOf = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
// The kinds of newly issued list the interpretation can read, and their names here.
const HL_KINDS = ["wwdp", "pto", "haz", "ecc", "pco", "tsd", "trc", "chemical", "importer"];
const KIND_NAME = { wwdp: "DP", pto: "PTO", haz: "HWG ID", ecc: "ECC/CNC", pco: "PCO", tsd: "TSD", trc: "TP/TRC", chemical: "Chemical", importer: "Importer" };
// Whole percents, rounded down: 100% only when every one is done.
const share = (a, b) => Math.floor((a / b) * 100 + 1e-9);
const pctText = (a, b) => (b ? `${share(a, b)}%` : "");

/** A number cell: right-aligned, "—" for none when asked. */
const Num = ({ v, dash, strong, tone }) => <td className={`ts-num${strong ? " is-strong" : ""}${tone ? ` ${tone}` : ""}`}>{dash && !v ? "—" : n(v)}</td>;
const Pct = ({ a, b, tone }) => {
  const p = b ? share(a, b) : null;
  return <td className={`ts-num ts-pct${p === null ? "" : p >= 100 ? " is-done" : p >= 50 ? " is-mid" : " is-low"}${tone ? ` ${tone}` : ""}`}>{p === null ? "—" : `${p}%`}</td>;
};

export default function TrackingSummary({ matrix = [], checkedAt, seasonName, names = {}, landfills = 0 }) {
  const units = PROVINCES.map((p) => matrix.find((u) => u.unit === p)).filter(Boolean);
  // The healthcare lists added together: their own column, never in the provinces' TOTAL.
  const hcUnits = matrix.filter((u) => u.group === "healthcare");
  const hc = hcUnits.length ? { ...totalOf(hcUnits, HC), unit: HC } : null;
  // Block 4 reads one kind of permit's list at a time — a province's DP list
  // done is not mixed with its untouched ECC or PTO lists. Until one is
  // picked: the kind furthest along in its highlighting.
  const [hlPicked, setHlPicked] = useState(null);
  if (!units.length && !hc) return <Empty description="No RAW data read yet." />;

  // Every column after the provinces' TOTAL: the healthcare lists'.
  const extra = hc ? [hc] : [];
  const all = [...units, ...extra];
  const total = (get) => units.reduce((a, u) => a + (Number(get(u)) || 0), 0);
  const permit = (u, k) => u.permits?.[k] || 0;
  const issued = (u, k) => u.issuedByKind?.[k] || { issued: 0, inRaw: 0, status: { new: 0, updated: 0, firmNew: 0 } };
  const status = (u, k, s) => issued(u, k).status?.[s] || 0;
  // The newly issued permits of a kind already in the RAW data: renewed (updated), new (on a firm of the universe or one added), and all.
  const renewed = (u, k) => status(u, k, "updated");
  const fresh = (u, k) => status(u, k, "new") + status(u, k, "firmNew");
  const newlyAdded = (u, k) => renewed(u, k) + fresh(u, k);

  // Block 1: the rows of the province matrix. PTO, WWDP and HWG ID alike:
  // the permits now, then those added from the newly issued list.
  const kindRows = (k, label) => [
    { label, get: (u) => permit(u, k), strong: true },
    { label: "newly added (from the masterlist)", get: (u) => newlyAdded(u, k), sub: true, hint: `newly issued ${label} already encoded in the RAW data: renewed + new` },
    { label: "of which renewed (permit updated)", get: (u) => renewed(u, k), sub: true, hint: "the list says renewal: the firm's permit updated" },
    { label: "of which new permit added", get: (u) => fresh(u, k), sub: true, hint: "a new permit, on a firm of the universe or one added this updating" },
  ];
  const rows = [
    { label: "Count (before the updating)", get: (u) => u.base, hint: "firms on the main sheet before this updating" },
    { label: "Current count", get: (u) => u.rows, strong: true },
    { label: "Added", get: (u) => u.rows - u.base, tone: "is-add", hint: "from ERMS and ECC Online" },
    { label: "of which from ERMS", get: (u) => u.added?.erms, sub: true },
    { label: "of which from ECC Online", get: (u) => u.added?.ecconline, sub: true },
    { label: "Duplicates", get: (u) => u.duplicate },
    { heading: "PERMITS" },
    { label: "ECC/CNC", get: (u) => permit(u, "ecc"), strong: true },
    { label: "n% of the firms", pct: (u) => [permit(u, "ecc"), u.rows], sub: true },
    ...kindRows("pto", "PTO"),
    ...kindRows("wwdp", "WWDP"),
    ...kindRows("haz", "HWG ID"),
    { label: "TSD", get: (u) => permit(u, "tsd") },
    { label: "TP/TRC", get: (u) => permit(u, "trc") },
    { label: "PCO", get: (u) => permit(u, "pco") },
    { label: "Pending (In-process, App No.)", get: (u) => sumOf(u.pendingPermits), sub: true, hint: "written in a permit column but not a permit yet — not counted above" },
  ];

  // Block 2: the masterlist (the newly issued lists' sizes).
  const masterKinds = [
    { key: "wwdp", label: "WWDP" },
    { key: "pto", label: "PTO" },
    { key: "haz", label: "HWG ID" },
    { key: "ecc", label: "ECC" },
    { key: "tsd", label: "TSD" },
    { key: "trc", label: "TP/TRC" },
  ].filter((k) => all.some((u) => issued(u, k.key).issued > 0));
  // Each kind's row, then what is within it: its healthcare / TSD / TRC firms
  // and its sanitary landfills — counted in the row, shown apart.
  const masterRows = masterKinds.flatMap((k) => {
    const hcOf = (u) => issued(u, k.key).scopes?.healthcare?.issued || 0;
    const lfOf = (u) => issued(u, k.key).landfills || 0;
    return [
      { key: k.key, label: k.label, get: (u) => issued(u, k.key).issued },
      ...(units.some((u) => hcOf(u) > 0) ? [{ key: `${k.key}-hc`, label: "of which healthcare / TSD / TRC", get: hcOf, sub: true, hint: `${k.label} of healthcare / TSD / TRC firms on the province sheets: marked in the list's column, or already on the healthcare RAW lists` }] : []),
      ...(all.some((u) => lfOf(u) > 0) ? [{ key: `${k.key}-lf`, label: "of which sanitary landfills", get: lfOf, sub: true, hint: `${k.label} issued to sanitary landfills: counted as the sheet counts them` }] : []),
    ];
  });

  // Block 4: the newly issued lists' colours, by the workshop's meaning — one kind of permit.
  const allTotal = (get) => all.reduce((a, u) => a + (Number(get(u)) || 0), 0);
  const hlKinds = HL_KINDS.filter((k) => allTotal((u) => u.issuedByKind?.[k]?.issued) > 0);
  const hlKind = hlKinds.includes(hlPicked) ? hlPicked : [...hlKinds].sort((a, b) => allTotal((u) => u.issuedByKind?.[b]?.colored) - allTotal((u) => u.issuedByKind?.[a]?.colored))[0] || null;
  const listOf = (u, k = hlKind) => u.issuedByKind?.[k] || {};
  const colourOf = (u, f, k) => listOf(u, k).families?.[f]?.rows || 0;
  const issuedOf = (u, k) => listOf(u, k).issued || 0;
  const notYet = (u, k) => Math.max(0, issuedOf(u, k) - (listOf(u, k).colored || 0));
  const otherColours = (u, k) => Object.entries(listOf(u, k).families || {}).filter(([f]) => !MASTERLIST_FAMILY[f]);

  // The whole summary as rows of text (CSV / copy).
  const asRows = () => {
    const head = (first, label = unitLabel) => [first, ...units.map((u) => label(u.unit)), "TOTAL (MONITORING PLAN)", ...extra.map((u) => label(u.unit).toUpperCase())];
    const out = [["UCD TRACKING SYSTEM SUMMARY", seasonName || "", checkedAt ? dayjs(checkedAt).format("M/D/YYYY h:mm A") : ""], [], head("Description", (u) => unitLabel(u).toUpperCase())];
    for (const r of rows) {
      if (r.heading) out.push([r.heading]);
      else if (r.pct)
        out.push([r.label, ...units.map((u) => pctText(...r.pct(u))), pctText(total((u) => r.pct(u)[0]), total((u) => r.pct(u)[1])), ...extra.map((u) => pctText(...r.pct(u)))]);
      else out.push([r.label, ...units.map((u) => r.get(u) || 0), total(r.get), ...extra.map((u) => r.get(u) || 0)]);
    }
    out.push([], head("MASTERLIST", (u) => SHORT[u]));
    for (const r of masterRows) out.push([r.label, ...units.map((u) => r.get(u)), total(r.get), ...extra.map((u) => r.get(u))]);
    // Each kind of permit's list on its own block; the colours outside the
    // workshop's legend found on any province's list, each its own column.
    for (const k of hlKinds) {
      const others = [...new Set(all.flatMap((u) => otherColours(u, k).map(([f]) => f)))];
      out.push([], [`CONDITIONAL HIGHLIGHTS — INTERPRETATION (newly issued ${KIND_NAME[k] || k} list)`, "ISSUED", "HIGHLIGHTED", ...MASTERLIST.map((m) => `${m.family.toUpperCase()}: ${m.label}`), ...others.map((f) => `${f.toUpperCase()}: ${masterlistLabel(f, names)}`), "NOT YET HIGHLIGHTED"]);
      for (const u of all) {
        out.push([unitLabel(u.unit), issuedOf(u, k), listOf(u, k).colored || 0, ...MASTERLIST.map((m) => colourOf(u, m.family, k)), ...others.map((f) => colourOf(u, f, k)), notYet(u, k)]);
      }
    }
    out.push([], ["ADDED PERMITS TO UNIVERSE", ...LISTS.flatMap((l) => [`${l.label} NEW`, `${l.label} UPDATED`, `${l.label} FIRM NEW`, `${l.label} ACCOMP.`, `${l.label} COUNT`, `${l.label} n%`])]);
    const addedRow = (label, get) =>
      out.push([
        label,
        ...LISTS.flatMap((l) => {
          const s = (st) => get((u) => issued(u, l.key).status?.[st]);
          const done = get((u) => issued(u, l.key).inRaw);
          const count = get((u) => issued(u, l.key).issued);
          return [s("new"), s("updated"), s("firmNew"), done, count, pctText(done, count)];
        }),
      ]);
    for (const u of units) addedRow(SHORT[u.unit], (f) => Number(f(u)) || 0);
    addedRow("TOTAL (MONITORING PLAN)", total);
    for (const u of extra) addedRow(SHORT[u.unit], (f) => Number(f(u)) || 0);
    return out;
  };
  const copy = async () => {
    if (await copyText(asRows().map((r) => r.join("\t")).join("\n"))) message.success("Summary copied — paste it into Excel.");
    else message.error("The browser would not copy it — use CSV instead.");
  };
  const download = () => {
    const blob = new Blob(["﻿" + Papa.unparse(asRows())], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `UCD-Tracking-Summary-${dayjs().format("YYYY-MM-DD")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // The column heads after the provinces: their TOTAL, then HEALTHCARE.
  const tailHeads = (short) => [
    <th key="total" className="ts-total">
      <Tooltip title="The Monitoring Plan: the seven provinces">TOTAL</Tooltip>
    </th>,
    ...extra.map((u) => (
      <th key={u.unit} className="ts-hc">
        <Tooltip title="The healthcare lists — Healthcare Industries, Chemical permits, TSD / TRC, Importers — apart from the Monitoring Plan">{short ? SHORT[u.unit] : "HEALTHCARE"}</Tooltip>
      </th>
    )),
  ];

  return (
    <div className="ts">
      <div className="ts-title">
        <div>
          <div className="ts-title-main">UCD TRACKING SYSTEM SUMMARY</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {seasonName ? `${seasonName} · ` : ""}live from the RAW files and the newly issued permit lists{checkedAt ? ` · as of ${dayjs(checkedAt).format("M/D/YYYY h:mm A")}` : ""}
          </Text>
        </div>
        <Space size={6}>
          <Button size="small" icon={<CopyOutlined />} onClick={copy}>
            Copy
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={download}>
            CSV
          </Button>
        </Space>
      </div>

      <div className="ts-blocks">
        {/* 1. The province matrix. */}
        <div className="ts-block ts-matrix">
          <table className="ts-table ts-fit">
            <colgroup>
              <col style={{ width: "28%" }} />
              {units.map((u) => (
                <col key={u.unit} />
              ))}
              <col style={{ width: "9%" }} />
              {extra.map((u) => (
                <col key={u.unit} style={{ width: "10%" }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="ts-desc">Description</th>
                {units.map((u) => (
                  <th key={u.unit}>{unitLabel(u.unit).toUpperCase()}</th>
                ))}
                {tailHeads(false)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r.heading ? (
                  <tr key={i} className="ts-heading">
                    <td colSpan={units.length + 2 + extra.length}>{r.heading}</td>
                  </tr>
                ) : (
                  <tr key={i} className={r.sub ? "is-sub" : ""}>
                    <td className="ts-desc">
                      {r.hint ? (
                        <Tooltip title={r.hint}>
                          <span className="ts-hinted">{r.label}</span>
                        </Tooltip>
                      ) : (
                        r.label
                      )}
                    </td>
                    {r.pct
                      ? units.map((u) => {
                          const [a, b] = r.pct(u);
                          return <Pct key={u.unit} a={a} b={b} />;
                        })
                      : units.map((u) => <Num key={u.unit} v={r.get(u)} strong={r.strong} tone={r.tone} dash={r.sub} />)}
                    {r.pct ? <Pct a={total((u) => r.pct(u)[0])} b={total((u) => r.pct(u)[1])} /> : <Num v={total(r.get)} strong tone="ts-total" dash={r.sub} />}
                    {extra.map((u) => {
                      if (!r.pct) return <Num key={u.unit} v={r.get(u)} strong={r.strong} tone="ts-hc" dash={r.sub} />;
                      const [a, b] = r.pct(u);
                      return <Pct key={u.unit} a={a} b={b} tone="ts-hc" />;
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="ts-side">
          {/* 2. The masterlist. */}
          <div className="ts-block">
            <table className="ts-table ts-fit">
              <colgroup>
                <col style={{ width: "20%" }} />
                {units.map((u) => (
                  <col key={u.unit} />
                ))}
                <col style={{ width: "11%" }} />
                {extra.map((u) => (
                  <col key={u.unit} style={{ width: "10%" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="ts-desc">MASTERLIST</th>
                  {units.map((u) => (
                    <th key={u.unit}>{SHORT[u.unit]}</th>
                  ))}
                  {tailHeads(true)}
                </tr>
              </thead>
              <tbody>
                {masterRows.map((r) => (
                  <tr key={r.key} className={r.sub ? "is-sub" : ""}>
                    <td className="ts-desc">
                      {r.hint ? (
                        <Tooltip title={r.hint}>
                          <span className="ts-hinted">{r.label}</span>
                        </Tooltip>
                      ) : (
                        r.label
                      )}
                    </td>
                    {units.map((u) => (
                      <Num key={u.unit} v={r.get(u)} strong={!r.sub} dash={r.sub} />
                    ))}
                    <Num v={total(r.get)} strong tone="ts-total" dash={r.sub} />
                    {extra.map((u) => (
                      <Num key={u.unit} v={r.get(u)} strong={!r.sub} tone="ts-hc" dash={r.sub} />
                    ))}
                  </tr>
                ))}
                {!masterKinds.length && (
                  <tr>
                    <td colSpan={units.length + 2 + extra.length} className="ts-empty">
                      No newly issued permit list read yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {masterKinds.length > 0 && (
              <Text type="secondary" className="ts-note">
                As each list&rsquo;s province sheets count it: every row on the sheet — AURORA (44) is 44 — its healthcare firms and sanitary landfills
                included and shown under it{landfills ? ` (${n(landfills)} landfill row${landfills === 1 ? "" : "s"} in all)` : ""}. HC: the firms a list keeps
                on its own Healthcare sheet, and the TSD and TP/TRC lists. A working copy of a list is not counted again.
              </Text>
            )}
          </div>

          {/* 4. The conditional highlights, colour by colour — the newly issued lists. */}
          <div className="ts-block">
            <table className="ts-table ts-fit ts-indicators">
              <thead>
                <tr>
                  <th className="ts-desc" colSpan={2}>
                    <div className="ts-ind-head">
                      <span>CONDITIONAL HIGHLIGHTS — INTERPRETATION{hlKind ? ` · ${KIND_NAME[hlKind] || hlKind}` : ""}</span>
                      {hlKinds.length > 1 && (
                        <Segmented size="small" value={hlKind} onChange={setHlPicked} options={hlKinds.map((k) => ({ value: k, label: KIND_NAME[k] || k }))} />
                      )}
                    </div>
                  </th>
                </tr>
                <tr>
                  <td colSpan={2} className="ts-ind-key">
                    {MASTERLIST.map((m) => (
                      <Tooltip key={m.family} title={m.hint}>
                        <span className="ts-ind">
                          <i style={{ background: m.hex }} />
                          {m.label}
                        </span>
                      </Tooltip>
                    ))}
                  </td>
                </tr>
              </thead>
              <tbody>
                {all.map((u) => (
                  <tr key={u.unit} className={u.unit === HC ? "ts-hc-row" : ""}>
                    <td className="ts-desc">
                      {u.unit === HC ? (
                        <Tooltip title={hcUnits.map((x) => unitLabel(x.unit)).join(", ")}>
                          <span className="ts-hinted">Healthcare</span>
                        </Tooltip>
                      ) : (
                        unitLabel(u.unit)
                      )}
                      {issuedOf(u) > 0 && (
                        <Tooltip title={`${n(listOf(u).colored)} of ${n(issuedOf(u))} newly issued ${KIND_NAME[hlKind] || hlKind} highlighted`}>
                          <div className="ts-ind-done">
                            {n(listOf(u).colored)}/{n(issuedOf(u))}
                          </div>
                        </Tooltip>
                      )}
                    </td>
                    <td>
                      <div className="ts-ind-list">
                        {MASTERLIST.filter((m) => colourOf(u, m.family)).map((m) => (
                          <Tooltip key={m.family} title={`${m.label}: ${m.hint} ${n(listOf(u).families[m.family].inRaw)} of them in the RAW data.`}>
                            <span className="ts-ind">
                              <i style={{ background: m.hex }} />
                              {m.label} <b>{n(colourOf(u, m.family))}</b>
                            </span>
                          </Tooltip>
                        ))}
                        {otherColours(u).map(([f, x]) => (
                          <Tooltip key={f} title={`${names[f] ? "Named for this season" : "A colour the workshop does not use"}; not checked against the RAW data.${Object.keys(x.shades || {}).length ? ` Shades: ${Object.keys(x.shades).map((s) => `#${s}`).join(", ")}.` : ""}`}>
                            <span className="ts-ind">
                              <i style={{ background: Object.keys(x.shades || {})[0] ? `#${Object.keys(x.shades)[0]}` : masterlistHex(f) }} />
                              <Text type={names[f] ? undefined : "secondary"}>{masterlistLabel(f, names)}</Text> <b>{n(x.rows)}</b>
                            </span>
                          </Tooltip>
                        ))}
                        {issuedOf(u) > 0 ? (
                          notYet(u) > 0 ? (
                            <Tooltip title="Permits on the list with no colour yet: not worked on.">
                              <span className="ts-ind">
                                <i style={{ background: NO_COLOUR.hex, outline: `1px solid ${NO_COLOUR.stroke}` }} />
                                <Text type="secondary">Not yet highlighted</Text> <b>{n(notYet(u))}</b>
                              </span>
                            </Tooltip>
                          ) : (
                            <Text strong style={{ color: "#389e0d", fontSize: 12 }}>
                              All highlighted
                            </Text>
                          )
                        ) : (
                          <Text type="secondary">No newly issued {KIND_NAME[hlKind] || ""} list</Text>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Added permits to universe. */}
      <div className="ts-block">
        <table className="ts-table ts-fit ts-updates">
          <colgroup>
            <col style={{ width: "8%" }} />
            {LISTS.flatMap((l) => ["n", "u", "f", "a", "c", "p"].map((k) => <col key={`${l.key}${k}`} />))}
          </colgroup>
          <thead>
            <tr>
              <th className="ts-desc" rowSpan={2}>
                ADDED PERMITS TO UNIVERSE
              </th>
              {LISTS.map((l) => (
                <th key={l.key} colSpan={6} className="ts-group">
                  {l.label} <Text type="secondary" style={{ fontWeight: 400 }}>({l.name})</Text>
                </th>
              ))}
            </tr>
            <tr>
              {LISTS.flatMap((l) => [
                <th key={`${l.key}n`}>
                  <Tooltip title="A new permit of an establishment already in the universe">NEW</Tooltip>
                </th>,
                <th key={`${l.key}u`}>
                  <Tooltip title="A renewal: the establishment's permit updated">UPDATED</Tooltip>
                </th>,
                <th key={`${l.key}f`}>
                  <Tooltip title="Came with a firm added this updating (ERMS or ECC Online)">FIRM NEW</Tooltip>
                </th>,
                <th key={`${l.key}a`}>
                  <Tooltip title="Already in the RAW data: NEW + UPDATED + FIRM NEW">ACCOMP.</Tooltip>
                </th>,
                <th key={`${l.key}c`}>
                  <Tooltip title="Permits on the newly issued list">COUNT</Tooltip>
                </th>,
                <th key={`${l.key}p`}>n%</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.unit}>
                <td className="ts-desc">{SHORT[u.unit]}</td>
                {LISTS.flatMap((l) => {
                  const x = issued(u, l.key);
                  return [
                    <Num key={`${l.key}n`} v={x.status?.new} />,
                    <Num key={`${l.key}u`} v={x.status?.updated} />,
                    <Num key={`${l.key}f`} v={x.status?.firmNew} />,
                    <Num key={`${l.key}a`} v={x.inRaw} strong />,
                    <Num key={`${l.key}c`} v={x.issued} />,
                    <Pct key={`${l.key}p`} a={x.inRaw} b={x.issued} />,
                  ];
                })}
              </tr>
            ))}
            <tr className="ts-sum">
              <td className="ts-desc">
                <Tooltip title="The Monitoring Plan: the seven provinces">TOTAL</Tooltip>
              </td>
              {LISTS.flatMap((l) => {
                const t = (s) => total((u) => issued(u, l.key).status?.[s]);
                const done = total((u) => issued(u, l.key).inRaw);
                const count = total((u) => issued(u, l.key).issued);
                return [
                  <Num key={`${l.key}n`} v={t("new")} strong />,
                  <Num key={`${l.key}u`} v={t("updated")} strong />,
                  <Num key={`${l.key}f`} v={t("firmNew")} strong />,
                  <Num key={`${l.key}a`} v={done} strong />,
                  <Num key={`${l.key}c`} v={count} strong />,
                  <Pct key={`${l.key}p`} a={done} b={count} />,
                ];
              })}
            </tr>
            {extra.map((u) => (
              <tr key={u.unit} className="ts-hc-row">
                <td className="ts-desc">
                  <Tooltip title={hcUnits.map((x) => unitLabel(x.unit)).join(", ")}>
                    <span className="ts-hinted">HC</span>
                  </Tooltip>
                </td>
                {LISTS.flatMap((l) => {
                  const x = issued(u, l.key);
                  return [
                    <Num key={`${l.key}n`} v={x.status?.new} />,
                    <Num key={`${l.key}u`} v={x.status?.updated} />,
                    <Num key={`${l.key}f`} v={x.status?.firmNew} />,
                    <Num key={`${l.key}a`} v={x.inRaw} strong />,
                    <Num key={`${l.key}c`} v={x.issued} />,
                    <Pct key={`${l.key}p`} a={x.inRaw} b={x.issued} />,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <Text type="secondary" className="ts-note">
          NEW, UPDATED and FIRM NEW are worked out, not typed: of each newly issued permit already in the RAW data — FIRM NEW when it sits on a firm added this
          updating (ERMS or ECC Online), UPDATED when its list says renewal, NEW otherwise. HC: the healthcare / TSD / TRC firms&rsquo; permits, apart from the
          provinces&rsquo; TOTAL.
        </Text>
      </div>
    </div>
  );
}
