import { Button, Space, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { unitTheme } from "../units/unitTheme";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The parts one ERMS document's page is built from — a Records record, a
// Legal case document, a Laboratory result alike: the header row naming it,
// and its values laid out like the form that made them, as labelled text on
// a grid — a label above each value, the value wrapping onto as many lines
// as it needs (a long file name or project title is read whole, not cut off
// in a box).
// ---------------------------------------------------------------------------

const text = (v) => (v === null || v === undefined ? "" : String(v));

/** A label and its value as text, wrapped — read, not edited. */
export const Field = ({ label, value, span, mono, warning, path }) => {
  const { token } = antdTheme.useToken();
  const shown = text(value).trim();
  return (
    <div
      style={{
        ...(span ? { gridColumn: "1 / -1" } : null),
        padding: "8px 0 10px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 3, color: token.colorTextSecondary }}>{label}</div>
      {warning ? (
        <Tooltip title="Could not be interpreted during migration. This is the original value.">
          <Tag color="warning" style={{ whiteSpace: "normal", fontFamily: "monospace", marginInlineEnd: 0 }}>{text(warning)}</Tag>
        </Tooltip>
      ) : (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: shown ? token.colorText : token.colorTextQuaternary,
            whiteSpace: "pre-wrap",
            // A share path has no spaces to break at; let it break anywhere.
            overflowWrap: path ? "anywhere" : "break-word",
            ...(mono ? { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 13 } : null),
          }}
        >
          {shown || "—"}
        </div>
      )}
    </div>
  );
};

export const Grid = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 24px" }}>{children}</div>
);

/** A heading over a group of fields, as the form's tabs group them. */
export const FieldGroup = ({ title, children }) => {
  const { token } = antdTheme.useToken();
  return (
    <div>
      {title && <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: token.colorTextTertiary, margin: "4px 0 2px" }}>{title}</div>}
      <Grid>{children}</Grid>
    </div>
  );
};

/**
 * The row above a document's tabs: back to the library (on its own page),
 * the unit's icon, what the document is known by, its kind, its serial, and
 * the actions on the right.
 */
/** `actionsFirst`: the actions at the left, before the title, instead of at the far right. */
export const DetailHeader = ({ unit, title, typeLabel, typeColor, serialNo, tags, onBack, backLabel, actions, actionsFirst = false }) => {
  const theme = unitTheme(unit);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <Space size={8} wrap>
        {actionsFirst && actions}
        {onBack && (
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            {backLabel || "Document Library"}
          </Button>
        )}
        <span style={{ color: theme.accent, fontSize: 16 }}>{theme.icon}</span>
        <Text strong style={{ fontSize: 16 }}>{title || serialNo}</Text>
        {typeLabel && <Tag color={typeColor || theme.color}>{typeLabel}</Tag>}
        {title && serialNo && title !== serialNo && <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>{serialNo}</Text>}
        {tags}
      </Space>
      {actions && !actionsFirst && <Space size={8}>{actions}</Space>}
    </div>
  );
};
