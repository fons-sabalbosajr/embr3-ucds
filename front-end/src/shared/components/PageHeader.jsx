import { Card, Space, Typography, theme as antdTheme } from "antd";

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// The band at the top of a page — every ERMS unit's and the Universe Central
// DB's alike: an icon in the subsystem's accent, the page's name, a line on
// what it holds, and the page's actions on the right. One design across the
// application; only the accent and the icon tell the subsystems apart.
// ---------------------------------------------------------------------------

// `compact`: a tighter band for data-dense pages (the Universe Central DB),
// where the table should start as high on the screen as it can.
const PageHeader = ({ accent, icon, title, description, actions, extra, compact = false }) => {
  const { token } = antdTheme.useToken();
  return (
    <Card size="small" styles={{ body: { padding: compact ? "8px 14px" : "16px 20px" } }} style={{ background: token.colorFillQuaternary, borderTop: `3px solid ${accent}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 8 : 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <Title level={compact ? 5 : 4} style={{ margin: 0 }}>
            {icon && <span style={{ color: accent, marginRight: 8 }}>{icon}</span>}
            {title}
          </Title>
          {description && <Text type="secondary" style={compact ? { fontSize: 12.5 } : undefined}>{description}</Text>}
          {extra}
        </div>
        {actions && <Space wrap>{actions}</Space>}
      </div>
    </Card>
  );
};

export default PageHeader;
