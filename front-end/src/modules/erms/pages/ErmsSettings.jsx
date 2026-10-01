import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  AuditOutlined,
  CopyOutlined,
  DesktopOutlined,
  EditOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { message } from "../../../shared/feedback";
import {
  PROVINCE_LABEL,
  describeApiError,
  fetchDuplicateGroups,
  fetchRecords,
  fetchUnitActivity,
  fetchUnitDocuments,
  fetchUnitDuplicateGroups,
  fetchUnitSettings,
  fetchUnits,
  resetUnitSettings,
  saveUnitSettings,
} from "../api/ermsService";
import RecordFormModal from "../components/RecordFormModal";
import { unitTheme } from "../units/unitTheme";

const SECTIONS = ["data", "duplicates", "privacy", "pdf", "audit", "log"];

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Settings › ERMS — a unit's working rules, set by its own staff.
//
// Each tab is one concern, and each setting is enforced somewhere named in
// its description: the record form, the library, the viewer, the trail. The
// Records Unit's tabs also carry the tools that go with the rule — the
// records needing review, the permit numbers filed twice — so the rule and
// the fix are in one place.
// ---------------------------------------------------------------------------

const UNIT_LABEL = { records: "Records", legal: "Legal Services", laboratory: "Laboratory" };

const Rule = ({ name, label, help, valuePropName = "checked", children }) => (
  <Form.Item name={name} label={label} extra={help} valuePropName={valuePropName} style={{ marginBottom: 14 }}>
    {children}
  </Form.Item>
);

/** Records whose values could not be interpreted — with the form to fix them. */
const NeedsReview = () => {
  const [editing, setEditing] = useState(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["erms", "records", { flagged: true, page: 1, pageSize: 50 }],
    queryFn: () => fetchRecords({ flagged: true, page: 1, pageSize: 50, sortBy: "document.uploadedAt", sortDir: -1 }),
  });
  const columns = [
    { title: "FSN", dataIndex: "serialNo", key: "serialNo", width: 140, render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
    { title: "Permit", dataIndex: ["permit", "number"], key: "permit", width: 200, render: (v) => v || "—" },
    { title: "Proponent", dataIndex: "proponentName", key: "proponent", ellipsis: true },
    { title: "Province", dataIndex: ["location", "province"], key: "province", width: 120, render: (p) => PROVINCE_LABEL[p] || p || "—" },
    { title: "", key: "fix", width: 80, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>Fix</Button> },
  ];
  return (
    <Card size="small" title={<Space><ToolOutlined />Records that need review{data ? <Text type="secondary">{new Intl.NumberFormat().format(data.total)}</Text> : null}</Space>} extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()} />}>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        A value that could not be interpreted during migration — usually a date. The original text is kept on the record; open it, enter the value properly, and the flag clears.
        {data?.total > 50 ? " Showing the first 50; the rest are in the library under “Needs review”." : ""}
      </Paragraph>
      <Table size="small" rowKey="serialNo" loading={isLoading} columns={columns} dataSource={data?.items || []} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing needs review" /> }} />
      <RecordFormModal open={Boolean(editing)} record={editing} writableProvinces={null} onClose={() => { setEditing(null); refetch(); }} />
    </Card>
  );
};

/** Permit numbers filed more than once. */
const DuplicateGroups = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["erms", "duplicate-groups"], queryFn: fetchDuplicateGroups, staleTime: 5 * 60 * 1000 });
  const columns = [
    { title: "Permit number", dataIndex: "permitNumber", key: "permitNumber", width: 220, render: (v) => <Link to={`/universe/erms/records?search=${encodeURIComponent(v)}`}>{v}</Link> },
    { title: "Filed", dataIndex: "count", key: "count", width: 70, align: "right" },
    { title: "As", dataIndex: "serials", key: "serials", render: (s) => <Space size={4} wrap>{s.map((x) => <Tag key={x} style={{ fontFamily: "monospace" }}>{x}</Tag>)}</Space> },
    { title: "Proponents", dataIndex: "proponents", key: "proponents", ellipsis: true, render: (p) => p.filter(Boolean).join(" · ") },
  ];
  return (
    <Card size="small" title={<Space><CopyOutlined />Permit numbers filed more than once{data ? <Text type="secondary">{data.length}</Text> : null}</Space>} extra={<Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} />}>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Some are legitimate — an original and its amendment, an attachment — and some are the same document filed twice. Open the permit number in the library to decide.
      </Paragraph>
      <Table size="small" rowKey="permitNumber" loading={isLoading} columns={columns} dataSource={data || []} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No permit number is filed twice" /> }} />
    </Card>
  );
};

/** A unit's documents that name no file on the share. */
const UnitMissingFiles = ({ unit }) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["erms", "unit", unit, "documents", { missingFile: true }],
    queryFn: () => fetchUnitDocuments(unit, { missingFile: true, pageSize: 50 }),
  });
  const columns = [
    { title: "Serial", dataIndex: "serialNo", key: "serialNo", width: 160, render: (s) => <Link to={`/universe/erms/${unit}/documents/${encodeURIComponent(s)}`} style={{ fontFamily: "monospace" }}>{s}</Link> },
    { title: "Title", dataIndex: "title", key: "title", ellipsis: true },
    { title: "Type", dataIndex: "docTypeLabel", key: "type", width: 200, render: (v, d) => v || d.docType },
    { title: "Province", dataIndex: "provinceLabel", key: "province", width: 120, render: (v, d) => v || d.province || "—" },
  ];
  return (
    <Card size="small" title={<Space><ToolOutlined />Documents without a file on the share{data ? <Text type="secondary">{new Intl.NumberFormat().format(data.total)}</Text> : null}</Space>} extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()} />}>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Entries the desktop system kept without a scan, or whose scan could not be placed. Open one to file the scan against it.
      </Paragraph>
      <Table size="small" rowKey="serialNo" loading={isLoading} columns={columns} dataSource={data?.items || []} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every document has its file" /> }} />
    </Card>
  );
};

/** File names filed more than once in a unit. */
const UnitDuplicateGroups = ({ unit }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["erms", "unit", unit, "duplicate-groups"], queryFn: () => fetchUnitDuplicateGroups(unit), staleTime: 5 * 60 * 1000 });
  const columns = [
    { title: "File name", dataIndex: "fileName", key: "fileName", ellipsis: true, render: (v) => <Link to={`/universe/erms/${unit}/documents?search=${encodeURIComponent(v)}`}>{v}</Link> },
    { title: "Filed", dataIndex: "count", key: "count", width: 70, align: "right" },
    { title: "As", dataIndex: "serials", key: "serials", width: 320, render: (s) => <Space size={4} wrap>{s.map((x) => <Tag key={x} style={{ fontFamily: "monospace" }}>{x}</Tag>)}</Space> },
  ];
  return (
    <Card size="small" title={<Space><CopyOutlined />File names filed more than once{data ? <Text type="secondary">{data.length}</Text> : null}</Space>} extra={<Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} />}>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        The same scan filed twice, or a name reused for two documents. Open the file name in the documents list to decide.
      </Paragraph>
      <Table size="small" rowKey="fileName" loading={isLoading} columns={columns} dataSource={data || []} pagination={{ defaultPageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No file name is filed twice" /> }} />
    </Card>
  );
};

/** The unit's log history. */
const LogHistory = ({ unit }) => {
  const [q, setQ] = useState("");
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["erms", "activity", unit, q], queryFn: () => fetchUnitActivity(unit, { q, limit: 200 }) });
  const columns = [
    { title: "When", dataIndex: "at", key: "at", width: 160, render: (d) => new Date(d).toLocaleString() },
    { title: "Who", dataIndex: "who", key: "who", width: 140, render: (v) => v || <Text type="secondary">—</Text> },
    { title: "What", key: "what", render: (_, r) => (
      <Space size={6} wrap>
        <Tag color={r.success ? (r.source === "document" ? "blue" : "default") : "red"}>{r.label}</Tag>
        {r.serialNo && <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{r.serialNo}</Text>}
        {r.fileName && <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: r.fileName }}>{r.fileName}</Text>}
        {r.detail && <Text type="secondary" style={{ fontSize: 12 }}>{r.detail}</Text>}
      </Space>
    ) },
    { title: "From", dataIndex: "ip", key: "ip", width: 130, render: (v) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : "" },
  ];
  return (
    <Card
      size="small"
      title={<Space><HistoryOutlined />Log history{data ? <Text type="secondary">since {new Date(data.since).toLocaleDateString()}</Text> : null}</Space>}
      extra={
        <Space>
          <Input.Search size="small" allowClear placeholder="Person, FSN, file, action" style={{ width: 260 }} onSearch={setQ} prefix={<SearchOutlined />} />
          <Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} />
        </Space>
      }
    >
      <Table size="small" rowKey="id" loading={isLoading} columns={columns} dataSource={data?.events || []} pagination={{ defaultPageSize: 25 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in the period" /> }} />
      {unit === "records" && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          <DesktopOutlined /> The desktop system&rsquo;s own log for a document is on the record&rsquo;s Tracking tab.
        </Text>
      )}
    </Card>
  );
};

const ErmsSettings = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Each section is its own entry in the sidebar; the tab follows the URL.
  const { section } = useParams();
  const activeTab = SECTIONS.includes(section) ? section : "data";
  const [form] = Form.useForm();
  const { data: units } = useQuery({ queryKey: ["erms", "units"], queryFn: fetchUnits, staleTime: 5 * 60 * 1000 });
  const mine = useMemo(() => units?.units || [], [units]);
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!unit && units) setUnit(units.home || mine[0]?.key || null);
  }, [units, unit, mine]);

  const { data, isLoading, error } = useQuery({ queryKey: ["erms", "unit-settings", unit], queryFn: () => fetchUnitSettings(unit), enabled: Boolean(unit) });
  useEffect(() => {
    if (data?.settings) form.setFieldsValue(data.settings);
  }, [data, form]);

  const save = useMutation({
    mutationFn: (settings) => saveUnitSettings({ unit, settings }),
    onSuccess: () => {
      message.success("Settings saved.");
      queryClient.invalidateQueries({ queryKey: ["erms", "unit-settings", unit] });
    },
    onError: (e) => message.error(describeApiError(e, "The settings could not be saved.")),
  });
  const reset = useMutation({
    mutationFn: () => resetUnitSettings(unit),
    onSuccess: () => {
      message.success("Settings returned to their defaults.");
      queryClient.invalidateQueries({ queryKey: ["erms", "unit-settings", unit] });
    },
    onError: (e) => message.error(describeApiError(e, "Could not reset.")),
  });

  const canEdit = data?.canEdit === true;
  const watchedClassifications = Form.useWatch(["privacy", "classifications"], form);
  const classifications = useMemo(() => watchedClassifications || data?.settings?.privacy?.classifications || [], [watchedClassifications, data]);
  const isRecords = unit === "records";
  const accent = unit && unit !== "records" ? unitTheme(unit).accent : undefined;

  const tabs = useMemo(() => [
    {
      key: "data",
      label: <Space size={6}><ToolOutlined />Data quality</Space>,
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {isRecords ? (
            <Card size="small" title="What a record must have before it is saved">
              <Rule name={["dataQuality", "requirePermitNumber"]} label="Permit / reference number required" help="Enforced by the record form and the API on every new record. Migrated records without one are fixed from the list below, not refused."><Switch disabled={!canEdit} /></Rule>
              <Rule name={["dataQuality", "requireDateApproved"]} label="Date approved required" help="A record filed without its approval date cannot be placed in the year folders the way the desktop system did."><Switch disabled={!canEdit} /></Rule>
              <Rule name={["dataQuality", "requireProjectType"]} label="Project type required"><Switch disabled={!canEdit} /></Rule>
            </Card>
          ) : (
            <Alert
              type="info"
              showIcon
              message="What a document must have before it is filed"
              description="Each document type's form decides its required fields — set under Admin Settings › ERMS Config › the unit's document types. The upload form and the API enforce them on every document filed here."
            />
          )}
          {isRecords ? <NeedsReview /> : unit && <UnitMissingFiles unit={unit} />}
        </Space>
      ),
    },
    {
      key: "duplicates",
      label: <Space size={6}><CopyOutlined />Duplicates</Space>,
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small" title={isRecords ? "When a permit number or file is already filed" : "When a file is already filed"}>
            {isRecords && <Rule name={["duplicates", "warnOnPermitNumber"]} label="Warn on the form when the permit number is already filed" help="The form shows the existing record(s) as the number is typed; the clerk may still go ahead."><Switch disabled={!canEdit} /></Rule>}
            <Rule name={["duplicates", "warnOnFileName"]} label="Warn when a scan with the same file name is already filed" help="The upload form shows the existing document(s) when the chosen file's name is already on file."><Switch disabled={!canEdit} /></Rule>
            {isRecords && <Rule name={["duplicates", "blockOnPermitNumber"]} label="Refuse a second record with the same permit number" help="Enforced by the API. An amendment or an attachment then has to be filed against the existing record rather than as a new one."><Switch disabled={!canEdit} /></Rule>}
          </Card>
          {isRecords ? <DuplicateGroups /> : unit && <UnitDuplicateGroups unit={unit} />}
        </Space>
      ),
    },
    {
      key: "privacy",
      label: <Space size={6}><LockOutlined />Data privacy</Space>,
      children: (
        <Card size="small" title="Classification and what a viewer sees">
          <Form.Item name={["privacy", "classifications"]} label="Classifications offered on the form" extra="Type a new one and press Enter. The first in the list is the default unless another is chosen below." style={{ marginBottom: 14 }}>
            <Select mode="tags" disabled={!canEdit} tokenSeparators={[","]} />
          </Form.Item>
          <Form.Item name={["privacy", "defaultClassification"]} label="Classification an upload gets when the form names none" style={{ marginBottom: 14 }}>
            <Select disabled={!canEdit} options={classifications.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Rule name={["privacy", "watermarkViewer"]} label="Watermark the viewer with the viewer's name and the date" help="Drawn over every page in the application's viewer, so a screenshot says who took it."><Switch disabled={!canEdit} /></Rule>
          {isRecords && <Rule name={["privacy", "hideProponentFromRequesters"]} label="Hide the proponent's name from people asking for access" help="Their request list and the establishment panel show the permit number and title only."><Switch disabled={!canEdit} /></Rule>}
        </Card>
      ),
    },
    {
      key: "pdf",
      label: <Space size={6}><FilePdfOutlined />PDF viewing</Space>,
      children: (
        <Card size="small" title="How much of a document someone outside the unit sees">
          <Form.Item name={["pdfViewing", "previewPageLimit"]} label={isRecords ? "Pages shown to a person viewing by approval" : "Pages shown in the viewer"} extra={isRecords ? "0 shows every page. With a limit, the PDF is cut on the server to its first N pages — the rest never leave it — and the viewer shows the withheld pages as blurred placeholders." : "0 shows every page. Only the unit's own staff see its documents, so a limit here applies only with the switch below turned on."} style={{ marginBottom: 14 }}>
            <InputNumber min={0} max={500} disabled={!canEdit} addonAfter="pages" />
          </Form.Item>
          <Rule name={["pdfViewing", "blurWithheldPages"]} label="Show the withheld pages blurred, with a note to ask the unit" help="Off: the document simply ends at the limit."><Switch disabled={!canEdit} /></Rule>
          <Rule name={["pdfViewing", "applyToUnit"]} label="Apply the limit to the unit's own staff as well"><Switch disabled={!canEdit} /></Rule>
          <Rule name={["pdfViewing", "hideToolbar"]} label="Hide the viewer's toolbar (no save or print button)" help="A courtesy to the rule, not a lock: a browser cannot be stopped from saving what it shows."><Switch disabled={!canEdit} /></Rule>
        </Card>
      ),
    },
    {
      key: "audit",
      label: <Space size={6}><AuditOutlined />Tracing & auditing</Space>,
      children: (
        <Card size="small" title="What is written to the trail">
          <Rule name={["auditing", "logViews"]} label="Every document view, with who and from where" help="Recommended. Off, the trail records uploads and changes only."><Switch disabled={!canEdit} /></Rule>
          <Rule name={["auditing", "logSearches"]} label="Every library search, with the term and the number of hits"><Switch disabled={!canEdit} /></Rule>
          <Rule name={["auditing", "logShares"]} label="Every share of a document"><Switch disabled={!canEdit} /></Rule>
          <Divider style={{ margin: "8px 0 14px" }} />
          <Form.Item name={["logHistory", "retentionDays"]} label="Log history reads back" style={{ marginBottom: 14 }}>
            <InputNumber min={7} max={3650} disabled={!canEdit} addonAfter="days" />
          </Form.Item>
          <Rule name={["logHistory", "showDesktopLog"]} label="Show the desktop system's log on a record's Tracking tab"><Switch disabled={!canEdit} /></Rule>
        </Card>
      ),
    },
    {
      key: "log",
      label: <Space size={6}><HistoryOutlined />Log history</Space>,
      children: unit ? <LogHistory unit={unit} /> : null,
    },
  ], [canEdit, classifications, isRecords, unit]);

  if (units && !mine.length) {
    return <Alert type="info" showIcon message="No ERMS unit on this account" description="These settings belong to a unit's own staff." />;
  }

  return (
    <Card
      title={
        <Space size={12} wrap>
          <span style={{ color: accent }}>{unit && unit !== "records" ? unitTheme(unit).icon : <SafetyCertificateOutlined />}</span>
          <span>ERMS settings</span>
          {mine.length > 1 ? (
            <Select size="small" value={unit} onChange={setUnit} options={mine.map((u) => ({ value: u.key, label: UNIT_LABEL[u.key] || u.label }))} style={{ width: 170 }} />
          ) : (
            unit && <Tag>{UNIT_LABEL[unit] || unit}</Tag>
          )}
        </Space>
      }
      extra={
        canEdit && (
          <Space>
            <Popconfirm title="Return every setting to its default?" onConfirm={() => reset.mutate()} okText="Reset" okButtonProps={{ danger: true }}>
              <Button loading={reset.isPending}>Reset</Button>
            </Popconfirm>
            <Button type="primary" loading={save.isPending} onClick={async () => save.mutate(await form.validateFields())}>
              Save settings
            </Button>
          </Space>
        )
      }
    >
      {error && <Alert type="error" showIcon message={describeApiError(error)} style={{ marginBottom: 12 }} />}
      {!canEdit && data && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Read only: the unit's own staff change these settings." />
      )}
      {data?.updatedAt && (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          Last changed {new Date(data.updatedAt).toLocaleString()}{data.updatedBy ? ` by ${data.updatedBy}` : ""}.
        </Text>
      )}
      {isLoading || !unit ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Form form={form} layout="vertical" initialValues={data?.settings}>
          <Tabs items={tabs} activeKey={activeTab} onChange={(key) => navigate(`/universe/settings/erms/${key}`)} />
        </Form>
      )}
    </Card>
  );
};

export default ErmsSettings;
