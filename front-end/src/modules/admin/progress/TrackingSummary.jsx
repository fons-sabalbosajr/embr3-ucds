import { Button, Empty, Space, Tooltip, Typography } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import Papa from "papaparse";
import { message } from "../../../shared/feedback";
import { copyText } from "../../../shared/copyText";
import { FAMILY, n, unitLabel } from "./palette";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The UCD Tracking System's summary (the "tracking_v1" sheet of
// UCD_Document_Tracking.xlsx), live from the season's RAW files and newly
// issued permit lists — one column per province:
//
//   1. the count before the updating, the current count, added, duplicates;
//      the permits by kind (ECC/CNC with its share of the firms) — counted
//      as the sheet counts them: "In-process", "Interconnected" and
//      "App No." entries are not permits yet (shown apart, as pending);
//   2. the masterlist: the newly issued WWDP, PTO, HAZ (… ) lists' sizes;
//   3. "Added permits to universe": of each list, the permits already in the
//      RAW data — NEW, UPDATED (a renewal), FIRM NEW (with a firm added this
//      updating) — their sum, the list's count and the share done;
//   4. the conditional highlights' interpretation, colour by colour.
//
// The sheet's hand counts (NEW / UPDATE / FIRM NEW typed against each row)
// are worked out here: the list says new or renewal, the RAW data says on
// which firm a permit sits.
// ---------------------------------------------------------------------------

const PROVINCES = ["Aurora", "Bataan", "Bulacan", "Nueva_Ecija", "Pampanga", "Tarlac", "Zambales"];
const SHORT = { Aurora: "AU", Bataan: "BA", Bulacan: "BU", Nueva_Ecija: "NE", Pampanga: "PA", Tarlac: "TA", Zambales: "ZA" };
const LISTS = [
  { key: "wwdp", label: "DP", name: "WWDP" },
  { key: "pto", label: "PTO", name: "PTO" },
  { key: "haz", label: "HAZ", name: "HWG ID" },
];
const sumOf = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);

/** A number cell: right-aligned, "—" for none when asked. */
const Num = ({ v, dash, strong, tone }) => <td className={`ts-num${strong ? " is-strong" : ""}${tone ? ` ${tone}` : ""}`}>{dash && !v ? "—" : n(v)}</td>;
const Pct = ({ a, b }) => {
  const p = b ? Math.round((a / b) * 100) : null;
  return <td className={`ts-num ts-pct${p === null ? "" : p >= 100 ? " is-done" : p >= 50 ? " is-mid" : " is-low"}`}>{p === null ? "—" : `${p}%`}</td>;
};

export default function TrackingSummary({ matrix = [], checkedAt, seasonName }) {
  const units = PROVINCES.map((p) => matrix.find((u) => u.unit === p)).filter(Boolean);
  if (!units.length) return <Empty description="No RAW data read yet." />;

  const total = (get) => units.reduce((a, u) => a + (Number(get(u)) || 0), 0);
  const permit = (u, k) => u.permits?.[k] || 0;
  const issued = (u, k) => u.issuedByKind?.[k] || { issued: 0, inRaw: 0, status: { new: 0, updated: 0, firmNew: 0 } };
  const status = (u, k, s) => issued(u, k).status?.[s] || 0;

  // Block 1: the rows of the province matrix.
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
    { label: "PTO", get: (u) => permit(u, "pto"), strong: true },
    { label: "permit updated", get: (u) => status(u, "pto", "updated"), sub: true, hint: "renewals from the newly issued list, encoded" },
    { label: "new permit added", get: (u) => status(u, "pto", "new") + status(u, "pto", "firmNew"), sub: true, hint: "new permits from the newly issued list, encoded" },
    { label: "WWDP", get: (u) => permit(u, "wwdp"), strong: true },
    { label: "newly added", get: (u) => status(u, "wwdp", "new") + status(u, "wwdp", "firmNew") + status(u, "wwdp", "updated"), sub: true },
    { label: "HWG ID", get: (u) => permit(u, "haz"), strong: true },
    { label: "newly added", get: (u) => status(u, "haz", "new") + status(u, "haz", "firmNew") + status(u, "haz", "updated"), sub: true },
    { label: "TSD", get: (u) => permit(u, "tsd") },
    { label: "TP/TRC", get: (u) => permit(u, "trc") },
    { label: "PCO", get: (u) => permit(u, "pco") },
    { label: "Pending (In-process, App No.)", get: (u) => sumOf(u.pendingPermits), sub: true, hint: "written in a permit column but not a permit yet — not counted above" },
  ];

  // Block 2: the masterlist (the newly issued lists' sizes).
  const masterKinds = [
    { key: "wwdp", label: "WWDP" },
    { key: "pto", label: "PTO" },
    { key: "haz", label: "HAZ" },
    { key: "ecc", label: "ECC" },
    { key: "tsd", label: "TSD" },
    { key: "trc", label: "TP/TRC" },
  ].filter((k) => total((u) => issued(u, k.key).issued) > 0);

  // The whole summary as rows of text (CSV / copy).
  const asRows = () => {
    const out = [["UCD TRACKING SYSTEM SUMMARY", seasonName || "", checkedAt ? dayjs(checkedAt).format("M/D/YYYY h:mm A") : ""], [], ["Description", ...units.map((u) => unitLabel(u.unit).toUpperCase()), "TOTAL"]];
    for (const r of rows) {
      if (r.heading) out.push([r.heading]);
      else if (r.pct) out.push([r.label, ...units.map((u) => { const [a, b] = r.pct(u); return b ? `${Math.round((a / b) * 100)}%` : ""; }), (() => { const a = total((u) => r.pct(u)[0]); const b = total((u) => r.pct(u)[1]); return b ? `${Math.round((a / b) * 100)}%` : ""; })()]);
      else out.push([r.label, ...units.map((u) => r.get(u) || 0), total(r.get)]);
    }
    out.push([], ["MASTERLIST", ...units.map((u) => SHORT[u.unit]), "TOTAL"]);
    for (const k of masterKinds) out.push([k.label, ...units.map((u) => issued(u, k.key).issued), total((u) => issued(u, k.key).issued)]);
    out.push([], ["ADDED PERMITS TO UNIVERSE", ...LISTS.flatMap((l) => [`${l.label} NEW`, `${l.label} UPDATED`, `${l.label} FIRM NEW`, `${l.label} ACCOMP.`, `${l.label} COUNT`, `${l.label} n%`])]);
    for (const u of units) {
      out.push([
        SHORT[u.unit],
        ...LISTS.flatMap((l) => {
          const x = issued(u, l.key);
          return [x.status?.new || 0, x.status?.updated || 0, x.status?.firmNew || 0, x.inRaw, x.issued, x.issued ? `${Math.round((x.inRaw / x.issued) * 100)}%` : ""];
        }),
      ]);
    }
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
              <col style={{ width: "30%" }} />
              {units.map((u) => (
                <col key={u.unit} />
              ))}
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="ts-desc">Description</th>
                {units.map((u) => (
                  <th key={u.unit}>{unitLabel(u.unit).toUpperCase()}</th>
                ))}
                <th className="ts-total">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r.heading ? (
                  <tr key={i} className="ts-heading">
                    <td colSpan={units.length + 2}>{r.heading}</td>
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
                <col style={{ width: "26%" }} />
                {units.map((u) => (
                  <col key={u.unit} />
                ))}
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="ts-desc">MASTERLIST</th>
                  {units.map((u) => (
                    <th key={u.unit}>{SHORT[u.unit]}</th>
                  ))}
                  <th className="ts-total">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {masterKinds.map((k) => (
                  <tr key={k.key}>
                    <td className="ts-desc">{k.label}</td>
                    {units.map((u) => (
                      <Num key={u.unit} v={issued(u, k.key).issued} />
                    ))}
                    <Num v={total((u) => issued(u, k.key).issued)} strong tone="ts-total" />
                  </tr>
                ))}
                {!masterKinds.length && (
                  <tr>
                    <td colSpan={units.length + 2} className="ts-empty">
                      No newly issued permit list read yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 4. The conditional highlights, colour by colour. */}
          <div className="ts-block">
            <table className="ts-table ts-fit ts-indicators">
              <thead>
                <tr>
                  <th className="ts-desc" colSpan={2}>
                    CONDITIONAL HIGHLIGHTS — INTERPRETATION
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.unit}>
                    <td className="ts-desc">{unitLabel(u.unit)}</td>
                    <td>
                      <div className="ts-ind-list">
                        {(u.colours || []).slice(0, 5).map((c) => (
                          <Tooltip key={c.family} title={`${n(c.rows)} rows`}>
                            <span className="ts-ind">
                              <i style={{ background: c.shades?.[0] ? `#${c.shades[0].rgb}` : FAMILY[c.family]?.hex }} />
                              {c.label || <Text type="secondary">{FAMILY[c.family]?.label || c.family}</Text>}
                            </span>
                          </Tooltip>
                        ))}
                        {!u.colours?.length && <Text type="secondary">No highlighting</Text>}
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
            <col style={{ width: "7%" }} />
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
              <td className="ts-desc">TOTAL</td>
              {LISTS.flatMap((l) => {
                const t = (s) => total((u) => issued(u, l.key).status?.[s]);
                const done = total((u) => issued(u, l.key).inRaw);
                const all = total((u) => issued(u, l.key).issued);
                return [
                  <Num key={`${l.key}n`} v={t("new")} strong />,
                  <Num key={`${l.key}u`} v={t("updated")} strong />,
                  <Num key={`${l.key}f`} v={t("firmNew")} strong />,
                  <Num key={`${l.key}a`} v={done} strong />,
                  <Num key={`${l.key}c`} v={all} strong />,
                  <Pct key={`${l.key}p`} a={done} b={all} />,
                ];
              })}
            </tr>
          </tbody>
        </table>
        <Text type="secondary" className="ts-note">
          NEW, UPDATED and FIRM NEW are worked out, not typed: of each newly issued permit already in the RAW data — FIRM NEW when it sits on a firm added this
          updating (ERMS or ECC Online), UPDATED when its list says renewal, NEW otherwise.
        </Text>
      </div>
    </div>
  );
}
