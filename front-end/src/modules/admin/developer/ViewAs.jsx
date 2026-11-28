import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Input, List, Radio, Space, Tag, Typography } from "antd";
import { EyeOutlined, KeyOutlined, LockOutlined } from "@ant-design/icons";
import { message } from "../../../shared/feedback";
import { API_BASE_URL } from "../../../config/api";
import { ROUTES } from "../../../config/routes";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// Developer › View as an account.
//
// See E-Universe exactly as a Planning or ERMS officer sees it: their menus,
// provinces, years and ERMS unit, through the same checks the server applies
// to them. View only, for 30 minutes at most, and logged under the Developer
// (server/services/viewAs.js). The PIN is the Developer's own, set here with
// their password; it is asked for each time a view is started.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}/api/developer/view-as${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  }).then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }));

const digits = (v) => v.replace(/\D/g, "").slice(0, 6);

const PinCard = ({ state, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isSet = state?.pinSet === true;

  const save = async () => {
    setError(null);
    if (pin !== confirm) return setError("The two PINs do not match.");
    setSaving(true);
    const { ok, body } = await api("/pin", { method: "POST", body: JSON.stringify({ pin, password }) });
    setSaving(false);
    if (!ok) return setError(body.message || "Could not save the PIN.");
    setPin("");
    setConfirm("");
    setPassword("");
    setEditing(false);
    message.success("PIN saved.");
    onSaved();
  };

  return (
    <Card
      title={
        <Space size={8}>
          <KeyOutlined />
          <span>PIN</span>
          {isSet ? <Tag color="green">Set</Tag> : <Tag>Not set</Tag>}
        </Space>
      }
      extra={isSet && !editing ? <Button size="small" onClick={() => setEditing(true)}>Change</Button> : null}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {isSet && !editing ? (
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Asked for each time you start viewing as an account. Five wrong PINs lock it for 15 minutes.
          {state?.pinSetAt && <> Set {new Date(state.pinSetAt).toLocaleString()}.</>}
        </Paragraph>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 380 }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            6 digits, not repeated or sequential. Confirm it with your own password.
          </Paragraph>
          <Input.Password placeholder="New PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(digits(e.target.value))} />
          <Input.Password placeholder="Confirm PIN" inputMode="numeric" maxLength={6} value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
          <Input.Password placeholder="Your password" prefix={<LockOutlined />} value={password} onChange={(e) => setPassword(e.target.value)} onPressEnter={save} />
          <Space>
            <Button type="primary" loading={saving} disabled={pin.length < 6 || confirm.length < 6 || !password} onClick={save}>
              {isSet ? "Change PIN" : "Set PIN"}
            </Button>
            {editing && <Button onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>}
          </Space>
        </Space>
      )}
    </Card>
  );
};

const StartCard = ({ state }) => {
  const [pin, setPin] = useState("");
  const [accounts, setAccounts] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const unlock = async () => {
    setError(null);
    setBusy(true);
    const { ok, body } = await api("/unlock", { method: "POST", body: JSON.stringify({ pin }) });
    setBusy(false);
    setPin("");
    if (!ok) return setError(body.message || "Could not check the PIN.");
    setAccounts(body.accounts || []);
  };

  const start = async () => {
    setError(null);
    setBusy(true);
    const { ok, body } = await api("/start", { method: "POST", body: JSON.stringify({ userId: chosen }) });
    if (!ok) {
      setBusy(false);
      if (/PIN again/i.test(body.message || "")) setAccounts(null);
      return setError(body.message || "Could not start.");
    }
    // A full reload: every screen, menu and cached answer is the officer's from here.
    window.location.assign(ROUTES.appHome);
  };

  if (!state?.pinSet) {
    return (
      <Card title={<Space size={8}><EyeOutlined /><span>Start viewing</span></Space>}>
        <Text type="secondary">Set a PIN first.</Text>
      </Card>
    );
  }

  return (
    <Card title={<Space size={8}><EyeOutlined /><span>Start viewing</span></Space>}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {state.locked && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`Locked after wrong PINs until ${new Date(state.lockedUntil).toLocaleTimeString()}.`} />
      )}
      {!accounts ? (
        <Space.Compact style={{ maxWidth: 320, width: "100%" }}>
          <Input.Password placeholder="PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(digits(e.target.value))} onPressEnter={() => pin.length === 6 && unlock()} />
          <Button type="primary" loading={busy} disabled={pin.length < 6} onClick={unlock}>Continue</Button>
        </Space.Compact>
      ) : accounts.length === 0 ? (
        <Empty description="There are no Planning or ERMS accounts yet." />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Text type="secondary">Choose the account. The list stays open for 5 minutes.</Text>
          <Radio.Group value={chosen} onChange={(e) => setChosen(e.target.value)} style={{ width: "100%" }}>
            <List
              bordered
              dataSource={accounts}
              renderItem={(a) => (
                <List.Item onClick={() => setChosen(a.userId)} style={{ cursor: "pointer" }}>
                  <Radio value={a.userId}>
                    <Space direction="vertical" size={0}>
                      <Text strong>{a.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {a.username} · {[a.designation, a.division].filter(Boolean).join(", ") || "—"}
                      </Text>
                    </Space>
                  </Radio>
                  <Tag color={a.role === "records" ? "purple" : "blue"}>{a.roleLabel}</Tag>
                </List.Item>
              )}
            />
          </Radio.Group>
          <Space>
            <Button type="primary" icon={<EyeOutlined />} loading={busy} disabled={!chosen} onClick={start}>
              View as this account
            </Button>
            <Button onClick={() => { setAccounts(null); setChosen(null); }}>Cancel</Button>
          </Space>
        </Space>
      )}
    </Card>
  );
};

const ViewAs = () => {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    const { ok, body } = await api("/status");
    if (ok) setState(body);
    else setError(body.message || "Could not read the status.");
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Title level={3} style={{ marginTop: 0 }}>View as an account</Title>
      <Paragraph type="secondary">
        See E-Universe exactly as a Planning or ERMS officer sees it: their menus, provinces, years
        and unit. It is <Text strong>view only</Text>: nothing can be saved while it lasts. It ends
        after {state?.minutes || 30} minutes, when you click Exit, or when you sign out. Starting and
        ending are recorded in the audit trail under your name, and anything opened while viewing is
        logged as yours.
      </Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <PinCard state={state} onSaved={load} />
        <StartCard state={state} />
      </Space>
    </div>
  );
};

export default ViewAs;
