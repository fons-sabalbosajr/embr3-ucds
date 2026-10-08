import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SettingOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import {
  describeApiError,
  fetchErmsConfig,
  fetchLookupList,
  resetErmsConfig,
  saveErmsConfig,
  saveLookupList,
} from "../../erms/api/ermsService";
import { UNIT_THEME } from "../../erms/units/unitTheme";
import LookupListEditor from "../../erms/components/LookupListEditor";

const { Text, Paragraph, Title } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings > ERMS Config.
//
// Everything ERMS is configured with, in one place: for each unit, its
// document types and the form each asks for, the serial format each is
// numbered in, and how its share is laid out; the upload limits; and the
// menus (the lookup lists the forms offer). The desktop system kept these
// in three Settings screens and in code; the server keeps them in one
// document and serves the defaults — which are the legacy layout — until
// something is saved here. "Back to the legacy layout" puts them back.
// ---------------------------------------------------------------------------

const UNITS = ["records", "legal", "laboratory"];
const LOOKUP_KINDS = [
  "project-types", "document-statuses", "legal-statuses", "legal-officers", "case-handlers",
  "nature-of-business", "lab-parameters", "provinces", "cities", "barangays", "legal-dockets", "document-types",
];

const uid = () => Math.random().toString(36).slice(2, 8);

// --- the fields of one document type --------------------------------------------------

const FieldsEditor = ({ open, docType, fieldTypes, lookupKinds, onClose, onSave }) => {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (open) setRows((docType?.fields || []).map((f) => ({ ...f, _id: uid() })));
  }, [open, docType]);

  const patch = (id, changes) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...changes } : r)));
  const columns = [
    { title: "Key", dataIndex: "key", width: 160, render: (v, r) => <Input value={v} onChange={(e) => patch(r._id, { key: e.target.value.replace(/[^a-zA-Z0-9]/g, "") })} placeholder="camelCase" /> },
    { title: "Label", dataIndex: "label", render: (v, r) => <Input placeholder="Label shown on the form" value={v} onChange={(e) => patch(r._id, { label: e.target.value })} /> },
    { title: "Type", dataIndex: "type", width: 130, render: (v, r) => <Select placeholder="Field type" value={v} onChange={(t) => patch(r._id, { type: t })} options={fieldTypes.map((t) => ({ value: t, label: t }))} style={{ width: "100%" }} /> },
    {
      title: "List / options",
      width: 200,
      render: (_, r) =>
        r.type === "lookup" ? (
          <Select value={r.lookup} onChange={(k) => patch(r._id, { lookup: k })} options={lookupKinds.map((k) => ({ value: k, label: k }))} style={{ width: "100%" }} placeholder="menu" />
        ) : r.type === "select" ? (
          <Input value={(r.options || []).join(", ")} onChange={(e) => patch(r._id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="a, b, c" />
        ) : (
          <Input value={r.placeholder || ""} onChange={(e) => patch(r._id, { placeholder: e.target.value })} placeholder="placeholder" />
        ),
    },
    { title: "Required", dataIndex: "required", width: 90, align: "center", render: (v, r) => <Checkbox checked={v === true} onChange={(e) => patch(r._id, { required: e.target.checked })} /> },
    { title: "", width: 40, render: (_, r) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setRows((rs) => rs.filter((x) => x._id !== r._id))} /> },
  ];

  return (
    <Modal
      open={open}
      title={`Form fields — ${docType?.label || ""}`}
      width={960}
      onCancel={onClose}
      onOk={() => onSave(rows.filter((r) => r.key && r.label).map(({ _id, ...f }) => f))}
      okText="Apply"
      destroyOnHidden
    >
      <Paragraph type="secondary">
        What the upload form asks for, in this order. A <Text code>lookup</Text> field offers one of the menus; a{" "}
        <Text code>select</Text> field offers the options listed. Keys are how the values are stored — change one and existing documents keep the old key.
      </Paragraph>
      <Table rowKey="_id" size="small" pagination={false} columns={columns} dataSource={rows} />
      <Button icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setRows((rs) => [...rs, { _id: uid(), key: "", label: "", type: "text", required: false }])}>
        Add a field
      </Button>
    </Modal>
  );
};

// --- one unit's tab ------------------------------------------------------------------------

const UnitTab = ({ unitKey, unit, fieldTypes, folderTokens, lookupKinds, onChange }) => {
  const theme = UNIT_THEME[unitKey];
  const isRecords = unitKey === "records";
  const [editingType, setEditingType] = useState(null);

  const patch = (changes) => onChange({ ...unit, ...changes });
  const patchFolder = (changes) => patch({ folder: { ...unit.folder, ...changes } });
  const patchType = (code, changes) => patch({ docTypes: unit.docTypes.map((t) => (t.code === code ? { ...t, ...changes } : t)) });

  const typeColumns = [
    { title: "Code", dataIndex: "code", width: 130, render: (v) => <Text code>{v}</Text> },
    { title: "Label", dataIndex: "label", render: (v, t) => <Input placeholder="Label shown in lists" value={v} onChange={(e) => patchType(t.code, { label: e.target.value })} /> },
    { title: "Folder on the share", dataIndex: "folder", width: 180, render: (v, t) => <Input value={v} onChange={(e) => patchType(t.code, { folder: e.target.value })} placeholder="(none)" /> },
    isRecords
      ? { title: "File prefix", dataIndex: "filePrefix", width: 140, render: (v, t) => <Input value={v} onChange={(e) => patchType(t.code, { filePrefix: e.target.value })} placeholder="ECC_Original" /> }
      : {
          title: "Serial",
          width: 220,
          render: (_, t) => (
            <Space.Compact>
              <Input value={t.serial?.prefix} onChange={(e) => patchType(t.code, { serial: { ...t.serial, prefix: e.target.value } })} style={{ width: 130 }} />
              <InputNumber value={t.serial?.pad} min={3} max={10} onChange={(n) => patchType(t.code, { serial: { ...t.serial, pad: n || 5 } })} style={{ width: 70 }} />
            </Space.Compact>
          ),
        },
    !isRecords && { title: "Fields", width: 110, render: (_, t) => <Button size="small" icon={<SettingOutlined />} onClick={() => setEditingType(t)}>{(t.fields || []).length} fields</Button> },
    {
      title: "",
      width: 40,
      render: (_, t) => (
        <Popconfirm title={`Remove ${t.label}?`} description="Existing documents keep their type; it just cannot be chosen for new ones." onConfirm={() => patch({ docTypes: unit.docTypes.filter((x) => x.code !== t.code) })}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ].filter(Boolean);

  const addType = () => {
    let code = "";
    Modal.confirm({
      title: "New document type",
      content: <Input placeholder="code, e.g. cdo" onChange={(e) => { code = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); }} />,
      onOk: () => {
        if (!code || unit.docTypes.some((t) => t.code === code)) {
          message.error("Enter a code that is not in use.");
          return Promise.reject();
        }
        patch({
          docTypes: [
            ...unit.docTypes,
            isRecords
              ? { code, label: code.toUpperCase(), folder: "", filePrefix: "", fields: [] }
              : { code, label: code.toUpperCase(), folder: "", serial: { prefix: `FSN-${code.toUpperCase()}-`, pad: 5 }, fields: [] },
          ],
        });
        return undefined;
      },
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card size="small" title={<Space><span style={{ color: theme.accent }}>{theme.icon}</span>Unit</Space>} style={{ borderTop: `3px solid ${theme.accent}` }}>
        <Descriptions column={1} size="small" bordered labelStyle={{ width: 220 }}>
          <Descriptions.Item label="Name">
            <Input placeholder="Unit name" value={unit.label} onChange={(e) => patch({ label: e.target.value })} style={{ maxWidth: 320 }} />
          </Descriptions.Item>
          <Descriptions.Item label="Storage container">
            <Space>
              <Input placeholder="e.g. legal" value={unit.container} onChange={(e) => patch({ container: e.target.value })} style={{ width: 200 }} />
              <Text type="secondary">the container key under Storage Configuration</Text>
            </Space>
          </Descriptions.Item>
          {isRecords && (
            <Descriptions.Item label="Serial">
              <Space.Compact>
                <Input value={unit.serial?.prefix} onChange={(e) => patch({ serial: { ...unit.serial, prefix: e.target.value } })} style={{ width: 130 }} />
                <InputNumber value={unit.serial?.pad} min={3} max={10} onChange={(n) => patch({ serial: { ...unit.serial, pad: n || 7 } })} style={{ width: 70 }} />
              </Space.Compact>
            </Descriptions.Item>
          )}
          {unit.docket && (
            <Descriptions.Item label="Docket numbers">
              <Space direction="vertical" size={6}>
                <Space wrap>
                  <Space.Compact>
                    <Input value={unit.docket.prefix} onChange={(e) => patch({ docket: { ...unit.docket, prefix: e.target.value.toUpperCase() } })} style={{ width: 110 }} />
                    <InputNumber value={unit.docket.pad} min={1} max={6} onChange={(n) => patch({ docket: { ...unit.docket, pad: n || 3 } })} style={{ width: 70 }} />
                  </Space.Compact>
                  <Text type="secondary">
                    e.g. <Text code>{`${unit.docket.prefix}-${new Date().getFullYear()}-PA-${"1".padStart(unit.docket.pad, "0")}`}</Text>, one register per province and year
                  </Text>
                </Space>
                <Space wrap>
                  <Text type="secondary">Issued on</Text>
                  <Select
                    mode="multiple"
                    value={unit.docket.issueOn}
                    onChange={(issueOn) => patch({ docket: { ...unit.docket, issueOn } })}
                    options={unit.docTypes.map((t) => ({ value: t.code, label: t.label }))}
                    style={{ minWidth: 260 }}
                    placeholder="the document types that open a case"
                  />
                </Space>
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card size="small" title="Filing on the share">
        <Paragraph type="secondary">
          Where an uploaded scan lands. The tokens {folderTokens.map((t) => <Text code key={t}>{t}</Text>)} are filled from the
          document being filed; <Text code>{"{yearRange}"}</Text> is the desktop system’s five-year bucket (2021-2025).
        </Paragraph>
        <Descriptions column={1} size="small" bordered labelStyle={{ width: 220 }}>
          <Descriptions.Item label="Root folder"><Input placeholder="Top folder on the share" value={unit.folder.root} onChange={(e) => patchFolder({ root: e.target.value })} /></Descriptions.Item>
          <Descriptions.Item label="Pattern"><Input placeholder="e.g. {year}/{folder}" value={unit.folder.pattern} onChange={(e) => patchFolder({ pattern: e.target.value })} /></Descriptions.Item>
          <Descriptions.Item label="{folder} comes from">
            <Space>
              <Input placeholder="Field key, e.g. companyName" value={unit.folder.folderField} onChange={(e) => patchFolder({ folderField: e.target.value })} style={{ width: 240 }} />
              <Text type="secondary">a field key (companyName, firmName, projectTitle)</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="{year} comes from">
            <Space>
              <Input placeholder="Date field key, e.g. dateFiled" value={unit.folder.yearField} onChange={(e) => patchFolder({ yearField: e.target.value })} style={{ width: 240 }} />
              <Text type="secondary">a date field; the upload date when empty</Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        size="small"
        title={isRecords ? "Permit types" : "Document types"}
        extra={<Button size="small" icon={<PlusOutlined />} onClick={addType}>Add</Button>}
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {isRecords
            ? "The permit kinds the Records Unit files. The record form is fixed; each kind has its folder and the prefix its file names carry."
            : "What this unit files. Each has its own form (Fields), its own serial sequence, and its own folder under the company or station."}
        </Paragraph>
        <Table rowKey="code" size="small" pagination={false} columns={typeColumns} dataSource={unit.docTypes} />
      </Card>

      <FieldsEditor
        open={Boolean(editingType)}
        docType={editingType}
        fieldTypes={fieldTypes}
        lookupKinds={lookupKinds}
        onClose={() => setEditingType(null)}
        onSave={(fields) => {
          patchType(editingType.code, { fields });
          setEditingType(null);
        }}
      />
    </Space>
  );
};

// --- the menus -----------------------------------------------------------------------------

const MenusTab = ({ kinds }) => {
  const queryClient = useQueryClient();
  return (
    <LookupListEditor
      kinds={kinds.map((k) => ({ value: k, label: k }))}
      load={fetchLookupList}
      save={saveLookupList}
      queryKey={(kind) => ["erms", "config", "lookup", kind]}
      onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["erms", "lookups"] });
        queryClient.invalidateQueries({ queryKey: ["erms", "config"] });
        queryClient.invalidateQueries({ queryKey: ["erms", "unit-lookups"] });
      }}
    />
  );
};

// --- the screen --------------------------------------------------------------------------------

const ErmsConfig = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["erms", "config"], queryFn: fetchErmsConfig });
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (data) setDraft({ units: data.units, upload: data.upload });
  }, [data]);

  const dirty = data && draft && JSON.stringify({ units: data.units, upload: data.upload }) !== JSON.stringify(draft);

  const save = useMutation({
    mutationFn: () => saveErmsConfig(draft),
    onSuccess: () => {
      message.success("ERMS configuration saved. It applies to the next upload; open screens pick it up within a minute.");
      queryClient.invalidateQueries({ queryKey: ["erms", "config"] });
      queryClient.invalidateQueries({ queryKey: ["erms", "units"] });
    },
    onError: (e) => message.error(describeApiError(e, "Could not save the configuration.")),
  });
  const reset = useMutation({
    mutationFn: resetErmsConfig,
    onSuccess: () => {
      message.success("Back to the legacy layout.");
      queryClient.invalidateQueries({ queryKey: ["erms", "config"] });
      queryClient.invalidateQueries({ queryKey: ["erms", "units"] });
    },
    onError: (e) => message.error(describeApiError(e, "Could not reset.")),
  });

  if (error) return <Alert type="error" showIcon message={describeApiError(error, "Could not load the ERMS configuration.")} />;
  if (isLoading || !draft) return <Card loading />;

  const lookupKinds = Object.keys(data.lookups || {}).length ? Object.keys(data.lookups) : LOOKUP_KINDS;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card size="small">
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space direction="vertical" size={0}>
            <Title level={4} style={{ margin: 0 }}>ERMS Config</Title>
            <Text type="secondary">
              The three units, what each files and how, the upload limits, and the menus.
              {data.updatedAt ? ` Last saved ${new Date(data.updatedAt).toLocaleString()} by ${data.updatedBy}.` : " Currently the legacy layout, unchanged."}
            </Text>
          </Space>
          <Space>
            <Popconfirm title="Back to the legacy layout?" description="Every unit, type and field goes back to what the desktop system used. Menus are kept." onConfirm={() => reset.mutate()}>
              <Button icon={<ReloadOutlined />} loading={reset.isPending}>Back to the legacy layout</Button>
            </Popconfirm>
            <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              Save configuration
            </Button>
          </Space>
        </Space>
      </Card>

      <Tabs
        items={[
          ...UNITS.map((u) => ({
            key: u,
            label: <Space><span style={{ color: UNIT_THEME[u].accent }}>{UNIT_THEME[u].icon}</span>{UNIT_THEME[u].short}</Space>,
            children: (
              <UnitTab
                unitKey={u}
                unit={draft.units[u]}
                fieldTypes={data.fieldTypes || []}
                folderTokens={data.folderTokens || []}
                lookupKinds={lookupKinds}
                onChange={(next) => setDraft((d) => ({ ...d, units: { ...d.units, [u]: next } }))}
              />
            ),
          })),
          {
            key: "upload",
            label: "Upload",
            children: (
              <Card size="small" title="Upload limits">
                <Descriptions column={1} size="small" bordered labelStyle={{ width: 220 }}>
                  <Descriptions.Item label="Largest file (MB)">
                    <InputNumber value={draft.upload.maxMb} min={1} max={256} onChange={(n) => setDraft((d) => ({ ...d, upload: { ...d.upload, maxMb: n || 100 } }))} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Accepted file types">
                    <Select
                      mode="tags"
                      value={draft.upload.allowedExtensions}
                      onChange={(v) => setDraft((d) => ({ ...d, upload: { ...d.upload, allowedExtensions: v.map((x) => (x.startsWith(".") ? x : `.${x}`).toLowerCase()) } }))}
                      style={{ width: "100%", maxWidth: 520 }}
                      tokenSeparators={[",", " "]}
                    />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          { key: "menus", label: "Menus", children: <MenusTab kinds={lookupKinds} /> },
        ]}
      />
    </Space>
  );
};

export default ErmsConfig;
