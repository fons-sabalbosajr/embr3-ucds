import React, { useState } from "react";
import { Button, Card, Space, Typography, theme as antdTheme } from "antd";
import {
  CloseCircleOutlined,
  CompassOutlined,
  LockOutlined,
  WarningOutlined,
} from "@ant-design/icons";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// One error card for the whole application.
//
// "Forbidden", "not found" and "something threw" used to be three differently
// shaped Result blocks floating in the content area. They are the same moment
// for the person reading them — the page they wanted is not coming — so they
// get the same card: what happened, what it means for their data, what to do
// next, and the technical detail folded away for whoever has to report it.
//
// Colours come from the theme tokens, so the card is right in both modes and
// follows the accent like everything else.
// ---------------------------------------------------------------------------

const KINDS = {
  error: { icon: CloseCircleOutlined, tone: "colorError", tint: "colorErrorBg", label: "Error" },
  forbidden: { icon: LockOutlined, tone: "colorWarning", tint: "colorWarningBg", label: "No access" },
  notfound: { icon: CompassOutlined, tone: "colorInfo", tint: "colorInfoBg", label: "Not found" },
  warning: { icon: WarningOutlined, tone: "colorWarning", tint: "colorWarningBg", label: "Attention" },
};

/**
 * @param {"error"|"forbidden"|"notfound"|"warning"} kind
 * @param {string} title       one line, what happened
 * @param {React.ReactNode} description  what it means and what to do
 * @param {string} [details]   technical text, folded away by default
 * @param {React.ReactNode[]} [actions]  buttons; the first is primary
 * @param {string} [code]      a short code shown in the corner (403, 404…)
 */
const ErrorCard = ({ kind = "error", title, description, details, actions = [], code }) => {
  const { token } = antdTheme.useToken();
  const [showDetails, setShowDetails] = useState(false);
  const spec = KINDS[kind] || KINDS.error;
  const Icon = spec.icon;

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 16px" }}>
      <Card
        style={{ width: "100%", maxWidth: 560, borderTop: `3px solid ${token[spec.tone]}` }}
        styles={{ body: { padding: "28px 28px 24px" } }}
      >
        <Space align="start" size={18} style={{ width: "100%" }}>
          <div
            aria-hidden="true"
            style={{
              flex: "none",
              width: 52,
              height: 52,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: token[spec.tint],
              color: token[spec.tone],
              fontSize: 26,
            }}
          >
            <Icon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} style={{ marginBottom: 4 }}>
              <Text
                type="secondary"
                style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}
              >
                {spec.label}
              </Text>
              {code && (
                <Text type="secondary" style={{ fontSize: 11, fontFamily: "Consolas, Menlo, monospace" }}>
                  {code}
                </Text>
              )}
            </Space>
            <Title level={4} style={{ margin: "0 0 8px", lineHeight: 1.3 }}>
              {title}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: actions.length || details ? 18 : 0 }}>
              {description}
            </Paragraph>

            {actions.length > 0 && (
              <Space wrap>
                {actions.map((a, i) =>
                  React.isValidElement(a) ? React.cloneElement(a, { key: a.key ?? i }) : a
                )}
              </Space>
            )}

            {details && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? "Hide technical details" : "Show technical details"}
                </Button>
                {showDetails && (
                  <pre
                    style={{
                      margin: "8px 0 0",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: token.colorFillTertiary,
                      color: token.colorTextSecondary,
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 220,
                      overflow: "auto",
                    }}
                  >
                    {details}
                  </pre>
                )}
              </div>
            )}
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default ErrorCard;
