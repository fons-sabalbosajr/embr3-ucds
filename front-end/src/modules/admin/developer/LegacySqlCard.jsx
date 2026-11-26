/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, Typography } from "antd";
import { ApiOutlined, DatabaseOutlined, SaveOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import { message } from "../../../shared/feedback";
import LegacySqlExplorer from "./LegacySqlExplorer";
import EuDatabaseCard from "./EuDatabaseCard";

const { Paragraph, Text } = Typography;

// ---------------------------------------------------------------------------
// Storage › SQL Server: the legacy ERMS SQL Server, read-only.
//
// The office server connects to it over the office network, so it is never
// exposed to the Internet; a Developer reaches it here from anywhere. The
// login's password is stored encrypted on the server and is never sent back
// to this screen. Everything below only reads (services/legacySql.js).
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });

const json = async (res) => res.json().catch(() => ({}));

const TestResult = ({ result }) => {
  if (!result) return null;
  if (!result.ok) {
    return (
      <Alert
        type="error"
        showIcon
        message={`Could not connect (${result.code})`}
        description={
          <>
            <Paragraph style={{ marginBottom: 4 }}>{result.message}</Paragraph>
            <Text type="secondary">
              Check the address, login and password. The office server must be able to reach the SQL Server on the office network; from
              anywhere else this test only works through the office server.
            </Text>
          </>
        }
      />
    );
  }
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert
        type={result.canWrite ? "warning" : "success"}
        showIcon
        message={`Connected as ${result.login} in ${(result.ms / 1000).toFixed(1)} s`}
        description={
          result.canWrite
            ? "This login can change data. E-Universe never does, but ask the database administrator for a read-only login (db_datareader only) and save that instead."
            : "Read-only login: it can read the databases and change nothing."
        }
      />
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Server">
          {result.edition} {result.version}
          {result.sysadmin && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              sysadmin
            </Tag>
          )}
        </Descriptions.Item>
        {result.databases.map((d) => (
          <Descriptions.Item key={d.name} label={d.name}>
            {!d.exists ? (
              <Tag>not on this server</Tag>
            ) : !d.access ? (
              <Tag color="red">no access</Tag>
            ) : d.canWrite ? (
              <Tag color="orange">readable, login can write</Tag>
            ) : (
              <Tag color="green">readable</Tag>
            )}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Space>
  );
};

const LegacySqlCard = () => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [exploring, setExploring] = useState(false);

  const load = useCallback(async () => {
    const res = await api("/api/legacy-sql/config");
    const body = await json(res);
    if (!res.ok) {
      setError(body.message || "Could not read the SQL Server settings.");
      return;
    }
    setConfig(body);
    form.setFieldsValue({
      host: body.host || "",
      port: body.port || 1433,
      username: body.username || "",
      password: "",
      encrypt: body.encrypt !== false,
      trustServerCertificate: body.trustServerCertificate !== false,
      databases: body.databases,
    });
  }, [form]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values) => {
    setSaving(true);
    const res = await api("/api/legacy-sql/config", { method: "PUT", body: JSON.stringify(values) });
    const body = await json(res);
    setSaving(false);
    if (!res.ok) {
      message.error(body.message || "Could not save the settings.");
      return;
    }
    message.success("Saved. Testing the connection…");
    setConfig(body);
    form.setFieldValue("password", "");
    runTest();
  };

  const runTest = async () => {
    setTesting(true);
    const res = await api("/api/legacy-sql/test", { method: "POST" });
    const body = await json(res);
    setTesting(false);
    setResult(res.ok ? body : { ok: false, code: body.code || res.status, message: body.message || "The test could not run." });
    load();
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="The legacy ERMS SQL Server, read-only"
        description="E-Universe connects to it from the office server, over the office network, so the SQL Server is never exposed to the internet. You reach it here from anywhere. The password is stored encrypted on the server and is never shown again. E-Universe only reads; the daily divergence check can read it live with --source=sql."
      />
      {error && <Alert type="warning" showIcon message={error} />}
      {config && !config.secretsAvailable && (
        <Alert type="error" showIcon message="CONFIG_ENCRYPTION_KEY is not set on the server, so a password cannot be saved." />
      )}

      <Card size="small" title={<Space><ApiOutlined />Connection</Space>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark="optional" style={{ maxWidth: 640 }}>
          <Space wrap align="start" size="middle">
            <Form.Item name="host" label="Server" rules={[{ required: true, message: "Enter the server address" }]} extra="As in SSMS, e.g. 10.14.77.248, 1433">
              <Input placeholder="10.14.77.248, 1433" style={{ width: 260 }} autoComplete="off" />
            </Form.Item>
            <Form.Item name="port" label="Port" extra="Used when the server line has none">
              <InputNumber min={1} max={65535} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Space wrap align="start" size="middle">
            <Form.Item name="username" label="SQL Server login" rules={[{ required: true, message: "Enter the login" }]}>
              <Input placeholder="erms-server" style={{ width: 260 }} autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={config?.passwordSet ? [] : [{ required: true, message: "Enter the password" }]}
              extra={config?.passwordSet ? (config.passwordReadable ? "Saved. Leave blank to keep it." : "Saved, but unreadable: enter it again.") : "Stored encrypted; never shown again."}
            >
              <Input.Password placeholder={config?.passwordSet ? "••••••••" : ""} style={{ width: 260 }} autoComplete="new-password" />
            </Form.Item>
          </Space>
          <Form.Item name="databases" label="Databases to read" rules={[{ required: true, message: "List at least one database" }]}>
            <Select mode="tags" tokenSeparators={[",", " "]} placeholder="dbmain_records" />
          </Form.Item>
          <Space wrap size="large">
            <Form.Item name="encrypt" label="Encrypt the connection" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="trustServerCertificate" label="Trust the server's own certificate" valuePropName="checked" extra="On for an office server with a self-signed certificate">
              <Switch />
            </Form.Item>
          </Space>
          <Space wrap>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Save and test
            </Button>
            <Button onClick={runTest} loading={testing} disabled={!config?.configured}>
              Test connection
            </Button>
          </Space>
        </Form>
        {config?.lastTestAt && !result && (
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Last test {new Date(config.lastTestAt).toLocaleString()}:{" "}
            <Tag color={config.lastTestOk ? "green" : "red"}>{config.lastTestOk ? "passed" : "failed"}</Tag>
            {config.lastTestDetail}
          </Paragraph>
        )}
        {result && (
          <div style={{ marginTop: 16 }}>
            <TestResult result={result} />
          </div>
        )}
      </Card>

      {/* Once a test has passed: the data explorer, full screen. */}
      {config?.configured && config.lastTestOk && (
        <Card size="small">
          <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
            <Space direction="vertical" size={0}>
              <Text strong>Connected. Browse the legacy ERMS data</Text>
              <Text type="secondary">
                Tables, search, filters, sorting, column choice, and exports to CSV, Excel or JSON. Read-only; every export is audited.
              </Text>
            </Space>
            <Button type="primary" size="large" icon={<DatabaseOutlined />} onClick={() => setExploring(true)}>
              Open data explorer
            </Button>
          </Space>
        </Card>
      )}
      {/* E-Universe's own database on the same server (phase B1). */}
      <EuDatabaseCard />
      <Modal
        open={exploring}
        onCancel={() => setExploring(false)}
        footer={null}
        title={<Space><DatabaseOutlined />Legacy ERMS data explorer <Tag>read-only</Tag></Space>}
        width="calc(100vw - 32px)"
        style={{ top: 16, maxWidth: "none", paddingBottom: 0 }}
        destroyOnHidden
      >
        {config?.databases && <LegacySqlExplorer databases={config.databases} />}
      </Modal>
    </Space>
  );
};

export default LegacySqlCard;
