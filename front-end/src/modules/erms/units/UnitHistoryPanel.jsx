import { Alert, Card, Empty, Skeleton, Space, Tag, Timeline, Typography } from "antd";
import { DesktopOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDocumentHistory } from "../api/ermsService";
import { formatValue } from "./unitTheme";

// A Legal or Laboratory document's history — what a record's Tracking panel
// is to the Records Unit, read-only: its filing (in the desktop ERMS or
// here), then each edit with what it changed, each scan filed or replaced,
// each view, each attachment filed against it, and how it was shared
// through the Document Portal (asked for, decided, changed, withdrawn,
// ended, opened by the requester) — from the audit trail.

const ACTIONS = {
  "legacy-filed": { label: "Filed in the desktop ERMS", color: "blue" },
  filed: { label: "Filed", color: "blue" },
  "document-upload": { label: "Scan filed", color: "blue" },
  "document-update": { label: "Details changed", color: "gold" },
  "document-delete": { label: "Old scan removed", color: "orange" },
  "document-view": { label: "Viewed", color: "default" },
  "document-read": { label: "Could not open", color: "red" },
  "attachment-filed": { label: "Attachment filed", color: "blue" },
  // Sharing, through the Document Portal.
  "portal-request": { label: "Requested in the Document Portal", color: "purple" },
  "portal-decision": { label: "Sharing decided", color: "purple" },
  "portal-adjust": { label: "Shared access changed", color: "purple" },
  "portal-revoke": { label: "Sharing withdrawn", color: "orange" },
  "portal-ended": { label: "Sharing ended", color: "default" },
  "portal-leave": { label: "Requester left", color: "default" },
  "portal-view": { label: "Opened by the requester", color: "purple" },
  "portal-download": { label: "Downloaded by the requester", color: "purple" },
};

const fieldLabel = (fields, key) => (key === "province" ? "Province" : fields.find((f) => f.key === key)?.label || key);

const UnitHistoryPanel = ({ unit, serialNo, fields = [] }) => {
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["erms", "unit", unit, "document", serialNo, "history"],
    queryFn: () => fetchUnitDocumentHistory(unit, serialNo),
  });

  const body = () => {
    if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
    if (error) return <Alert type="error" showIcon message={describeApiError(error, "Could not load the history.")} />;
    if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded for this document yet" />;
    return (
      <Timeline
        items={events.map((e) => {
          const known = ACTIONS[e.action] || { label: e.label || "Activity", color: "default" };
          const color = e.success ? known.color : "red";
          const changes = Object.entries(e.changes || {});
          return {
            key: e.id,
            color: color === "default" ? "gray" : color,
            dot: e.action === "legacy-filed" ? <DesktopOutlined style={{ fontSize: 12 }} /> : e.shared ? <ShareAltOutlined style={{ fontSize: 12 }} /> : undefined,
            children: (
              <Space direction="vertical" size={0}>
                <Space size={6} wrap>
                  <Tag color={color}>{known.label}</Tag>
                  {e.fileName && <Typography.Text style={{ overflowWrap: "anywhere" }}>{e.fileName}</Typography.Text>}
                </Space>
                {changes.map(([key, c]) => {
                  const field = fields.find((f) => f.key === key);
                  return (
                    <Typography.Text key={key} style={{ fontSize: 13 }}>
                      {fieldLabel(fields, key)}: <Typography.Text delete type="secondary">{formatValue(field, c.from)}</Typography.Text> → {formatValue(field, c.to)}
                    </Typography.Text>
                  );
                })}
                {e.detail && <Typography.Text type="secondary">{e.detail}</Typography.Text>}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {e.at ? new Date(e.at).toLocaleString() : "date unknown"} · {e.who || "unknown"}
                  {e.ip ? ` · ${e.ip}` : ""}
                </Typography.Text>
              </Space>
            ),
          };
        })}
      />
    );
  };

  return (
    <Card size="small" title="History">
      {body()}
    </Card>
  );
};

export default UnitHistoryPanel;
