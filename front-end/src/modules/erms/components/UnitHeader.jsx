import { Card, Space, Typography, theme as antdTheme } from "antd";
import { unitTheme } from "../units/unitTheme";

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// The band at the top of every ERMS page — Records, Legal Services and
// Laboratory alike: the unit's icon and accent, the page's name, a line on
// what it holds, and the page's actions on the right. The three units share
// one design; only the accent colour and icon tell them apart.
// ---------------------------------------------------------------------------

const UnitHeader = ({ unit, title, description, actions }) => {
  const { token } = antdTheme.useToken();
  const theme = unitTheme(unit);
  return (
    <Card
      size="small"
      styles={{ body: { padding: "16px 20px" } }}
      style={{ background: token.colorFillQuaternary, borderTop: `3px solid ${theme.accent}` }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0 }}>
            <span style={{ color: theme.accent, marginRight: 8 }}>{theme.icon}</span>
            {title || theme.label}
          </Title>
          <Text type="secondary">{description ?? theme.description}</Text>
        </div>
        {actions && <Space wrap>{actions}</Space>}
      </div>
    </Card>
  );
};

export default UnitHeader;
