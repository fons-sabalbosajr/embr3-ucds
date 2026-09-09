import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import { message } from "../../../shared/feedback";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The share connection, editable so the password can be rotated without a
// redeploy.
//
// The password field is always empty on load and the API never returns one:
// the screen is told only whether a password is set. Leaving it blank keeps
// the stored secret, so correcting a host name does not silently blank the
// credential.
//
// Saving also applies the credential to the machine's own credential store.
// That is not decoration — nothing in the backend authenticates to the share
// itself, Windows does, so a password stored here without being applied would
// leave the old one in force while the screen said "saved".
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const NasConnectionCard = ({ onSaved }) => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/nas/config");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not read the share configuration.");
        return;
      }
      setConfig(body);
      form.setFieldsValue({
        root: body.configured ? `\\\\${body.host}\\${body.share}` : "",
        baseDir: body.baseDir || "",
        username: body.username || "",
        domain: body.domain || "",
        password: "",
      });
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values) => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await api("/api/nas/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not save the connection.");
        return;
      }
      setConfig(body.config);
      setResult(body);
      form.setFieldValue("password", "");
      message.success(
        body.test?.ok ? "Saved. The share answered." : "Saved, but the share did not answer."
      );
      onSaved?.(body);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await api("/api/nas/test-connection", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setResult({ test: body.ok ? { ok: true, ms: body.ms, entryCount: body.entryCount } : { ok: false, ...body } });
    } finally {
      setTesting(false);
    }
  };

  const revert = async () => {
    const res = await api("/api/nas/config", { method: "DELETE" });
    if (res.ok) {
      message.success("Reverted to the server environment settings.");
      await load();
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable />}

      {config && !config.secretsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="Secrets cannot be stored on this server"
          description="CONFIG_ENCRYPTION_KEY is not set, so the password cannot be encrypted at rest. The NAS_* environment variables are being used instead and cannot be changed from here."
        />
      )}

      {config?.configured && config.passwordReadable === false && (
        <Alert
          type="error"
          showIcon
          message="The stored password cannot be read"
          description="CONFIG_ENCRYPTION_KEY has probably changed since it was saved. Enter the password again to store it under the current key."
        />
      )}

      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label="Settings come from">
          <Tag color={config?.source === "database" ? "blue" : "default"}>
            {config?.source === "database" ? "Admin Settings" : "server environment"}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Password">
          {config?.passwordSet ? <Tag color="green">Set</Tag> : <Tag color="orange">Not set</Tag>}
        </Descriptions.Item>
        {config?.updatedBy && (
          <Descriptions.Item label="Last changed" span={2}>
            {config.updatedBy}
            {config.updatedAt ? ` · ${new Date(config.updatedAt).toLocaleString()}` : ""}
          </Descriptions.Item>
        )}
      </Descriptions>

      <Form
        form={form}
        layout="vertical"
        onFinish={save}
        disabled={loading || (config && !config.secretsAvailable)}
        style={{ maxWidth: 560 }}
      >
        <Form.Item
          name="root"
          label="Share path"
          rules={[{ required: true, message: "Enter the share path" }]}
          extra="The UNC path to the share, for example \\10.14.76.167\IDMS_Records_Database"
        >
          <Input placeholder="\\host\share" autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="baseDir"
          label="Base directory"
          extra="A folder inside the share. Leave empty unless documents live in a subfolder — the stored record paths already begin at the share root."
        >
          <Input placeholder="(none)" autoComplete="off" />
        </Form.Item>

        <Form.Item name="username" label="Username">
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item name="domain" label="Domain or workgroup" extra="Leave empty if the account is local to the NAS.">
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          extra={
            config?.passwordSet
              ? "Leave empty to keep the stored password. Enter a new one to rotate it."
              : "Stored encrypted. It is never sent back to this screen."
          }
        >
          <Input.Password
            placeholder={config?.passwordSet ? "unchanged" : "not set"}
            autoComplete="new-password"
          />
        </Form.Item>

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
            Save and apply
          </Button>
          <Button onClick={test} loading={testing} icon={<ReloadOutlined />}>
            Test connection
          </Button>
          {config?.source === "database" && (
            <Popconfirm
              title="Revert to the server environment settings?"
              description="The stored connection is discarded. The NAS_* values in server/.env are used instead."
              onConfirm={revert}
            >
              <Button danger>Revert to environment</Button>
            </Popconfirm>
          )}
        </Space>
      </Form>

      {result?.test && (
        <Alert
          type={result.test.ok ? "success" : "error"}
          showIcon
          message={
            result.test.ok
              ? `The share answered in ${result.test.ms}ms — ${result.test.entryCount} entries at the root.`
              : result.test.message || "The share did not answer."
          }
          description={
            result.credentialApplied === false && result.credentialMessage ? (
              <Paragraph style={{ marginBottom: 0 }}>
                <Text strong>Credential not applied: </Text>
                {result.credentialMessage}
              </Paragraph>
            ) : result.credentialApplied ? (
              "The machine credential was updated, so this password is now the one in force."
            ) : null
          }
        />
      )}
    </Space>
  );
};

export default NasConnectionCard;
