import { useEffect, useState } from "react";
import { Button, Space, Switch, Tooltip, Typography } from "antd";
import { MobileOutlined, SendOutlined } from "@ant-design/icons";
import { message } from "../feedback";
import { disablePush, enablePush, isPushOn, pushSupport, sendTestNotice } from "./devicePush";

// ---------------------------------------------------------------------------
// The bell's "Notify me on this device" switch. One per device: turned on
// here, this PC or phone shows E-Universe notices even with the app closed.
// When the browser cannot (an http:// address, an iPhone outside the Home
// Screen, notices blocked) it says what to do instead of failing quietly.
// ---------------------------------------------------------------------------

export default function DeviceNoticesToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    let live = true;
    isPushOn().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async (next) => {
    setBusy(true);
    try {
      if (next) {
        const res = await enablePush();
        if (!res.ok) {
          message.warning(res.reason);
          return;
        }
        setOn(true);
        message.success("Notices are on for this device.");
      } else {
        await disablePush();
        setOn(false);
        message.info("Notices are off for this device.");
      }
    } catch (e) {
      message.error(e?.response?.data?.message || "That did not work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const res = await sendTestNotice();
      message.success(res.pushes ? "Sent. It should appear on this device in a few seconds." : "Sent to your open screens.");
    } catch {
      message.error("The test notice could not be sent.");
    }
  };

  return (
    <div className="device-notices">
      <Space size={8} align="center" style={{ width: "100%", justifyContent: "space-between" }}>
        <Space size={6} align="center">
          <MobileOutlined />
          <Typography.Text style={{ fontSize: 12 }}>Notify me on this device</Typography.Text>
        </Space>
        <Space size={4} align="center">
          {on && (
            <Tooltip title="Send a test notice">
              <Button size="small" type="text" icon={<SendOutlined />} onClick={test} aria-label="Send a test notice" />
            </Tooltip>
          )}
          <Tooltip title={support.supported ? "Shows notices on this PC or phone, even with E-Universe closed." : support.reason}>
            <Switch size="small" checked={on} loading={busy} disabled={!support.supported && !on} onChange={toggle} />
          </Tooltip>
        </Space>
      </Space>
      {!support.supported && !on && (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
          {support.reason}
        </Typography.Text>
      )}
    </div>
  );
}
