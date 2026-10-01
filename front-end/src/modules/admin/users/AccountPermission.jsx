import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Space, Switch, Table, Tabs, Tag, Typography } from "antd";
import { message } from "../../../shared/feedback";
import {
  CalendarOutlined,
  DatabaseOutlined,
  ExportOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import axios from "axios";
import AvatarWithName from "../../../components/AvatarwithName";
import AccountTypePanel from "./AccountTypePanel";
import { accountType } from "../../../shared/accountTypes";
import "./accountpermission.css";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// User Permission: everything that decides what an account reaches.
//
//   Type & Storage    the account type, and the NAS containers designated to
//                     it (Developer only) — AccountTypePanel
//   Year containers   which years the account may enter; an Encoder with no
//                     year cannot open UCDS at all
//   Access Settings   the named capabilities the server enforces
//   Monitoring Plan   province scope on the register: view, or read and write
//
// The server is the authority on all four; this dialog edits and explains.
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  {
    key: "canManageData",
    name: "Manage data",
    description: "Add, edit and delete rows in the Monitoring Plan and in every imported dataset of the years assigned. Still subject to the Universe Central DB editing switch and to the province scope below.",
    icon: <DatabaseOutlined />,
  },
  {
    key: "canGenerateData",
    name: "Generate reports",
    description: "Produce ICIR and other generated reports from register records. The PDFs are filed in the Records container.",
    icon: <ExportOutlined />,
  },
  {
    key: "canViewDataHistory",
    name: "Data history",
    description: "See the history of changes behind a record, and who else is viewing a province right now.",
    icon: <HistoryOutlined />,
  },
  {
    key: "canAccessRangePicker",
    name: "Date range filter",
    description: "Filter the dashboard and register by a date range instead of the current year only.",
    icon: <SearchOutlined />,
  },
  {
    key: "canViewAdminPanel",
    name: "Admin panel",
    description: "Show the Admin Settings menu. Only accounts whose type includes administration (Developer, legacy Administrator) can actually open it; for others this flag does nothing.",
    icon: <SettingOutlined />,
  },
];

const PROVINCES = [
  { key: "aurora", name: "Aurora" },
  { key: "bataan", name: "Bataan" },
  { key: "bulacan", name: "Bulacan" },
  { key: "nuevaEcija", name: "Nueva Ecija" },
  { key: "pampanga", name: "Pampanga" },
  { key: "tarlac", name: "Tarlac" },
  { key: "zambales", name: "Zambales" },
];

const AccountPermission = ({ onClose, onPermissionsUpdate, userData }) => {
  const [me, setMe] = useState(null);
  const [account, setAccount] = useState(null);
  const [years, setYears] = useState([]);
  const [caps, setCaps] = useState({});
  const [provinces, setProvinces] = useState({});
  const [assignedYears, setAssignedYears] = useState([]);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userData?.username) return;
    try {
      const [usersRes, yearsRes, meRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`, { params: { username: userData.username }, withCredentials: true }),
        axios.get(`${API_BASE_URL}/api/admin/years`, { withCredentials: true }).catch(() => ({ data: { years: [] } })),
        axios.get(`${API_BASE_URL}/api/auth/me`, { withCredentials: true }).catch(() => ({ data: null })),
      ]);
      const current = (usersRes.data || [])[0];
      if (!current) {
        message.error("User not found");
        return;
      }
      setAccount(current);
      setMe(meRes.data);
      setYears((yearsRes.data?.years || []).sort((a, b) => a.year - b.year));
      const c = Object.fromEntries(CAPABILITIES.map(({ key }) => [key, current[key] === true || current.capabilities?.[key] === true]));
      const p = Object.fromEntries(PROVINCES.map(({ key }) => [key, current[key] === "readWrite" ? "readWrite" : current[key] === "view" ? "view" : "none"]));
      const y = Array.isArray(current.assignedYears) ? current.assignedYears.map(Number) : [];
      setCaps(c);
      setProvinces(p);
      setAssignedYears(y);
      setSaved({ caps: c, provinces: p, years: [...y].sort() });
    } catch (error) {
      console.error("Error fetching user data:", error);
      message.error("Error fetching user data");
    }
  }, [userData?.username]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return (
      JSON.stringify(caps) !== JSON.stringify(saved.caps) ||
      JSON.stringify(provinces) !== JSON.stringify(saved.provinces) ||
      JSON.stringify([...assignedYears].sort()) !== JSON.stringify(saved.years)
    );
  }, [caps, provinces, assignedYears, saved]);

  const canEdit = me?.role === "developer" || me?.role === "admin";
  const type = accountType(account?.permission || userData.permission);
  const allYears = ["developer", "admin"].includes(String(account?.permission || "").toLowerCase());
  const isEncoder = String(account?.permission || "").toLowerCase() === "viewer";

  const save = async () => {
    setSaving(true);
    try {
      if (JSON.stringify(caps) !== JSON.stringify(saved.caps)) {
        await axios.patch(`${API_BASE_URL}/api/users/${encodeURIComponent(account.email)}/permissions`, caps, { withCredentials: true });
      }
      if (JSON.stringify(provinces) !== JSON.stringify(saved.provinces)) {
        await axios.patch(`${API_BASE_URL}/api/users/${encodeURIComponent(account.email)}/province-permissions`, provinces, { withCredentials: true });
      }
      if (JSON.stringify([...assignedYears].sort()) !== JSON.stringify(saved.years)) {
        await axios.put(`${API_BASE_URL}/api/users/${account._id}/years`, { years: assignedYears }, { withCredentials: true });
      }
      setSaved({ caps, provinces, years: [...assignedYears].sort() });
      message.success("Access saved. It applies on the person's next request.");
      onPermissionsUpdate?.();
    } catch (error) {
      message.error(error?.response?.data?.error || "Could not save the access settings.");
    } finally {
      setSaving(false);
    }
  };

  const setProvince = (key, level) => setProvinces((p) => ({ ...p, [key]: level }));

  const capabilityColumns = [
    {
      title: "Capability",
      dataIndex: "name",
      render: (name, r) => (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div className="icon-container">{r.icon}</div>
          <div className="access-details">
            <strong>{name}</strong>
            <p style={{ margin: 0 }}>
              <Text type="secondary">{r.description}</Text>
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Granted",
      key: "granted",
      width: 90,
      align: "center",
      render: (_, r) => <Switch size="small" checked={caps[r.key] === true} disabled={!canEdit} onChange={(v) => setCaps((c) => ({ ...c, [r.key]: v }))} />,
    },
  ];

  const provinceColumns = [
    { title: "Province", dataIndex: "name" },
    {
      title: "Scope",
      key: "scope",
      width: 320,
      render: (_, r) => (
        <Space>
          {[
            ["none", "No access"],
            ["view", "View"],
            ["readWrite", "Read and write"],
          ].map(([level, label]) => (
            <Tag.CheckableTag key={level} checked={provinces[r.key] === level} onChange={() => canEdit && setProvince(r.key, level)}>
              {label}
            </Tag.CheckableTag>
          ))}
        </Space>
      ),
    },
  ];

  const thisYear = new Date().getFullYear();

  const items = [
    {
      key: "type",
      label: "Type & Storage",
      children: <AccountTypePanel userId={userData._id} permission={account?.permission || userData.permission} nasContainers={account?.nasContainers ?? userData.nasContainers} ermsUnit={account?.ermsUnit ?? userData.ermsUnit ?? null} onChanged={() => { load(); onPermissionsUpdate?.(); }} />,
    },
    {
      key: "years",
      label: "Year containers",
      children: (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {allYears ? (
            <Alert type="info" showIcon icon={<CalendarOutlined />} message={`${type.label} accounts enter every active year container.`} />
          ) : (
            <>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                The years this account may pick at sign-in and switch to from the header. {isEncoder ? "An Encoder with no year cannot open UCDS at all." : "Hidden and archived years are never offered, whatever is ticked here."}
              </Paragraph>
              <Checkbox.Group
                value={assignedYears}
                disabled={!canEdit}
                onChange={(v) => setAssignedYears(v.map(Number))}
                options={years.map((y) => ({
                  value: y.year,
                  label: (
                    <Space size={4}>
                      {y.year}
                      {y.year === thisYear && <Tag color="processing" style={{ marginInlineEnd: 0 }}>current</Tag>}
                      {y.status !== "active" && <Tag style={{ marginInlineEnd: 0 }}>{y.status}</Tag>}
                      {y.hidden && <Tag style={{ marginInlineEnd: 0 }}>hidden</Tag>}
                      {y.locked && <Tag color="red" style={{ marginInlineEnd: 0 }}>locked</Tag>}
                    </Space>
                  ),
                }))}
                className="year-checkboxes"
              />
              {!assignedYears.length && <Alert type="warning" showIcon message="No year assigned — this account cannot enter UCDS." />}
            </>
          )}
        </Space>
      ),
    },
    {
      key: "capabilities",
      label: "Access Settings",
      children: (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {String(account?.permission || "").toLowerCase() === "developer" && (
            <Alert type="info" showIcon message="A Developer holds every capability; these switches are not consulted for them." />
          )}
          <Table dataSource={CAPABILITIES} columns={capabilityColumns} pagination={false} rowKey="key" size="small" showHeader={false} />
        </Space>
      ),
    },
    {
      key: "provinces",
      label: "Monitoring Plan Access",
      children: (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Which provinces of the register this account sees, within each year container&rsquo;s own province list. <b>View</b> reads the rows; <b>Read and write</b> also lets Manage data act on them. Developers and Administrators see every province.
          </Paragraph>
          <Table dataSource={PROVINCES} columns={provinceColumns} pagination={false} rowKey="key" size="small" />
          {canEdit && (
            <Space>
              <Button size="small" onClick={() => setProvinces(Object.fromEntries(PROVINCES.map((p) => [p.key, "readWrite"])))}>All read and write</Button>
              <Button size="small" onClick={() => setProvinces(Object.fromEntries(PROVINCES.map((p) => [p.key, "view"])))}>All view</Button>
              <Button size="small" onClick={() => setProvinces(Object.fromEntries(PROVINCES.map((p) => [p.key, "none"])))}>Clear</Button>
            </Space>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="account-permission-container">
      <div className="user-info">
        <div className="avatar-section">
          <AvatarWithName userHandle={userData.username} size="72px" />
          <span className={`status-dot ${userData.status === "online" ? "online" : "offline"}`} />
        </div>
        <div className="user-details">
          <p className="user-name-details">
            <strong>{userData.name}</strong>
          </p>
          <p className="user-email-details">{userData.email}</p>
          <p className="user-permission-details">
            <Tag color={type.color}>{type.label}</Tag>
            {account?.isDemo && <Tag color="gold">demo</Tag>}
          </p>
        </div>
      </div>

      {!canEdit && me && (
        <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} message="Only a Developer or Administrator can change access. Shown read-only." />
      )}

      <Tabs defaultActiveKey="type" items={items} />

      <div className="footer-actions">
        <Button type="primary" onClick={save} loading={saving} disabled={!dirty || !canEdit} style={{ marginRight: 8 }}>
          Save changes
        </Button>
        <Button onClick={onClose}>{dirty ? "Cancel" : "Close"}</Button>
      </div>
    </div>
  );
};

export default AccountPermission;
