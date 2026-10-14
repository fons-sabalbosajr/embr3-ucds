import { useEffect } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { ExportOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket, initializeSocket } from "../../api/socketService";
import { ROUTES } from "../../config/routes";
import { describeError, fetchDesk } from "./portalService";
import RecordsDesk from "./RecordsDesk";
import "./portal.css";

const { Title, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Portal Requests — the units' side of the E-Universe Document Portal, inside
// the application (ERMS › Records, Legal, Laboratory). Each unit decides the
// requests for its own documents. The public page, where people ask and
// read, is outside it at /e-universe/document-portal.
//
// Live: every change to the room reaches signed-in screens as a ping
// (server/services/notifier.js broadcast), and a new request also arrives as
// a notice on every screen and device of the people who decide.
// ---------------------------------------------------------------------------

export default function PortalDesk() {
  const queryClient = useQueryClient();
  // Shares the desk's query: a refusal here means this account does not decide.
  const { error } = useQuery({ queryKey: ["portal", "desk"], queryFn: fetchDesk, retry: false });

  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal"] });
    socket.on("portal:room", refresh);
    // A requester wrote, or a colleague replied: the badges and an open conversation follow.
    socket.on("portal:chat", refresh);
    return () => {
      socket.off("portal:room", refresh);
      socket.off("portal:chat", refresh);
    };
  }, [queryClient]);

  const refused = error?.response?.status === 403;
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <SafetyCertificateOutlined /> Document Portal requests
          </Title>
          <Paragraph type="secondary" style={{ margin: 0, maxWidth: 760 }}>
            People ask for scanned documents on the public Document Portal — the requests for your unit's documents are here. Approve each for a time and
            for all or some pages; they read it there, and it closes when the time ends. Use Messages to ask the requester a question.
          </Paragraph>
        </div>
        <a href={ROUTES.documentPortal} target="_blank" rel="noopener noreferrer">
          <Button icon={<ExportOutlined />}>Open the public portal</Button>
        </a>
      </div>
      {refused ? (
        <Alert type="info" showIcon message="Document Portal requests are decided by the unit that keeps the document." description="Your account can see the public portal, but not decide on requests." />
      ) : error ? (
        <Alert type="error" showIcon message={describeError(error, "The requests could not be loaded.")} />
      ) : (
        <RecordsDesk />
      )}
    </Space>
  );
}
