import { useEffect, useMemo, useState } from "react";
import { Alert, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { ShareAltOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { describeApiError, fetchAccessRequests, fetchSharePeople, shareDocument } from "../api/ermsService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Share a record's document with a person — the Records Unit's side of the
// document-request process. The result is the same approval a request ends
// in: it appears in the inbox, runs on the same clock, and can be revoked
// there. A pending request from the chosen person is answered by the share.
// ---------------------------------------------------------------------------

const DURATIONS = [
  [4, "4 hours"],
  [8, "8 hours (a working day)"],
  [24, "1 day"],
  [72, "3 days"],
  [168, "1 week"],
];

const ShareDocumentModal = ({ open, serialNo, fileName, onClose }) => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      form.resetFields();
      setSearch("");
    }
  }, [open, form]);

  const { data: people = [], isFetching } = useQuery({
    queryKey: ["erms", "share-people", search],
    queryFn: () => fetchSharePeople(search),
    enabled: open,
    staleTime: 60 * 1000,
  });

  // Who already holds this document, so the same person is not shared twice.
  const { data: inbox } = useQuery({
    queryKey: ["erms", "access-requests", "approved", serialNo],
    queryFn: () => fetchAccessRequests({ status: "approved", limit: 200 }),
    enabled: open,
  });
  const holders = useMemo(
    () => (inbox?.requests || []).filter((r) => r.serialNo === serialNo && !r.expired),
    [inbox, serialNo]
  );

  const share = useMutation({
    mutationFn: shareDocument,
    onSuccess: ({ request, created }) => {
      const person = request.requestedBy?.name || request.requestedBy?.username;
      message.success(created ? `Shared with ${person} until ${new Date(request.expiresAt).toLocaleString()}.` : `${person} already holds this document.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "access-requests"] });
      onClose(request);
    },
    onError: (e) => message.error(describeApiError(e, "The document could not be shared.")),
  });

  const submit = async () => {
    const v = await form.validateFields();
    share.mutate({ serialNo, userId: v.userId, durationHours: v.durationHours, note: v.note || undefined });
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ShareAltOutlined />
          <span>Share {serialNo}</span>
        </Space>
      }
      onCancel={() => onClose(null)}
      onOk={submit}
      okText="Share"
      confirmLoading={share.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={fileName || "Document"}
        description="The person will be able to view this document in the application for the period chosen — the same approval a document request ends in. It can be taken back from Document requests."
      />
      {holders.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Already holds it: </Text>
          {holders.map((h) => (
            <Tag key={h.id}>{h.requestedBy?.name || h.requestedBy?.username}</Tag>
          ))}
        </div>
      )}
      <Form form={form} layout="vertical" preserve={false} initialValues={{ durationHours: 8 }}>
        <Form.Item name="userId" label="Share with" rules={[{ required: true, message: "Choose a person." }]}>
          <Select
            showSearch
            filterOption={false}
            loading={isFetching}
            onSearch={setSearch}
            placeholder="Search by name, username or division"
            notFoundContent={isFetching ? "Looking…" : "No one matches"}
            options={people.map((p) => ({
              value: p.userId,
              label: (
                <Space size={6}>
                  <span>{p.name || p.username}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {p.username}
                    {p.division ? ` · ${p.division}` : ""}
                    {p.roleLabel ? ` · ${p.roleLabel}` : ""}
                  </Text>
                </Space>
              ),
            }))}
          />
        </Form.Item>
        <Form.Item name="durationHours" label="For how long">
          <Select placeholder="Select how long" options={DURATIONS.map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="note" label="Note (optional)">
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="Why it is being shared, for the record" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ShareDocumentModal;
