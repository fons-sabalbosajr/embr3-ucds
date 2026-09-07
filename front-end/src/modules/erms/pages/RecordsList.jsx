import { useState } from "react";
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
import { LinkOutlined, WarningOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchFilterOptions,
  fetchRecords,
} from "../api/ermsService";

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
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchDraft, setSearchDraft] = useState("");

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

  const columns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 190,
      sorter: true,
      render: (serial, row) => (
        <Space size={6}>
          <Link to={`/universe/erms/records/${encodeURIComponent(serial)}`}>{serial}</Link>
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
      ),
    },
    {
      title: "Proponent",
      dataIndex: "proponentName",
      key: "proponentName",
      sorter: true,
      ellipsis: true,
    },
    {
      title: "Project",
      dataIndex: "projectTitle",
      key: "projectTitle",
      sorter: true,
      ellipsis: true,
    },
    {
      title: "Permit",
      key: "permit",
      width: 210,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Tag color={PERMIT_TYPE_COLOR[row.permit?.type]} style={{ marginInlineEnd: 0 }}>
            {row.permit?.label || row.permit?.type}
          </Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.permit?.number || "—"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Location",
      key: "location",
      width: 150,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{PROVINCE_LABEL[row.location?.province] || row.location?.province || "—"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.location?.city || ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Register",
      key: "ucdsRef",
      width: 120,
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
      width: 130,
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
      title="Records"
      extra={
        <Typography.Text type="secondary">
          {data ? `${new Intl.NumberFormat().format(data.total)} records` : ""}
        </Typography.Text>
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
              setQuery(DEFAULT_QUERY);
            }}
          >
            Reset
          </Button>
        </Space>

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
    </Card>
  );
};

export default RecordsList;
