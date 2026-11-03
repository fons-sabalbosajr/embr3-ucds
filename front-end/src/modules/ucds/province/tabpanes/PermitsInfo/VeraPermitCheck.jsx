import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Collapse, Popover, Space, Tag, Tooltip, Typography, theme } from "antd";
import { ClockCircleOutlined, EditOutlined, ExclamationCircleOutlined, MessageOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { VeraFlame } from "../../../../vera/VeraMark";
import { analyzePermits, openVera } from "../../../../vera/veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// VERA's check of this record's clearances and permits, against the laws in
// her library (server: services/vera/permitAnalysis.js).
//
// Worked out by rule, not by a model: each permit's state (in date, expiring,
// expired, missing, not needed), then what needs attention, each with the
// sections of the law it rests on — the enacted text a click away. Follows the
// record as it is edited. "Ask VERA" opens the chat on this firm, where the
// same file is explained and cited.
//
// A round button floating at the foot of the tab, its badge the findings
// (red when one is serious); the check opens over the permits as a card. It
// was a card of its own above them, taking the tab's height from the permits.
// ---------------------------------------------------------------------------

const SHORT = { ecc: "ECC/CNC", pto: "PTO", wwdp: "WWDP", hw: "HW ID", pco: "PCO", chem: "Chemical", importer: "Importer", tsd: "TSD", trc: "TRC" };
const STATE = {
  valid: { color: "green", text: (p) => `valid to ${p.expires}` },
  expiring: { color: "gold", text: (p) => `expires ${p.expires}` },
  expired: { color: "red", text: (p) => `expired ${p.expires}` },
  missing: { color: "volcano", text: () => "missing" },
  "on-file": { color: "blue", text: () => "on file" },
  "not-needed": { color: "default", text: (p) => p.written || "not applicable" },
  "not-assessed": { color: "default", text: () => "none" },
};
const SEVERITY = {
  high: { icon: ExclamationCircleOutlined, color: "error", label: "serious" },
  medium: { icon: ClockCircleOutlined, color: "warning", label: "to watch" },
  low: { icon: EditOutlined, color: "secondary", label: "entries to correct" },
};

// What is sent: the record's plain values (the server keeps only the permit fields).
const plain = (record) => Object.fromEntries(Object.entries(record || {}).filter(([, v]) => v == null || typeof v !== "object"));

function LawTag({ refKey, law }) {
  const section = law.find((l) => l.key === refKey);
  if (!section) return null;
  const content = (
    <div style={{ maxWidth: 460 }}>
      <Text strong>
        {section.label}
        {section.heading ? ` — ${section.heading}` : ""}
      </Text>
      <Paragraph style={{ whiteSpace: "pre-wrap", fontSize: 12.5, maxHeight: 260, overflowY: "auto", margin: "6px 0" }}>{section.text}</Paragraph>
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        The enacted text ({section.lawShort}), from{" "}
        <a href={section.url} target="_blank" rel="noreferrer">
          lawphil.net
        </a>
        . Later amendments and the implementing rules are not included.
      </Text>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomLeft">
      <Tag style={{ cursor: "pointer", marginInlineEnd: 4 }} color="geekblue">
        {section.label.replace(/^(R\.A\.|P\.D\.) No\. /, (m) => (m.startsWith("R") ? "RA " : "PD "))}
      </Tag>
    </Popover>
  );
}

const VeraPermitCheck = ({ record }) => {
  const { token } = theme.useToken();
  // Edits settle for half a second before the record is checked again.
  const [snapshot, setSnapshot] = useState(() => plain(record));
  useEffect(() => {
    const t = setTimeout(() => setSnapshot(plain(record)), 500);
    return () => clearTimeout(t);
  }, [record]);
  const key = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["vera", "permit-analysis", key],
    queryFn: () => analyzePermits(snapshot),
    enabled: Boolean(snapshot?.sort_key),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const findings = data?.findings || [];
  const summary = data?.summary || {};
  const law = data?.law || [];
  const shown = (data?.permits || []).filter((p) => p.state !== "not-assessed" || p.key === "ecc");

  const list = (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      {findings.map((f, i) => {
        const S = SEVERITY[f.severity];
        const Icon = S.icon;
        return (
          <div key={`${f.kind}-${f.code}-${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon style={{ color: f.severity === "low" ? token.colorTextTertiary : f.severity === "high" ? token.colorError : token.colorWarning, marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13 }}>{f.text}</Text>
              {f.refs.length > 0 && (
                <div style={{ marginTop: 3 }}>
                  {f.refs.map((r) => (
                    <LawTag key={r} refKey={r} law={law} />
                  ))}
                </div>
              )}
              {f.rules && (
                <Text type="secondary" style={{ display: "block", fontSize: 11.5, marginTop: 2 }}>
                  {f.rules}
                </Text>
              )}
              {!f.refs.length && (
                <Text type="secondary" style={{ display: "block", fontSize: 11.5 }}>
                  A register entry to correct, not a legal finding.
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </Space>
  );

  const card = (
    <div className="rf-vera-card">
      <header className="rf-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="rf-permit-head" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <VeraFlame size={18} label="VERA" />
          VERA&rsquo;s permit check
          {data && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              against PD 1586, RA 8749, RA 9275 and RA 6969 · {dayjs(data.asOf).format("MMM D, YYYY")}
            </Text>
          )}
        </span>
        <Space size={6} wrap>
          {isLoading && <Text type="secondary">checking…</Text>}
          {isError && !data && <Text type="secondary">VERA could not check this record just now.</Text>}
          {data && !findings.length && <Tag color="success">Nothing to flag</Tag>}
          {["high", "medium", "low"].map((s) =>
            summary[s] ? (
              <Tag key={s} color={s === "high" ? "error" : s === "medium" ? "warning" : "default"}>
                {summary[s]} {SEVERITY[s].label}
              </Tag>
            ) : null
          )}
          <Tooltip title="Open VERA's chat on this firm: she explains each finding and cites the law.">
            <Button size="small" icon={<MessageOutlined />} disabled={!record?.sort_key} onClick={() => openVera(`Check the permits and compliance of ${record.sort_key}`)}>
              Ask VERA
            </Button>
          </Tooltip>
        </Space>
      </header>
      {data && (
        <div style={{ padding: "8px 12px" }}>
          <Space size={[6, 6]} wrap>
            {shown.map((p) => {
              const st = STATE[p.state] || STATE["not-assessed"];
              return (
                <Tooltip key={p.key} title={`${p.label}${p.numbers.length ? `: ${p.numbers.join(", ")}` : ""}${p.status ? ` · NOV recommendation: ${p.status}` : ""}${p.notes ? ` · inspector noted: ${p.notes}` : ""}`}>
                  <Tag color={st.color} style={{ marginInlineEnd: 0 }}>
                    <b>{SHORT[p.key] || p.label}</b> {st.text(p)}
                  </Tag>
                </Tooltip>
              );
            })}
          </Space>
          {findings.length > 0 && (
            <Collapse
              ghost
              size="small"
              style={{ marginTop: 6 }}
              defaultActiveKey={summary.high ? ["f"] : []}
              items={[{ key: "f", label: <Text strong style={{ fontSize: 13 }}>{findings.length} finding{findings.length === 1 ? "" : "s"} — what needs attention, and the law</Text>, children: list }]}
            />
          )}
          <Text type="secondary" style={{ display: "block", fontSize: 11.5, marginTop: 4 }}>
            Worked out by rule from this record, not by an AI model. The law is the enacted text; the firm&rsquo;s own documents and the last inspection settle it.
          </Text>
        </div>
      )}
    </div>
  );

  const count = findings.length;
  return (
    <div className="rf-vera-float">
      <Popover content={card} trigger="click" placement="topRight" arrow={false} overlayClassName="rf-vera-popover">
        <span className="rf-vera-button">
          <Badge count={count} size="small" color={summary.high ? token.colorError : token.colorWarning} offset={[-4, 4]}>
            <Button
              shape="circle"
              size="large"
              // Drawn for the dark button: with the app's light theme the flame was drawn for white, and vanished on it.
              icon={<VeraFlame size={32} theme="dark" label="" />}
              aria-label={`VERA's permit check${count ? `: ${count} finding${count === 1 ? "" : "s"}` : ""}`}
              title={isLoading ? "VERA is checking the permits…" : count ? `VERA's permit check: ${count} finding${count === 1 ? "" : "s"}` : "VERA's permit check: nothing to flag"}
            />
          </Badge>
        </span>
      </Popover>
    </div>
  );
};

export default VeraPermitCheck;
