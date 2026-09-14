import { Card, Skeleton } from "antd";

/**
 * The content area while a screen or its data loads.
 *
 * Shaped like the screens it stands in for — a titled card with a toolbar
 * row and a table body — so nothing jumps when the real thing arrives. Only
 * the content area shows it; the sidebar and header stay where they are.
 */
const ContentLoading = ({ rows = 8, title = true }) => (
  <Card
    size="small"
    style={{ minHeight: 420 }}
    title={title ? <Skeleton.Input active size="small" style={{ width: 220 }} /> : undefined}
    extra={title ? <Skeleton.Button active size="small" style={{ width: 96 }} /> : undefined}
  >
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <Skeleton.Input active size="small" style={{ width: 280 }} />
      <Skeleton.Input active size="small" style={{ width: 160 }} />
      <Skeleton.Button active size="small" />
    </div>
    <Skeleton active title={false} paragraph={{ rows, width: "100%" }} />
  </Card>
);

export default ContentLoading;
