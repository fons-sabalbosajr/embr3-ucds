import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Space, Spin, Typography, theme as antdTheme } from "antd";
import { ClockCircleOutlined, SendOutlined } from "@ant-design/icons";
import { when } from "./time";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// One request's conversation, as either side sees it: the requester on the
// public page, staff on the desk (server/modules/portal/services/portalChat).
//
// Temporary by design — the server deletes a conversation left idle for 12
// hours — so the thread says when this one goes if nobody writes again.
// ---------------------------------------------------------------------------

const MAX = 1000;

/**
 * @param side      "requester" | "staff" — whose messages are "mine" (on the right)
 * @param messages  [{ id, from, name, text, at }]
 * @param onSend    (text) => Promise — resolves when the server has it
 */
export default function ChatThread({ side, messages = [], expiresAt, loading, onSend, sending, disabled, otherName, placeholder }) {
  const { token } = antdTheme.useToken();
  const [text, setText] = useState("");
  const endRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    try {
      await onSend(body);
      setText("");
    } catch {
      /* the caller shows the error; the text stays for another try */
    }
  };

  return (
    <div className="portal-chat">
      <Alert
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
        className="portal-chat-note"
        message="Temporary conversation"
        description={
          <>
            Messages are deleted after <b>12 hours</b> without a new one
            {expiresAt ? <> — this conversation goes at <b>{when(expiresAt)}</b> unless someone writes</> : null}. Do not send passwords or ID numbers.
          </>
        }
      />
      <div className="portal-chat-messages" role="log" aria-live="polite" aria-label="Messages">
        {loading ? (
          <Spin style={{ display: "block", margin: "32px auto" }} />
        ) : !messages.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No messages yet. Write to ${otherName || "the other side"} below.`} />
        ) : (
          messages.map((m) => {
            const mine = m.from === side;
            return (
              <div key={m.id} className={`portal-chat-row${mine ? " is-mine" : ""}`}>
                <div
                  className="portal-chat-bubble"
                  style={
                    mine
                      ? { background: token.colorPrimary, color: token.colorTextLightSolid }
                      : { background: token.colorFillSecondary, color: token.colorText }
                  }
                >
                  {m.text}
                </div>
                <Text type="secondary" className="portal-chat-meta">
                  {mine ? "You" : m.name || (m.from === "staff" ? "Staff" : "Requester")} · {when(m.at)}
                </Text>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <Space.Compact style={{ width: "100%" }}>
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={MAX}
          placeholder={placeholder || "Type a message — Enter to send, Shift+Enter for a new line"}
          disabled={disabled}
          aria-label="Your message"
        />
        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={sending} disabled={disabled || !text.trim()}>
          Send
        </Button>
      </Space.Compact>
    </div>
  );
}
