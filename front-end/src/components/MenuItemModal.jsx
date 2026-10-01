import { useEffect } from "react";
import { Form, Input, Modal, Radio, Select, Typography } from "antd";
import { FolderOutlined, TableOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../config/api";
import { message } from "../shared/feedback";

// ---------------------------------------------------------------------------
// Add or rename an item in the year's branch of the Universe Central DB menu.
//
// An item is a name and a place: a folder (to group things) or a table (the
// Planning Unit's own, columns and rows to be designed on its page). It goes
// under the year, under the Monitoring Plan folder, or inside a folder
// someone made. The server checks the year and the capability.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });

const MenuItemModal = ({ open, year, item, parent, folders = [], onClose }) => {
  const [form] = Form.useForm();
  const isEdit = Boolean(item);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      item
        ? { label: item.label, kind: item.kind, parent: item.parent }
        : { label: "", kind: "folder", parent: parent || "root" }
    );
  }, [open, item, parent, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const res = isEdit
      ? await api(`/api/ucds/menu-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ label: v.label, parent: v.parent }) })
      : await api("/api/ucds/menu-items", { method: "POST", body: JSON.stringify({ label: v.label, kind: v.kind, parent: v.parent }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      message.error(body.message || body.error || "Could not save the item.");
      return;
    }
    message.success(isEdit ? `Renamed to ${body.item.label}.` : `${body.item.label} added to ${year}.`);
    form.resetFields();
    onClose(body.item);
  };

  const placeOptions = [
    { value: "root", label: `${year} (the year itself)` },
    { value: "monitoring", label: "Monitoring Plan" },
    ...folders.filter((f) => !item || f.id !== item.id).map((f) => ({ value: f.id, label: `Folder: ${f.label}` })),
  ];

  return (
    <Modal
      open={open}
      title={isEdit ? `Rename ${item.label}` : `Add to ${year}`}
      okText={isEdit ? "Save" : "Add"}
      onOk={submit}
      onCancel={() => {
        form.resetFields();
        onClose(null);
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="label" label="Name" rules={[{ required: true, message: "Give it a name." }]}>
          <Input maxLength={80} placeholder="e.g. Air quality stations" autoFocus />
        </Form.Item>
        {!isEdit && (
          <Form.Item name="kind" label="What it is">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: "folder", label: <><FolderOutlined /> Folder</> },
                { value: "table", label: <><TableOutlined /> Table</> },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="parent" label="Where">
          <Select options={placeOptions} />
        </Form.Item>
        {!isEdit && (
          <Typography.Text type="secondary">
            A folder groups other items. A table is the Planning Unit’s own — its columns and rows are designed on its page.
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
};

export default MenuItemModal;
