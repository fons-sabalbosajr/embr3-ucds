import { useEffect } from "react";
import { Badge, Card, Col, Progress, Row, Space, Statistic, Typography, theme as antdTheme } from "antd";
import { RightOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket, initializeSocket } from "../../api/socketService";
import { fetchDesk } from "./portalService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The public Document Portal, as a unit sees it from its dashboard — Records,
// Legal Services or Laboratory: who is in the room, what waits for a
// decision, and the day's requests and openings — live, with the way into
// Portal Requests. With `source`, only that unit's requests (a Developer,
// who decides for all three, sees each unit's on that unit's dashboard).
// Shown only to the people who decide (the desk refuses everyone else, and
// then this is not drawn at all).
// ---------------------------------------------------------------------------

export default function PortalSummaryCard({ source, accent }) {
  const { token } = antdTheme.useToken();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal", "desk", source || "all"],
    queryFn: () => fetchDesk(source ? { source } : {}),
    refetchInterval: 30000,
    retry: false,
  });

  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal"] });
    socket.on("portal:room", refresh);
    return () => socket.off("portal:room", refresh);
  }, [queryClient]);

  if (isError) return null;
  const pending = data?.pending?.length || 0;
  const viewing = data?.approved?.length || 0;
  const waiting = data?.waiting?.length || 0;
  const capacity = data?.capacity || 50;
  const seated = pending + viewing;

  return (
    <Card
      size="small"
      loading={isLoading}
      title={
        <Space wrap size={[8, 0]}>
          <SafetyCertificateOutlined style={{ color: accent || token.colorPrimary }} />
          Document Portal
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, whiteSpace: "normal" }}>
            public requests for {source && source !== "records" ? "this unit's" : "scanned"} documents
          </Text>
        </Space>
      }
      extra={
        <Link to="/universe/erms/portal-requests">
          <Badge count={pending} size="small" offset={[6, -2]}>
            <span>
              Portal Requests <RightOutlined style={{ fontSize: 10 }} />
            </span>
          </Badge>
        </Link>
      }
    >
      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            In the room
          </Text>
          <div style={{ fontSize: token.fontSizeHeading4, fontWeight: 600 }}>
            {seated}
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
              {" "}
              / {capacity}
            </Text>
          </div>
          <Progress percent={Math.round((seated / capacity) * 100)} showInfo={false} size="small" status={seated >= capacity ? "exception" : "normal"} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Awaiting decision" value={pending} valueStyle={{ color: pending ? token.colorWarning : undefined }} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Viewing now" value={viewing} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Waiting line" value={waiting} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Requests today" value={data?.today?.requested || 0} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Approved today" value={data?.today?.approved || 0} />
        </Col>
        <Col xs={12} md={3}>
          <Statistic title="Opened today" value={data?.today?.opened || 0} />
        </Col>
      </Row>
    </Card>
  );
}
