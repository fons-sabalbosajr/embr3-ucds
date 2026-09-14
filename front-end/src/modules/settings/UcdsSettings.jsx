import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useSearchParams } from "react-router-dom";
import { CloudUploadOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { message } from "../../shared/feedback";
import { fetchCurrentUser } from "../../api/universeService";
import { API_BASE_URL } from "../../config/api";
import ContentLoading from "../../shared/components/ContentLoading";
import { useUcdsSettings } from "../../context/UcdsSettingsContext";
import { useYear } from "../../context/YearContext";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Universe Central DB settings.
//
// Four tabs, each backed by something the server enforces or a screen reads:
//
//   General         editing and export switches, both checked on the server
//   Data Management the year folders' spreadsheets and their import state,
//                   with import per dataset or per year (Developer)
//   Year Config     the year containers: create, archive, reopen, and the
//                   future-year lock the picker and /api/years/select apply
//   Display         the page sizes the register and dataset tables open with
//
// Everyone with UCDS may read; a Developer or Administrator may change.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

const PAGE_SIZES = [10, 25, 50, 100, 200].map((n) => ({ value: n, label: `${n} rows` }));

const UcdsSettings = () => {
  const [params, setParams] = useSearchParams();
  const tab = ["general", "data", "years", "display"].includes(params.get("tab")) ? params.get("tab") : "general";
  const [me, setMe] = useState(null);
  // Saving pushes the document to every open UCDS screen at once, and the
  // year rules to the sidebar and picker, so nothing waits for a reload.
  const { apply: applySettings } = useUcdsSettings();
  const { refresh: refreshYears } = useYear();
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canEdit = me?.role === "developer" || me?.role === "admin";
  const isDeveloper = me?.role === "developer";

  const load = useCallback(async () => {
    const [meBody, res] = await Promise.all([fetchCurrentUser().catch(() => ({})), api("/api/ucds/settings")]);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.message || "Could not load the settings.");
      return;
    }
    setMe(meBody);
    setSettings(body);
    setDraft(body);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = draft && settings && JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api("/api/ucds/settings", json("PUT", draft));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(body.message || "Could not save.");
        return;
      }
      setSettings(body);
      setDraft(body);
      applySettings(body);
      await refreshYears();
      message.success("Settings saved and applied.");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return error ? <Alert type="error" showIcon message={error} /> : <ContentLoading rows={6} />;

  const patch = (section, key, value) => setDraft({ ...draft, [section]: { ...draft[section], [key]: value } });

  const saveBar = (
    <Space style={{ marginTop: 16 }}>
      <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || !canEdit} onClick={save}>
        Save changes
      </Button>
      <Button disabled={!dirty} onClick={() => setDraft(settings)}>
        Discard
      </Button>
      {settings.updatedBy && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Last changed by {settings.updatedBy} · {new Date(settings.updatedAt).toLocaleString()}
        </Text>
      )}
    </Space>
  );

  const items = [
    {
      key: "general",
      label: "General",
      children: (
        <Card size="small" title="Datasets">
          <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }}>
            <Descriptions.Item label="Allow editing of dataset rows">
              <Space direction="vertical" size={2}>
                <Switch checked={draft.datasets.editing} disabled={!canEdit} onChange={(v) => patch("datasets", "editing", v)} />
                <Text type="secondary">
                  When off, nobody can add, change or delete rows in any imported dataset, whatever their account
                  allows. The server refuses the write. Use it while a year is being reconciled.
                </Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Allow CSV export">
              <Space direction="vertical" size={2}>
                <Switch checked={draft.datasets.export} disabled={!canEdit} onChange={(v) => patch("datasets", "export", v)} />
                <Text type="secondary">Shows the Export button on dataset screens and serves the download. Off blocks both.</Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          {saveBar}
        </Card>
      ),
    },
    {
      key: "data",
      label: "Data Management",
      children: <DataManagement isDeveloper={isDeveloper} />,
    },
    {
      key: "years",
      label: "Year Configuration",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small" title="Future years">
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }}>
              <Descriptions.Item label="Keep future containers locked">
                <Space direction="vertical" size={2}>
                  <Switch checked={draft.years.lockFuture} disabled={!canEdit} onChange={(v) => patch("years", "lockFuture", v)} />
                  <Text type="secondary">
                    A container for a year that has not started is listed but cannot be entered — on the picker, in
                    the sidebar and at the API. Turn off to open next year's container early (for example in December).
                  </Text>
                </Space>
              </Descriptions.Item>
            </Descriptions>
            {saveBar}
          </Card>
          <YearContainers canManage={canEdit} />
        </Space>
      ),
    },
    {
      key: "display",
      label: "Display",
      children: (
        <Card size="small" title="Tables">
          <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }}>
            <Descriptions.Item label="Monitoring Plan page size">
              <Space direction="vertical" size={2}>
                <Select value={draft.register.pageSize} options={PAGE_SIZES} disabled={!canEdit} onChange={(v) => patch("register", "pageSize", v)} style={{ width: 160 }} />
                <Text type="secondary">Rows per page when a province register opens. People can still change it on the screen.</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Dataset page size">
              <Space direction="vertical" size={2}>
                <Select value={draft.datasets.pageSize} options={PAGE_SIZES} disabled={!canEdit} onChange={(v) => patch("datasets", "pageSize", v)} style={{ width: 160 }} />
                <Text type="secondary">Rows per page when an imported dataset opens.</Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          {saveBar}
        </Card>
      ),
    },
  ];

  return (
    <Card title="Universe Central DB" styles={{ body: { paddingTop: 8 } }}>
      {!canEdit && me && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Only a Developer or Administrator can change these settings." />}
      <Tabs items={items} activeKey={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
    </Card>
  );
};

// --- Data Management ----------------------------------------------------------

const DataManagement = ({ isDeveloper }) => {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/ucds/datasets/registry");
      const body = await res.json().catch(() => ({}));
      setYears(body.years || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const importNow = (year, key, label) => {
    Modal.confirm({
      title: key ? `Import ${label} (${year})?` : `Import every ${year} spreadsheet?`,
      content: "Rows already imported for the same dataset are replaced by the spreadsheet in the data folder. Edits made in the application since the last import are lost.",
      okText: "Import",
      onOk: async () => {
        setBusy(`${year}:${key || "*"}`);
        try {
          const res = await api("/api/ucds/datasets/import-year", json("POST", { year, key }));
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            message.error(body.message || "Import failed.");
            return;
          }
          const ok = body.results.filter((r) => r.ok);
          const failed = body.results.filter((r) => !r.ok);
          message[failed.length ? "warning" : "success"](
            `${ok.length} imported (${ok.reduce((n, r) => n + r.rowCount, 0).toLocaleString()} rows)${failed.length ? `; ${failed.length} failed: ${failed.map((f) => `${f.key} — ${f.message}`).join("; ")}` : ""}`
          );
          await load();
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const rows = years.flatMap((y) => y.datasets.map((d) => ({ ...d, year: y.year, id: `${y.year}:${d.key}` })));

  const columns = [
    { title: "Year", dataIndex: "year", width: 80, sorter: (a, b) => a.year - b.year, defaultSortOrder: "ascend" },
    { title: "Dataset", dataIndex: "label", render: (v, r) => <Space><Text strong>{v}</Text>{r.kind === "monitoring-plan" && <Tag color="blue">register</Tag>}</Space> },
    { title: "Files", dataIndex: "fileCount", width: 70, align: "right" },
    {
      title: "In the application",
      key: "state",
      render: (_, r) =>
        r.kind === "monitoring-plan" ? (
          <Text type="secondary">edited on the Province screens</Text>
        ) : r.imported ? (
          <Text>
            {r.rowCount.toLocaleString()} rows · {r.sheets.length} sheet(s) · {new Date(r.importedAt).toLocaleDateString()}
          </Text>
        ) : (
          <Tag color="orange">not imported</Tag>
        ),
    },
    {
      title: "",
      key: "act",
      width: 130,
      render: (_, r) =>
        isDeveloper && r.kind === "table" ? (
          <Button size="small" icon={<CloudUploadOutlined />} loading={busy === r.id} onClick={() => importNow(r.year, r.key, r.label)}>
            {r.imported ? "Re-import" : "Import"}
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      size="small"
      title="Spreadsheets in the year folders"
      extra={
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          {isDeveloper &&
            years.map((y) => (
              <Button key={y.year} size="small" loading={busy === `${y.year}:*`} onClick={() => importNow(y.year, null)}>
                Import all {y.year}
              </Button>
            ))}
        </Space>
      }
    >
      <Paragraph type="secondary">
        What the server finds under <Text code>data/ucd &lt;year&gt;/</Text>, and whether each spreadsheet has been read
        into the application. Importing replaces that dataset's rows for that year; nothing else is touched.
      </Paragraph>
      <Table size="small" rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 720 }} />
    </Card>
  );
};

// --- Year containers ------------------------------------------------------------

const YearContainers = ({ canManage }) => {
  const { refresh: refreshYears } = useYear();
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/years");
      const body = await res.json().catch(() => ({}));
      setYears((body.years || []).sort((a, b) => a.year - b.year));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
    else setLoading(false);
  }, [load, canManage]);

  const setStatus = async (year, status) => {
    const res = await api(`/api/admin/years/${year}`, json("PATCH", { status }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return message.error(body.error || "Could not update the container.");
    message.success(`${year} ${status === "archived" ? "archived" : "reopened"}.`);
    await refreshYears();
    return load();
  };

  // Two switches the status does not cover. Hidden takes the year off every
  // picker and menu without archiving it; locked keeps it listed but refuses
  // entry — a single year closed for editing, unlike the future-years rule
  // that closes all of them at once.
  const setFlag = async (year, flag, value) => {
    const res = await api(`/api/admin/years/${year}`, json("PATCH", { [flag]: value }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return message.error(body.error || "Could not update the container.");
    message.success(
      flag === "hidden" ? `${year} is now ${value ? "hidden" : "visible"}.` : `${year} ${value ? "locked" : "unlocked"}.`
    );
    await refreshYears();
    return load();
  };

  const create = async (values) => {
    const res = await api("/api/admin/years", json("POST", values));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return message.error(body.error || "Could not create the container.");
    message.success(`${values.year} created.`);
    setAdding(false);
    form.resetFields();
    await refreshYears();
    return load();
  };

  if (!canManage) return null;

  const thisYear = new Date().getFullYear();
  return (
    <Card
      size="small"
      title="Year containers"
      styles={{ body: { paddingTop: 8 } }}
      extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add year</Button>}
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        Visible takes a year off every picker and menu without archiving it. Locked keeps it listed but refuses entry until unlocked —
        one year at a time, independent of the future-years rule above.
      </Text>
      <Table
        size="small"
        rowKey="year"
        loading={loading}
        dataSource={years}
        pagination={false}
        columns={[
          { title: "Year", dataIndex: "year", width: 80 },
          { title: "Label", dataIndex: "label" },
          {
            title: "Status",
            dataIndex: "status",
            width: 140,
            render: (s, r) => (
              <Space size={4}>
                <Tag color={s === "active" ? "green" : "default"}>{s}</Tag>
                {r.year > thisYear && <Tag>upcoming</Tag>}
                {r.year === thisYear && <Tag color="processing">current</Tag>}
                {r.hidden && <Tag color="default">hidden</Tag>}
                {r.locked && <Tag color="red">locked</Tag>}
              </Space>
            ),
          },
          {
            title: "Visible",
            dataIndex: "hidden",
            width: 90,
            align: "center",
            render: (hidden, r) => (
              <Switch
                size="small"
                checked={!hidden}
                onChange={(v) => setFlag(r.year, "hidden", !v)}
                title={hidden ? "Show this year on pickers and menus" : "Hide this year from every picker and menu"}
              />
            ),
          },
          {
            title: "Locked",
            dataIndex: "locked",
            width: 90,
            align: "center",
            render: (locked, r) => (
              <Switch
                size="small"
                checked={Boolean(locked)}
                onChange={(v) => setFlag(r.year, "locked", v)}
                title={locked ? "Unlock: allow entering this year again" : "Lock: keep the year listed but refuse entry"}
              />
            ),
          },
          { title: "Provinces", dataIndex: "provinces", render: (p) => (p?.length ? p.join(", ") : <Text type="secondary">all</Text>) },
          {
            title: "",
            key: "act",
            width: 120,
            render: (_, r) =>
              r.status === "active" ? (
                <Popconfirm title={`Archive ${r.year}?`} description="Nobody can enter it until it is reopened. Data is kept." onConfirm={() => setStatus(r.year, "archived")}>
                  <Button size="small" danger>Archive</Button>
                </Popconfirm>
              ) : (
                <Button size="small" onClick={() => setStatus(r.year, "active")}>Reopen</Button>
              ),
          },
        ]}
      />
      <Modal open={adding} title="Add a year container" onCancel={() => setAdding(false)} onOk={() => form.submit()} okText="Create" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={create} initialValues={{ year: thisYear + 1 }}>
          <Form.Item name="year" label="Year" rules={[{ required: true, message: "Enter the year." }]}>
            <Input type="number" min={2000} max={2100} />
          </Form.Item>
          <Form.Item name="label" label="Label" extra="Defaults to “<year> Data”.">
            <Input placeholder="e.g. 2032 Data" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UcdsSettings;
