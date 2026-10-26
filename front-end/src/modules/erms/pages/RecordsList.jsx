import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { CloudUploadOutlined, EditOutlined, EyeOutlined, FilePdfOutlined, LinkOutlined, PaperClipOutlined, WarningOutlined } from "@ant-design/icons";
import { DocumentViewer } from "../../../shared/components/DocumentPanel";
import { useRecordsLive } from "../useRecordsLive";
import UnitHeader from "../components/UnitHeader";
import { useSearchParams } from "react-router-dom";
import RecordDetail from "./RecordDetail";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  exportRecords,
  fetchFilterOptions,
  fetchRecords,
} from "../api/ermsService";
import RecordFormModal from "../components/RecordFormModal";
import ExportButton from "../components/ExportButton";
import FloatingModal from "../../../shared/components/FloatingModal";
import useFitHeight from "../../../shared/useFitHeight";
import useScreen from "../../../shared/useScreen";
import "./recordslist.css";

// Below the table's top: its header row, the pagination, the card's own
// padding and the application footer.
const TABLE_RESERVE = 180;

// The columns fitted to the width the table really has (the window less the
// sidebar, measured), widest first. Project Details takes what is left, never
// less than DETAILS_MIN. Where a column no longer fits it folds into another
// cell rather than vanishing: the project type under the project details, the
// register link under the FSN, the upload date and uploader into the details.
// `from`: the narrowest table width the layout is used at.
const LAYOUTS = [
  { from: 1360, widths: { serialNo: 130, permit: 190, projectType: 240, ucdsRef: 140, uploadedAt: 150, actions: 118 } },
  { from: 1180, widths: { serialNo: 120, permit: 170, projectType: 190, ucdsRef: 130, uploadedAt: 130, actions: 110 } },
  { from: 960, widths: { serialNo: 120, permit: 170, ucdsRef: 130, uploadedAt: 130, actions: 110 } },
  { from: 760, widths: { serialNo: 120, permit: 160, uploadedAt: 120, actions: 110 } },
  { from: 0, widths: { serialNo: 110, permit: 150, actions: 104 } },
];
const DETAILS_MIN = 220;
// The expand arrow of a record with attachments.
const EXPAND_COLUMN = 48;

const LINK_OPTIONS = [
  { value: "", label: "Any register status" },
  { value: "linked", label: "Linked to the register" },
  { value: "unlinked", label: "Not linked" },
];

const DEFAULT_QUERY = {
  search: "",
  permitType: undefined,
  province: undefined,
  uploadedBy: undefined,
  linked: "",
  flagged: undefined,
  page: 1,
  pageSize: 25,
  sortBy: "document.uploadedAt",
  sortDir: -1,
};

// Antd's sorter keys map onto the fields the API is willing to sort by.
const SORT_FIELD = {
  serialNo: "serialNo",
  proponentName: "proponentName",
  projectTitle: "projectTitle",
  uploadedAt: "document.uploadedAt",
  dateApproved: "permit.dateApproved",
};

const RecordsList = () => {
  // The establishment panel on the UCDS side links here with ?linkedTo=<key>,
  // so the list opens already filtered to that establishment's records.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedTo = searchParams.get("linkedTo") || undefined;
  // The dashboard's attention tiles link here already filtered.
  const linked = ["linked", "unlinked"].includes(searchParams.get("linked")) ? searchParams.get("linked") : undefined;
  const flagged = searchParams.get("flagged") === "1" ? true : undefined;
  const initialSearch = searchParams.get("search") || "";

  const [query, setQuery] = useState({ ...DEFAULT_QUERY, linkedTo, linked, flagged, search: initialSearch });
  const [searchDraft, setSearchDraft] = useState(initialSearch);
  // The upload form opens from here and from the sidebar's "Upload record"
  // (?new=1). A record's details open in a dialog over the register rather
  // than on their own page, so the list is still there when it closes.
  const [creating, setCreating] = useState(searchParams.get("new") === "1");
  const [openSerial, setOpenSerial] = useState(null);
  // The row being edited in the form.
  const [editing, setEditing] = useState(null);
  // The row whose scan is open in the viewer.
  const [viewingDoc, setViewingDoc] = useState(null);
  // A colleague's edit, or a record put right elsewhere, shows here at once.
  useRecordsLive();
  const [fitRef, fitHeight, fitWidth] = useFitHeight(TABLE_RESERVE);
  const screen = useScreen();
  // Before the first measure: the window's width, near enough.
  const tableWidth = fitWidth || (typeof window !== "undefined" ? window.innerWidth : 1366);
  const layout = LAYOUTS.find((l) => tableWidth >= l.from) || LAYOUTS[LAYOUTS.length - 1];
  const widths = layout.widths;
  const shown = (key) => key in widths;
  // Narrower than the columns need: the table scrolls sideways instead of crushing them.
  const needed = Object.values(widths).reduce((a, w) => a + w, 0) + DETAILS_MIN + EXPAND_COLUMN;

  useEffect(() => {
    if (searchParams.get("new") === "1") setCreating(true);
  }, [searchParams]);

  const { data: options } = useQuery({
    queryKey: ["erms", "filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isFetching, error } = useQuery({
    queryKey: ["erms", "records", query],
    queryFn: () => fetchRecords(query),
    placeholderData: keepPreviousData,
  });

  const patch = (changes) => setQuery((q) => ({ ...q, page: 1, ...changes }));

  // The API is the authority; these only avoid offering what it refuses.
  const writable = options?.writableProvinces;
  const canWrite = (row) => writable === null || (writable || []).includes(row.location?.province);

  const address = (loc) =>
    [loc?.street, loc?.barangay, loc?.city, PROVINCE_LABEL[loc?.province] || loc?.provinceLabel || loc?.province]
      .filter(Boolean)
      .join(", ");

  // The project type and, when one was given, the specific type — "Mining
  // and Quarrying Projects — Sand and gravel extraction".
  const projectType = (p) => [p?.type, p?.otherType].filter((v) => v && v !== "n/a").join(" — ");

  // The scan, straight from the row. The viewer asks the server first, which
  // decides as everywhere: the Records Unit and the Developer read it here,
  // within their provinces; anyone else is pointed to the Document Portal.
  const docButton = (row) => (
    <Tooltip title={row.document?.fileName ? "View document" : "No scan filed for this record"}>
      <Button
        size="small"
        icon={<FilePdfOutlined />}
        disabled={!row.document?.fileName}
        onClick={() => setViewingDoc(row)}
        aria-label="View document"
      />
    </Tooltip>
  );

  // The register link: its own column when there is room, else under the FSN.
  const registerTag = (row) =>
    row.ucdsRef?.sortKey ? (
      <Tooltip title={row.ucdsRef.nameSnapshot || ""}>
        <Tag icon={<LinkOutlined />} color="green" style={{ marginInlineEnd: 0, width: "fit-content" }}>
          {row.ucdsRef.sortKey}
        </Tag>
      </Tooltip>
    ) : null;

  const allColumns = [
    // The FSN is the document's number in the library — its own column.
    {
      title: "Serial No.",
      dataIndex: "serialNo",
      key: "serialNo",
      sorter: true,
      render: (serial, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text style={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>{serial}</Typography.Text>
          {!shown("ucdsRef") && registerTag(row)}
          <Space size={4} wrap>
            {row.isAttachment && (
              <Tooltip title="An additional document filed against an existing record">
                <Tag style={{ marginInlineEnd: 0 }}>att</Tag>
              </Tooltip>
            )}
            {row.attachments?.length > 0 && (
              <Tooltip title="Its attachments — open the row to see them">
                <Tag icon={<PaperClipOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>{row.attachments.length}</Tag>
              </Tooltip>
            )}
            {row.dataQuality?.clean === false && (
              <Tooltip title="A value could not be interpreted during migration. The original is preserved on the record.">
                <WarningOutlined style={{ color: "#9a6b00" }} />
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
    },
    // The permit is what people know a record by: its reference number opens it.
    {
      title: "Permit / Ref. No.",
      key: "permit",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <a
            href={`/e-universe/erms/records/${encodeURIComponent(row.serialNo)}`}
            onClick={(e) => { e.preventDefault(); setOpenSerial(row.serialNo); }}
            style={{ fontWeight: 600, overflowWrap: "anywhere" }}
          >
            {row.permit?.number || "—"}
          </a>
          <Tag color={PERMIT_TYPE_COLOR[row.permit?.type]} style={{ marginInlineEnd: 0, width: "fit-content" }}>
            {row.permit?.label || row.permit?.type}
          </Tag>
        </Space>
      ),
    },
    // One column for what the record is about: the project, whose it is,
    // and where — the three things that used to be spread over four. No
    // width: it takes whatever the table has left, and wraps rather than
    // cutting a long title off. On a narrower table it also carries the
    // project type and the upload, when their columns have folded away.
    {
      title: "Project Details",
      dataIndex: "projectTitle",
      key: "projectTitle",
      sorter: true,
      render: (title, row) => (
        <div className="records-project-details">
          <Typography.Text strong>{title || "—"}</Typography.Text>
          <Typography.Text>{row.proponentName || "—"}</Typography.Text>
          <Typography.Text type="secondary">
            {address(row.location) || "—"}
          </Typography.Text>
          {!shown("projectType") && projectType(row.project) && <Typography.Text type="secondary">{projectType(row.project)}</Typography.Text>}
          {!shown("uploadedAt") && row.document?.uploadedAt && (
            <Typography.Text type="secondary">
              Uploaded {new Date(row.document.uploadedAt).toLocaleDateString()}
              {row.document?.uploadedBy ? ` · ${row.document.uploadedBy}` : ""}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: "Project Type",
      key: "projectType",
      render: (_, row) => (
        <Typography.Text type={projectType(row.project) ? undefined : "secondary"} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
          {projectType(row.project) || "—"}
        </Typography.Text>
      ),
    },
    {
      title: "Register",
      key: "ucdsRef",
      render: (_, row) => registerTag(row) || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "Uploaded",
      dataIndex: ["document", "uploadedAt"],
      key: "uploadedAt",
      sorter: true,
      render: (d, row) => (
        <Space direction="vertical" size={0}>
          <span>{d ? new Date(d).toLocaleDateString() : "—"}</span>
          <Typography.Text type="secondary" style={{ overflowWrap: "anywhere" }}>
            {row.document?.uploadedBy || ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Action",
      key: "actions",
      align: "center",
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="View record">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(row.serialNo)} aria-label="View record" />
          </Tooltip>
          {docButton(row)}
          {canWrite(row) && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} aria-label="Edit" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];
  // The layout's columns at its widths; Project Details (no width) takes the rest.
  const columns = allColumns
    .filter((c) => c.key === "projectTitle" || shown(c.key))
    .map((c) => (c.key === "projectTitle" ? c : { ...c, width: widths[c.key] }));

  const onTableChange = (pagination, _filters, sorter) => {
    const field = Array.isArray(sorter?.field) ? sorter.field.join(".") : sorter?.field;
    const mapped = SORT_FIELD[sorter?.columnKey] || SORT_FIELD[field];
    setQuery((q) => ({
      ...q,
      page: pagination.current,
      pageSize: pagination.pageSize,
      ...(mapped && sorter.order
        ? { sortBy: mapped, sortDir: sorter.order === "ascend" ? 1 : -1 }
        : {}),
    }));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
    <UnitHeader
      unit="records"
      title="Document Library"
      description="Every permit and clearance on file, by its FSN. Open one for its scan, attachments and tracking."
      actions={
        <>
          <Typography.Text type="secondary">
            {data ? `${new Intl.NumberFormat().format(data.total)} records` : ""}
          </Typography.Text>
          <ExportButton load={() => exportRecords(query)} />
          {/* Offered only where the account may actually write. */}
          {(options?.writableProvinces === null ||
            (options?.writableProvinces || []).length > 0) && (
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setCreating(true)}>
              Upload record
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
            placeholder="Serial, permit number, proponent or project"
            style={{ width: screen.phone ? "100%" : 320 }}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onSearch={(v) => patch({ search: v })}
            enterButton
          />
          <Select
            allowClear
            placeholder="Permit type"
            style={{ width: 210 }}
            value={query.permitType}
            onChange={(v) => patch({ permitType: v })}
            options={(options?.permitTypes || []).map((t) => ({ value: t.code, label: t.label }))}
          />
          <Select
            allowClear
            placeholder="Province"
            style={{ width: 160 }}
            value={query.province}
            onChange={(v) => patch({ province: v })}
            options={(options?.provinces || []).map((p) => ({
              value: p,
              label: PROVINCE_LABEL[p] || p,
            }))}
          />
          <Select placeholder="Any link status"
            style={{ width: 200 }}
            value={query.linked}
            onChange={(v) => patch({ linked: v })}
            options={LINK_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Uploaded by"
            style={{ width: 190 }}
            value={query.uploadedBy}
            onChange={(v) => patch({ uploadedBy: v })}
            options={(options?.uploaders || []).map((u) => ({ value: u, label: u }))}
          />
          <Button
            type={query.flagged ? "primary" : "default"}
            icon={<WarningOutlined />}
            onClick={() => patch({ flagged: query.flagged ? undefined : true })}
          >
            Needs review
          </Button>
          <Button
            onClick={() => {
              setSearchDraft("");
              setSearchParams({});
              setQuery(DEFAULT_QUERY);
            }}
          >
            Reset
          </Button>
        </Space>

        {query.linkedTo && (
          <Alert
            type="info"
            showIcon
            message={
              <Space size={8}>
                <span>Showing records filed against establishment</span>
                <Tag color="green">{query.linkedTo}</Tag>
              </Space>
            }
            closable
            onClose={() => {
              setSearchParams({});
              setQuery((q) => ({ ...q, linkedTo: undefined, page: 1 }));
            }}
          />
        )}

        {error && (
          <Alert
            type="error"
            showIcon
            message="Could not load records"
            description={describeApiError(error)}
          />
        )}

        {/* Fitted to the space the table has (LAYOUTS): the columns share its
            width (fixed layout, Project Details taking what is left), and the
            rows scroll under a header that stays put, ending above the
            pagination. Only when even the narrowest layout does not fit does
            the table scroll sideways rather than crush its columns. */}
        <div ref={fitRef}>
        <Table
          rowKey="serialNo"
          size="small"
          bordered
          tableLayout="fixed"
          className="records-table"
          loading={isFetching}
          columns={columns}
          dataSource={data?.items || []}
          onChange={onTableChange}
          onRow={(r) => ({ onDoubleClick: () => setOpenSerial(r.serialNo), style: { cursor: "pointer" } })}
          // A record's attachments, inside it — not rows of their own.
          expandable={{
            rowExpandable: (r) => r.attachments?.length > 0,
            expandedRowRender: (r) => (
              <Table
                rowKey="serialNo"
                size="small"
                pagination={false}
                showHeader={false}
                className="records-table"
                dataSource={r.attachments}
                onRow={(a) => ({ onDoubleClick: () => setOpenSerial(a.serialNo), style: { cursor: "pointer" } })}
                columns={[
                  {
                    key: "serial",
                    width: 230,
                    render: (_, a) => (
                      <Space size={6}>
                        <PaperClipOutlined />
                        <Typography.Link onClick={() => setOpenSerial(a.serialNo)} style={{ fontFamily: "monospace" }}>
                          {a.serialNo.replace(`${r.serialNo} `, "")}
                        </Typography.Link>
                      </Space>
                    ),
                  },
                  { key: "file", render: (_, a) => <Typography.Text style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{a.document?.fileName || a.projectTitle || "no file"}</Typography.Text> },
                  { key: "when", width: 200, responsive: ["sm"], render: (_, a) => (a.document?.uploadedAt ? new Date(a.document.uploadedAt).toLocaleDateString() : "—") },
                  {
                    key: "view",
                    width: 80,
                    align: "center",
                    render: (_, a) => (
                      <Space size={4}>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(a.serialNo)} aria-label="View record" />
                        {docButton(a)}
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          }}
          // On a phone the page scrolls, not a box inside it.
          scroll={{ x: tableWidth < needed ? needed : undefined, y: screen.phone ? undefined : fitHeight }}
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

      <RecordFormModal
        open={creating}
        record={null}
        writableProvinces={options?.writableProvinces}
        onClose={(saved) => {
          setCreating(false);
          if (searchParams.get("new")) setSearchParams({});
          if (saved) setOpenSerial(saved.serialNo);
        }}
      />

      {/* Edit from the row, without opening the record first. The list row
          carries every field the form edits. */}
      <RecordFormModal
        open={Boolean(editing)}
        record={editing}
        writableProvinces={options?.writableProvinces}
        onClose={() => setEditing(null)}
      />

      <DocumentViewer
        open={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        serialNo={viewingDoc?.serialNo}
        fileName={viewingDoc?.document?.fileName}
        refNo={viewingDoc?.permit?.number}
      />

      {/* A window: moved, minimised or resized, so it can sit beside the
          scan's own window. */}
      <FloatingModal
        open={Boolean(openSerial)}
        onCancel={() => setOpenSerial(null)}
        width={1100}
        maxHeight="88vh"
        title={<Typography.Text type="secondary" style={{ fontSize: 13 }}>Record details · <span style={{ fontFamily: "monospace" }}>{openSerial}</span></Typography.Text>}
        bodyStyle={{ paddingTop: 8 }}
      >
        {openSerial && <RecordDetail serialNo={openSerial} embedded onOpenRecord={setOpenSerial} />}
      </FloatingModal>
    </Card>
    </Space>
  );
};

export default RecordsList;

