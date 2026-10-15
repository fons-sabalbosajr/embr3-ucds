import { Card, Skeleton, Space, Statistic, Typography, theme as antdTheme } from "antd";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// The ERMS dashboards' tiles, shared by the Records, Legal Services and
// Laboratory dashboards. Status colour on an attention tile always comes
// with an icon and a word, never on its own.

/** A count that wants doing something about, with where to do it. */
export const AttentionTile = ({ icon, label, value, tone, to, hint, loading }) => {
  const navigate = useNavigate();
  const { token } = antdTheme.useToken();
  const colors = { warning: token.colorWarning, danger: token.colorError, info: token.colorInfo, ok: token.colorSuccess };
  const color = value > 0 ? colors[tone] : token.colorTextTertiary;
  return (
    <Card
      size="small"
      hoverable={Boolean(to)}
      onClick={to ? () => navigate(to) : undefined}
      styles={{ body: { padding: "12px 14px" } }}
      style={{ height: "100%", borderInlineStart: `3px solid ${color}` }}
    >
      {loading ? (
        <Skeleton active paragraph={false} title={{ width: 120 }} />
      ) : (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          <Space size={6}>
            <span style={{ color }}>{icon}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          </Space>
          <Space align="baseline" size={6}>
            <Text strong style={{ fontSize: 24, lineHeight: 1.1 }}>{fmt(value)}</Text>
            {hint && <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>}
          </Space>
        </Space>
      )}
    </Card>
  );
};

/** A plain count. */
export const StatTile = ({ title, value, suffix, prefix, loading, onClick }) => (
  <Card size="small" hoverable={Boolean(onClick)} onClick={onClick} style={{ height: "100%" }}>
    {loading ? <Skeleton active paragraph={false} /> : <Statistic title={title} value={value ?? 0} formatter={fmt} prefix={prefix} suffix={suffix} />}
  </Card>
);
