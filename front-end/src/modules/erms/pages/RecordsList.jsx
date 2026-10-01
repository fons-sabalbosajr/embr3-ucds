import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { EditOutlined, EyeOutlined, LinkOutlined, PlusOutlined, ShareAltOutlined, WarningOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import RecordDetail from "./RecordDetail";
import ShareDocumentModal from "../components/ShareDocumentModal";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchFilterOptions,
  fetchRecords,
} from "../api/ermsService";
import RecordFormModal from "../components/RecordFormModal";

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
  // The row being edited in the form, and the one being shared.
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);

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
  const canShare = options?.canShare === true;

  const address = (loc) =>
    [loc?.street, loc?.barangay, loc?.city, PROVINCE_LABEL[loc?.province] || loc?.provinceLabel || loc?.province]
      .filter(Boolean)
      .join(", ");

  // The project type and, when one was given, the specific type — "Mining
  // and Quarrying Projects — Sand and gravel extraction".
  const projectType = (p) => [p?.type, p?.otherType].filter((v) => v && v !== "n/a").join(" — ");

  const columns = [
    // The FSN is the document's number in the library — its own column.
    {
      title: "FSN",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 150,
      sorter: true,
      render: (serial, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text style={{ fontFamily: "monospace" }}>{serial}</Typography.Text>
          <Space size={4}>
            {row.isAttachment && (
              <Tooltip title="An additional document filed against an existing record">
                <Tag style={{ marginInlineEnd: 0 }}>att</Tag>
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
      width: 210,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <a
            href={`/universe/erms/records/${encodeURIComponent(row.serialNo)}`}
            onClick={(e) => { e.preventDefault(); setOpenSerial(row.serialNo); }}
            style={{ fontWeight: 600 }}
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
    // and where — the three things that used to be spread over four.
    {
      title: "Project Details",
      dataIndex: "projectTitle",
      key: "projectTitle",
      sorter: true,
      render: (title, row) => (
        <Space direction="vertical" size={0} style={{ maxWidth: 560 }}>
          <Typography.Text strong ellipsis={{ tooltip: title }}>
            {title || "—"}
          </Typography.Text>
          <Typography.Text ellipsis={{ tooltip: row.proponentName }}>{row.proponentName || "—"}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: address(row.location) }}>
            {address(row.location) || "—"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Project Type",
      key: "projectType",
      width: 220,
      render: (_, row) => (
        <Typography.Text type={projectType(row.project) ? undefined : "secondary"} ellipsis={{ tooltip: projectType(row.project) }} style={{ maxWidth: 200, fontSize: 13 }}>
          {projectType(row.project) || "—"}
        </Typography.Text>
      ),
    },
    {
      title: "Register",
      key: "ucdsRef",
      width: 150,
      render: (_, row) =>
        row.ucdsRef?.sortKey ? (
          <Tooltip title={row.ucdsRef.nameSnapshot || ""}>
            <Tag icon={<LinkOutlined />} color="green">
              {row.ucdsRef.sortKey}
            </Tag>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "Uploaded",
      dataIndex: ["document", "uploadedAt"],
      key: "uploadedAt",
      width: 200,
      sorter: true,
      render: (d, row) => (
        <Space direction="vertical" size={0}>
          <span>{d ? new Date(d).toLocaleDateString() : "—"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.document?.uploadedBy || ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Action",
      key: "actions",
      width: 120,
      align: "center",
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="View">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenSerial(row.serialNo)} aria-label="View" />
          </Tooltip>
          {canWrite(row) && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)} aria-label="Edit" />
            </Tooltip>
          )}
          {canShare && row.document?.fileName && (
            <Tooltip title="Share the document">
              <Button size="small" icon={<ShareAltOutlined />} onClick={() => setSharing(row)} aria-label="Share" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

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
    <Card
      title="Document Library"
      extra={
        <Space size={12}>
          <Typography.Text type="secondary">
            {data ? `${new Intl.NumberFormat().format(data.total)} records` : ""}
          </Typography.Text>
          {/* Offered only where the account may actually write. */}
          {(options?.writableProvinces === null ||
            (options?.writableProvinces || []).length > 0) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New record
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space wrap size={8}>
          <Input.Search
            allowClear
            placeholder="Serial, permit number, proponent or project"
            style={{ width: 320 }}
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
          <Select
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

        <Table
          rowKey="serialNo"
          size="small"
          bordered
          loading={isFetching}
          columns={columns}
          dataSource={data?.items || []}
          onChange={onTableChange}
          onRow={(r) => ({ onDoubleClick: () => setOpenSerial(r.serialNo), style: { cursor: "pointer" } })}
          scroll={{ x: "max-content" }}
          pagination={{
            current: data?.page || 1,
            pageSize: data?.pageSize || 25,
            total: data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100],
            showTotal: (t, r) => `${r[0]}–${r[1]} of ${new Intl.NumberFormat().format(t)}`,
          }}
        />
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

      <ShareDocumentModal
        open={Boolean(sharing)}
        serialNo={sharing?.serialNo}
        fileName={sharing?.document?.fileName}
        onClose={() => setSharing(null)}
      />

      <Modal
        open={Boolean(openSerial)}
        onCancel={() => setOpenSerial(null)}
        footer={null}
        width="min(1100px, 96vw)"
        style={{ top: 24 }}
        // The record's own header names it; a title above would repeat it.
        title={null}
        styles={{ body: { paddingTop: 8 } }}
        destroyOnHidden
      >
        {openSerial && <RecordDetail serialNo={openSerial} embedded onOpenRecord={setOpenSerial} />}
      </Modal>
    </Card>
  );
};

export default RecordsList;
