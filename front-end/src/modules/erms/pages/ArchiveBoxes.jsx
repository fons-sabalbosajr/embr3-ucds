import { useState } from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { InboxOutlined, PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PROVINCE_LABEL,
  createBox,
  describeApiError,
  fetchBoxContents,
  fetchBoxes,
  fetchDisposalDue,
  fetchFilterOptions,
  updateBox,
} from "../api/ermsService";

const STATUS_COLOR = {
  open: "green",
  sealed: "blue",
  "due-for-disposal": "orange",
  disposed: "default",
};

const ArchiveBoxes = () => {
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form] = Form.useForm();

  const { data: options } = useQuery({
    queryKey: ["erms", "filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60 * 1000,
  });
  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ["erms", "boxes"],
    queryFn: () => fetchBoxes(),
  });
  const { data: due = [] } = useQuery({
    queryKey: ["erms", "disposal-due"],
    queryFn: fetchDisposalDue,
  });
  const { data: contents = [], isFetching: loadingContents } = useQuery({
    queryKey: ["erms", "box", viewing],
    queryFn: () => fetchBoxContents(viewing),
    enabled: Boolean(viewing),
  });

  const canWrite = Boolean(options?.writableProvinces?.length ?? true);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["erms"] });
  const onError = (fallback) => (e) => message.error(describeApiError(e, fallback));

  const createMutation = useMutation({
    mutationFn: createBox,
    onSuccess: (box) => {
      message.success(`Created box ${box.code}.`);
      setCreating(false);
      form.resetFields();
      invalidate();
    },
    onError: onError("Could not create the box."),
  });

  const updateMutation = useMutation({
    mutationFn: updateBox,
    onSuccess: (box) => {
      message.success(`Box ${box.code} is now ${box.status}.`);
      invalidate();
    },
    onError: onError("Could not update the box."),
  });

  const seal = (box) =>
    modal.confirm({
      title: `Seal box ${box.code}?`,
      content: box.retentionYears
        ? `No further records can be filed into it. Its retention period of ${box.retentionYears} years starts today.`
        : "No further records can be filed into it. No retention period is set, so no disposal date will be calculated.",
      okText: "Seal box",
      onOk: () => updateMutation.mutateAsync({ code: box.code, status: "sealed" }),
    });

  // Disposal is recorded, never performed. The authority that approved it is
  // required, and the records stay in the database afterwards.
  const dispose = (box) => {
    let authority = "";
    modal.confirm({
      title: `Record the disposal of box ${box.code}?`,
      width: 520,
      content: (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
            This records that the physical contents were disposed of. The records
            themselves remain in the system, so the trail survives the paper.
          </Typography.Paragraph>
          <Input
            placeholder="Disposal authority, e.g. NAP Disposal Authority 2026-001"
            onChange={(e) => {
              authority = e.target.value;
            }}
          />
        </Space>
      ),
      okText: "Record disposal",
      okButtonProps: { danger: true },
      onOk: () => {
        if (!authority.trim()) {
          message.error("The approving authority is required.");
          return Promise.reject(new Error("authority required"));
        }
        return updateMutation.mutateAsync({
          code: box.code,
          status: "disposed",
          disposalAuthority: authority.trim(),
        });
      },
    });
  };

  const columns = [
    {
      title: "Box",
      dataIndex: "code",
      key: "code",
      render: (code, box) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{code}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {box.label}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: "Province",
      dataIndex: "province",
      key: "province",
      render: (p) => PROVINCE_LABEL[p] || p,
    },
    { title: "Location", dataIndex: "location", key: "location", render: (l) => l || "—" },
    {
      title: "Records",
      dataIndex: "recordCount",
      key: "recordCount",
      align: "right",
      render: (n, box) => (
        <Button type="link" size="small" onClick={() => setViewing(box.code)}>
          {n}
        </Button>
      ),
    },
    {
      title: "Retention",
      key: "retention",
      render: (_, box) =>
        box.disposeAfter ? (
          <Tooltip title={`Sealed ${new Date(box.sealedAt).toLocaleDateString()}`}>
            {new Date(box.disposeAfter).toLocaleDateString()}
          </Tooltip>
        ) : box.retentionYears ? (
          `${box.retentionYears} yrs after sealing`
        ) : (
          "—"
        ),
    },
    {
      title: "",
      key: "actions",
      render: (_, box) =>
        canWrite && (
          <Space size={4}>
            {box.status === "open" && (
              <Button size="small" onClick={() => seal(box)}>
                Seal
              </Button>
            )}
            {["sealed", "due-for-disposal"].includes(box.status) && (
              <Button size="small" danger onClick={() => dispose(box)}>
                Record disposal
              </Button>
            )}
          </Space>
        ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {due.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${due.length} box${due.length === 1 ? "" : "es"} past the retention period`}
          description={due.map((b) => b.code).join(", ")}
        />
      )}

      <Card
        title="Archive boxes"
        extra={
          canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New box
            </Button>
          )
        }
      >
        <Typography.Paragraph type="secondary">
          Where records physically sit, and how long they must stay there. Sealing
          a box stops new records going in and starts its retention clock.
        </Typography.Paragraph>
        <Table
          rowKey="code"
          size="small"
          bordered
          loading={isLoading}
          columns={columns}
          dataSource={boxes}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No boxes yet" }}
        />
      </Card>

      <Modal
        title="New archive box"
        open={creating}
        onCancel={() => {
          form.resetFields();
          setCreating(false);
        }}
        onOk={async () => createMutation.mutate(await form.validateFields())}
        okText="Create box"
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="code" label="Box code" rules={[{ required: true }]}>
            <Input placeholder="BA-2021-001" />
          </Form.Item>
          <Form.Item name="label" label="Label">
            <Input placeholder="Bataan ECC records, 2021" />
          </Form.Item>
          <Form.Item name="province" label="Province" rules={[{ required: true }]}>
            <Select
              options={(options?.writableProvinces || Object.keys(PROVINCE_LABEL)).map((p) => ({
                value: p,
                label: PROVINCE_LABEL[p] || p,
              }))}
            />
          </Form.Item>
          <Form.Item name="location" label="Physical location">
            <Input placeholder="Records room, shelf 3" />
          </Form.Item>
          <Form.Item
            name="retentionYears"
            label="Retention (years after sealing)"
            extra="From the agency's retention schedule. Leave blank if not yet decided."
          >
            <InputNumber min={0} max={200} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <InboxOutlined />
            {`Contents of ${viewing || ""}`}
          </Space>
        }
        open={Boolean(viewing)}
        onCancel={() => setViewing(null)}
        footer={null}
        width={800}
      >
        <Table
          rowKey="serialNo"
          size="small"
          loading={loadingContents}
          dataSource={contents}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            {
              title: "Serial",
              dataIndex: "serialNo",
              key: "serialNo",
              render: (s) => (
                <Link to={`/universe/erms/records/${encodeURIComponent(s)}`}>{s}</Link>
              ),
            },
            { title: "Proponent", dataIndex: "proponentName", key: "proponent", ellipsis: true },
            { title: "Permit", dataIndex: ["permit", "number"], key: "permit" },
          ]}
          locale={{ emptyText: "This box is empty" }}
        />
      </Modal>
    </Space>
  );
};

export default ArchiveBoxes;
