import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Tag, Typography, message } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The PIN that replaces re-emailing a code.
//
// It only appears here, inside the verified section, because setting one
// requires an elevation already proved by email. That is the whole safeguard:
// without it a stolen session could set a PIN and turn a temporary hold on the
// account into a durable one.
//
// The PIN grants exactly the same bounded elevation an emailed code does. It
// is a shortcut past the inbox, not a way to leave the share configuration
// permanently open.
// ---------------------------------------------------------------------------

const MIN = 6;
const MAX = 12;

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const NasPinCard = () => {
  const [state, setState] = useState(null);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api("/api/nas/elevation");
      const body = await res.json().catch(() => ({}));
      setState(body.pin || { set: false });
    } catch {
      setError("Could not read the PIN status.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setError(null);
    if (pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await api("/api/nas/elevation/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not set the PIN.");
        return;
      }
      setPin("");
      setConfirm("");
      setEditing(false);
      message.success("PIN saved. It will be asked for instead of an emailed code.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api("/api/nas/elevation/pin", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || "Could not remove the PIN.");
        return;
      }
      message.success("PIN removed. Verification goes back to email.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const isSet = state?.set === true;

  return (
    <Card
      title={
        <Space size={8}>
          <KeyOutlined />
          <span>Verification PIN</span>
          {isSet ? <Tag color="green">Set</Tag> : <Tag>Not set</Tag>}
        </Space>
      }
      extra={
        isSet && !editing ? (
          <Space>
            <Button size="small" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button size="small" danger loading={saving} onClick={remove}>
              Remove
            </Button>
          </Space>
        ) : null
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {isSet && !editing ? (
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          You will be asked for this PIN instead of an emailed code the next
          time you open this screen. Emailing a code still works if you forget
          it, and five wrong attempts locks the PIN until you verify by email.
        </Paragraph>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 380 }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {MIN}&ndash;{MAX} digits. Avoid repeated or sequential digits &mdash;
            this re-opens the share configuration, so it should not be a PIN
            somebody would try first.
          </Paragraph>
          <Input.Password
            placeholder="New PIN"
            maxLength={MAX}
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <Input.Password
            placeholder="Confirm PIN"
            maxLength={MAX}
            inputMode="numeric"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            onPressEnter={save}
          />
          <Space>
            <Button
              type="primary"
              loading={saving}
              disabled={pin.length < MIN || confirm.length < MIN}
              onClick={save}
            >
              {isSet ? "Change PIN" : "Set PIN"}
            </Button>
            {editing && (
              <Button
                onClick={() => {
                  setEditing(false);
                  setPin("");
                  setConfirm("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </Space>
          {state?.setAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Current PIN set {new Date(state.setAt).toLocaleString()}
            </Text>
          )}
        </Space>
      )}
    </Card>
  );
};

export default NasPinCard;
