import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { PlusOutlined, TagOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ORG_UNIT_TYPES,
  addOrgUnitAlias,
  createOrgUnit,
  describeApiError,
  listOrgUnits,
  updateOrgUnit,
} from "../../api/orgUnitService";
import { message } from "../../shared/feedback";

// ---------------------------------------------------------------------------
// Offices, divisions and sections — shared master data.
//
// "Division" used to be a free-text string typed into each user account, which
// is how "ORD-PISMU" and "ORD - PISMU" both came to exist. Units are now one
// authoritative list, and a variant spelling is recorded as an alias against
// the canonical code so existing records still resolve.
// ---------------------------------------------------------------------------

const TYPE_COLOR = {
  office: "geekblue",
  division: "green",
  section: "gold",
  unit: "default",
};

const OrgUnits = () => {
  const queryClient = useQueryClient();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | unit
  const [aliasTarget, setAliasTarget] = useState(null);
  const [form] = Form.useForm();
  const [aliasForm] = Form.useForm();

  const { data: orgUnits = [], isLoading } = useQuery({
    queryKey: ["org-units", { includeInactive }],
    queryFn: () => listOrgUnits({ includeInactive }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["org-units"] });

  const onError = (error, fallback) => message.error(describeApiError(error, fallback));

  const createMutation = useMutation({
    mutationFn: createOrgUnit,
    onSuccess: (unit) => {
      message.success(`Created ${unit.code}.`);
      setEditing(null);
      form.resetFields();
      invalidate();
    },
    onError: (e) => onError(e, "Could not create the unit."),
  });

  const updateMutation = useMutation({
    mutationFn: updateOrgUnit,
    onSuccess: (unit) => {
      message.success(`Updated ${unit.code}.`);
      setEditing(null);
      form.resetFields();
      invalidate();
    },
    onError: (e) => onError(e, "Could not update the unit."),
  });

  const aliasMutation = useMutation({
    mutationFn: addOrgUnitAlias,
    onSuccess: (unit) => {
      message.success(`Alias added to ${unit.code}.`);
      setAliasTarget(null);
      aliasForm.resetFields();
      invalidate();
    },
    onError: (e) => onError(e, "Could not add the alias."),
  });

  const parentOptions = useMemo(
    () => orgUnits.map((u) => ({ value: u.code, label: u.code })),
    [orgUnits]
  );

  const openEditor = (unit) => {
    setEditing(unit || "new");
    form.setFieldsValue(
      unit
        ? { code: unit.code, name: unit.name, type: unit.type, parentCode: unit.parentCode || undefined }
        : { type: "division" }
    );
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (editing === "new") {
      createMutation.mutate(values);
      return;
    }
    // Code is the identity of a unit and is not editable — changing it would
    // orphan every record that already references it, so it is not sent.
    updateMutation.mutate({
      id: editing._id,
      name: values.name,
      type: values.type,
      parentCode: values.parentCode ?? null,
      active: values.active,
    });
  };

  const columns = [
    {
      title: "Code",
      dataIndex: "code",
      key: "code",
      width: 150,
      align: "left",
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (code, unit) => (
        <Space size={6}>
          <Typography.Text strong>{code}</Typography.Text>
          {!unit.active && <Tag>inactive</Tag>}
        </Space>
      ),
    },
    { title: "Name", dataIndex: "name", key: "name", width: 200, align: "left" },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      filters: ORG_UNIT_TYPES.map((t) => ({ text: t, value: t })),
      onFilter: (value, unit) => unit.type === value,
      render: (type) => <Tag color={TYPE_COLOR[type] || "default"}>{type}</Tag>,
    },
    {
      title: "Parent",
      dataIndex: "parentCode",
      key: "parentCode",
      render: (parent) => parent || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "Also written as",
      dataIndex: "aliases",
      key: "aliases",
      render: (aliases = []) =>
        aliases.length ? (
          <Space size={4} wrap>
            {aliases.map((a) => (
              <Tag key={a}>{a}</Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 160,
      render: (_, unit) => (
        <Space size={4}>
          <Button size="small" onClick={() => openEditor(unit)}>
            Edit
          </Button>
          <Tooltip title="Record another spelling that should resolve to this unit">
            <Button size="small" icon={<TagOutlined />} onClick={() => setAliasTarget(unit)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card
      title="Organizational Units"
      extra={
        <Space size={16}>
          <Space size={6}>
            <Typography.Text type="secondary">Show inactive</Typography.Text>
            <Switch size="small" checked={includeInactive} onChange={setIncludeInactive} />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>
            New unit
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Offices, divisions and sections shared by both the Planning and Records
        modules. A unit&apos;s code is its identity — record variant spellings as
        aliases instead of creating a second unit.
      </Typography.Paragraph>

      <Table
        rowKey="_id"
        size="small"
        bordered
        loading={isLoading}
        dataSource={orgUnits}
        columns={columns}
        pagination={{ defaultPageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
      />

      <Modal
        title={editing === "new" ? "New organisational unit" : `Edit ${editing?.code || ""}`}
        open={Boolean(editing)}
        onCancel={() => {
          setEditing(null);
          form.resetFields();
        }}
        onOk={submit}
        okText="Save"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="code"
            label="Code"
            rules={[{ required: true, message: "A unit needs a code." }]}
            extra="Normalised to upper case with single hyphens, e.g. ORD-PEMU-BATAAN."
          >
            <Input disabled={editing !== "new"} placeholder="ORD-PEMU-BATAAN" />
          </Form.Item>
          <Form.Item name="name" label="Name">
            <Input placeholder="Provincial Environmental Management Unit — Bataan" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select placeholder="Select the type" options={ORG_UNIT_TYPES.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="parentCode" label="Parent unit">
            <Select allowClear showSearch options={parentOptions} placeholder="None" />
          </Form.Item>
          {editing !== "new" && (
            <Form.Item name="active" label="Active" valuePropName="checked" initialValue={editing?.active}>
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`Add an alias for ${aliasTarget?.code || ""}`}
        open={Boolean(aliasTarget)}
        onCancel={() => {
          setAliasTarget(null);
          aliasForm.resetFields();
        }}
        onOk={async () => {
          const { alias } = await aliasForm.validateFields();
          aliasMutation.mutate({ code: aliasTarget.code, alias });
        }}
        okText="Add alias"
        confirmLoading={aliasMutation.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Any record still carrying this spelling will resolve to{" "}
          <Typography.Text code>{aliasTarget?.code}</Typography.Text>.
        </Typography.Paragraph>
        <Form form={aliasForm} layout="vertical" preserve={false}>
          <Form.Item
            name="alias"
            label="Spelling"
            rules={[{ required: true, message: "Enter the spelling to map." }]}
          >
            <Input placeholder="ORD - PISMU" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default OrgUnits;
