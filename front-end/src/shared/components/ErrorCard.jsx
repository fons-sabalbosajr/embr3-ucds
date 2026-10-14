import React, { useState } from "react";
import { Button, Space, Typography, theme as antdTheme } from "antd";
import { CheckOutlined, CloseCircleOutlined, CompassOutlined, CopyOutlined, LockOutlined, WarningOutlined } from "@ant-design/icons";
import { subsystemOf } from "../subsystems";
import "./errorcard.css";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// One error screen for the whole application.
//
// "Forbidden", "not found" and "something threw" are the same moment for the
// person reading them — the page they wanted is not coming — so they share
// one card: where they were (the subsystem, in its own colour), what
// happened, what it means for their data, what to do next, and the technical
// detail folded away — with a copy button — for whoever has to report it.
//
// `fullPage` frames it on its own, for an error that took the whole
// application down with it (RouteError); otherwise it sits in the content
// area like any screen.
// ---------------------------------------------------------------------------

const KINDS = {
  error: { icon: CloseCircleOutlined, tone: "colorError", label: "Something went wrong" },
  forbidden: { icon: LockOutlined, tone: "colorWarning", label: "No access" },
  notfound: { icon: CompassOutlined, tone: "colorInfo", label: "Not found" },
  warning: { icon: WarningOutlined, tone: "colorWarning", label: "Attention" },
};

/**
 * @param {"error"|"forbidden"|"notfound"|"warning"} kind
 * @param {string} title       one line, what happened
 * @param {React.ReactNode} description  what it means and what to do
 * @param {string} [details]   technical text, folded away by default
 * @param {React.ReactNode[]} [actions]  buttons; the first is primary
 * @param {string} [code]      a short code (403, 404…)
 * @param {object} [subsystem] shared/subsystems entry; from the address when omitted
 * @param {boolean} [fullPage] frame it on its own page
 */
const ErrorCard = ({ kind = "error", title, description, details, actions = [], code, subsystem, fullPage = false }) => {
  const { token } = antdTheme.useToken();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const spec = KINDS[kind] || KINDS.error;
  const Icon = spec.icon;
  const where = subsystem || subsystemOf();
  const tone = token[spec.tone];

  const copy = () => {
    navigator.clipboard
      ?.writeText(`${where.name} — ${title}\n${window.location.href}\n\n${details}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const card = (
    <div className="eu-error-card" style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary, boxShadow: token.boxShadowTertiary }}>
      {/* Where this happened: the subsystem, in its own colour. */}
      <div className="eu-error-band" style={{ background: `linear-gradient(120deg, ${where.color} 0%, ${where.color}cc 100%)` }}>
        <div>
          <div className="eu-error-band-name">{where.name}</div>
          <div className="eu-error-band-detail">{where.detail}</div>
        </div>
        {code ? <span className="eu-error-code">{code}</span> : null}
      </div>

      <div className="eu-error-body">
        <div className="eu-error-icon" style={{ color: tone, background: `${tone}1a`, borderColor: `${tone}40` }} aria-hidden="true">
          <Icon />
        </div>
        <Text className="eu-error-kind" style={{ color: tone }}>
          {spec.label}
        </Text>
        <Title level={3} style={{ margin: "4px 0 10px", lineHeight: 1.3 }}>
          {title}
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 22 }}>
          {description}
        </Paragraph>

        {actions.length > 0 && (
          <Space wrap size={10} style={{ justifyContent: "center" }}>
            {actions.map((a, i) => (React.isValidElement(a) ? React.cloneElement(a, { key: a.key ?? i }) : a))}
          </Space>
        )}

        {details && (
          <div className="eu-error-details" style={{ borderTopColor: token.colorBorderSecondary }}>
            <Space size={4}>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? "Hide technical details" : "Show technical details"}
              </Button>
              {showDetails && (
                <Button type="text" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy}>
                  {copied ? "Copied" : "Copy details"}
                </Button>
              )}
            </Space>
            {showDetails && (
              <pre style={{ background: token.colorFillTertiary, color: token.colorTextSecondary }}>{details}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!fullPage) return <div className="eu-error-wrap">{card}</div>;
  return (
    <div className="eu-error-page" style={{ background: token.colorBgLayout, color: token.colorText }}>
      <header className="eu-error-brand">
        <span className="eu-error-brand-mark" style={{ background: where.color }}>
          E
        </span>
        <span>
          <b>E-Universe</b>
          <span className="eu-error-brand-sub"> · Unified Information and Records Management System</span>
        </span>
      </header>
      <div className="eu-error-wrap">{card}</div>
    </div>
  );
};

export default ErrorCard;
