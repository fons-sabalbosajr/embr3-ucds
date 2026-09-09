import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  InputNumber,
  Radio,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import { PoweroffOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Application-wide document access.
//
// The state shown here is read from the server on every load, and the server
// decides whether the window is open. The countdown below is a display of that
// decision, never the thing enforcing it — a browser clock is not a control.
//
// Switching this on switches it on for everyone, which is the point: the old
// per-session behaviour meant a developer could see documents while nobody
// else could, and nothing said so.
// ---------------------------------------------------------------------------

const REASONS = {
  "not-configured": "No records share is configured on this server.",
  "disabled-by-environment": "Switched off for this deployment (NAS_ENABLED=false).",
  disabled: "Manually switched off.",
  "not-yet": "Scheduled to start later.",
  expired: "The activation window has expired.",
};

const PRESETS = [
  { label: "4 hours", minutes: 240 },
  { label: "1 day", minutes: 1440 },
  { label: "5 days", minutes: 7200 },
];

const humanDuration = (ms) => {
  if (ms == null) return "no expiry";
  const total = Math.max(Math.floor(ms / 1000), 0);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
};

const NasActivationCard = ({ onChanged }) => {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("duration");
  const [minutes, setMinutes] = useState(240);
  const [range, setRange] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/nas/activation`, {
        credentials: "include",
      });
      setState(await res.json());
    } catch {
      setError("Could not read the activation state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-read periodically so an expiry that happens while this page is open is
  // reflected. The server is still the one that decided it.
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const save = async (body) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/nas/activation`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not change document access.");
        return;
      }
      setState(data);
      message.success(body.enabled ? "Document access is on" : "Document access is off");
      onChanged?.(data);
    } finally {
      setSaving(false);
    }
  };

  const activate = () => {
    if (mode === "duration") return save({ enabled: true, durationMinutes: minutes });
    if (!range?.[0] || !range?.[1]) {
      setError("Choose a start and an end.");
      return undefined;
    }
    return save({
      enabled: true,
      startsAt: range[0].toISOString(),
      endsAt: range[1].toISOString(),
    });
  };

  if (loading) return <Card size="small" loading title="Document access" />;

  const active = state?.active === true;

  return (
    <Card
      title="Document access"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      }
    >
      {error && <Alert type="error" showIcon message={error} closable style={{ marginBottom: 16 }} />}

      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Status">
          {active ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag>}
          {!active && state?.reason && (
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {REASONS[state.reason] || state.reason}
            </Text>
          )}
        </Descriptions.Item>
        {state?.startsAt && (
          <Descriptions.Item label="Activated">
            {dayjs(state.startsAt).format("D MMM YYYY, h:mm A")}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Expires">
          {state?.endsAt ? (
            dayjs(state.endsAt).format("D MMM YYYY, h:mm A")
          ) : (
            <Text type="secondary">no expiry set</Text>
          )}
        </Descriptions.Item>
        {active && state?.remainingMs != null && (
          <Descriptions.Item label="Remaining">
            <Statistic
              value={humanDuration(state.remainingMs)}
              valueStyle={{ fontSize: 16 }}
            />
          </Descriptions.Item>
        )}
        {state?.updatedBy && (
          <Descriptions.Item label="Last changed">
            {state.updatedBy}
            {state.updatedAt ? ` · ${dayjs(state.updatedAt).format("D MMM, h:mm A")}` : ""}
          </Descriptions.Item>
        )}
      </Descriptions>

      {active ? (
        <Button danger icon={<PoweroffOutlined />} loading={saving} onClick={() => save({ enabled: false })}>
          Switch off for everyone
        </Button>
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
            <Radio.Button value="duration">For a period</Radio.Button>
            <Radio.Button value="window">Between two times</Radio.Button>
          </Radio.Group>

          {mode === "duration" ? (
            <Space wrap>
              {PRESETS.map((p) => (
                <Button
                  key={p.minutes}
                  size="small"
                  type={minutes === p.minutes ? "primary" : "default"}
                  onClick={() => setMinutes(p.minutes)}
                >
                  {p.label}
                </Button>
              ))}
              <InputNumber
                min={1}
                max={20160}
                value={minutes}
                onChange={(v) => setMinutes(v || 1)}
                addonAfter="min"
                style={{ width: 150 }}
              />
            </Space>
          ) : (
            <DatePicker.RangePicker showTime value={range} onChange={setRange} />
          )}

          <Button type="primary" loading={saving} onClick={activate}>
            Switch on for everyone
          </Button>
        </Space>
      )}

      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
        The server evaluates this window on every request, so access ends on its
        own when the period passes — nobody has to remember to switch it off.
        The share is unavailable at weekends, which is what this is for.
      </Paragraph>
    </Card>
  );
};

export default NasActivationCard;
