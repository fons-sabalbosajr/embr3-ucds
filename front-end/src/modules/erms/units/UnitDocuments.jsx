import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, UploadOutlined } from "@ant-design/icons";
import { useParams, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDocuments } from "../api/ermsService";
import { useUnits } from "./useUnits";
import { PROVINCE_OPTIONS, unitTheme, formatValue } from "./unitTheme";
import UnitUploadModal from "./UnitUploadModal";
import UnitDocumentDetail from "./UnitDocumentDetail";

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// A unit's documents: Legal cases by docket, Laboratory documents by firm.
// Filter by type, province and text; open one; file a new one.
//
// A document opens in a dialog over the list, as a Records record does, so
// the filters, page and scroll position are still there when it closes. The
// page route (/erms/:unit/documents/:serialNo) remains for links from
// elsewhere.
// ---------------------------------------------------------------------------

const DEFAULT = { search: "", docType: undefined, province: undefined, page: 1, pageSize: 25, sortBy: "createdAt", sortDir: -1 };

const UnitDocuments = () => {
  const { unit } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = unitTheme(unit);
  const { unit: unitOf, isLoading: unitsLoading } = useUnits();
  const unitConfig = unitOf(unit);

  const [query, setQuery] = useState({ ...DEFAULT, docType: searchParams.get("docType") || undefined, docketNo: searchParams.get("docketNo") || undefined, search: searchParams.get("search") || undefined });
  const [draft, setDraft] = useState("");
  const [filing, setFiling] = useState(searchParams.get("upload") === "1");
  const [openSerial, setOpenSerial] = useState(searchParams.get("open") || null);

  useEffect(() => {
    if (searchParams.get("upload") === "1") setFiling(true);
  }, [searchParams]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["erms", "unit", unit, "documents", query],
    queryFn: () => fetchUnitDocuments(unit, query),
    enabled: Boolean(unitConfig),
    placeholderData: keepPreviousData,
  });

  const patch = (changes) => setQuery((q) => ({ ...q, page: 1, ...changes }));
  const typeLabel = (code) => unitConfig?.docTypes.find((t) => t.code === code)?.label || code;

  if (!unitsLoading && !unitConfig) {
    return <Alert type="warning" showIcon message="This unit is not part of your account." />;
  }

  const primaryKey = unit === "legal" ? "docketNo" : unit === "laboratory" ? "cocNo" : null;

  const columns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      sorter: true,
      width: 170,
      render: (s) => (
        <Typography.Link
          href={`/universe/erms/${unit}/documents/${encodeURIComponent(s)}`}
          onClick={(e) => {
            // A plain click opens the dialog; ctrl/middle-click still opens the page in a new tab.
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            setOpenSerial(s);
          }}
        >
          {s}
        </Typography.Link>
      ),
    },
    { title: "Type", dataIndex: "docType", width: 200, render: (code) => <Tag color={theme.color}>{typeLabel(code)}</Tag> },
    {
      title: unit === "legal" ? "Company / project" : "Firm / station",
      dataIndex: "title",
      sorter: true,
      render: (t, r) => (
        <Space direction="vertical" size={0}>
          <span>{t}</span>
          {primaryKey && r.fields?.[primaryKey] && <Text type="secondary" style={{ fontSize: 12 }}>{r.fields[primaryKey]}</Text>}
        </Space>
      ),
    },
    { title: "Province", dataIndex: "provinceLabel", width: 120, render: (v) => v || <Text type="secondary">—</Text> },
    unit === "legal" && { title: "Status", dataIndex: ["fields", "status"], width: 200, render: (v) => v || "—" },
    unit === "laboratory" && { title: "Sampled", dataIndex: ["fields", "dateOfSampling"], width: 120, render: (v) => formatValue({ type: "date" }, v) },
    { title: "Filed", dataIndex: "createdAt", sorter: true, width: 120, render: (v) => formatValue({ type: "date" }, v) },
    { title: "File", dataIndex: ["document", "fileName"], ellipsis: true, render: (v) => v || <Text type="secondary">no file</Text> },
    {
      title: "",
      key: "view",
      width: 56,
      align: "center",
      render: (_, r) => (
        <Tooltip title="View">
          <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(r.serialNo)} aria-label={`View ${r.serialNo}`} />
        </Tooltip>
      ),
    },
  ].filter(Boolean);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card size="small" style={{ borderTop: `3px solid ${theme.accent}` }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space direction="vertical" size={0}>
            <Title level={4} style={{ margin: 0 }}>
              <span style={{ color: theme.accent, marginRight: 8 }}>{theme.icon}</span>
              {unitConfig?.label || theme.label} — documents
            </Title>
            <Text type="secondary">{theme.description}</Text>
          </Space>
          {unitConfig?.canFile && (
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setFiling(true)}>
              File a document
            </Button>
          )}
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message={describeApiError(error, "Could not load the documents.")} />}

      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder={unit === "legal" ? "Docket, company, serial…" : "Firm, COC number, serial…"}
            allowClear
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onSearch={(v) => patch({ search: v })}
            style={{ width: 320 }}
          />
          <Select
            allowClear
            placeholder="Any type"
            value={query.docType}
            onChange={(v) => patch({ docType: v })}
            options={(unitConfig?.docTypes || []).map((t) => ({ value: t.code, label: t.label }))}
            style={{ width: 240 }}
          />
          <Select allowClear placeholder="Any province" value={query.province} onChange={(v) => patch({ province: v })} options={PROVINCE_OPTIONS} style={{ width: 180 }} />
          {query.docketNo && (
            <Tag closable onClose={() => { patch({ docketNo: undefined }); setSearchParams({}); }}>
              docket {query.docketNo}
            </Tag>
          )}
        </Space>
        <Table
          rowKey="id"
          size="small"
          loading={isFetching}
          columns={columns}
          dataSource={data?.items || []}
          pagination={{
            current: data?.page || 1,
            pageSize: data?.pageSize || 25,
            total: data?.total || 0,
            showSizeChanger: true,
            showTotal: (t) => `${t} document${t === 1 ? "" : "s"}`,
          }}
          onChange={(pagination, _filters, sorter) => {
            const map = { serialNo: "serialNo", title: "title", createdAt: "createdAt" };
            setQuery((q) => ({
              ...q,
              page: pagination.current,
              pageSize: pagination.pageSize,
              sortBy: sorter?.field && map[sorter.field] ? map[sorter.field] : q.sortBy,
              sortDir: sorter?.order === "ascend" ? 1 : -1,
            }));
          }}
          onRow={(r) => ({ onDoubleClick: () => setOpenSerial(r.serialNo), style: { cursor: "pointer" } })}
        />
      </Card>

      <UnitUploadModal
        unit={unit}
        unitConfig={unitConfig}
        open={filing}
        onClose={(saved) => {
          setFiling(false);
          if (searchParams.get("upload")) setSearchParams({});
          if (saved) setOpenSerial(saved.serialNo);
        }}
      />

      <Modal
        open={Boolean(openSerial)}
        onCancel={() => setOpenSerial(null)}
        footer={null}
        width="min(1100px, 96vw)"
        style={{ top: 24 }}
        // The document's own header names it; a title above would repeat it.
        title={null}
        styles={{ body: { paddingTop: 8 } }}
        destroyOnHidden
      >
        {openSerial && <UnitDocumentDetail unit={unit} serialNo={openSerial} embedded onOpenDocument={setOpenSerial} />}
      </Modal>
    </Space>
  );
};

export default UnitDocuments;
