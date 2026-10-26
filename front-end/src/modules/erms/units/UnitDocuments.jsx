import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CloudUploadOutlined, EditOutlined, EyeOutlined, FileExclamationOutlined, FilePdfOutlined, PaperClipOutlined } from "@ant-design/icons";
import { DocumentViewer } from "../../../shared/components/DocumentPanel";
import { useParams, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { describeApiError, exportUnitDocuments, fetchUnitDocuments } from "../api/ermsService";
import ExportButton from "../components/ExportButton";
import UnitHeader from "../components/UnitHeader";
import useFitHeight from "../../../shared/useFitHeight";
import useScreen from "../../../shared/useScreen";
import { useUnits } from "./useUnits";
import { PROVINCE_OPTIONS, unitTheme, formatValue } from "./unitTheme";
import UnitUploadModal from "./UnitUploadModal";
import UnitDocumentDetail from "./UnitDocumentDetail";
import "../pages/recordslist.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// A unit's Document Library: Legal cases by docket, Laboratory documents by
// firm. Filter by type, province and text; open one; edit one; upload a new
// one.
//
// Laid out as the Records Unit's library is — the same header, toolbar,
// table and row actions — so the three units read as one system and differ
// only in their accent colour and icon.
//
// A Legal case's attachments are listed inside it — the + at the start of
// its row — not as rows of their own, so a case reads as one thing. Looking
// for something (a search, a type, a docket) lists every match as a row.
//
// A document opens in a dialog over the list, as a Records record does, so
// the filters, page and scroll position are still there when it closes. The
// page route (/erms/:unit/documents/:serialNo) remains for links from
// elsewhere.
// ---------------------------------------------------------------------------

// Below the table's top: its header row, the pagination, the card's own
// padding and the application footer (as on the Records library).
const TABLE_RESERVE = 180;

const DEFAULT = { search: "", docType: undefined, province: undefined, docketNo: undefined, page: 1, pageSize: 25, sortBy: "createdAt", sortDir: -1 };

const UnitDocuments = () => {
  const { unit } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = unitTheme(unit);
  const { unit: unitOf, isLoading: unitsLoading } = useUnits();
  const unitConfig = unitOf(unit);

  const [query, setQuery] = useState({ ...DEFAULT, docType: searchParams.get("docType") || undefined, docketNo: searchParams.get("docketNo") || undefined, search: searchParams.get("search") || "" });
  const [draft, setDraft] = useState(searchParams.get("search") || "");
  const [filing, setFiling] = useState(searchParams.get("upload") === "1");
  const [openSerial, setOpenSerial] = useState(searchParams.get("open") || null);
  // The row being edited in the form.
  const [editing, setEditing] = useState(null);
  // The row whose scan is open in the viewer.
  const [viewingDoc, setViewingDoc] = useState(null);
  const [fitRef, fitHeight] = useFitHeight(TABLE_RESERVE);
  const screen = useScreen();

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

  // What a document is known by besides its serial: a Legal docket, a COC.
  const primaryKey = unit === "legal" ? "docketNo" : unit === "laboratory" ? "cocNo" : null;

  // The scan, straight from the row (as on the Records library). The viewer
  // asks the server first: only this unit's own staff and the Developer read
  // it here; anyone else is pointed to the Document Portal.
  const docButton = (row) => (
    <Tooltip title={row.document?.fileName ? "View document" : "No scan filed for this document"}>
      <Button size="small" icon={<FilePdfOutlined />} disabled={!row.document?.fileName} onClick={() => setViewingDoc(row)} aria-label="View document" />
    </Tooltip>
  );

  const columns = [
    // The serial is the document's number in the library — its own column.
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 150,
      sorter: true,
      render: (serial, row) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontFamily: "monospace" }}>{serial}</Text>
          <Space size={4}>
            {row.attachments?.length > 0 && (
              <Tooltip title={`${row.attachments.length} attachment${row.attachments.length === 1 ? "" : "s"} — open the row to see them`}>
                <Tag icon={<PaperClipOutlined />} color={theme.color} style={{ marginInlineEnd: 0 }}>{row.attachments.length}</Tag>
              </Tooltip>
            )}
            {row.parentSerialNo && (
              <Tooltip title={`An attachment of ${row.parentSerialNo}`}>
                <Tag style={{ marginInlineEnd: 0 }}>att</Tag>
              </Tooltip>
            )}
            {!row.document?.fileName && (
              <Tooltip title="No scan is filed for this document">
                <FileExclamationOutlined style={{ color: "#9a6b00" }} />
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
    },
    // What people know a document by: its docket or COC opens it.
    {
      title: unit === "legal" ? "Docket / Type" : "COC / Type",
      key: "type",
      width: 200,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <a
            href={`/e-universe/erms/${unit}/documents/${encodeURIComponent(row.serialNo)}`}
            onClick={(e) => {
              // A plain click opens the dialog; ctrl/middle-click still opens the page in a new tab.
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              setOpenSerial(row.serialNo);
            }}
            style={{ fontWeight: 600 }}
          >
            {(primaryKey && row.fields?.[primaryKey]) || "—"}
          </a>
          <Tag color={theme.color} style={{ marginInlineEnd: 0, width: "fit-content" }}>
            {row.docTypeLabel || typeLabel(row.docType)}
          </Tag>
        </Space>
      ),
    },
    {
      title: unit === "legal" ? "Company Details" : "Firm / Station Details",
      dataIndex: "title",
      key: "title",
      // No width: it takes whatever the window has left, as on the Records library.
      sorter: true,
      render: (title, row) => (
        <div className="records-project-details">
          <Text strong>{title || "—"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[row.fields?.companyAddress || row.fields?.address, row.provinceLabel].filter(Boolean).join(" · ") || "—"}
          </Text>
        </div>
      ),
    },
    unit === "legal" && {
      title: "Status",
      key: "status",
      width: 180,
      responsive: ["md"],
      render: (_, row) => (
        <Text type={row.fields?.status ? undefined : "secondary"} style={{ fontSize: 13, whiteSpace: "normal", wordBreak: "break-word" }}>
          {row.fields?.status || "—"}
        </Text>
      ),
    },
    unit === "laboratory" && {
      title: "Sampled",
      key: "sampled",
      width: 130,
      responsive: ["md"],
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{formatValue({ type: "date" }, row.fields?.dateOfSampling)}</span>
          {row.fields?.parameters && <Text type="secondary" style={{ fontSize: 12 }}>{row.fields.parameters}</Text>}
        </Space>
      ),
    },
    {
      title: "Uploaded",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      sorter: true,
      responsive: ["sm"],
      render: (d, row) => (
        <Space direction="vertical" size={0}>
          <span>{formatValue({ type: "date" }, row.document?.uploadedAt || d)}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.document?.uploadedBy || row.createdBy || ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Action",
      key: "actions",
      width: 118,
      align: "center",
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="View document details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(row.serialNo)} aria-label="View document details" />
          </Tooltip>
          {docButton(row)}
          {unitConfig?.canFile && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} aria-label="Edit" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ].filter(Boolean);

  const onTableChange = (pagination, _filters, sorter) => {
    const map = { serialNo: "serialNo", title: "title", createdAt: "createdAt" };
    const mapped = map[sorter?.columnKey] || map[sorter?.field];
    setQuery((q) => ({
      ...q,
      page: pagination.current,
      pageSize: pagination.pageSize,
      ...(mapped && sorter.order ? { sortBy: mapped, sortDir: sorter.order === "ascend" ? 1 : -1 } : {}),
    }));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <UnitHeader
        unit={unit}
        title="Document Library"
        description={`${unitConfig?.label || theme.label}: every document on file, by its serial. Open one for its scan${unit === "legal" ? ", its docket" : ""} and history.`}
        actions={
          <>
            <Text type="secondary">{data ? `${new Intl.NumberFormat().format(data.total)} documents` : ""}</Text>
            <ExportButton load={() => exportUnitDocuments(unit, query)} />
            {unitConfig?.canFile && (
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setFiling(true)}>
                Upload document
              </Button>
            )}
          </>
        }
      />

      <Card size="small">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap size={8}>
            <Input.Search
              allowClear
              placeholder={unit === "legal" ? "Serial, docket, company or status" : "Serial, COC number, firm or station"}
              style={{ width: screen.phone ? "100%" : 320 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onSearch={(v) => patch({ search: v })}
              enterButton
            />
            <Select
              allowClear
              placeholder="Document type"
              style={{ width: 240 }}
              value={query.docType}
              onChange={(v) => patch({ docType: v })}
              options={(unitConfig?.docTypes || []).map((t) => ({ value: t.code, label: t.label }))}
            />
            <Select allowClear placeholder="Province" style={{ width: 160 }} value={query.province} onChange={(v) => patch({ province: v })} options={PROVINCE_OPTIONS} />
            <Button
              onClick={() => {
                setDraft("");
                setSearchParams({});
                setQuery(DEFAULT);
              }}
            >
              Reset
            </Button>
          </Space>

          {query.docketNo && (
            <Alert
              type="info"
              showIcon
              message={
                <Space size={8}>
                  <span>Showing the documents on docket</span>
                  <Tag color={theme.color}>{query.docketNo}</Tag>
                </Space>
              }
              closable
              onClose={() => {
                setSearchParams({});
                patch({ docketNo: undefined });
              }}
            />
          )}

          {error && <Alert type="error" showIcon message="Could not load the documents" description={describeApiError(error)} />}

          {/* Fitted to the window, as the Records library is: fixed layout,
              the details column taking what is left, rows scrolling under a
              header that stays put. */}
          <div ref={fitRef}>
            <Table
              rowKey="id"
              size="small"
              bordered
              tableLayout="fixed"
              loading={isFetching}
              columns={columns}
              dataSource={data?.items || []}
              onChange={onTableChange}
              onRow={(r) => ({ onDoubleClick: () => setOpenSerial(r.serialNo), style: { cursor: "pointer" } })}
              // A case's attachments, inside it.
              expandable={{
                rowExpandable: (r) => r.attachments?.length > 0,
                expandedRowRender: (r) => (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    showHeader={false}
                    dataSource={r.attachments}
                    onRow={(a) => ({ onDoubleClick: () => setOpenSerial(a.serialNo), style: { cursor: "pointer" } })}
                    columns={[
                      {
                        key: "serial",
                        width: 230,
                        render: (_, a) => (
                          <Space size={6} wrap>
                            <PaperClipOutlined style={{ color: theme.accent }} />
                            <Typography.Link onClick={() => setOpenSerial(a.serialNo)} style={{ fontFamily: "monospace", fontSize: 12 }}>
                              {a.serialNo.replace(`${r.serialNo} `, "")}
                            </Typography.Link>
                          </Space>
                        ),
                      },
                      { key: "what", render: (_, a) => <Text style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{a.fields?.documentType || a.document?.fileName || a.title}</Text> },
                      { key: "file", ellipsis: true, responsive: ["md"], render: (_, a) => <Text type="secondary" style={{ fontSize: 12 }}>{a.document?.fileName || "no file"}</Text> },
                      { key: "when", width: 110, responsive: ["sm"], render: (_, a) => formatValue({ type: "date" }, a.document?.uploadedAt || a.createdAt) },
                      {
                        key: "view",
                        width: 80,
                        align: "center",
                        render: (_, a) => (
                          <Space size={4}>
                            <Tooltip title="View document details">
                              <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(a.serialNo)} aria-label="View document details" />
                            </Tooltip>
                            {docButton(a)}
                          </Space>
                        ),
                      },
                    ]}
                  />
                ),
              }}
              scroll={screen.phone ? { x: 600 } : { x: 1000, y: fitHeight }}
              pagination={{
                current: data?.page || 1,
                pageSize: data?.pageSize || 25,
                total: data?.total || 0,
                showSizeChanger: true,
                pageSizeOptions: [25, 50, 100],
                showTotal: (t, r) => `${r[0]}–${r[1]} of ${new Intl.NumberFormat().format(t)}`,
              }}
            />
          </div>
        </Space>
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

      <DocumentViewer
        open={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        serialNo={viewingDoc?.serialNo}
        unit={unit}
        fileName={viewingDoc?.document?.fileName}
      />

      {/* Edit from the row, without opening the document first. */}
      <UnitUploadModal unit={unit} unitConfig={unitConfig} open={Boolean(editing)} document={editing} onClose={() => setEditing(null)} />

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
