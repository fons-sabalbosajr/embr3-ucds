import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Input, Result, Space, Spin, Tabs, Tag, Typography } from "antd";
import { useSearchParams } from "react-router-dom";
import { message } from "../../../shared/feedback";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import NasConnectionCard from "./NasConnectionCard";
import NasHistoryCard from "./NasHistoryCard";
import NasActivationCard from "./NasActivationCard";
import NasPinCard from "./NasPinCard";
import NasFileExplorer from "./NasFileExplorer";
import NasContainersCard from "./NasContainersCard";
import NasAccessCard from "./NasAccessCard";
import NasDiagnosticsCard from "./NasDiagnosticsCard";
import NasAuditCard from "./NasAuditCard";
import NasReportFilesCard from "./NasReportFilesCard";

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

const StorageConfig = () => {
  const [elevated, setElevated] = useState(null); // null = still checking
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [pin, setPin] = useState(null);
  const [pinEntry, setPinEntry] = useState("");
  const [forceEmail, setForceEmail] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = ["connection", "containers", "access", "explorer", "reports", "diagnostics", "audit"].includes(params.get("tab"))
    ? params.get("tab")
    : "connection";

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
        // Tells the gate which challenge to offer first. Carries no secret —
        // only whether a PIN exists and whether it is locked out.
        setPin(state.pin || null);
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

  const submitPin = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await jsonPost("/api/nas/elevation/pin/verify", { pin: pinEntry.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.attemptsLeft != null && data.attemptsLeft > 0
            ? `${data.message} ${data.attemptsLeft} attempt(s) left.`
            : data.message || "That PIN was not accepted."
        );
        if (data.code === "PIN_LOCKED") setPin((p) => ({ ...(p || {}), locked: true }));
        return;
      }
      setPinEntry("");
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



  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  if (!elevated) {
    // A PIN is offered first when one is set: it re-opens a step-up already
    // proved by email, so making someone wait for another email each time buys
    // nothing except the habit of leaving the page open.
    const pinAvailable = pin?.set && !pin?.locked && !forceEmail;

    return (
      <Card style={{ maxWidth: 560, margin: "24px auto" }}>
        <Result
          icon={<LockOutlined />}
          title="Verification required"
          subTitle={
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              The records share configuration names the internal server and the
              service account, so reading or changing it needs
              {pinAvailable ? " your PIN." : " a one-time code sent to the email address registered on your account."}
            </Paragraph>
          }
        />

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        {pin?.locked && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="PIN locked"
            description="Too many incorrect PINs. Verify by email to unlock it."
          />
        )}

        {pinAvailable ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Input.Password
              size="large"
              maxLength={12}
              inputMode="numeric"
              placeholder="PIN"
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ""))}
              onPressEnter={submitPin}
              style={{ letterSpacing: 4, textAlign: "center", fontSize: 18 }}
            />
            <Button
              type="primary"
              block
              loading={verifying}
              disabled={pinEntry.length < 6}
              onClick={submitPin}
            >
              Unlock
            </Button>
            <Button type="link" block onClick={() => setForceEmail(true)}>
              Email me a code instead
            </Button>
          </Space>
        ) : !sentTo ? (
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

  // Four tabs rather than one long column. Connection and Access are
  // deliberately separate: how the backend authenticates to the share is a
  // different question from whether the application is currently permitted to
  // use it, and changing a password should not silently turn access on.
  const tabs = [
    {
      key: "connection",
      label: "Records connection",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="This is the Records container"
            description="ERMS documents resolve against it, and the NAS_* variables in server/.env describe it when nothing is stored here. The Legal, Laboratory and any other shares are managed under Containers; who may open each is set under Access."
          />
          <NasConnectionCard onSaved={() => setTestResult(null)} />
        </Space>
      ),
    },
    {
      key: "containers",
      label: "Containers",
      children: <NasContainersCard onChanged={() => setTestResult(null)} />,
    },
    {
      key: "access",
      label: "Access",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="How the NAS reaches staff"
            description="Two switches, both yours. Activation turns document access on for everyone for a set window. The table decides which containers each Planning or Records admin may open in that window; Encoders never have storage. Nobody but you holds a share credential."
          />
          <NasActivationCard />
          <NasAccessCard refreshKey={testResult} />
          <NasPinCard />
        </Space>
      ),
    },
    {
      key: "explorer",
      label: "File Explorer",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="Your view of every container"
            description="Pick a container to browse it as the server sees it. Staff see the same explorer under Storage, limited to the containers shared with them on the Access tab."
          />
          <NasFileExplorer />
        </Space>
      ),
    },
    {
      key: "reports",
      label: "Report Files",
      children: <NasReportFilesCard />,
    },
    {
      key: "diagnostics",
      label: "Diagnostics",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <NasDiagnosticsCard onTested={(r) => setTestResult(r)} />

          <Card title="Records container" size="small">
            {config?.configured ? (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Source">
                  {config.source === "database" ? "Admin Settings" : "server environment"}
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
                  {config.passwordSet ? (
                    <Tag color="green">Set</Tag>
                  ) : (
                    <Tag color="orange">Not set</Tag>
                  )}
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Held on the server. It is never sent to this screen.
                  </Text>
                </Descriptions.Item>
                {config.lastTestAt && (
                  <Descriptions.Item label="Last test">
                    <Tag color={config.lastTestOk ? "green" : "red"}>
                      {config.lastTestOk ? "passed" : "failed"}
                    </Tag>
                    {new Date(config.lastTestAt).toLocaleString()}
                    {config.lastTestDetail ? ` · ${config.lastTestDetail}` : ""}
                  </Descriptions.Item>
                )}
              </Descriptions>
            ) : (
              <Alert
                type="warning"
                showIcon
                message="No share is configured"
                description="Set it on the Connection tab, or set NAS_ROOT in server/.env."
              />
            )}
          </Card>

          {/* Refreshed when a connection test runs, so a rotation and its
              outcome appear together without a manual reload. */}
          <NasHistoryCard refreshKey={testResult} />

          <Alert
            type="info"
            showIcon
            message="How documents are served"
            description="Staff never reach the share directly. A document is requested by its record, the server resolves the stored path inside the configured share and streams the file back. No workstation needs the drive mapped, and no credential reaches a browser."
          />
        </Space>
      ),
    },
    {
      key: "audit",
      label: "Audit Log",
      children: <NasAuditCard />,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {error && <Alert type="warning" showIcon message={error} closable />}

      <Card
        title="Network Attached Storage (NAS Configuration)"
        extra={<Button onClick={endSession}>End verified session</Button>}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Tabs
          items={tabs}
          activeKey={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
        />
      </Card>
    </Space>
  );
};

export default StorageConfig;
