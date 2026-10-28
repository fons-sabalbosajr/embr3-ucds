import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Col, Descriptions, Empty, Progress, Row, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import {
  ApiOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  FilePdfOutlined,
  HourglassOutlined,
  KeyOutlined,
  MessageOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Column } from "@ant-design/plots";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getVeraModels, getVeraUsage } from "./veraService";
import { CATEGORICAL } from "../../shared/components/dashboard/palette";
import { useTheme } from "../../theme/ThemeProvider";
import { getSocket, initializeSocket } from "../../api/socketService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Models & usage: every AI model VERA may
// use, in the order the router tries them — what each is (its context window
// and longest answer, from the provider), what VERA uses it for, how much of
// its allowance is left and when it resets, and what it has done today and
// over 14 days (services/vera/modelUsage). It reloads when anyone uses VERA
// (the "vera:usage" notice), and every 30 seconds besides.
//
// A model's colour is its place in this list, the same in both charts and
// the table; its name is always beside it, so colour never stands alone.
// ---------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const compact = (n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);

/** "4h 12m", "38m", "under a minute". */
function untilText(at, now) {
  const ms = new Date(at).getTime() - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 60 * 1000) return "under a minute";
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const CODE_LABEL = {
  quota_exhausted: "daily quota used up",
  rate_limited: "rate limited",
  overloaded: "overloaded",
  timeout: "too slow",
  model_unavailable: "not on this key",
  no_credit: "no credit",
  auth_failed: "key rejected",
  bad_request: "request refused",
  refused: "declined to answer",
  provider_error: "provider error",
  no_model: "no model answered",
  unknown: "other error",
};
const FEATURE_LABEL = { chat: "chat", "public-chat": "public chat", tools: "VERA's checks", test: "connection tests", other: "other" };
const PROVIDER_LABEL = { gemini: "Google Gemini", anthropic: "Anthropic Claude", groq: "Groq" };

const STATUS = {
  ready: { color: "success", icon: <CheckCircleOutlined />, label: "Ready" },
  resting: { color: "warning", icon: <ClockCircleOutlined />, label: "Resting" },
  "no-key": { color: "default", icon: <KeyOutlined />, label: "No API key" },
  unused: { color: "default", icon: <MinusCircleOutlined />, label: "Not in the route" },
};

/** A summary tile: one size for all, an animated icon, the value, a line under it. */
function StatTile({ icon, motion, tone, title, value, suffix, note, tip }) {
  const tile = (
    <Card size="small" className={`vm-tile vm-tone-${tone}`}>
      <div className="vm-tile__body">
        <span className={`vm-tile__icon vm-anim-${motion}`} aria-hidden>
          {icon}
        </span>
        <div className="vm-tile__text">
          <div className="vm-tile__title">{title}</div>
          <div className="vm-tile__value">
            {value}
            {suffix ? <span className="vm-tile__suffix">{suffix}</span> : null}
          </div>
          <div className="vm-tile__note">{note || " "}</div>
        </div>
      </div>
    </Card>
  );
  return tip ? <Tooltip title={tip}>{tile}</Tooltip> : tile;
}

/** One allowance as a bar: what is left, of what, and where the figure comes from. */
function Allowance({ label, a, unit }) {
  if (!a) return null;
  if (a.pct == null) {
    return (
      <div className="vm-allow">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {label}: {fmt(a.of)} {unit} ({a.source})
        </Text>
      </div>
    );
  }
  return (
    <Tooltip title={`${fmt(a.left)} of ${fmt(a.of)} ${unit} left — ${a.source}${a.resetIn ? `; full again in ${a.resetIn}` : ""}`}>
      <div className="vm-allow">
        <div className="vm-allow__head">
          <span>{label}</span>
          <span>{a.pct}% left</span>
        </div>
        <Progress percent={a.pct} size="small" showInfo={false} status={a.pct <= 10 ? "exception" : "normal"} strokeColor={a.pct <= 25 ? "#d46b08" : undefined} />
      </div>
    </Tooltip>
  );
}

/** Requests or tokens per day, stacked by model, the day's total over each column. */
function DailyStack({ data, days, models, colourOf, field, name, dark }) {
  const rows = [];
  for (const day of days) {
    for (const m of models) {
      const d = data.find((x) => x.day === day && x.model === m);
      const value = field === "tokens" ? (d?.inputTokens || 0) + (d?.outputTokens || 0) : d?.calls || 0;
      rows.push({ day: dayjs(day).format("MMM D"), model: m, value });
    }
  }
  const totals = days.map((day) => ({
    day: dayjs(day).format("MMM D"),
    total: rows.filter((r) => r.day === dayjs(day).format("MMM D")).reduce((s, r) => s + r.value, 0),
  }));
  if (!totals.some((t) => t.total > 0)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing yet in the last 14 days" />;
  return (
    <Column
      data={rows}
      xField="day"
      yField="value"
      colorField="model"
      stack
      height={260}
      theme={dark ? "classicDark" : "classic"}
      scale={{ color: { domain: models, range: models.map(colourOf) } }}
      // A 2px surface gap between stacked segments.
      style={{ stroke: dark ? "#1a1a19" : "#ffffff", lineWidth: 2, maxWidth: 26, radiusTopLeft: 3, radiusTopRight: 3 }}
      axis={{ x: { title: false, labelFontSize: 11 }, y: { title: false, grid: true, labelFormatter: (v) => compact(v), labelFontSize: 11 } }}
      legend={{ color: { position: "bottom", itemLabelFontSize: 11 } }}
      tooltip={{ items: [{ channel: "y", name, valueFormatter: (v) => fmt(v) }] }}
      annotations={[
        {
          type: "text",
          data: totals.filter((t) => t.total > 0),
          encode: { x: "day", y: "total", text: (d) => compact(d.total) },
          style: { textAlign: "center", textBaseline: "bottom", dy: -4, fontSize: 11, fill: dark ? "#d9d9d6" : "#4a4a47" },
          tooltip: false,
        },
      ]}
      animate={false}
      aria-label={`${name} per day, by model`}
    />
  );
}

/** Everything known about one model: the row's expanded view. */
function ModelDetails({ m, now }) {
  const pub = m.capabilities?.published;
  const fails = Object.entries(m.today.codes || {});
  const uses = Object.entries(m.today.features || {});
  return (
    <Descriptions size="small" bordered column={{ xs: 1, md: 2, xl: 3 }} className="vm-details">
      <Descriptions.Item label="Provider">{PROVIDER_LABEL[m.provider] || m.provider}</Descriptions.Item>
      <Descriptions.Item label="Name at the provider">{m.info?.displayName || m.model}</Descriptions.Item>
      <Descriptions.Item label="Place in the route">
        {m.position ? `#${m.position} — ${m.role}` : m.role}
      </Descriptions.Item>
      <Descriptions.Item label="Context window">{m.info?.contextWindow ? `${fmt(m.info.contextWindow)} tokens` : "Not stated by the provider"}</Descriptions.Item>
      <Descriptions.Item label="Longest answer">{m.info?.maxOutput ? `${fmt(m.info.maxOutput)} tokens` : "Not stated by the provider"}</Descriptions.Item>
      <Descriptions.Item label="Reasons before answering">{m.info ? (m.info.thinking ? "Yes" : "No") : "—"}</Descriptions.Item>
      <Descriptions.Item label="Reads scans (PDF)">{m.capabilities?.readsPdf ? "Yes — used for VERA's document checks" : "No — VERA sends it text only"}</Descriptions.Item>
      <Descriptions.Item label="Free-tier limits">
        {pub ? (
          <span>
            {fmt(pub.rpm)}/min · {fmt(pub.rpd)}/day requests · {fmt(pub.tpm)} tokens/min · {fmt(pub.tpd)} tokens/day
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Published: {pub.source}
            </Text>
          </span>
        ) : m.quotaWindow?.limit ? (
          `${fmt(m.quotaWindow.limit)} requests/day (stated by the provider in a refusal)`
        ) : (
          <Text type="secondary">Not published per model; shown once the provider states it</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Quota resets">
        {m.available?.requests?.resetIn
          ? `Full again in ${m.available.requests.resetIn} (reported by the provider)`
          : m.quotaWindow?.resetsAt
            ? `In ${untilText(m.quotaWindow.resetsAt, now)} — ${dayjs(m.quotaWindow.resetsAt).format("MMM D, h:mm A")}`
            : m.provider === "anthropic"
              ? "Per minute, refilling continuously"
              : "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Today, by use">{uses.length ? uses.map(([f, n]) => `${FEATURE_LABEL[f] || f} ${fmt(n)}`).join(" · ") : "—"}</Descriptions.Item>
      <Descriptions.Item label="Today, failures">{fails.length ? fails.map(([c, n]) => `${CODE_LABEL[c] || c} ${fmt(n)}`).join(" · ") : "None"}</Descriptions.Item>
      <Descriptions.Item label="Tokens today">
        {fmt(m.today.inputTokens)} in · {fmt(m.today.outputTokens)} out
      </Descriptions.Item>
      <Descriptions.Item label="Last 14 days">
        {fmt(m.period.calls)} requests · {m.period.calls ? `${Math.round((m.period.ok / m.period.calls) * 100)}% answered` : "—"} · {compact(m.period.inputTokens + m.period.outputTokens)} tokens
      </Descriptions.Item>
      <Descriptions.Item label="Average answer time">{m.today.avgMs != null ? `${(m.today.avgMs / 1000).toFixed(1)} s today` : m.period.avgMs != null ? `${(m.period.avgMs / 1000).toFixed(1)} s over 14 days` : "—"}</Descriptions.Item>
      <Descriptions.Item label="Last answer / failure">
        {m.lastOkAt ? dayjs(m.lastOkAt).format("MMM D, h:mm:ss A") : "None yet"}
        {m.lastErrorAt ? ` / ${CODE_LABEL[m.lastErrorCode] || m.lastErrorCode}, ${dayjs(m.lastErrorAt).format("MMM D, h:mm:ss A")}` : ""}
      </Descriptions.Item>
    </Descriptions>
  );
}

export default function VeraModels() {
  const { mode } = useTheme();
  const dark = mode === "dark";
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["vera", "models"], queryFn: getVeraModels, refetchInterval: 30000, refetchIntervalInBackground: false });
  const usage = useQuery({ queryKey: ["vera", "usage"], queryFn: async () => (await getVeraUsage()).data, refetchInterval: 60000, refetchIntervalInBackground: false });
  // The countdowns move between refreshes.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // Someone used VERA: reload now, not at the next 30-second refresh.
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    const reload = () => {
      queryClient.invalidateQueries({ queryKey: ["vera", "models"] });
      queryClient.invalidateQueries({ queryKey: ["vera", "usage"] });
    };
    socket.on("vera:usage", reload);
    return () => socket.off("vera:usage", reload);
  }, [queryClient]);

  const data = q.data;
  const models = useMemo(() => (data?.models || []).map((m) => m.model), [data]);
  const palette = CATEGORICAL[dark ? "dark" : "light"];
  const colourOf = (model) => palette[Math.max(0, models.indexOf(model)) % palette.length];

  if (q.isLoading) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (q.error) return <Alert type="error" showIcon message="The model usage could not be loaded." description={q.error?.response?.data?.message} />;

  const t = data.totals;
  const successRate = t.calls ? Math.round((t.ok / t.calls) * 100) : null;
  const gemini = data.windows?.gemini;
  const anyReady = data.models.some((m) => m.status === "ready");
  const missing = (data.providers || []).filter((p) => !p.keyPresent);

  // Shares of the table (tableLayout "fixed"), under 100% beside the fixed
  // columns; the expand arrow opens every detail of a model.
  const columns = [
    { title: "#", dataIndex: "position", width: 40, align: "center", render: (v) => v ?? "—" },
    {
      title: "Model",
      key: "model",
      width: "21%",
      render: (_, m) => (
        <Space direction="vertical" size={3} style={{ width: "100%" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: colourOf(m.model), flex: "none" }} aria-hidden />
            <Text strong style={{ fontFamily: "monospace", minWidth: 0 }}>
              {m.model}
            </Text>
          </span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {PROVIDER_LABEL[m.provider] || m.provider} · {m.role}
          </Text>
          <Space size={[4, 4]} wrap>
            {m.capabilities?.accurate && (
              <Tag icon={<SafetyCertificateOutlined />} color="purple" style={{ marginInlineEnd: 0 }}>
                Legal questions
              </Tag>
            )}
            {m.capabilities?.light && (
              <Tag icon={<ThunderboltOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>
                Short questions
              </Tag>
            )}
            {m.capabilities?.readsPdf && (
              <Tag icon={<FilePdfOutlined />} style={{ marginInlineEnd: 0 }}>
                Reads scans
              </Tag>
            )}
            {m.info?.thinking && <Tag style={{ marginInlineEnd: 0 }}>Reasons</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: "14%",
      render: (_, m) => {
        const s = STATUS[m.status] || STATUS.unused;
        return (
          <Space direction="vertical" size={2}>
            <Tag color={s.color} icon={s.icon} style={{ marginInlineEnd: 0 }}>
              {s.label}
            </Tag>
            {m.status === "resting" && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {m.reason} — tried again in {untilText(m.restingUntil, now)} ({dayjs(m.restingUntil).format("h:mm A")})
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Available",
      key: "available",
      width: "18%",
      render: (_, m) => {
        const a = m.available || {};
        if (!a.requests && !a.tokensPerMinute && !a.tokensPerDay) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {m.provider === "anthropic" ? "Per minute; draws on account credit" : "Not known yet — shown once the provider states its limit"}
              {m.quotaWindow?.resetsAt ? ` · resets in ${untilText(m.quotaWindow.resetsAt, now)}` : ""}
            </Text>
          );
        }
        return (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Allowance label="Requests today" a={a.requests} unit="requests" />
            <Allowance label="Tokens this minute" a={a.tokensPerMinute} unit="tokens" />
            <Allowance label="Tokens today" a={a.tokensPerDay} unit="tokens" />
          </Space>
        );
      },
    },
    {
      title: "Today",
      key: "today",
      width: "15%",
      render: (_, m) =>
        m.today.calls ? (
          <Space direction="vertical" size={0}>
            <Text>
              {fmt(m.today.calls)} request{m.today.calls === 1 ? "" : "s"}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fmt(m.today.ok)} answered{m.today.failed ? ` · ${fmt(m.today.failed)} failed` : ""}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {compact(m.today.inputTokens + m.today.outputTokens)} tokens{m.today.avgMs != null ? ` · ${(m.today.avgMs / 1000).toFixed(1)} s` : ""}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Size",
      key: "size",
      width: "11%",
      responsive: ["lg"],
      render: (_, m) =>
        m.info?.contextWindow ? (
          <Tooltip title="From the provider: how much the model reads at once, and its longest answer">
            <Space direction="vertical" size={0}>
              <Text>{compact(m.info.contextWindow)} in</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {m.info.maxOutput ? `${compact(m.info.maxOutput)} out` : "—"}
              </Text>
            </Space>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {m.status === "no-key" ? "Needs its key" : "Not stated"}
          </Text>
        ),
    },
    {
      title: "Last",
      key: "last",
      width: "12%",
      render: (_, m) => (
        <Space direction="vertical" size={0}>
          {m.lastOkAt ? (
            <Tooltip title={`Last answered ${dayjs(m.lastOkAt).format("MMM D, YYYY h:mm:ss A")}`}>
              <Text style={{ fontSize: 12 }}>
                <CheckCircleOutlined style={{ color: "var(--ant-color-success, #52c41a)" }} /> {dayjs(m.lastOkAt).format("h:mm A")}
              </Text>
            </Tooltip>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              No answer yet
            </Text>
          )}
          {m.lastErrorAt && (
            <Tooltip title={`Last failed ${dayjs(m.lastErrorAt).format("MMM D, YYYY h:mm:ss A")}`}>
              <Text type="danger" style={{ fontSize: 12 }}>
                <WarningOutlined /> {CODE_LABEL[m.lastErrorCode] || m.lastErrorCode} · {dayjs(m.lastErrorAt).format("h:mm A")}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }} className="vera-models">
      {!data.masterEnabled && <Alert type="info" showIcon message="The server's master switch is off, so no model is called; VERA answers from the help library." />}
      {data.masterEnabled && !anyReady && (
        <Alert type="warning" showIcon message="No model is answering right now" description="Every model in the route is resting or has no key. VERA answers from the help library until one is tried again (see the times below)." />
      )}

      <Row gutter={[12, 12]} className="vm-tiles">
        <Col xs={12} md={8} xl={4}>
          <StatTile icon={<ApiOutlined />} motion="pulse" tone="blue" title="Model requests today" value={fmt(t.calls)} note={`${fmt(t.failed)} failed`} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile icon={<CheckCircleOutlined />} motion="beat" tone="green" title="Answered" value={successRate ?? "—"} suffix={successRate != null ? "%" : ""} note={`${fmt(t.ok)} of ${fmt(t.calls)}`} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile icon={<ThunderboltOutlined />} motion="flicker" tone="gold" title="Tokens today" value={compact(t.inputTokens + t.outputTokens)} note={`${compact(t.inputTokens)} in · ${compact(t.outputTokens)} out`} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile icon={<MessageOutlined />} motion="bob" tone="cyan" title="Chat messages today" value={usage.data?.messagesToday ?? "—"} note={usage.data ? `${fmt(usage.data.modelAnswersToday)} by a model` : ""} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile
            icon={<DatabaseOutlined />}
            motion="pulse"
            tone="purple"
            title="From the cache today"
            value={usage.data?.cacheAnswersToday ?? "—"}
            note="no request, no tokens"
            tip="Chat answers given from the semantic cache today: a question close to one already answered, for the same kind of account."
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatTile
            icon={<HourglassOutlined />}
            motion="turn"
            tone="orange"
            title="Gemini quota resets in"
            value={gemini?.resetsAt ? untilText(gemini.resetsAt, now) : "—"}
            note={gemini?.resetsAt ? `${dayjs(gemini.resetsAt).format("MMM D, h:mm A")}` : ""}
            tip={`${gemini?.note || ""} That is midnight Pacific time.`}
          />
        </Col>
      </Row>

      {missing.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<KeyOutlined />}
          message={`More free capability is one key away: ${missing.map((p) => p.label).join(", ")}`}
          description={
            <span style={{ fontSize: 13 }}>
              {missing.map((p) => (
                <span key={p.id} style={{ display: "block" }}>
                  <Text code>{p.envKey}</Text> in <Text code>server/.env</Text> adds <Text code>{p.defaultModel}</Text>
                  {p.id === "groq" ? " — free at console.groq.com (no card); it then takes legal questions first, reasoning before it answers." : "."}
                </span>
              ))}
              Restart the server after adding a key.
            </span>
          }
        />
      )}

      <Card
        size="small"
        title="Models, in the order VERA tries them"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ReloadOutlined spin={q.isFetching} /> Updated {dayjs(q.dataUpdatedAt).format("h:mm:ss A")} · live
          </Text>
        }
      >
        <Table
          className="vera-models-table"
          size="small"
          rowKey={(m) => `${m.provider}:${m.model}`}
          columns={columns}
          dataSource={data.models}
          pagination={false}
          tableLayout="fixed"
          expandable={{ expandedRowRender: (m) => <ModelDetails m={m} now={now} />, columnWidth: 36 }}
        />
        <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          A model that fails is rested and the next one answers: a spent daily quota for up to an hour, an overloaded or slow model for 10 minutes, a
          model not on the key for an hour. "Available" is what the provider reported on its last answer, or its stated or published limit against what
          VERA counted — never a guess. "Today" is the Manila day; Gemini's quota counts from midnight Pacific. Open a row for every detail.
        </Text>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" title="Requests per day, by model (last 14 days)">
            <DailyStack data={data.daily} days={data.days} models={models} colourOf={colourOf} field="calls" name="Requests" dark={dark} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="Tokens per day, by model (last 14 days)">
            <DailyStack data={data.daily} days={data.days} models={models} colourOf={colourOf} field="tokens" name="Tokens" dark={dark} />
          </Card>
        </Col>
      </Row>

      {data.laws && (
        <Card size="small" title={<Space><BookOutlined /> VERA&rsquo;s law library</Space>} extra={<Text type="secondary" style={{ fontSize: 12 }}>Built {dayjs(data.laws.builtAt).format("MMM D, YYYY")}</Text>}>
          <Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
            Legal questions are answered from the enacted text of these laws, section by section ({data.laws.source}). VERA cites the law and section; any
            section or peso amount in an answer that is not in the text she was given is flagged under it. Implementing rules and DAOs are not included.
          </Text>
          <Space size={[6, 6]} wrap>
            {data.laws.laws.map((l) => (
              <Tooltip key={l.id} title={`${l.sections} sections — open the text on lawphil.net`}>
                <Tag icon={<BookOutlined />} style={{ marginInlineEnd: 0 }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.number} · {l.short}
                  </a>
                </Tag>
              </Tooltip>
            ))}
          </Space>
        </Card>
      )}
    </Space>
  );
}
