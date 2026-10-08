import { useEffect, useState } from "react";
import { Badge, Button, Card, Descriptions, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, MailOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message as toast } from "../../../shared/feedback";
import { deleteMessage, describeApiError, fetchMessagePeople, fetchMessages, markMessage, sendMessage } from "../api/ermsService";

const { Text, Title, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Messages — the desktop system's Action Center.
//
// A short note between the people who work in ERMS, with a purpose (a
// modification, a clarification, a request), a subject and the details,
// numbered ERMSAC-<year><sequence> as there. Opening a message marks it
// read; deleting it removes it from your own view only.
// ---------------------------------------------------------------------------

const PURPOSE_COLOR = { Modification: "orange", Clarification: "blue", Request: "purple", Information: "default", Reminder: "gold" };
const when = (d) => dayjs(d).format("D MMM YYYY, h:mm A");
const who = (p) => (p ? `${p.name}${p.unitLabel ? ` · ${p.unitLabel}` : ""}` : "—");

const Compose = ({ open, onClose, replyTo }) => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const { data: people = [], isFetching } = useQuery({ queryKey: ["erms", "message-people", q], queryFn: () => fetchMessagePeople(q), enabled: open, staleTime: 60 * 1000 });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (replyTo) form.setFieldsValue({ to: replyTo.from.username, purpose: "Clarification", subject: /^re:/i.test(replyTo.subject) ? replyTo.subject : `Re: ${replyTo.subject}` });
  }, [open, replyTo, form]);

  const send = useMutation({
    mutationFn: sendMessage,
    onSuccess: (m) => {
      toast.success(`Sent ${m.msgId} to ${m.to.name}.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "messages"] });
      onClose();
    },
    onError: (e) => toast.error(describeApiError(e, "The message could not be sent.")),
  });

  const options = [
    ...(replyTo && !people.some((p) => p.username === replyTo.from.username) ? [{ value: replyTo.from.username, label: who(replyTo.from) }] : []),
    ...people.map((p) => ({ value: p.username, label: who(p) })),
  ];

  return (
    <Modal open={open} title="New message" okText="Send" confirmLoading={send.isPending} onCancel={onClose} onOk={async () => send.mutate(await form.validateFields())} destroyOnHidden width={620}>
      <Form form={form} layout="vertical" initialValues={{ purpose: "Request" }}>
        <Form.Item name="to" label="To" rules={[{ required: true, message: "Choose who it is for." }]}>
          <Select showSearch filterOption={false} onSearch={setQ} loading={isFetching} options={options} placeholder="Search by name" notFoundContent={isFetching ? "Searching…" : "No one by that name in ERMS"} />
        </Form.Item>
        <Form.Item name="purpose" label="Purpose" rules={[{ required: true }]}>
          <Select placeholder="Select the purpose" options={Object.keys(PURPOSE_COLOR).map((p) => ({ value: p, label: p }))} />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, message: "Give it a subject." }]}>
          <Input placeholder="One line on what it's about" maxLength={200} />
        </Form.Item>
        <Form.Item name="details" label="Details">
          <Input.TextArea placeholder="Details, references, what you need" rows={5} maxLength={4000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const Messages = () => {
  const queryClient = useQueryClient();
  const [box, setBox] = useState("inbox");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["erms", "messages", box, page],
    queryFn: () => fetchMessages({ box, page, pageSize: 25 }),
  });

  const mark = useMutation({
    mutationFn: markMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["erms", "messages"] }),
  });
  const remove = useMutation({
    mutationFn: deleteMessage,
    onSuccess: () => {
      toast.success("Message deleted.");
      setOpen(null);
      queryClient.invalidateQueries({ queryKey: ["erms", "messages"] });
    },
    onError: (e) => toast.error(describeApiError(e, "Could not delete the message.")),
  });

  const openMessage = (m) => {
    setOpen(m);
    if (m.unread) mark.mutate({ id: m.id, read: true });
  };

  const columns = [
    {
      title: box === "inbox" ? "From" : "To",
      key: "party",
      width: 260,
      render: (_, m) => (
        <Space size={6}>
          {m.unread && <Badge status="processing" />}
          <Text strong={m.unread}>{who(box === "inbox" ? m.from : m.to)}</Text>
        </Space>
      ),
    },
    { title: "Purpose", dataIndex: "purpose", key: "purpose", width: 130, render: (p) => <Tag color={PURPOSE_COLOR[p]}>{p}</Tag> },
    { title: "Subject", dataIndex: "subject", key: "subject", ellipsis: true, render: (s, m) => <Text strong={m.unread}>{s}</Text> },
    { title: "Sent", dataIndex: "sentAt", key: "sentAt", width: 190, render: when },
    { title: "No.", dataIndex: "msgId", key: "msgId", width: 170, render: (v) => <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</Text> },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}><MailOutlined style={{ marginRight: 8 }} />Messages</Title>
            <Text type="secondary">Notes between the people who work in ERMS — a modification, a clarification, a request.</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
            <Button type="primary" icon={<EditOutlined />} onClick={() => { setReplyTo(null); setComposing(true); }}>New message</Button>
          </Space>
        </div>
      </Card>

      <Card
        size="small"
        title={
          <Segmented
            value={box}
            onChange={(v) => { setBox(v); setPage(1); }}
            options={[
              { label: <Space size={4}>Inbox{data?.unread ? <Badge count={data.unread} size="small" /> : null}</Space>, value: "inbox" },
              { label: "Sent", value: "sent" },
            ]}
          />
        }
      >
        <Table
          size="small"
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items || []}
          onRow={(m) => ({ onClick: () => openMessage(m), style: { cursor: "pointer" } })}
          pagination={{ current: page, pageSize: 25, total: data?.total || 0, onChange: setPage, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={box === "inbox" ? "No messages" : "Nothing sent"} /> }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Modal
        open={Boolean(open)}
        title={open?.subject}
        onCancel={() => setOpen(null)}
        width={680}
        footer={
          open && (
            <Space>
              <Popconfirm title="Delete this message from your view?" description="The other person keeps their copy." onConfirm={() => remove.mutate(open.id)}>
                <Button danger icon={<DeleteOutlined />} loading={remove.isPending}>Delete</Button>
              </Popconfirm>
              {open.box === "inbox" && (
                <Button onClick={() => { mark.mutate({ id: open.id, read: false }); setOpen(null); }}>Mark unread</Button>
              )}
              {open.box === "inbox" && (
                <Button type="primary" onClick={() => { setReplyTo(open); setOpen(null); setComposing(true); }}>Reply</Button>
              )}
            </Space>
          )
        }
      >
        {open && (
          <>
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="From">{who(open.from)}</Descriptions.Item>
              <Descriptions.Item label="To">{who(open.to)}</Descriptions.Item>
              <Descriptions.Item label="Purpose"><Tag color={PURPOSE_COLOR[open.purpose]}>{open.purpose}</Tag></Descriptions.Item>
              <Descriptions.Item label="Sent">{when(open.sentAt)}</Descriptions.Item>
              <Descriptions.Item label="No."><Text style={{ fontFamily: "monospace" }}>{open.msgId}</Text></Descriptions.Item>
            </Descriptions>
            <Paragraph style={{ whiteSpace: "pre-wrap" }}>{open.details || <Text type="secondary">No details.</Text>}</Paragraph>
          </>
        )}
      </Modal>

      <Compose open={composing} replyTo={replyTo} onClose={() => setComposing(false)} />
    </Space>
  );
};

export default Messages;
