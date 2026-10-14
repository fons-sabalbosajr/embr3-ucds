import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { DesktopOutlined, PlusOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTracking, describeApiError } from "../api/ermsService";
import { message } from "../../../shared/feedback";

// Custody history. Append-only — there is no edit or delete, here or in the
// API. A mistake is corrected by recording a correction.
//
// Three sources on one timeline: the movements recorded here, how the
// record was shared through the Document Portal (who asked, who approved or
// declined it and for how long, access changed or withdrawn, each time the
// requester opened it), and the desktop system's own log for the record
// (who viewed, modified, requested or uploaded its file, from its SQL
// tables). The desktop entries are marked as such and cannot be added to —
// that system is closed.

const ACTION_COLOR = {
  received: "green",
  returned: "green",
  retrieved: "green",
  archived: "blue",
  released: "orange",
  forwarded: "orange",
  borrowed: "volcano",
  corrected: "default",
  "legacy-uploaded": "blue",
  "legacy-modified": "gold",
  "legacy-replaced": "gold",
  "legacy-attached": "blue",
  "legacy-requested": "purple",
  "legacy-viewed": "default",
  "legacy-other": "default",
  "portal-request": "purple",
  "portal-decision": "purple",
  "portal-adjust": "purple",
  "portal-revoke": "orange",
  "portal-ended": "default",
  "portal-leave": "default",
  "portal-view": "purple",
  "portal-download": "purple",
};

const SOURCE_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "custody", label: "Movements recorded here" },
  { value: "portal", label: "Sharing (Document Portal)" },
  { value: "legacy", label: "Desktop system log" },
];

const TrackingPanel = ({ serialNo, tracking = [], custody, actions = [], canWrite }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("all");
  const [form] = Form.useForm();

  const legacyCount = tracking.filter((t) => t.source === "legacy").length;
  const sharedCount = tracking.filter((t) => t.source === "portal").length;
  const shown = tracking.filter((t) => source === "all" || (t.source || "custody") === source);

  const mutation = useMutation({
    mutationFn: addTracking,
    onSuccess: (entry) => {
      message.success(`${entry.actionLabel} recorded.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "record", serialNo] });
      queryClient.invalidateQueries({ queryKey: ["erms", "overdue"] });
      form.resetFields();
      setOpen(false);
    },
    onError: (e) => message.error(describeApiError(e, "Could not record the movement.")),
  });

  const submit = async () => {
    const v = await form.validateFields();
    mutation.mutate({
      serialNo,
      action: v.action,
      fromParty: v.fromParty || null,
      toParty: v.toParty || null,
      purpose: v.purpose || null,
      remarks: v.remarks || null,
      dueDate: v.dueDate ? v.dueDate.format("YYYY-MM-DD") : null,
    });
  };

  return (
    <Card
      title={
        <Space size={8} wrap>
          <span>Tracking</span>
          {sharedCount > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: "normal" }}>
              <ShareAltOutlined /> {sharedCount} sharing
            </Typography.Text>
          )}
          {legacyCount > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: "normal" }}>
              <DesktopOutlined /> {legacyCount} from the desktop system
            </Typography.Text>
          )}
        </Space>
      }
      size="small"
      extra={
        <Space size={8} wrap>
          {(legacyCount > 0 || sharedCount > 0) && (
            <Select placeholder="Source" size="small" value={source} onChange={setSource} options={SOURCE_OPTIONS} style={{ width: 210 }} />
          )}
          {canWrite && (
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              Record a movement
            </Button>
          )}
        </Space>
      }
    >
      {custody && (
        <Alert
          type={custody.released ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            custody.released
              ? `Released to ${custody.heldBy || "an external party"}`
              : `Held by ${custody.heldBy}`
          }
          description={`Since ${new Date(custody.since).toLocaleString()}`}
        />
      )}

      {shown.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={source === "legacy" ? "The desktop system has no log for this record" : "No movements recorded for this record yet"}
        />
      ) : (
        <Timeline
          items={shown.map((t, i) => ({
            key: t._id || `${t.source}-${i}`,
            color: ACTION_COLOR[t.action] || "gray",
            dot: t.source === "legacy" ? <DesktopOutlined style={{ fontSize: 12 }} /> : t.source === "portal" ? <ShareAltOutlined style={{ fontSize: 12 }} /> : undefined,
            children: (
              <Space direction="vertical" size={0}>
                <Space size={6} wrap>
                  <Tag color={ACTION_COLOR[t.action]}>{t.actionLabel}</Tag>
                  {t.source === "legacy" && (
                    <Tag style={{ marginInlineEnd: 0 }} icon={<DesktopOutlined />}>
                      desktop system
                    </Tag>
                  )}
                  {t.toParty && <Typography.Text strong>{t.toParty}</Typography.Text>}
                </Space>
                {t.purpose && <Typography.Text>{t.purpose}</Typography.Text>}
                {t.remarks && <Typography.Text type="secondary">{t.remarks}</Typography.Text>}
                {t.dueDate && (
                  <Typography.Text type="warning" style={{ fontSize: 12 }}>
                    Due back {new Date(t.dueDate).toLocaleDateString()}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : t.createdAtRaw || "date unknown"} · {t.createdBy}
                  {t.loginAs ? ` (${t.loginAs})` : ""}
                  {t.ipAddress ? ` · ${t.ipAddress}` : ""}
                </Typography.Text>
              </Space>
            ),
          }))}
        />
      )}

      <Modal
        title={`Record a movement for ${serialNo}`}
        open={open}
        onCancel={() => {
          form.resetFields();
          setOpen(false);
        }}
        onOk={submit}
        okText="Record"
        confirmLoading={mutation.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Movements cannot be edited or removed once recorded. To correct one, add
          a correction note.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="action" label="Action" rules={[{ required: true }]}>
            <Select placeholder="Select the action" options={actions.map((a) => ({ value: a.code, label: a.label }))} />
          </Form.Item>
          <Form.Item name="fromParty" label="From">
            <Input placeholder="Section or person releasing the record" />
          </Form.Item>
          <Form.Item name="toParty" label="To">
            <Input placeholder="Section or person receiving the record" />
          </Form.Item>
          <Form.Item name="purpose" label="Purpose">
            <Input placeholder="Why the record is moving" />
          </Form.Item>
          <Form.Item
            name="dueDate"
            label="Due back"
            extra="Only for a loan. An overdue loan appears in the tracking report."
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea placeholder="Optional note for the trail" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default TrackingPanel;
