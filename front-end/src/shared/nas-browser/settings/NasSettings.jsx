import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Result,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  MailOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Records share configuration.
//
// Reading this screen needs an emailed one-time code on top of being signed in
// as a developer, because the configuration names the internal host and the
// service account. The code is verified on the server and the elevation lives
// in the session there — nothing about it is stored in the browser, so there
// is no token here for anything to reuse or leak.
//
// The share password is never sent to this screen in any form. It is set in
// server/.env and only the server ever reads it.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const jsonPost = (path, body) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const NasSettings = () => {
  const [elevated, setElevated] = useState(null); // null = still checking
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  const loadConfig = useCallback(async () => {
    const res = await api("/api/nas/config");
    if (res.status === 403) {
      setElevated(false);
      setConfig(null);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message || "Could not read the share configuration.");
      return;
    }
    setElevated(true);
    setConfig(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/nas/elevation");
        const state = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (state.elevated) await loadConfig();
        else setElevated(false);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConfig]);

  const requestCode = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await jsonPost("/api/nas/elevation/request");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not send a verification code.");
        return;
      }
      setSentTo(data.sentTo);
      message.success(`Verification code sent to ${data.sentTo}`);
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await jsonPost("/api/nas/elevation/verify", { code: code.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.attemptsLeft != null
            ? `${data.message} ${data.attemptsLeft} attempt(s) left.`
            : data.message || "That code was not accepted."
        );
        return;
      }
      setCode("");
      setSentTo(null);
      await loadConfig();
    } finally {
      setVerifying(false);
    }
  };

  const endSession = async () => {
    await api("/api/nas/elevation", { method: "DELETE" });
    setElevated(false);
    setConfig(null);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await jsonPost("/api/nas/test-connection");
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setElevated(false);
        setConfig(null);
        setError("Your verification expired. Verify again to continue.");
        return;
      }
      setTestResult(data);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  if (!elevated) {
    return (
      <Card style={{ maxWidth: 560, margin: "24px auto" }}>
        <Result
          icon={<LockOutlined />}
          title="Verification required"
          subTitle={
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              The records share configuration names the internal server and the
              service account, so reading or changing it needs a one-time code
              sent to the email address registered on your account.
            </Paragraph>
          }
        />

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        {!sentTo ? (
          <Button
            type="primary"
            block
            icon={<MailOutlined />}
            loading={sending}
            onClick={requestCode}
          >
            Email me a code
          </Button>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Alert
              type="info"
              showIcon
              message={`Code sent to ${sentTo}`}
              description="It expires in 10 minutes and can be used once."
            />
            <Input
              size="large"
              maxLength={6}
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onPressEnter={verify}
              style={{ letterSpacing: 6, textAlign: "center", fontSize: 20 }}
            />
            <Space style={{ width: "100%" }}>
              <Button
                type="primary"
                loading={verifying}
                disabled={code.length !== 6}
                onClick={verify}
              >
                Verify
              </Button>
              <Button loading={sending} onClick={requestCode}>
                Send another
              </Button>
            </Space>
          </Space>
        )}
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {error && <Alert type="warning" showIcon message={error} closable />}

      <Card
        title="Records share"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={testing} onClick={testConnection}>
              Test connection
            </Button>
            <Button onClick={endSession}>End verified session</Button>
          </Space>
        }
      >
        {config?.configured ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Status">
              {config.enabled ? (
                <Tag color="green">Enabled</Tag>
              ) : (
                <Tag color="orange">Disabled</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Host">{config.host}</Descriptions.Item>
            <Descriptions.Item label="Share">{config.share}</Descriptions.Item>
            <Descriptions.Item label="Base directory">
              {config.baseDir || <Text type="secondary">share root</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Service account">
              {config.username || <Text type="secondary">the server&rsquo;s own identity</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Domain">
              {config.domain || <Text type="secondary">none</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="Password">
              <Text type="secondary">
                Held in the server environment. It is never sent to this screen.
              </Text>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Alert
            type="warning"
            showIcon
            message="No share is configured"
            description="Set NAS_ROOT, NAS_USERNAME and NAS_PASSWORD in server/.env, then restart the server."
          />
        )}
      </Card>

      {testResult && (
        <Card size="small">
          {testResult.ok ? (
            <Space size="large">
              <Statistic
                title="Connection"
                value="Reachable"
                prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              />
              <Statistic title="Round trip" value={testResult.ms} suffix="ms" />
              <Statistic title="Entries at root" value={testResult.entryCount} />
            </Space>
          ) : (
            <Alert
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
              message={testResult.message || "The share could not be reached."}
              description={`Reason: ${testResult.reason || "unknown"}${
                testResult.code ? ` (${testResult.code})` : ""
              }`}
            />
          )}
        </Card>
      )}

      <Alert
        type="info"
        showIcon
        message="How documents are served"
        description={
          <>
            Staff never reach the share directly. A document is requested by its
            record, the server resolves the stored path inside the configured
            share and streams the file back. No workstation needs the drive
            mapped, and no credential reaches a browser.
          </>
        }
      />
    </Space>
  );
};

export default NasSettings;
