import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Result,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useState } from "react";
import {
  ArrowLeftOutlined,
  EditOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchFilterOptions,
  fetchRecord,
} from "../api/ermsService";
import TrackingPanel from "../components/TrackingPanel";
import RecordFormModal from "../components/RecordFormModal";
import BoxAssignment from "../components/BoxAssignment";
import DocumentPanel from "../components/DocumentPanel";

const date = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const dateTime = (d) => (d ? new Date(d).toLocaleString() : "—");
const orDash = (v) => (v === null || v === undefined || v === "" ? "—" : v);

/**
 * A value that could not be interpreted during migration. The original text is
 * shown rather than hidden, so whoever fixes it can see what was actually
 * recorded.
 */
const RawValue = ({ raw }) => (
  <Tooltip title="Could not be interpreted during migration. This is the original value.">
    <Tag color="warning" style={{ fontFamily: "monospace" }}>
      {raw}
    </Tag>
  </Tooltip>
);

const RecordDetail = () => {
  const { serialNo } = useParams();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "record", serialNo],
    queryFn: () => fetchRecord(serialNo),
    retry: false,
  });

  const { data: options } = useQuery({
    queryKey: ["erms", "filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 12 }} />;

  if (error) {
    const status = error?.response?.status;
    if (status === 404) {
      return (
        <Result
          status="404"
          title="Record not found"
          subTitle={`No record with serial ${serialNo}, or it lies outside the provinces assigned to your account.`}
          extra={
            <Button type="primary" onClick={() => navigate("/universe/erms/records")}>
              Back to records
            </Button>
          }
        />
      );
    }
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load the record"
        description={describeApiError(error)}
      />
    );
  }

  const { record, attachments, tracking, custody } = data;
  const { permit, project, location, document: doc, ucdsRef, dataQuality } = record;

  // The API is the authority; this only avoids offering an action it refuses.
  // A null writable list means unrestricted.
  const writable = options?.writableProvinces;
  const canWrite = writable === null || (writable || []).includes(location?.province);

  const attachmentColumns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      render: (s) => <Link to={`/universe/erms/records/${encodeURIComponent(s)}`}>{s}</Link>,
    },
    { title: "File", dataIndex: ["document", "fileName"], key: "file", ellipsis: true },
    {
      title: "Uploaded",
      dataIndex: ["document", "uploadedAt"],
      key: "uploadedAt",
      render: date,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/universe/erms/records")}>
          Back to records
        </Button>
        {record.isAttachment && record.parentSerialNo && (
          <Link to={`/universe/erms/records/${encodeURIComponent(record.parentSerialNo)}`}>
            This is an attachment of {record.parentSerialNo}
          </Link>
        )}
        {canWrite && (
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Edit record
          </Button>
        )}
      </Space>

      {dataQuality?.clean === false && (
        <Alert
          type="warning"
          showIcon
          message="This record has a value that could not be interpreted"
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {dataQuality.issues.map((i, idx) => (
                <li key={idx}>
                  <strong>{i.field}</strong> — {i.problem}
                  {i.value ? `: "${i.value}"` : ""}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card
        title={
          <Space size={8} wrap>
            <span>{record.serialNo}</span>
            <Tag color={PERMIT_TYPE_COLOR[permit?.type]}>{permit?.label || permit?.type}</Tag>
          </Space>
        }
      >
        <Descriptions column={{ xs: 1, sm: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label="Proponent" span={2}>
            {orDash(record.proponentName)}
          </Descriptions.Item>
          <Descriptions.Item label="Project title" span={2}>
            {orDash(record.projectTitle)}
          </Descriptions.Item>
          <Descriptions.Item label="Permit number">{orDash(permit?.number)}</Descriptions.Item>
          <Descriptions.Item label="Process">{orDash(permit?.processSource)}</Descriptions.Item>
          <Descriptions.Item label="Approved">
            {permit?.dateApprovedRaw ? <RawValue raw={permit.dateApprovedRaw} /> : date(permit?.dateApproved)}
          </Descriptions.Item>
          <Descriptions.Item label="Amended">
            {permit?.dateAmendedRaw ? <RawValue raw={permit.dateAmendedRaw} /> : date(permit?.dateAmended)}
          </Descriptions.Item>
          <Descriptions.Item label="Project type" span={2}>
            {orDash(project?.type || project?.otherType)}
          </Descriptions.Item>
          <Descriptions.Item label="Province">
            {PROVINCE_LABEL[location?.province] || orDash(location?.provinceLabel)}
          </Descriptions.Item>
          <Descriptions.Item label="City / Municipality">{orDash(location?.city)}</Descriptions.Item>
          <Descriptions.Item label="Barangay">{orDash(location?.barangay)}</Descriptions.Item>
          <Descriptions.Item label="Street">{orDash(location?.street)}</Descriptions.Item>
          {record.remarks && (
            <Descriptions.Item label="Remarks" span={2}>
              {record.remarks}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="Establishment in the UCDS register" size="small">
        {ucdsRef?.sortKey ? (
          <Descriptions column={{ xs: 1, md: 2 }} size="small">
            <Descriptions.Item label="Register key">
              <Tag icon={<LinkOutlined />} color="green">
                {ucdsRef.sortKey}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Name on the register">
              {orDash(ucdsRef.nameSnapshot)}
            </Descriptions.Item>
            <Descriptions.Item label="Matched on">
              <Tooltip title="How the permit number was resolved: an exact match, one ignoring punctuation, the hazardous-waste id rule, or a digits-only fallback.">
                <Typography.Text type="secondary">{orDash(ucdsRef.matchedOn)}</Typography.Text>
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label="Linked on">{date(ucdsRef.capturedAt)}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={2}>
                <Typography.Text>Not linked to a register entry</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  No establishment carries this permit number. That usually means the
                  register does not cover this record, not that the record is wrong.
                </Typography.Text>
              </Space>
            }
          />
        )}
      </Card>

      <Card title="Document" size="small">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="File name">{orDash(doc?.fileName)}</Descriptions.Item>
          <Descriptions.Item label="Classification">
            <Tag>{orDash(doc?.fileClass)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Uploaded">
            {dateTime(doc?.uploadedAt)} by {orDash(doc?.uploadedBy)}
          </Descriptions.Item>
          {/* The API sends this to developers only — the path describes the
              internal layout of the records share, and nobody filing a record
              needs it. Absent for everyone else, so the row simply is not
              there rather than showing an empty one. */}
          {doc?.sharePath && (
            <Descriptions.Item label="Location on the share">
              <Typography.Text code style={{ fontSize: 12, wordBreak: "break-all" }}>
                {doc.sharePath}
              </Typography.Text>
            </Descriptions.Item>
          )}
        </Descriptions>

        <DocumentPanel serialNo={record.serialNo} fileName={doc?.fileName} />
      </Card>

      <BoxAssignment record={record} canWrite={canWrite} />

      <TrackingPanel
        serialNo={record.serialNo}
        tracking={tracking}
        custody={custody}
        actions={options?.trackingActions || []}
        canWrite={canWrite}
      />

      <RecordFormModal
        open={editing}
        record={record}
        writableProvinces={writable}
        onClose={() => setEditing(false)}
      />

      {attachments?.length > 0 && (
        <Card title={`Attachments (${attachments.length})`} size="small">
          <Table
            rowKey="serialNo"
            size="small"
            columns={attachmentColumns}
            dataSource={attachments}
            pagination={false}
          />
        </Card>
      )}
    </Space>
  );
};

export default RecordDetail;
