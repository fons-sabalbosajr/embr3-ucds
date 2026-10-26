import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tabs, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { CheckOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, KeyOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined } from "@ant-design/icons";
import axios from "axios";
import UserProfileModal from "./UserAccountModal";
import AccountPermission from "./AccountPermission";
import { ApproveRequestModal, RejectRequestModal } from "./ApproveRequestModal";
import AvatarWithName from "../../../components/AvatarwithName";
import PageHeader from "../../../shared/components/PageHeader";
import { accountType, accountTypeLabel } from "../../../shared/accountTypes";
import { fetchCurrentUser } from "../../../api/universeService";
import { getSocket, initializeSocket } from "../../../api/socketService";
import { message } from "../../../shared/feedback";
import visibleInterval from "../../../shared/visibleInterval";
import { API_BASE_URL } from "../../../config/api";
import "./useraccount.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// User Accounts: the accounts, and the requests for new ones.
//
// An account exists only once a Developer has approved a request (the
// public Request Access page records it; services/accountRequests on the
// server makes the account and sends the email). Approving, declining and
// deleting are the Developer's; the server refuses them to anyone else, and
// this screen does not offer them.
//
// The lists refresh every 30 seconds while the tab is in view, and at once
// when a request arrives or is decided (the "accounts:requests" notice).
// ---------------------------------------------------------------------------

const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });
const errorOf = (e, fallback) => e?.response?.data?.error || e?.response?.data?.message || fallback;
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** "active now", "active 5 min ago", "offline" — from the login-status row. */
function presenceOf(status) {
  if (!status) return "offline";
  if (status.isLoggedIn) return "online";
  const ms = Date.now() - new Date(status.logoutTime || 0).getTime();
  if (!status.logoutTime || ms > 12 * 3600 * 1000) return "offline";
  const mins = Math.floor(ms / 60000);
  return mins < 60 ? `active ${mins} min ago` : `active ${Math.floor(mins / 60)} hr ago`;
}

const REQUEST_STATUS = {
  pending: { color: "orange", label: "Waiting" },
  approving: { color: "blue", label: "Being approved" },
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Declined" },
};

/** The accounts as a CSV file: who, what type, which unit, what status. */
function exportCsv(rows) {
  const head = ["Name", "Username", "Email", "Division", "Position", "Type", "ERMS unit", "Years", "Status"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((u) =>
    [u.name, u.username, u.email, u.division, u.designation, accountTypeLabel(u.permission), u.ermsUnit || "", (u.assignedYears || []).join(" "), u.presence].map(cell).join(",")
  );
  // The byte-order mark makes Excel read the file as UTF-8 (ñ in names).
  const blob = new Blob(["﻿", [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `E-Universe accounts ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const UserAccounts = () => {
  const { token } = antdTheme.useToken();
  const [me, setMe] = useState(null);
  const isDeveloper = me?.role === "developer";

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestView, setRequestView] = useState("pending");

  const [editingProfile, setEditingProfile] = useState(null);
  const [editingAccess, setEditingAccess] = useState(null);
  const [deleting, setDeleting] = useState(null); // { user, typed }
  const [approving, setApproving] = useState(null);
  const [declining, setDeclining] = useState(null);
  // Opens on the requests when some are waiting (the bell links here), once.
  const [tab, setTab] = useState("accounts");
  const [tabChosen, setTabChosen] = useState(false);

  useEffect(() => {
    fetchCurrentUser().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (tabChosen || !requests.length) return;
    setTabChosen(true);
    if (requests.some((r) => r.status === "pending")) setTab("requests");
  }, [requests, tabChosen]);

  const loadUsers = useCallback(async () => {
    try {
      const [list, statuses] = await Promise.all([api.get("/api/users").then((r) => r.data), api.get("/api/login-status").then((r) => r.data).catch(() => [])]);
      const byName = new Map((Array.isArray(statuses) ? statuses : []).map((s) => [s.username, s]));
      const rows = (Array.isArray(list) ? list : []).map((u) => ({ ...u, presence: presenceOf(byName.get(u.username)) }));
      // Online first, then by name.
      rows.sort((a, b) => (b.presence === "online") - (a.presence === "online") || String(a.name || "").localeCompare(String(b.name || "")));
      setUsers(rows);
      setUsersError(null);
    } catch (e) {
      setUsersError(errorOf(e, "The accounts could not be loaded."));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    if (!isDeveloper) return;
    setLoadingRequests(true);
    try {
      const { data } = await api.get("/api/sign-up");
      setRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(errorOf(e, "The account requests could not be loaded."));
    } finally {
      setLoadingRequests(false);
    }
  }, [isDeveloper]);

  useEffect(() => {
    loadUsers();
    return visibleInterval(loadUsers, 30000);
  }, [loadUsers]);

  useEffect(() => {
    loadRequests();
    return visibleInterval(loadRequests, 30000);
  }, [loadRequests]);

  // A request arriving, or decided by another Developer, shows at once.
  useEffect(() => {
    if (!isDeveloper) return undefined;
    const socket = getSocket() || initializeSocket();
    const refresh = () => {
      loadRequests();
      loadUsers();
    };
    socket.on("accounts:requests", refresh);
    return () => socket.off("accounts:requests", refresh);
  }, [isDeveloper, loadRequests, loadUsers]);

  const types = useMemo(() => [...new Set(users.map((u) => u.permission).filter(Boolean))], [users]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (typeFilter === "all" || u.permission === typeFilter) &&
        (!q || [u.name, u.username, u.email, u.division, u.designation].some((v) => String(v || "").toLowerCase().includes(q)))
    );
  }, [users, search, typeFilter]);

  const pending = requests.filter((r) => r.status === "pending");
  const requestRows = requestView === "all" ? requests : requests.filter((r) => (requestView === "pending" ? ["pending", "approving"].includes(r.status) : r.status === requestView));

  const deleteAccount = async () => {
    const target = deleting?.user;
    if (!target) return;
    try {
      const { data } = await api.delete(`/api/users/${target._id}`);
      setDeleting(null);
      message.success(`${target.username} deleted; signed out of ${data?.removed?.sessions || 0} session(s). The activity trail keeps the name for the audit record.`);
      loadUsers();
    } catch (e) {
      message.error(errorOf(e, "The account could not be deleted."));
    }
  };

  const removeRequest = async (r) => {
    try {
      await api.delete(`/api/remove-user/${r._id}`);
      message.success(`The request from ${r.name} was removed.`);
      loadRequests();
    } catch (e) {
      message.error(errorOf(e, "The request could not be removed."));
    }
  };

  const userColumns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: 260,
      render: (name, u) => (
        <div className="user-name-cell">
          <AvatarWithName userHandle={u.username} />
          <div className="user-fullname-wrapper">
            <div className="user-fullname">{name}</div>
            <span className={`user-last-active ${u.presence === "online" ? "active-now" : "active-ago"}`}>{u.presence === "online" ? "active now" : u.presence}</span>
          </div>
        </div>
      ),
    },
    { title: "Username", dataIndex: "username", key: "username", width: 150, render: (v) => <Text code>{v}</Text> },
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true },
    { title: "Division", dataIndex: "division", key: "division", ellipsis: true, responsive: ["lg"] },
    {
      title: "Type",
      dataIndex: "permission",
      key: "permission",
      width: 190,
      render: (permission, u) => {
        const t = accountType(permission);
        return (
          <Space size={4} wrap>
            <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.label}</Tag>
            {permission === "records" && <Tag style={{ marginInlineEnd: 0 }}>{{ records: "Records", legal: "Legal", laboratory: "Laboratory" }[u.ermsUnit || "records"]}</Tag>}
          </Space>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      align: "center",
      render: (_, u) => (
        <Space size={4}>
          <Tooltip title="Edit profile">
            <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => setEditingProfile(u)} aria-label="Edit profile" />
          </Tooltip>
          <Tooltip title="Edit access">
            <Button size="small" icon={<KeyOutlined />} onClick={() => setEditingAccess(u)} aria-label="Edit access" />
          </Tooltip>
          {isDeveloper && String(u._id) !== String(me?.user?.userId) && (
            <Tooltip title="Delete account">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting({ user: u, typed: "" })} aria-label="Delete account" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const requestColumns = [
    {
      title: "Name",
      key: "name",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{[r.position, r.division].filter(Boolean).join(" · ")}</Text>
        </Space>
      ),
    },
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true },
    { title: "Requested access", dataIndex: "accessLabel", key: "access", width: 230, render: (v) => v || <Text type="secondary">Not stated</Text> },
    { title: "Requested", dataIndex: "requestedAt", key: "requestedAt", width: 170, responsive: ["md"], render: when },
    {
      title: "Status",
      key: "status",
      width: 200,
      render: (_, r) => {
        const s = REQUEST_STATUS[r.status] || { color: "default", label: r.status };
        return (
          <Space direction="vertical" size={0}>
            <Tag color={s.color} style={{ marginInlineEnd: 0, width: "fit-content" }}>{s.label}</Tag>
            {r.decidedBy && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                by {r.decidedBy}, {when(r.decidedAt)}
                {r.username ? ` · ${r.username}` : ""}
              </Text>
            )}
            {r.reason && <Text type="secondary" style={{ fontSize: 12 }}>“{r.reason}”</Text>}
          </Space>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 220,
      align: "center",
      render: (_, r) => (
        <Space size={4} wrap>
          {r.status === "pending" && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setApproving(r)}>Approve</Button>
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => setDeclining(r)}>Decline</Button>
            </>
          )}
          {r.status !== "pending" && r.status !== "approving" && (
            <Popconfirm title="Remove this request from the list?" description="The account, if one was made, is not affected." okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => removeRequest(r)}>
              <Button size="small" icon={<DeleteOutlined />}>Remove</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <PageHeader
        accent={token.colorPrimary}
        icon={<TeamOutlined />}
        title="User Accounts"
        description="Every E-Universe account, and the requests for new ones. Accounts are made only by approving a request."
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => { loadUsers(); loadRequests(); }}>Refresh</Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv(shown)} disabled={!shown.length}>Export</Button>
          </>
        }
      />

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "accounts",
            label: (
              <Space size={6}>
                <TeamOutlined />
                Accounts <Badge count={users.length} color="#8c8c8c" overflowCount={999} />
              </Space>
            ),
            children: (
              <Card size="small">
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Space wrap size={8}>
                    <Input.Search allowClear placeholder="Name, username, email or division" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320, maxWidth: "100%" }} />
                    <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 200 }} options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: accountTypeLabel(t) }))]} />
                    <Text type="secondary">{shown.length === users.length ? `${users.length} accounts` : `${shown.length} of ${users.length} accounts`}</Text>
                  </Space>
                  {usersError && <Alert type="error" showIcon message={usersError} />}
                  <Table
                    rowKey="_id"
                    size="small"
                    bordered
                    loading={loadingUsers}
                    columns={userColumns}
                    dataSource={shown}
                    scroll={{ x: 900 }}
                    pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 50, 100], showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}` }}
                  />
                </Space>
              </Card>
            ),
          },
          {
            key: "requests",
            label: (
              <Space size={6}>
                <UserAddOutlined />
                Account Requests <Badge count={pending.length} />
              </Space>
            ),
            children: isDeveloper ? (
              <Card size="small">
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Segmented
                    value={requestView}
                    onChange={setRequestView}
                    options={[
                      { value: "pending", label: `Waiting (${pending.length})` },
                      { value: "approved", label: "Approved" },
                      { value: "rejected", label: "Declined" },
                      { value: "all", label: "All" },
                    ]}
                  />
                  <Table
                    rowKey="_id"
                    size="small"
                    bordered
                    loading={loadingRequests}
                    columns={requestColumns}
                    dataSource={requestRows}
                    scroll={{ x: 900 }}
                    pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={requestView === "pending" ? "No requests waiting" : "Nothing here"} /> }}
                  />
                </Space>
              </Card>
            ) : (
              <Alert type="info" showIcon message="Account requests are approved by the Developer." description="Requests from the Request Access page are reviewed and approved by a Developer, who sets the system and access the account gets." />
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.user.name || deleting.user.username}?` : ""}
        onCancel={() => setDeleting(null)}
        onOk={deleteAccount}
        okText="Delete account"
        okButtonProps={{ danger: true, disabled: deleting?.typed !== deleting?.user?.username }}
        destroyOnHidden
      >
        {deleting && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              The account, its sign-in sessions, its sign-up request, its storage PIN and its photo are removed. Entries it wrote in the activity trail are kept under its name, for the audit
              record. This cannot be undone.
            </div>
            <div>
              Type <strong>{deleting.user.username}</strong> to confirm.
            </div>
            <Input
              autoFocus
              value={deleting.typed}
              onChange={(e) => setDeleting({ ...deleting, typed: e.target.value })}
              onPressEnter={() => deleting.typed === deleting.user.username && deleteAccount()}
              placeholder={deleting.user.username}
            />
          </Space>
        )}
      </Modal>

      <Modal title="Account Details" open={Boolean(editingProfile)} onCancel={() => { setEditingProfile(null); loadUsers(); }} footer={null} destroyOnHidden width={800}>
        {editingProfile && <UserProfileModal user={editingProfile} onClose={() => { setEditingProfile(null); loadUsers(); }} />}
      </Modal>

      <Modal title="User Permission" open={Boolean(editingAccess)} footer={null} onCancel={() => { setEditingAccess(null); loadUsers(); }} width={800} destroyOnHidden>
        {editingAccess && (
          <AccountPermission
            visible
            onClose={() => { setEditingAccess(null); loadUsers(); }}
            onPermissionsUpdate={() => { setEditingAccess(null); loadUsers(); }}
            userData={{
              name: editingAccess.name,
              email: editingAccess.email,
              division: editingAccess.division,
              permission: editingAccess.permission,
              _id: editingAccess._id,
              nasContainers: editingAccess.nasContainers,
              username: editingAccess.username,
              avatar: editingAccess.avatar,
              status: editingAccess.presence,
            }}
          />
        )}
      </Modal>

      <ApproveRequestModal
        request={approving}
        open={Boolean(approving)}
        onClose={(created) => {
          setApproving(null);
          if (created) {
            loadRequests();
            loadUsers();
          }
        }}
      />
      <RejectRequestModal
        request={declining}
        open={Boolean(declining)}
        onClose={(declined) => {
          setDeclining(null);
          if (declined) loadRequests();
        }}
      />
    </Space>
  );
};

export default UserAccounts;
