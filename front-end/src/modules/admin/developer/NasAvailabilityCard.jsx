import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Descriptions, Input, InputNumber, Space, Switch, Tag, TimePicker, Typography } from "antd";
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { message } from "../../../shared/feedback";
import { API_BASE_URL } from "../../../config/api";
import { initializeSocket, getSocket } from "../../../api/socketService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Availability: one switch for every container, and the days the NAS is
// offered.
//
// The office server that bridges to the NAS is up on working days. Rather
// than let a weekend request fail against a share nobody expects to be
// reachable, the Developer sets the schedule here and writes the sentence
// staff read when they try — "NAS files are available on weekdays only".
// The server applies both on every request; this screen only edits them.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

// ---------------------------------------------------------------------------
// The bridge server. The application reaches the NAS through the office
// Windows Server on the tailnet; when it is off, so are the files. The
// server probes it on a timer and pushes changes to open screens; this card
// sets the address and shows the last probe.
// ---------------------------------------------------------------------------

const BridgeCard = ({ onProbed }) => {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await api("/api/nas/bridge");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.message || "Could not read the bridge settings.");
      return;
    }
    const { status: st, ...config } = body;
    setSaved(config);
    setDraft(config);
    setStatus(st);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { updatedAt, updatedBy, ...body } = draft;
      const res = await api("/api/nas/bridge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not save.");
        return;
      }
      const { status: st, changed, ...config } = data;
      setSaved(config);
      setDraft(config);
      setStatus(st);
      message.success(changed?.length ? `Saved: ${changed.join("; ")}.` : "Saved.");
      onProbed?.();
    } finally {
      setSaving(false);
    }
  };

  const probe = async () => {
    setProbing(true);
    try {
      const res = await api("/api/nas/bridge/probe", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(data.status);
        onProbed?.();
      } else message.error(data.message || "The check did not run.");
    } finally {
      setProbing(false);
    }
  };

  if (!draft) return error ? <Alert type="error" showIcon message={error} /> : <Card loading />;

  const up = status?.enabled ? status.up : null;
  const patch = (p) => setDraft({ ...draft, ...p });
  const ms = (r) => (r?.up ? r.ms + " ms" : "no answer");

  return (
    <Card
      size="small"
      title="Bridge server"
      extra={
        <Space>
          {up === true && <Tag color="green">NAS answering</Tag>}
          {up === false && <Tag color="red">{status?.bridge && !status.bridge.up ? "bridge not answering" : "NAS not connected"}</Tag>}
          {up === null && <Tag>not watched</Tag>}
          <Button size="small" icon={<ReloadOutlined />} loading={probing} onClick={probe}>
            Check now
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          The NAS is knocked on (its SMB port) on a timer whenever a share is configured; when it stops
          answering, NAS files are withdrawn at once and every open screen says so — the database and the
          rest of the application are unaffected. The application reaches the NAS through the office Windows
          Server on the tailnet; turn the bridge check on once it is in place, and the server is pinged as
          well so the message can say which of the two is off.
        </Paragraph>
        <Space align="start" size="middle">
          <Switch checked={draft.enabled} onChange={(v) => patch({ enabled: v })} />
          <Text strong>{draft.enabled ? "Bridge watched, and required" : "Bridge not watched (the NAS still is)"}</Text>
        </Space>
        <Descriptions column={1} size="small" bordered labelStyle={{ width: 160 }}>
          <Descriptions.Item label="Server name">
            <Input value={draft.name} maxLength={80} placeholder="emb3winsrvr2019" onChange={(e) => patch({ name: e.target.value })} style={{ maxWidth: 320 }} />
          </Descriptions.Item>
          <Descriptions.Item label="Tailscale address">
            <Input value={draft.host} maxLength={120} placeholder="100.126.200.112 or emb3winsrvr2019" onChange={(e) => patch({ host: e.target.value })} style={{ maxWidth: 320 }} />
          </Descriptions.Item>
          <Descriptions.Item label="NAS through it">
            <Space>
              <Input placeholder="10.14.76.167" value={draft.nasHost} maxLength={120} onChange={(e) => patch({ nasHost: e.target.value })} style={{ width: 200 }} />
              <Text type="secondary">port</Text>
              <InputNumber placeholder="445" value={draft.nasPort} min={1} max={65535} onChange={(v) => patch({ nasPort: v || 445 })} style={{ width: 90 }} />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Check every">
            <Space>
              <InputNumber placeholder="30" value={draft.intervalSec} min={10} max={600} onChange={(v) => patch({ intervalSec: v || 30 })} style={{ width: 90 }} />
              <Text type="secondary">seconds, timeout</Text>
              <InputNumber placeholder="4000" value={draft.timeoutMs} min={500} max={20000} step={500} onChange={(v) => patch({ timeoutMs: v || 4000 })} style={{ width: 100 }} />
              <Text type="secondary">ms</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Message when off">
            <Input.TextArea placeholder="Shown to everyone while the bridge server is off" rows={2} maxLength={400} showCount value={draft.offlineMessage} onChange={(e) => patch({ offlineMessage: e.target.value })} />
          </Descriptions.Item>
          {status?.checkedAt && (
            <Descriptions.Item label="Last check">
              {new Date(status.checkedAt).toLocaleString()}
              {status.bridge && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  bridge {ms(status.bridge)}
                  {status.nas && " · NAS " + ms(status.nas)}
                </Text>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={save}>
            Save bridge
          </Button>
          <Button disabled={!dirty} onClick={() => setDraft(saved)}>
            Discard
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

const useAvailabilityEvents = (load) => {
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    const onAvailability = () => load();
    socket?.on("nas:availability", onAvailability);
    return () => socket?.off("nas:availability", onAvailability);
  }, [load]);
};

const NasAvailabilityCard = () => {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [now, setNow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await api("/api/nas/availability");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.message || "Could not read the availability settings.");
      return;
    }
    const { now: current, scheduleText, ...config } = body;
    setSaved(config);
    setDraft(config);
    setNow({ ...current, scheduleText });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAvailabilityEvents(load);

  const dirty = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api("/api/nas/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: draft.master, schedule: draft.schedule, message: draft.message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not save.");
        return;
      }
      const { now: current, scheduleText, changed, ...config } = body;
      setSaved(config);
      setDraft(config);
      setNow({ ...current, scheduleText });
      message.success(changed?.length ? `Saved: ${changed.join("; ")}.` : "Saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return error ? <Alert type="error" showIcon message={error} /> : <Card loading />;

  const patchSchedule = (patch) => setDraft({ ...draft, schedule: { ...draft.schedule, ...patch } });

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <Card
        size="small"
        title="Right now"
        extra={
          now?.available ? <Tag color="green">NAS offered</Tag> : <Tag color="orange">NAS not offered</Tag>
        }
      >
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="State">
            {now?.available ? (
              <Text>Containers are offered to the people they are shared with (the activation window under Access still applies).</Text>
            ) : (
              <Text>{now?.message}</Text>
            )}
          </Descriptions.Item>
          {now?.reason && <Descriptions.Item label="Reason">{now.reason}</Descriptions.Item>}
          <Descriptions.Item label="Schedule">{now?.scheduleText}</Descriptions.Item>
          {now?.nextOpensAt && (
            <Descriptions.Item label="Next opens">{new Date(now.nextOpensAt).toLocaleString()}</Descriptions.Item>
          )}
          {saved.updatedAt && (
            <Descriptions.Item label="Last changed">
              {saved.updatedBy} · {new Date(saved.updatedAt).toLocaleString()}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <BridgeCard onProbed={load} />

      <Card size="small" title="All containers">
        <Space align="start" size="middle">
          <Switch checked={draft.master} onChange={(v) => setDraft({ ...draft, master: v })} />
          <div>
            <Text strong>{draft.master ? "On" : "Off"}</Text>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              One switch for Records, Legal, Laboratory and every other container. Off takes them all away at
              once — from staff and from you — without changing each container&rsquo;s own switch, so turning it
              back on restores exactly what was there.
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Card size="small" title="Schedule">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space align="start" size="middle">
            <Switch checked={draft.schedule.enabled} onChange={(v) => patchSchedule({ enabled: v })} />
            <div>
              <Text strong>{draft.schedule.enabled ? "Offered on a schedule" : "Offered at any time"}</Text>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                The office server that reaches the NAS runs on working days. Outside these days and hours the
                application shows the message below instead of trying the share.
              </Paragraph>
            </div>
          </Space>

          <Descriptions column={1} size="small" bordered labelStyle={{ width: 160 }}>
            <Descriptions.Item label="Days">
              <Checkbox.Group
                options={DAYS}
                value={draft.schedule.days}
                disabled={!draft.schedule.enabled}
                onChange={(days) => patchSchedule({ days: [...days].sort() })}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Hours">
              <Space>
                <TimePicker
                  format="HH:mm"
                  minuteStep={15}
                  allowClear={false}
                  disabled={!draft.schedule.enabled}
                  value={dayjs(draft.schedule.from, "HH:mm")}
                  onChange={(v) => v && patchSchedule({ from: v.format("HH:mm") })}
                />
                <Text type="secondary">to</Text>
                <TimePicker
                  format="HH:mm"
                  minuteStep={15}
                  allowClear={false}
                  disabled={!draft.schedule.enabled}
                  value={dayjs(draft.schedule.to, "HH:mm")}
                  onChange={(v) => v && patchSchedule({ to: v.format("HH:mm") })}
                />
                <Text type="secondary">{saved.timeZone}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Message shown">
              <Input.TextArea
                rows={2}
                maxLength={400}
                showCount
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                placeholder="NAS files are available on weekdays only…"
              />
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <Space>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={save}>
          Save changes
        </Button>
        <Button disabled={!dirty} onClick={() => setDraft(saved)}>
          Discard
        </Button>
      </Space>
    </Space>
  );
};

export default NasAvailabilityCard;
