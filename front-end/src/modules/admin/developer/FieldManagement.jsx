import React, { useEffect, useMemo, useState } from "react";
import { Typography, Card, Table, Button, Modal, Form, Input, Select, Switch, Space, message, Drawer, Tag } from "antd";
import { getFieldConfigs, createFieldConfig, updateFieldConfig, deleteFieldConfig, introspectUcdsFields, importFieldConfigs } from "../../../api/developerService";

const MODULE_OPTIONS = [
  { value: "monitoring", label: "Monitoring Plan" },
];

const FieldManagement = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("monitoring");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [importOpen, setImportOpen] = useState(false);
  const [introspecting, setIntrospecting] = useState(false);
  const [introspectItems, setIntrospectItems] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [importPageSize, setImportPageSize] = useState(10);
  const [importCurrentPage, setImportCurrentPage] = useState(1);
  const [importLoading, setImportLoading] = useState(false);
  const [importQ, setImportQ] = useState("");
  const [importType, setImportType] = useState("all");

  const filteredIntrospect = useMemo(() => {
    const q = (importQ || '').toLowerCase();
    return (introspectItems || []).filter((it) => {
      const typeOk = importType === 'all' || it.type === importType;
      if (!typeOk) return false;
      if (!q) return true;
      const inKey = (it.key || '').toLowerCase().includes(q);
      const inLabel = (it.label || '').toLowerCase().includes(q);
      const inSample = (String(it.sample ?? '')).toLowerCase().includes(q);
      return inKey || inLabel || inSample;
    });
  }, [introspectItems, importQ, importType]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getFieldConfigs({ module: moduleFilter, q: q || undefined });
      setItems(data.items || []);
    } catch (e) {
      message.error(e?.message || "Failed to load field configs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [moduleFilter, q]);

  const columns = useMemo(() => [
    { title: "Module", dataIndex: "module", width: 140 },
    { title: "Field Key", dataIndex: "fieldKey" },
    { title: "Label", dataIndex: "label" },
    { title: "Type", dataIndex: "type", width: 120 },
    { title: "Required", dataIndex: "required", width: 100, render: (v) => (v ? "Yes" : "No") },
    { title: "Visible", dataIndex: "visible", width: 90, render: (v) => (v ? "Yes" : "No") },
    { title: "Order", dataIndex: "order", width: 80 },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => onEdit(record)}>Edit</Button>
          <Button size="small" danger onClick={() => onDelete(record)}>Delete</Button>
        </Space>
      ),
    },
  ], []);

  const onAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ module: moduleFilter, required: false, visible: true, type: "text", order: 0 });
    setOpen(true);
  };

  const onEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({ ...record });
    setOpen(true);
  };

  const onDelete = async (record) => {
    Modal.confirm({
      title: `Delete field ${record.fieldKey}?`,
      onOk: async () => {
        try {
          await deleteFieldConfig(record._id);
          message.success("Deleted");
          fetchData();
        } catch (e) {
          message.error(e?.message || "Delete failed");
        }
      },
    });
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateFieldConfig(editing._id, values);
        message.success("Updated");
      } else {
        await createFieldConfig(values);
        message.success("Created");
      }
      setOpen(false);
      fetchData();
    } catch (e) {
      if (e?.errorFields) return; // form validation errors handled by antd
      message.error(e?.message || "Save failed");
    }
  };

  return (
    <Card title="Developer • Field Management" extra={
      <Space>
        <Input placeholder="Search field/label" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ width: 220 }} />
        <Select style={{ width: 220 }} value={moduleFilter} onChange={setModuleFilter} options={MODULE_OPTIONS} />
        <Button onClick={async () => {
          setImportOpen(true);
          setIntrospecting(true);
          try {
            const data = await introspectUcdsFields();
            // map type suggestions to config types
            const mapped = (data.items || []).map((it, idx) => ({
              key: it.key,
              type: it.type === 'number' ? 'number' : it.type === 'date' ? 'date' : 'text',
              count: it.count,
              sample: it.sample,
              order: idx,
              label: it.key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
            }));
            setIntrospectItems(mapped);
          } catch (e) {
            message.error(e?.message || 'Failed to introspect ucds-data');
          } finally {
            setIntrospecting(false);
          }
        }}>Import from ucds-data</Button>
        <Button type="primary" onClick={onAdd}>Add Field</Button>
      </Space>
    }>
      <Table
        rowKey="_id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={{
          current: currentPage,
          pageSize,
          total: items.length,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
          onChange: (page, ps) => {
            setCurrentPage(page);
            setPageSize(ps);
          },
        }}
        locale={{
          emptyText: (
            <div style={{ textAlign: 'center' }}>
              <div>No field configurations found for this module.</div>
              <Button style={{ marginTop: 8 }} type="primary" onClick={onAdd}>Add your first field</Button>
            </div>
          ),
        }}
      />

      <Modal open={open} title={editing ? "Edit Field" : "Add Field"} onOk={onSubmit} onCancel={()=>setOpen(false)} destroyOnClose>
        <Form layout="vertical" form={form}>
          <Form.Item name="module" label="Module" rules={[{ required: true }]}>
            <Select options={MODULE_OPTIONS} />
          </Form.Item>
          <Form.Item name="fieldKey" label="Field Key" rules={[{ required: true }]}> <Input /> </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}> <Input /> </Form.Item>
          <Form.Item name="type" label="Type"> <Select options={[{value:"text"},{value:"number"},{value:"select"},{value:"date"},{value:"textarea"}]} /> </Form.Item>
          <Form.Item name="options" label="Options (comma-separated for select)"> <Input /> </Form.Item>
          <Form.Item name="required" label="Required" valuePropName="checked"> <Switch /> </Form.Item>
          <Form.Item name="visible" label="Visible" valuePropName="checked"> <Switch defaultChecked /> </Form.Item>
          <Form.Item name="order" label="Order"> <Input type="number" /> </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        width={720}
        title={`Import fields from ucds-data → ${MODULE_OPTIONS.find(m=>m.value===moduleFilter)?.label || moduleFilter}`}
        extra={<Button type="primary" disabled={!selectedKeys.length || introspecting} loading={importLoading} onClick={async () => {
          setImportLoading(true);
          try {
            const fields = introspectItems
              .filter((it) => selectedKeys.includes(it.key))
              .map((it, idx) => ({ fieldKey: it.key, label: it.label, type: it.type, order: idx }));
            const res = await importFieldConfigs({ module: moduleFilter, fields });
            message.success(`Imported ${res.inserted} field(s), skipped ${res.skipped}`);
            setImportOpen(false);
            setSelectedKeys([]);
            fetchData();
          } catch (e) {
            message.error(e?.message || 'Import failed');
          } finally {
            setImportLoading(false);
          }
        }}>Import Selected</Button>}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Input
            placeholder="Search fields (key/label/sample)"
            allowClear
            style={{ width: 280 }}
            value={importQ}
            onChange={(e)=>{ setImportQ(e.target.value); setImportCurrentPage(1); }}
          />
          <Select
            style={{ width: 160 }}
            value={importType}
            onChange={(v)=>{ setImportType(v); setImportCurrentPage(1); }}
            options={[
              { value: 'all', label: 'All types' },
              { value: 'text', label: 'Text' },
              { value: 'number', label: 'Number' },
              { value: 'date', label: 'Date' },
              { value: 'boolean', label: 'Boolean' },
            ]}
          />
          <Button onClick={()=> setSelectedKeys((prev)=> Array.from(new Set([...prev, ...filteredIntrospect.map(i=>i.key)])))}>Select All (filtered)</Button>
          <Button onClick={()=> setSelectedKeys([])}>Clear Selection</Button>
        </Space>

        {/* Filtered list in-memory */}
        {(()=>{ /* compute here to avoid extra state writes */ })()}
        <Table
          rowKey="key"
          size="small"
          loading={introspecting}
          dataSource={filteredIntrospect}
          pagination={{
            current: importCurrentPage,
            pageSize: importPageSize,
            total: filteredIntrospect.length,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
            onChange: (page, ps) => {
              setImportCurrentPage(page);
              setImportPageSize(ps);
            },
          }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
          }}
          columns={[
            { title: 'Field Key', dataIndex: 'key' },
            { title: 'Suggested Label', dataIndex: 'label' },
            { title: 'Type', dataIndex: 'type', width: 120, render: (t)=> <Tag>{t}</Tag> },
            { title: 'Sample', dataIndex: 'sample', ellipsis: true },
            { title: 'Presence', dataIndex: 'count', width: 110 },
          ]}
        />
      </Drawer>
    </Card>
  );
};

export default FieldManagement;
