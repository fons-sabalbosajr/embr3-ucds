import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import { DisconnectOutlined } from "@ant-design/icons";
import { initializeSocket, getSocket } from "../../../api/socketService";
import { message } from "../../../shared/feedback";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Storage containers: one share and one service account each.
//
// The NAS serves several units — Records, Legal Services, Laboratory — with a
// separate share and account for each, and there will be more. This card is
// where they are registered. The Records container is the one ERMS documents
// resolve against; the Connection tab still edits it on its own, and it cannot
// be removed here, only reset.
//
// Passwords follow the same rule as everywhere on this screen: entered here,
// stored encrypted on the server, never sent back.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const jsonBody = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

const slug = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);

const NasContainersCard = ({ onChanged }) => {
  const [form] = Form.useForm();
  const [list, setList] = useState([]);
  const [secretsAvailable, setSecretsAvailable] = useState(true);
  // Whether the NAS is offered right now — the master switch, the schedule,
  // the bridge and the activation window together. Comes with the list, and
  // is refreshed whenever the server announces a change.
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {key} = edit
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/nas/containers");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not read the containers.");
        return;
      }
      setList(body.containers || []);
      setSecretsAvailable(body.secretsAvailable !== false);
      setAvailability(body.availability || null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket() || initializeSocket();
    const onAvailability = () => load();
    socket?.on("nas:availability", onAvailability);
    return () => socket?.off("nas:availability", onAvailability);
  }, [load]);

  const offered = availability ? availability.available : true;
  const OFF_REASONS = {
    "master-off": "switched off for everyone (Availability → All containers)",
    "outside-schedule": "outside the schedule (Availability → Schedule)",
    "bridge-offline": "the bridge server is not answering",
    "nas-offline": "the NAS is not connected",
    disabled: "document access is switched off (Access → Activation)",
    expired: "the activation window has expired (Access → Activation)",
    "not-yet": "the activation window has not started (Access → Activation)",
  };

  const openNew = () => {
    form.resetFields();
    setOutcome(null);
    setEditing({});
  };

  const openEdit = (c) => {
    form.setFieldsValue({
      key: c.key,
      label: c.label,
      unit: c.unit || "",
      root: c.configured ? `\\\\${c.host}\\${c.share}` : "",
      baseDir: c.baseDir || "",
      username: c.username || "",
      domain: c.domain || "",
      password: "",
      incoming: Boolean(c.incoming),
      note: c.note || "",
    });
    setOutcome(null);
    setEditing(c);
  };

  const save = async (values) => {
    setSaving(true);
    setError(null);
    try {
      const creating = !editing?.key;
      const res = await api(
        creating ? "/api/nas/containers" : `/api/nas/containers/${encodeURIComponent(editing.key)}`,
        jsonBody(creating ? "POST" : "PUT", values)
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not save the container.");
        return;
      }
      setOutcome(body);
      setEditing(null);
      message.success(
        body.test?.ok
          ? `${body.container.label} saved. The share answered.`
          : `${body.container.label} saved, but the share did not answer.`
      );
      await load();
      onChanged?.(body);
    } finally {
      setSaving(false);
    }
  };

  const test = async (c) => {
    setBusyKey(c.key);
    setOutcome(null);
    try {
      const res = await api(`/api/nas/containers/${encodeURIComponent(c.key)}/test`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setOutcome({
        container: c,
        test: body.ok ? { ok: true, ms: body.ms, entryCount: body.entryCount } : { ok: false, ...body },
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  };

  const toggle = async (c, enabled) => {
    setBusyKey(c.key);
    try {
      const res = await api(
        `/api/nas/containers/${encodeURIComponent(c.key)}/enabled`,
        jsonBody("PATCH", { enabled })
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not change the container.");
        return;
      }
      message.success(`${c.label} ${enabled ? "switched on" : "switched off"}.`);
      await load();
      onChanged?.(body);
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (c) => {
    setBusyKey(c.key);
    try {
      const res = await api(`/api/nas/containers/${encodeURIComponent(c.key)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not remove the container.");
        return;
      }
      message.success(`${c.label} removed.`);
      await load();
      onChanged?.(body);
    } finally {
      setBusyKey(null);
    }
  };

  const columns = [
    {
      title: "Container",
      dataIndex: "label",
      key: "label",
      width: 200,
      align: "left",
      render: (label, c) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Text strong>{label}</Text>
            {c.isRecords && (
              <Tooltip title="ERMS records resolve against this container.">
                <Tag color="blue">records</Tag>
              </Tooltip>
            )}
            {c.incoming && (
              <Tooltip title="Registered ahead of its credentials. Nobody can open it, and it is not tested, until the flag is cleared.">
                <Tag color="gold">incoming</Tag>
              </Tooltip>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {c.unit || c.key}
          </Text>
          {c.note && (
            <Text type="secondary" italic style={{ fontSize: 12 }}>
              {c.note}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Share",
      key: "share",
      align: "left",
      width: 400,
      render: (_, c) =>
        c.configured ? (
          <Text code>{`\\\\${c.host}\\${c.share}${c.baseDir ? `\\${c.baseDir}` : ""}`}</Text>
        ) : (
          <Text type="secondary">not configured</Text>
        ),
    },
    {
      title: "Account",
      key: "account",
      align: "left",
      width: 450,
      render: (_, c) => (
        <Space size={6}>
          <Text>{c.domain ? `${c.domain}\\` : ""}{c.username || <Text type="secondary">server identity</Text>}</Text>
          {c.passwordSet ? (
            c.passwordReadable === false ? (
              <Tag color="red">unreadable</Tag>
            ) : (
              <Tag color="green">password set</Tag>
            )
          ) : (
            <Tag color="orange">no password</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Last test",
      key: "test",
      width: 200,
      align: "left",
      render: (_, c) =>
        c.lastTestAt ? (
          <Space size={6}>
            {c.lastTestOk ? (
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
            ) : (
              <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(c.lastTestAt).toLocaleString()}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">never</Text>
        ),
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      render: (_, c) =>
        c.incoming ? (
          <Tag color="gold">incoming</Tag>
        ) : !c.enabled ? (
          <Tag>off</Tag>
        ) : offered ? (
          <Tag color="green">online</Tag>
        ) : (
          <Tag color="red">not offered</Tag>
        ),
    },
    {
      title: "On",
      key: "enabled",
      width: 100,
      render: (_, c) => (
        <Switch
          size="small"
          checked={c.enabled}
          loading={busyKey === c.key}
          disabled={c.source === "environment" || c.incoming}
          title={c.incoming ? "Clear the incoming flag once the credentials arrive." : undefined}
          onChange={(v) => toggle(c, v)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      align: "left",
      width: 300,
      render: (_, c) => (
        <Space size={4}>
          <Button size="small" icon={<ReloadOutlined />} loading={busyKey === c.key} disabled={c.incoming} onClick={() => test(c)}>
            Test
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(c)}>
            Edit
          </Button>
          {!c.isRecords && (
            <Popconfirm
              title={`Remove ${c.label}?`}
              description="Its stored account is discarded. Files on the share are untouched."
              onConfirm={() => remove(c)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      {!secretsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="Containers cannot be added on this server"
          description="CONFIG_ENCRYPTION_KEY is not set, so a share password cannot be encrypted at rest. Set it and restart."
        />
      )}

      {availability && !offered && (
        <Alert
          type="warning"
          showIcon
          icon={<DisconnectOutlined />}
          message="The NAS is off or not connected — every container is withheld"
          description={
            <>
              Reason: {OFF_REASONS[availability.reason] || availability.reason || "unavailable"}.
              {availability.message ? <> Staff see: “{availability.message}”</> : null}
              {availability.nextOpensAt ? <> Next opens {new Date(availability.nextOpensAt).toLocaleString()}.</> : null}
            </>
          }
        />
      )}

      <Card
        title="Storage containers"
        size="small"
        className={availability && !offered ? "eu-containers-off" : undefined}
        extra={
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={load}>
              Refresh
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!secretsAvailable} onClick={openNew}>
              Add container
            </Button>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="key"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      {outcome?.test && (
        <Alert
          type={outcome.test.ok ? "success" : outcome.conflictMessage ? "warning" : "error"}
          showIcon
          message={
            outcome.test.ok
              ? `${outcome.container?.label || "The share"} answered in ${outcome.test.ms}ms — ${outcome.test.entryCount} entries at the root.`
              : outcome.test.message || "The share did not answer."
          }
          description={
            <Space direction="vertical" size={4}>
              {outcome.conflictMessage && (
                <Paragraph style={{ marginBottom: 0 }}>
                  <Text strong>Credential conflict: </Text>
                  {outcome.conflictMessage}
                </Paragraph>
              )}
              {outcome.credentialApplied === false && outcome.credentialMessage && (
                <Paragraph style={{ marginBottom: 0 }}>
                  <Text strong>Credential not applied: </Text>
                  {outcome.credentialMessage}
                </Paragraph>
              )}
              {outcome.credentialApplied && (
                <Text>The machine credential for this host was updated, so this password is now the one in force.</Text>
              )}
            </Space>
          }
        />
      )}

      <Alert
        type="info"
        showIcon
        message="One account per server name"
        description="The server reads shares through Windows, and Windows keeps one credential per server name. Two containers on the same address with different accounts need different names for that address — add an alias in C:\Windows\System32\drivers\etc\hosts (for example legal-nas → 10.14.76.167) and use \\legal-nas\Share here — or ask the NAS administrator to give one account read access to both shares."
      />

      <Modal
        open={editing !== null}
        title={editing?.key ? `Edit ${editing.label}` : "Add a storage container"}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing?.key ? "Save and apply" : "Add and test"}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          onValuesChange={(changed) => {
            if (!editing?.key && changed.label !== undefined && !form.isFieldTouched("key")) {
              form.setFieldValue("key", slug(changed.label));
            }
          }}
        >
          <Form.Item name="label" label="Name" rules={[{ required: true, message: "Name the container." }]}>
            <Input placeholder="e.g. Legal Services" autoComplete="off" autoFocus />
          </Form.Item>

          {!editing?.key && (
            <Form.Item
              name="key"
              label="Key"
              extra="Short identifier used in URLs and logs. Cannot change later."
              rules={[
                { required: true, message: "Enter a key." },
                { pattern: /^[a-z][a-z0-9-]{1,30}$/, message: "Lowercase letters, digits and hyphens; 2–31 characters." },
              ]}
            >
              <Input placeholder="legal-services" autoComplete="off" />
            </Form.Item>
          )}

          <Form.Item name="unit" label="Unit" extra="Who owns the files: shown next to the name.">
            <Input placeholder="e.g. Legal Services Unit" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="root"
            label="Share path"
            rules={[{ required: true, message: "Enter the share path." }]}
            extra="The UNC path to the share, for example \\10.14.76.167\LegalDB"
          >
            <Input placeholder="\\host\share" autoComplete="off" />
          </Form.Item>

          <Form.Item name="baseDir" label="Base directory" extra="A folder inside the share. Usually empty.">
            <Input placeholder="(none)" autoComplete="off" />
          </Form.Item>

          <Form.Item name="username" label="Username">
            <Input autoComplete="off" placeholder="e.g. LegalDB User" />
          </Form.Item>

          <Form.Item name="domain" label="Domain or workgroup" extra="Leave empty if the account is local to the NAS.">
            <Input placeholder="e.g. EMBR3SYNOLOGY" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            extra={
              editing?.passwordSet
                ? "Leave empty to keep the stored password. Enter a new one to rotate it."
                : "Stored encrypted. It is never sent back to this screen."
            }
          >
            <Input.Password placeholder={editing?.passwordSet ? "unchanged" : "not set"} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="incoming"
            label="Incoming"
            valuePropName="checked"
            extra="For a container whose credentials have not arrived yet. It is listed, but stays off and untested, and no account can be granted it."
          >
            <Switch size="small" />
          </Form.Item>

          <Form.Item name="note" label="Note" extra="Shown under the name, for example when the credentials are expected.">
            <Input placeholder="e.g. Credentials expected October 2026" autoComplete="off" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default NasContainersCard;
