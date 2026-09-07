import { useState } from "react";
import {
  Alert,
  App as AntdApp,
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
import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTracking, describeApiError } from "../api/ermsService";

// Custody history. Append-only — there is no edit or delete, here or in the
// API. A mistake is corrected by recording a correction.

const ACTION_COLOR = {
  received: "green",
  returned: "green",
  retrieved: "green",
  archived: "blue",
  released: "orange",
  forwarded: "orange",
  borrowed: "volcano",
  corrected: "default",
};

const TrackingPanel = ({ serialNo, tracking = [], custody, actions = [], canWrite }) => {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

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
      title="Tracking"
      size="small"
      extra={
        canWrite && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Record a movement
          </Button>
        )
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

      {tracking.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No movements recorded for this record yet"
        />
      ) : (
        <Timeline
          items={tracking.map((t) => ({
            color: ACTION_COLOR[t.action] || "gray",
            children: (
              <Space direction="vertical" size={0}>
                <Space size={6}>
                  <Tag color={ACTION_COLOR[t.action]}>{t.actionLabel}</Tag>
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
                  {new Date(t.createdAt).toLocaleString()} · {t.createdBy}
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
            <Select options={actions.map((a) => ({ value: a.code, label: a.label }))} />
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
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default TrackingPanel;
