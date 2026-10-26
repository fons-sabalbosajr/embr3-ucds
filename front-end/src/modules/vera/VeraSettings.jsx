import { useEffect, useState } from "react";
import {
  AutoComplete,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Row,
  Col,
  Divider,
  Typography,
  Spin,
  Alert,
  Space,
  Tag,
  Descriptions,
  Statistic,
  Tooltip,
  Tabs,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  RobotOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  WarningOutlined,
  FileSearchOutlined,
  LinkOutlined,
  NumberOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import { getVeraConfig, updateVeraConfig, testVeraConnection, getVeraUsage, getCorrectionsPending, getRegisterLinksPending } from "./veraService";
import VeraCorrections from "./VeraCorrections";
import VeraRegisterLinks from "./VeraRegisterLinks";
import VeraSerials from "./VeraSerials";
import VeraProjectTypes from "./VeraProjectTypes";
import VeraScanText from "./VeraScanText";
import VeraRefNumbers from "./VeraRefNumbers";
import { useQuery } from "@tanstack/react-query";
import VeraLogs from "./VeraLogs";
import { VeraFlame } from "./VeraMark";
import { BorderBeam } from "border-beam";
import { useTheme } from "../../theme/ThemeProvider";
import { message } from "../../shared/feedback";
import "./vera.css";

const { Paragraph, Text } = Typography;

// Models offered in the picker. The Gemini ones were each tried with this
// server's key; the free tier covers the Flash and Flash-Lite models only, so
// the Pro models are left out. Any other name can still be typed.
const MODEL_CHOICES = {
  gemini: [
    { value: "gemini-3.8-flash", tag: "Newest · free tier", tagColor: "green" },
    { value: "gemini-3.5-flash", tag: "Free tier", tagColor: "green" },
    { value: "gemini-2.5-flash", tag: "Previous", tagColor: "default" },
    { value: "gemini-flash-latest", tag: "Moves with Google", tagColor: "gold" },
    { value: "gemini-3.1-flash-lite", tag: "Lighter · free tier", tagColor: "blue" },
  ],
  anthropic: [{ value: "claude-opus-5-5" }, { value: "claude-sonnet-5-5" }, { value: "claude-haiku-5-5" }],
};

/** The flame's states, previewed in the header: what each one means in the chat. */
const FLAME_STATES = [
  ["burning", "At rest"],
  ["listening", "You are typing"],
  ["thinking", "Thinking"],
  ["searching", "Checking the library"],
  ["working", "Preparing the steps"],
];

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant.
//
// The API key is deliberately NOT editable here. It is read only from the
// server environment, so it can never be read back through the API, shown
// in a browser, or copied out with a database backup. This screen says
// whether the server found one and which variable it expects.
// ---------------------------------------------------------------------------

export default function VeraSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [providers, setProviders] = useState([]);
  const [usage, setUsage] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [preview, setPreview] = useState("burning");
  const { mode } = useTheme();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "configuration");
  // Answers for the Developer only (403 otherwise), which also decides the tab.
  const { data: pendingCorrections } = useQuery({ queryKey: ["vera", "corrections", "pending"], queryFn: getCorrectionsPending, retry: false, staleTime: 30 * 1000 });
  const { data: pendingLinks } = useQuery({ queryKey: ["vera", "register-links", "pending"], queryFn: getRegisterLinksPending, retry: false, staleTime: 30 * 1000 });
  const provider = Form.useWatch("provider", form);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getVeraConfig();
      form.setFieldsValue(res.config || {});
      setStatus(res.status || null);
      setProviders(res.providers || []);
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to load the assistant settings");
    } finally {
      setLoading(false);
    }
    // Usage is extra: a failure must not block the form.
    try {
      setUsage((await getVeraUsage()).data || null);
    } catch {
      setUsage(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const res = await updateVeraConfig(values);
      setStatus(res.status || null);
      message.success("Assistant settings saved.");
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to save the assistant settings");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testVeraConnection();
      setTestResult({ ok: true, ...res });
      message.success(`Connected to ${res.model}.`);
      await load();
    } catch (err) {
      const data = err?.response?.data;
      setTestResult({ ok: false, message: data?.message || "The connection test failed.", code: data?.code });
      message.error(data?.message || "The connection test failed.");
      await load();
    } finally {
      setTesting(false);
    }
  };

  const selected = providers.find((p) => p.value === (provider || status?.provider || "anthropic"));

  const configuration = (
    <Spin spinning={loading}>
      <Card
        title={
          <Space>
            <VeraFlame size={24} theme={mode} glow={false} />
            <span>VERA Assistant</span>
            {status ? (
              <Tag color={status.operational ? "green" : status.enabled ? "gold" : "default"}>
                {status.operational ? "Operational" : status.enabled ? "Help library only" : "Off"}
              </Tag>
            ) : null}
          </Space>
        }
        extra={
          <Space wrap>
            <Button icon={<ApiOutlined />} loading={testing} onClick={onTest} disabled={loading || saving || !status?.keyConfigured}>
              Test connection
            </Button>
            <Button icon={<ReloadOutlined />} onClick={load} disabled={loading || saving}>
              Reset
            </Button>
          </Space>
        }
      >
        <Paragraph type="secondary">
          VERA is E-Universe's assistant. It explains how the system works — where a screen is, how to file a document, what a setting does — from a
          built-in help library, scoped to each account's domains. It <Text strong>cannot read any record, establishment, permit or document</Text>, and
          nothing but the typed question, the recent conversation and the name of the current screen is ever sent to the model provider.
        </Paragraph>

        {status ? (
          <>
            <Alert
              style={{ marginBottom: 16 }}
              type={status.operational ? "success" : status.keyConfigured || status.enabled ? "warning" : "info"}
              showIcon
              message={
                status.operational
                  ? "VERA is answering with the AI model."
                  : status.enabled
                    ? "VERA is answering from the built-in help library only."
                    : "VERA is turned off."
              }
              description={
                <div style={{ fontSize: 13 }}>
                  {!status.masterEnabled ? (
                    <div>
                      • The server switch <Text code>AUTOMATION_AGENT_ENABLED</Text> (or <Text code>VERA_ENABLED</Text>) is not <Text code>true</Text>, so no model
                      call can be made. It is the master switch — the toggle below cannot override it.
                    </div>
                  ) : null}
                  {!status.keyConfigured ? (
                    <div>
                      • No API key found. Set <Text code>{status.keyEnvVar}</Text> in <Text code>server/.env</Text> and restart the server.
                    </div>
                  ) : null}
                  {status.masterEnabled && status.keyConfigured && !status.enabled ? <div>• The key and master switch are ready — turn VERA on below.</div> : null}
                  {status.operational ? (
                    <div>
                      • Using <Text strong>{status.providerLabel}</Text> with <Text code>{status.model}</Text>. Run <Text strong>Test connection</Text> to confirm the
                      account can answer.
                    </div>
                  ) : null}
                </div>
              }
            />

            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Master switch (server)">
                {status.masterEnabled ? (
                  <Space size={4}><CheckCircleTwoTone twoToneColor="#52c41a" /> on</Space>
                ) : (
                  <Space size={4}><CloseCircleTwoTone twoToneColor="#cf1322" /> off</Space>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="API key">
                {status.keyConfigured ? (
                  <Tooltip title="Read from the server environment. Never stored in the database, never sent to a browser.">
                    <Space size={4}><CheckCircleTwoTone twoToneColor="#52c41a" /><Text>{status.keyHint}</Text></Space>
                  </Tooltip>
                ) : (
                  <Space size={4}><CloseCircleTwoTone twoToneColor="#cf1322" /><Text code>{status.keyEnvVar}</Text></Space>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Effective model">
                <Text code>{status.model}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Last successful call">
                {status.lastSuccessfulConnectionAt ? dayjs(status.lastSuccessfulConnectionAt).format("MMM D, YYYY h:mm A") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Last error" span={2}>
                {status.lastError ? (
                  <Space size={4} align="start">
                    <WarningOutlined style={{ color: "#d46b08" }} />
                    <Text type="secondary">
                      {status.lastError}
                      {status.lastErrorAt ? ` (${dayjs(status.lastErrorAt).format("MMM D, h:mm A")})` : ""}
                    </Text>
                  </Space>
                ) : (
                  "—"
                )}
              </Descriptions.Item>
            </Descriptions>
          </>
        ) : null}

        {testResult ? (
          <Alert
            style={{ marginBottom: 16 }}
            type={testResult.ok ? "success" : "error"}
            showIcon
            closable
            onClose={() => setTestResult(null)}
            message={testResult.ok ? `The model replied in ${testResult.durationMs} ms` : "Connection test failed"}
            description={
              testResult.ok ? (
                <span>
                  {testResult.provider} · {testResult.model} · reply "{testResult.reply}" · {testResult.inputTokens + testResult.outputTokens} tokens
                  {testResult.masterEnabled === false ? " · the master switch is still off, so chats use the help library" : ""}
                </span>
              ) : (
                <span>{testResult.message}</span>
              )
            }
          />
        ) : null}

        <Form form={form} layout="vertical" disabled={saving}>
          <Divider orientation="left">Availability</Divider>
          <Row gutter={24}>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item name="enabled" label="VERA enabled" valuePropName="checked" tooltip="Off hides the assistant and stops it answering.">
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item name="showLauncher" label="Show the floating button" valuePropName="checked" tooltip="Off keeps VERA available but hides the button.">
                <Switch checkedChildren="Shown" unCheckedChildren="Hidden" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item
                name="sendPageContext"
                label="Send the current screen name"
                valuePropName="checked"
                tooltip="Lets VERA tailor its directions to the screen. Only the screen NAME is sent — never anything on it."
              >
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item
                name="developerMode"
                label="Developer answers"
                valuePropName="checked"
                tooltip="Developer accounts also get the technical articles. Credentials and secrets stay refused for every role."
              >
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Sign-in page (no sign-in needed)</Divider>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="What VERA can and cannot do on the sign-in page"
            description={
              <span>
                Visitors there are <Text strong>not signed in and not identified</Text>, so VERA uses a separate, narrow help library: what E-Universe is,
                how to request an account, what pending approval means, signing in, and resetting a password. Before any model is reached, the server refuses
                <Text strong> every account or record lookup</Text> ("does the account … exist?"), every question about the inside of the system, and any
                password typed in. It is limited per address, not per user. Off by default — turning it on is a conscious decision.
              </span>
            }
          />
          <Row gutter={24}>
            <Col xs={24} md={8}>
              <Form.Item name="publicEnabled" label="VERA on the sign-in page" valuePropName="checked">
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>
              <Form.Item
                name="portalEnabled"
                label="VERA on the Document Portal"
                valuePropName="checked"
                tooltip="The public portal where people request scanned documents. She introduces herself there and answers only questions about the portal; she cannot see any request or document."
              >
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="publicWelcomeMessage" label="Sign-in page welcome message" tooltip="Blank uses the default.">
                <Input.TextArea placeholder="Blank uses the default greeting" rows={2} maxLength={600} showCount allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Model</Divider>
          <Row gutter={24}>
            <Col xs={24} md={8}>
              <Form.Item name="provider" label="Provider" tooltip="Each provider reads its own key from its own environment variable.">
                <Select placeholder="Select a provider" options={providers.map((p) => ({ value: p.value, label: `${p.label} — ${p.envKey}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="model"
                label="Model"
                tooltip="Pick one from the list or type a model name. Blank uses the model set in the server environment."
              >
                <AutoComplete
                  allowClear
                  placeholder={selected?.defaultModel || "provider default"}
                  options={(MODEL_CHOICES[selected?.value] || []).map((m) => ({
                    value: m.value,
                    label: (
                      <Space size={6}>
                        <span>{m.value}</span>
                        {m.tag && <Tag color={m.tagColor} style={{ marginInlineEnd: 0, fontSize: 11 }}>{m.tag}</Tag>}
                      </Space>
                    ),
                  }))}
                  filterOption={(input, option) => option.value.toLowerCase().includes(String(input || "").toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="maxTokens" label="Max reply tokens" tooltip="Blank uses the server value.">
                <InputNumber min={64} max={8192} step={64} style={{ width: "100%" }} placeholder={String(status?.maxTokens ?? "")} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="temperature" label="Temperature" tooltip="Lower is more consistent. Ignored by models that do not take it.">
                <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} placeholder={String(status?.temperature ?? "")} />
              </Form.Item>
            </Col>
          </Row>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Where the API key goes"
            description={
              <span>
                Not on this screen, by design. Put it in <Text code>server/.env</Text> as <Text code>{selected?.envKey || "ANTHROPIC_API_KEY"}</Text>, set
                <Text code> AUTOMATION_AGENT_ENABLED=true</Text>, and restart the server. In the environment it can never be read back through the API, shown in a
                browser, or copied out with a database backup.
              </span>
            }
          />

          <Divider orientation="left">Limits &amp; behaviour</Divider>
          <Row gutter={24}>
            <Col xs={12} md={6}>
              <Form.Item name="perUserDailyLimit" label="Messages per person / day" tooltip="0 = unlimited. Blank uses the server value.">
                <InputNumber min={0} max={10000} style={{ width: "100%" }} placeholder={String(status?.perUserDailyLimit ?? "")} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="dailyLimit" label="Messages per day, everyone" tooltip="0 = unlimited. A ceiling on the whole office's use. Blank uses the server value.">
                <InputNumber min={0} max={100000} style={{ width: "100%" }} placeholder={String(status?.dailyLimit ?? "")} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="requestTimeoutMs" label="Request timeout" tooltip="Blank uses the server value.">
                <InputNumber min={5000} max={120000} step={1000} style={{ width: "100%" }} addonAfter="ms" placeholder={String(status?.requestTimeoutMs ?? "")} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="supportContact" label="Who VERA points people to" tooltip="Used when VERA cannot answer. Blank: the E-Universe administrator (MIS).">
                <Input allowClear maxLength={160} placeholder="the E-Universe administrator (MIS)" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="officeWebsite"
                label="Office website"
                tooltip="Public visitors (sign-in page, Document Portal) who ask for counts or figures get no numbers from VERA — she sends them here. Staff always get exact figures. Blank: https://r3.emb.gov.ph"
                rules={[{ pattern: /^https?:\/\/[^\s/]+\.[^\s]+$/i, message: "A web address starting with http:// or https://" }]}
              >
                <Input allowClear maxLength={200} placeholder="https://r3.emb.gov.ph" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="welcomeMessage" label="Welcome message" tooltip="Shown when the chat opens. Blank uses the default greeting.">
                <Input.TextArea placeholder="Blank uses the default greeting" rows={2} maxLength={600} showCount allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            Save assistant settings
          </Button>
        </Form>

        {usage ? (
          <>
            <Divider orientation="left">Usage today</Divider>
            <Paragraph type="secondary">Metadata only — no question or answer is ever stored, so none can be reported.</Paragraph>
            <Row gutter={[12, 12]}>
              <Col xs={12} sm={8} md={4}>
                <Card size="small"><Statistic title="Messages today" value={usage.messagesToday} /></Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small"><Statistic title="Model answers" value={usage.modelAnswersToday} prefix={<ThunderboltOutlined />} /></Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small"><Statistic title="Input tokens" value={usage.inputTokensToday} /></Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small"><Statistic title="Output tokens" value={usage.outputTokensToday} /></Card>
              </Col>
              <Col xs={24} sm={16} md={8}>
                <Card size="small">
                  <Text type="secondary">By role today</Text>
                  <div style={{ marginTop: 6 }}>
                    {Object.keys(usage.byRole || {}).length ? (
                      <Space size={4} wrap>
                        {Object.entries(usage.byRole).map(([role, n]) => <Tag key={role}>{role}: {n}</Tag>)}
                      </Space>
                    ) : (
                      <Text type="secondary">No messages yet</Text>
                    )}
                  </div>
                </Card>
              </Col>
            </Row>
            {usage.recentFailures?.length ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message={`${usage.recentFailures.length} recent connection test failure(s)`}
                description={
                  <div>
                    {usage.recentFailures.map((f, i) => (
                      <div key={i}>{dayjs(f.at).format("MMM D, h:mm A")} — {f.code || "error"}{f.by ? ` (${f.by})` : ""}</div>
                    ))}
                  </div>
                }
              />
            ) : null}
          </>
        ) : null}
      </Card>
    </Spin>
  );

  return (
    <div className="vera-settings" data-theme={mode}>
      {/* VERA's flame on the title card, and the same beam that runs round
          her launcher running round the card. */}
      {/* The spacing sits on a wrapper, not on the beam's box: a margin
          there grew the box past the card, so the beam ran round empty
          space and looked oversized. The beam's box is exactly the card. */}
      <div className="vera-settings__beam-wrap">
      <BorderBeam className="vera-settings__beam" size="sm" colorVariant="ocean" theme={mode === "dark" ? "dark" : "light"} duration={3.2} strength={0.7} style={{ borderRadius: 20 }}>
      <section className="vera-settings__hero">
        <VeraFlame size={88} state={preview} theme={mode} />
        <div>
          <h2 className="vera-settings__title">VERA Assistant</h2>
          <p className="vera-settings__subtitle">Virtual Environmental Response Assistant</p>
          <div className="vera-settings__states" role="group" aria-label="Preview the flame's states">
            {FLAME_STATES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="vera-settings__state"
                aria-pressed={preview === key}
                onClick={() => setPreview(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      </BorderBeam>
      </div>
      <Tabs
        // The bell links to ?tab=corrections or ?tab=links; until that tab
        // exists (the Developer check is still answering), Configuration shows.
        activeKey={
          ((tab === "corrections" || tab === "serials" || tab === "project-types" || tab === "ref-numbers" || tab === "scan-text") && pendingCorrections === undefined) || (tab === "links" && pendingLinks === undefined) ? "configuration" : tab
        }
        onChange={setTab}
        items={[
          { key: "configuration", label: <span><RobotOutlined /> Configuration</span>, children: configuration },
          { key: "logs", label: <span><FileSearchOutlined /> Activity Log</span>, children: <VeraLogs /> },
          // VERA's report on the Records project types — the Developer's alone,
          // shown when the server says this account may see it.
          ...(pendingCorrections !== undefined
            ? [{ key: "corrections", label: <span><ThunderboltOutlined /> Data corrections{pendingCorrections ? <Tag color="gold" style={{ marginInlineStart: 6 }}>{pendingCorrections}</Tag> : null}</span>, children: <VeraCorrections /> }]
            : []),
          ...(pendingLinks !== undefined
            ? [{ key: "links", label: <span><LinkOutlined /> Register links{pendingLinks ? <Tag color="gold" style={{ marginInlineStart: 6 }}>{pendingLinks}</Tag> : null}</span>, children: <VeraRegisterLinks /> }]
            : []),
          // Serial numbers across the three ERMS units — the Developer's, like the two above.
          ...(pendingCorrections !== undefined
            ? [{ key: "serials", label: <span><NumberOutlined /> Serial numbers</span>, children: <VeraSerials /> }]
            : []),
          // Each record's project type, read against its document.
          ...(pendingCorrections !== undefined
            ? [{ key: "project-types", label: <span><FileSearchOutlined /> Project types</span>, children: <VeraProjectTypes /> }]
            : []),
          // Each record's Ref. No., read against the number printed on its scan.
          ...(pendingCorrections !== undefined
            ? [{ key: "ref-numbers", label: <span><NumberOutlined /> Ref. numbers</span>, children: <VeraRefNumbers /> }]
            : []),
          // Reading scans' text so the libraries can search inside them.
          ...(pendingCorrections !== undefined
            ? [{ key: "scan-text", label: <span><FileSearchOutlined /> Scan text</span>, children: <VeraScanText /> }]
            : []),
        ]}
      />
    </div>
  );
}
