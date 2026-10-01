import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Descriptions, Form, Input, Space, Table, Tabs, Tag, Typography } from "antd";
import { EditOutlined, SaveOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { message } from "../../../shared/feedback";
import AvatarWithName from "../../../components/AvatarwithName";
import { accountType } from "../../../shared/accountTypes";
import { API_BASE_URL } from "../../../config/api";
import "./useraccountmodal.css";

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// Account Details: who this person is, and a plain summary of what their
// account can reach. Identity fields are edited here; everything under
// "Access" is set from the User Permission dialog (Edit Access), which
// carries the checks — this view only reports it.
// ---------------------------------------------------------------------------

const PROVINCES = [
  ["aurora", "Aurora"],
  ["bataan", "Bataan"],
  ["bulacan", "Bulacan"],
  ["nuevaEcija", "Nueva Ecija"],
  ["pampanga", "Pampanga"],
  ["tarlac", "Tarlac"],
  ["zambales", "Zambales"],
];

const CAPABILITIES = [
  ["canManageData", "Add, edit and delete data"],
  ["canGenerateData", "Generate reports"],
  ["canViewDataHistory", "View data history"],
  ["canAccessRangePicker", "Date range picker"],
  ["canViewAdminPanel", "Admin panel"],
];

const CONTAINER_LABELS = { records: "Records", legal: "Legal", laboratory: "Laboratory", "clearance-permitting": "Clearance and Permitting" };

const DOMAIN_LABELS = { ucds: "UCDS", erms: "ERMS", admin: "Administration" };
const DEFAULT_DOMAINS = {
  developer: ["ucds", "erms", "admin"],
  admin: ["ucds", "erms", "admin"],
  records: ["erms", "ucds"],
  planning: ["ucds"],
  viewer: ["ucds"],
};

const UserAccountModal = ({ user, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(user);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState({ items: [], loading: true, forbidden: false });

  useEffect(() => {
    setCurrent(user);
  }, [user]);

  // Recent activity for this person, from the application log. Developers
  // may read it; for anyone else the tab just says so.
  const loadLogs = useCallback(async () => {
    if (!user?.username) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dev/activity-logs`, { params: { username: user.username, limit: 25 }, withCredentials: true });
      setLogs({ items: res.data?.items || [], loading: false, forbidden: false });
    } catch (err) {
      setLogs({ items: [], loading: false, forbidden: err?.response?.status === 403 || err?.response?.status === 401 });
    }
  }, [user?.username]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const type = accountType(current?.permission);
  const domains = useMemo(() => {
    const explicit = Array.isArray(current?.domains) && current.domains.length ? current.domains : null;
    return explicit || DEFAULT_DOMAINS[String(current?.permission || "viewer").toLowerCase()] || ["ucds"];
  }, [current]);
  const developer = String(current?.permission || "").toLowerCase() === "developer";
  const provinceScope = PROVINCES.filter(([k]) => current?.[k] && current[k] !== "none");
  const capabilities = CAPABILITIES.filter(([k]) => developer || current?.[k] === true || current?.capabilities?.[k] === true);

  const startEdit = () => {
    form.setFieldsValue({
      empid: current?.empid || "",
      name: current?.name || "",
      email: current?.email || "",
      division: current?.division || "",
      designation: current?.designation === "n/a" ? "" : current?.designation || "",
      office: current?.office === "n/a" ? "" : current?.office || "",
      region: current?.region === "n/a" ? "" : current?.region || "",
    });
    setEditing(true);
  };

  const save = async (values) => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
      await axios.put(`${API_BASE_URL}/api/users/${current._id}`, body, { withCredentials: true });
      const next = { ...current, ...body };
      setCurrent(next);
      setEditing(false);
      message.success("Account details saved.");
      onSaved?.(next);
    } catch (err) {
      message.error(err?.response?.data?.error || "Could not save the account details.");
    } finally {
      setSaving(false);
    }
  };

  if (!current) return null;

  const identity = (
    <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered labelStyle={{ width: 140 }}>
      <Descriptions.Item label="Employee ID">{current.empid || <Text type="secondary">—</Text>}</Descriptions.Item>
      <Descriptions.Item label="Username">
        <Text code>{current.username}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="Email">{current.email}</Descriptions.Item>
      <Descriptions.Item label="Division / Section">{current.division || <Text type="secondary">—</Text>}</Descriptions.Item>
      <Descriptions.Item label="Designation">{current.designation && current.designation !== "n/a" ? current.designation : <Text type="secondary">—</Text>}</Descriptions.Item>
      <Descriptions.Item label="Office">{current.office && current.office !== "n/a" ? current.office : <Text type="secondary">—</Text>}</Descriptions.Item>
      <Descriptions.Item label="Region">{current.region && current.region !== "n/a" ? current.region : <Text type="secondary">—</Text>}</Descriptions.Item>
      <Descriptions.Item label="Status">
        <Tag color={current.status === "online" ? "green" : "default"}>{current.status || "offline"}</Tag>
      </Descriptions.Item>
    </Descriptions>
  );

  const editForm = (
    <Form form={form} layout="vertical" onFinish={save} className="account-edit-form">
      <div className="account-edit-grid">
        <Form.Item name="empid" label="Employee ID">
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item name="name" label="Full name" rules={[{ required: true, message: "Enter the person's name." }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email address." }]}>
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="division" label="Division / Section" rules={[{ required: true, message: "Enter the division or section." }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="designation" label="Designation">
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="office" label="Office">
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="region" label="Region">
          <Input maxLength={40} />
        </Form.Item>
      </div>
    </Form>
  );

  const access = (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="What this account can reach"
        description="Set from Edit Access on the User Accounts table. Shown here as the server applies it."
      />
      <Descriptions column={1} size="small" bordered labelStyle={{ width: 180 }}>
        <Descriptions.Item label="Account type">
          <Space>
            <Tag color={type.color}>{type.label}</Tag>
            <Text type="secondary">{type.description}</Text>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Modules">
          {domains.map((d) => (
            <Tag key={d}>{DOMAIN_LABELS[d] || d}</Tag>
          ))}
        </Descriptions.Item>
        <Descriptions.Item label="Year containers">
          {developer ? (
            <Text type="secondary">every active year</Text>
          ) : Array.isArray(current.assignedYears) && current.assignedYears.length ? (
            [...current.assignedYears].sort().map((y) => <Tag key={y}>{y}</Tag>)
          ) : (
            <Text type="warning">none assigned — cannot enter UCDS</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Storage containers">
          {developer ? (
            <Text type="secondary">every container</Text>
          ) : String(current.permission).toLowerCase() === "viewer" ? (
            <Text type="secondary">none — Encoders have no storage</Text>
          ) : Array.isArray(current.nasContainers) && current.nasContainers.length ? (
            current.nasContainers.map((k) => <Tag key={k}>{CONTAINER_LABELS[k] || k}</Tag>)
          ) : String(current.permission).toLowerCase() === "records" ? (
            <Tag>Records (default)</Tag>
          ) : (
            <Text type="secondary">none designated</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Province scope">
          {developer || String(current.permission).toLowerCase() === "admin" ? (
            <Text type="secondary">all provinces</Text>
          ) : provinceScope.length ? (
            provinceScope.map(([k, label]) => (
              <Tag key={k} color={current[k] === "readWrite" ? "blue" : "default"}>
                {label} · {current[k] === "readWrite" ? "read / write" : "view"}
              </Tag>
            ))
          ) : (
            <Text type="warning">no province — sees no register rows</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Capabilities">
          {capabilities.length ? capabilities.map(([k, label]) => <Tag key={k}>{label}</Tag>) : <Text type="secondary">read only</Text>}
        </Descriptions.Item>
      </Descriptions>
    </Space>
  );

  const activity = logs.forbidden ? (
    <Alert type="info" showIcon message="Only a Developer can read the activity log." />
  ) : (
    <Table
      size="small"
      rowKey={(r) => r._id}
      loading={logs.loading}
      dataSource={logs.items}
      pagination={{ defaultPageSize: 8, size: "small" }}
      locale={{ emptyText: "No activity recorded for this account yet." }}
      columns={[
        { title: "When", dataIndex: "timestamp", width: 170, render: (v, r) => dayjs(v || r.createdAt || r.date).format("D MMM YYYY, h:mm A") },
        { title: "Action", dataIndex: "actionLabel", render: (v, r) => v || r.operation || r.message || "—" },
        { title: "Where", dataIndex: "path", width: 220, ellipsis: true, render: (v, r) => (r.domain === "nas" ? "storage" : v || "—") },
      ]}
    />
  );

  return (
    <div className="account-modal">
      <div className="account-hero">
        <AvatarWithName userHandle={current.username} size="72px" />
        <div className="account-hero-text">
          <Title level={4} style={{ margin: 0 }}>
            {current.name}
          </Title>
          <Space size={6} wrap>
            <Text type="secondary">@{current.username}</Text>
            <Tag color={type.color}>{type.label}</Tag>
            {current.isDemo && <Tag color="gold">demo</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {current.division}
            {current.designation && current.designation !== "n/a" ? ` · ${current.designation}` : ""}
          </Text>
        </div>
        <div className="account-hero-actions">
          {editing ? (
            <Space>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => form.submit()}>
                Save
              </Button>
            </Space>
          ) : (
            <Space>
              <Button icon={<EditOutlined />} onClick={startEdit}>
                Edit details
              </Button>
              <Button onClick={onClose}>Close</Button>
            </Space>
          )}
        </div>
      </div>

      <Tabs
        defaultActiveKey="details"
        items={[
          { key: "details", label: "Details", children: editing ? editForm : identity },
          { key: "access", label: "Access", children: access },
          { key: "activity", label: "Recent activity", children: activity },
        ]}
      />
    </div>
  );
};

export default UserAccountModal;
