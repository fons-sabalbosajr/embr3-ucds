import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import {
  decideAccessRequest,
  describeApiError,
  fetchAccessRequests,
  revokeAccessRequest,
} from "../api/ermsService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Document access requests.
//
// For the Records Unit: the inbox. Everyone who asked to see a scanned
// document, with the record, the reason and when — approve for a period, or
// decline with a note; take an approval back early. For anyone else: their
// own requests and where each one stands.
//
// The server decides who may decide (services/accessRequestService.js); this
// screen only hides the buttons from people the API would refuse.
// ---------------------------------------------------------------------------

const STATUS_TAG = {
  pending: ["gold", "pending"],
  approved: ["green", "approved"],
  denied: ["red", "declined"],
  revoked: ["default", "revoked"],
};

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
const hoursLabel = (h) => (h < 24 ? `${h} hours` : h === 24 ? "1 day" : `${h / 24} days`);

const AccessRequests = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [deciding, setDeciding] = useState(null); // { request, decision }
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "access-requests"],
    queryFn: () => fetchAccessRequests({ limit: 300 }),
    refetchInterval: 30000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["erms", "access-requests"] });

  const decide = useMutation({
    mutationFn: decideAccessRequest,
    onSuccess: (request) => {
      message.success(
        request.status === "approved"
          ? `Approved for ${request.requestedBy?.name || request.requestedBy?.username} until ${when(request.expiresAt)}.`
          : "Declined."
      );
      setDeciding(null);
      setNote("");
      refresh();
    },
    onError: (e) => message.error(describeApiError(e, "The decision was not saved.")),
  });

  const revoke = useMutation({
    mutationFn: revokeAccessRequest,
    onSuccess: () => {
      message.success("Access taken back.");
      refresh();
    },
    onError: (e) => message.error(describeApiError(e, "Could not revoke.")),
  });

  const requests = data?.requests || [];
  const canDecide = data?.canDecide === true;
  const durations = data?.durations || [4, 8, 24, 72, 168];
  const defaultDuration = data?.defaultDuration || 8;

  const byTab = {
    pending: requests.filter((r) => r.status === "pending"),
    approved: requests.filter((r) => r.status === "approved" && !r.expired),
    history: requests.filter((r) => r.status !== "pending" && !(r.status === "approved" && !r.expired)),
  };

  const open = (request, decision) => {
    setDeciding({ request, decision });
    setNote("");
    setDuration(defaultDuration);
  };

  const columns = [
    {
      title: "Record",
      dataIndex: "serialNo",
      render: (serialNo, r) => (
        <Space direction="vertical" size={0}>
          <Link to={`/universe/erms/records/${encodeURIComponent(serialNo)}`}>{serialNo}</Link>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.proponentName || ""}
            {r.fileName ? ` · ${r.fileName}` : ""}
          </Text>
        </Space>
      ),
    },
    canDecide && {
      title: "Requested by",
      dataIndex: ["requestedBy", "name"],
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.requestedBy?.name || r.requestedBy?.username}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.requestedBy?.division || ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Reason",
      dataIndex: "reason",
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    { title: "Requested", dataIndex: "requestedAt", render: when, width: 170 },
    {
      title: "Status",
      dataIndex: "status",
      width: 220,
      render: (status, r) => {
        const [color, label] = STATUS_TAG[status] || ["default", status];
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color}>{r.expired ? "expired" : label}</Tag>
            {status === "approved" && r.expiresAt && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <ClockCircleOutlined /> until {when(r.expiresAt)}
              </Text>
            )}
            {(status === "denied" || status === "revoked") && r.decidedBy && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                by {r.decidedBy.name || r.decidedBy.username} · {when(r.decidedAt)}
                {r.decisionNote ? ` — “${r.decisionNote}”` : ""}
              </Text>
            )}
          </Space>
        );
      },
    },
    canDecide && {
      title: "",
      key: "actions",
      width: 200,
      render: (_, r) => {
        if (r.status === "pending") {
          return (
            <Space>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => open(r, "approved")}>
                Approve
              </Button>
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => open(r, "denied")}>
                Decline
              </Button>
            </Space>
          );
        }
        if (r.status === "approved" && !r.expired) {
          return (
            <Tooltip title="Close this person's access to the document now">
              <Button size="small" icon={<StopOutlined />} loading={revoke.isPending} onClick={() => revoke.mutate({ id: r.id })}>
                Revoke
              </Button>
            </Tooltip>
          );
        }
        return null;
      },
    },
  ].filter(Boolean);

  const table = (rows) => (
    <Table
      rowKey="id"
      size="small"
      loading={isLoading}
      columns={columns}
      dataSource={rows}
      pagination={{ defaultPageSize: 20, hideOnSinglePage: true }}
      locale={{ emptyText: canDecide ? "Nothing waiting." : "You have not asked to see any document." }}
    />
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card size="small" title={canDecide ? "Document access requests" : "My document requests"}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {canDecide
            ? "Scanned documents are viewed in the application by the Records Unit. Anyone else asks here, record by record; an approval opens that document to that person for the time you choose, then closes on its own."
            : "Scanned documents are opened by the Records Unit. When you need to see one, send a request from the record; it is listed here with the Records Unit's decision."}
        </Paragraph>
      </Card>

      {error && <Alert type="error" showIcon message={describeApiError(error, "Could not load requests.")} />}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "pending",
            label: (
              <Badge count={byTab.pending.length} size="small" offset={[10, 0]}>
                Pending
              </Badge>
            ),
            children: table(byTab.pending),
          },
          { key: "approved", label: `Open (${byTab.approved.length})`, children: table(byTab.approved) },
          { key: "history", label: `History (${byTab.history.length})`, children: table(byTab.history) },
        ]}
      />

      <Modal
        open={Boolean(deciding)}
        title={deciding?.decision === "approved" ? "Approve viewing" : "Decline the request"}
        okText={deciding?.decision === "approved" ? "Approve" : "Decline"}
        okButtonProps={{ danger: deciding?.decision === "denied", loading: decide.isPending }}
        onCancel={() => setDeciding(null)}
        onOk={() =>
          decide.mutate({
            id: deciding.request.id,
            decision: deciding.decision,
            durationHours: deciding.decision === "approved" ? duration : undefined,
            note,
          })
        }
        destroyOnHidden
      >
        {deciding && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Text strong>{deciding.request.requestedBy?.name || deciding.request.requestedBy?.username}</Text>{" "}
              asked to view <Text code>{deciding.request.serialNo}</Text>
              {deciding.request.fileName ? ` (${deciding.request.fileName})` : ""}.
            </div>
            {deciding.request.reason && (
              <Text type="secondary">“{deciding.request.reason}”</Text>
            )}
            {deciding.decision === "approved" && (
              <Space>
                <Text>Open the document for</Text>
                <Select
                  value={duration}
                  onChange={setDuration}
                  style={{ width: 140 }}
                  options={durations.map((h) => ({ value: h, label: hoursLabel(h) }))}
                />
              </Space>
            )}
            <Input.TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder={deciding.decision === "approved" ? "Note (optional)" : "Why it is declined (the requester sees this)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Space>
        )}
      </Modal>
    </Space>
  );
};

export default AccessRequests;
