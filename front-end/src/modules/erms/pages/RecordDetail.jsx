import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Result,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useState } from "react";
import {
  ArrowLeftOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  LinkOutlined,
  PaperClipOutlined,
  ProfileOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
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
import ShareDocumentModal from "../components/ShareDocumentModal";
import BoxAssignment from "../components/BoxAssignment";
import AttachmentModal from "../components/AttachmentModal";
import DocumentPanel from "../../../shared/components/DocumentPanel";

const { Text } = Typography;

const date = (d) => (d ? new Date(d).toLocaleDateString() : "");
const dateTime = (d) => (d ? new Date(d).toLocaleString() : "");
const text = (v) => (v === null || v === undefined ? "" : String(v));

// ---------------------------------------------------------------------------
// One record, laid out like the form that made it: the same fields, in the
// same groups, as read-only text fields on tab pages — so a clerk reads a
// record the way they typed it, and the Edit button opens the same layout
// with the fields live. Tracking merges the custody trail kept here with the
// desktop system's own log for the record (see trackingService).
// ---------------------------------------------------------------------------

/** A read-only text field with its label, as the form shows it. */
const Field = ({ label, value, span, mono, warning }) => (
  <div style={span ? { gridColumn: "1 / -1" } : undefined}>
    <div style={{ fontSize: 12, marginBottom: 4 }}>
      <Text type="secondary">{label}</Text>
    </div>
    {warning ? (
      <Tooltip title="Could not be interpreted during migration. This is the original value.">
        <Input readOnly value={text(warning)} status="warning" style={{ fontFamily: "monospace" }} />
      </Tooltip>
    ) : (
      <Input readOnly value={text(value)} placeholder="—" style={mono ? { fontFamily: "monospace" } : undefined} />
    )}
  </div>
);

const Grid = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px 16px" }}>{children}</div>
);

/**
 * One record. On its own page (`/erms/records/:serialNo`) or embedded in a
 * dialog over the register (`serialNo` + `embedded`); when embedded, links
 * to other records hand the serial to `onOpenRecord` instead of navigating.
 */
const RecordDetail = ({ serialNo: serialProp, embedded = false, onOpenRecord }) => {
  const params = useParams();
  const serialNo = serialProp || params.serialNo;
  const navigate = useNavigate();
  const goToRecord = (serial) => (embedded && onOpenRecord ? onOpenRecord(serial) : navigate(`/universe/erms/records/${encodeURIComponent(serial)}`));
  const RecordLink = ({ serial, children }) => (
    <a href={`/universe/erms/records/${encodeURIComponent(serial)}`} onClick={(e) => { e.preventDefault(); goToRecord(serial); }}>
      {children || serial}
    </a>
  );

  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [tab, setTab] = useState("record");

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
    return <Alert type="error" showIcon message="Could not load the record" description={describeApiError(error)} />;
  }

  const { record, attachments, tracking, custody } = data;
  const { permit, project, location, document: doc, ucdsRef, dataQuality } = record;

  // The API is the authority; this only avoids offering an action it refuses.
  // A null writable list means unrestricted.
  const writable = options?.writableProvinces;
  const canWrite = writable === null || (writable || []).includes(location?.province);
  const canShare = options?.canShare === true && Boolean(doc?.fileName);

  const attachmentColumns = [
    { title: "Serial", dataIndex: "serialNo", key: "serialNo", render: (s) => <RecordLink serial={s} /> },
    { title: "File", dataIndex: ["document", "fileName"], key: "file", ellipsis: true },
    { title: "Uploaded", dataIndex: ["document", "uploadedAt"], key: "uploadedAt", render: (d) => date(d) || "—" },
  ];

  const tabs = [
    {
      key: "record",
      label: (
        <Space size={6}>
          <ProfileOutlined />
          Record
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Grid>
            <Field label="Proponent" value={record.proponentName} span />
            <Field label="Project title" value={record.projectTitle} span />
            <Field label="Permit type" value={permit?.label || permit?.type} />
            <Field label="Permit / Ref. No." value={permit?.number} mono />
            <Field label="Process" value={permit?.processSource} />
            <Field label="Serial (FSN)" value={record.serialNo} mono />
            <Field label="Date approved" value={date(permit?.dateApproved)} warning={permit?.dateApprovedRaw} />
            <Field label="Date amended" value={date(permit?.dateAmended)} warning={permit?.dateAmendedRaw} />
            <Field label="Project type" value={project?.type || project?.otherType} span />
            <Field label="Remarks" value={record.remarks} span />
          </Grid>
          {record.isAttachment && record.parentSerialNo && (
            <Alert
              type="info"
              showIcon
              message={
                <span>
                  This is an attachment of <RecordLink serial={record.parentSerialNo} />.
                </span>
              }
            />
          )}
        </Space>
      ),
    },
    {
      key: "location",
      label: (
        <Space size={6}>
          <EnvironmentOutlined />
          Location
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Grid>
            <Field label="Province" value={PROVINCE_LABEL[location?.province] || location?.provinceLabel} />
            <Field label="City / Municipality" value={location?.city} />
            <Field label="Barangay" value={location?.barangay} />
            <Field label="Street" value={location?.street} />
            <Field label="Mailing address" value={location?.mailingAddress} span />
            <Field label="Latitude" value={location?.lat} />
            <Field label="Longitude" value={location?.long} />
          </Grid>
          <Card title="Establishment in the Universe register" size="small">
            {ucdsRef?.sortKey ? (
              <Descriptions column={{ xs: 1, md: 2 }} size="small">
                <Descriptions.Item label="Register key">
                  <Tag icon={<LinkOutlined />} color="green">{ucdsRef.sortKey}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Name on the register">{ucdsRef.nameSnapshot || "—"}</Descriptions.Item>
                <Descriptions.Item label="Matched on">
                  <Tooltip title="How the permit number was resolved: an exact match, one ignoring punctuation, the hazardous-waste id rule, or a digits-only fallback.">
                    <Text type="secondary">{ucdsRef.matchedOn || "—"}</Text>
                  </Tooltip>
                </Descriptions.Item>
                <Descriptions.Item label="Linked on">{date(ucdsRef.capturedAt) || "—"}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>Not linked to a register entry</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      No establishment carries this permit number. That usually means the register does not cover this record, not that the record is wrong.
                    </Text>
                  </Space>
                }
              />
            )}
          </Card>
        </Space>
      ),
    },
    {
      key: "document",
      label: (
        <Space size={6}>
          <FileTextOutlined />
          Document
          {attachments?.length > 0 && <Badge count={attachments.length} size="small" color="blue" />}
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Grid>
            <Field label="File name" value={doc?.fileName} span />
            <Field label="Classification" value={doc?.fileClass} />
            <Field label="Uploaded" value={[dateTime(doc?.uploadedAt), doc?.uploadedBy].filter(Boolean).join(" by ")} />
            {/* The API sends the path to developers only — it describes the
                internal layout of the share, and nobody filing a record
                needs it. Absent for everyone else. */}
            {doc?.sharePath && <Field label="Location on the share" value={doc.sharePath} mono span />}
          </Grid>
          <DocumentPanel serialNo={record.serialNo} fileName={doc?.fileName} canFile={canWrite} />
          {(attachments?.length > 0 || (canWrite && !record.isAttachment)) && (
            <Card
              title={`Attachments (${attachments?.length || 0})`}
              size="small"
              extra={
                canWrite && !record.isAttachment && (
                  <Button size="small" icon={<PaperClipOutlined />} onClick={() => setAttaching(true)}>
                    Add attachment
                  </Button>
                )
              }
            >
              {attachments?.length > 0 ? (
                <Table rowKey="serialNo" size="small" columns={attachmentColumns} dataSource={attachments} pagination={false} />
              ) : (
                <Text type="secondary">An amendment, a certified copy or a letter filed against this record appears here.</Text>
              )}
            </Card>
          )}
        </Space>
      ),
    },
    {
      key: "tracking",
      label: (
        <Space size={6}>
          <HistoryOutlined />
          Tracking
          {tracking?.length > 0 && <Badge count={tracking.length} size="small" color="blue" overflowCount={999} />}
        </Space>
      ),
      children: (
        <TrackingPanel
          serialNo={record.serialNo}
          tracking={tracking}
          custody={custody}
          actions={options?.trackingActions || []}
          canWrite={canWrite}
        />
      ),
    },
    {
      key: "archive",
      label: (
        <Space size={6}>
          <InboxOutlined />
          Archive
        </Space>
      ),
      children: <BoxAssignment record={record} canWrite={canWrite} />,
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <Space size={8} wrap>
          {!embedded && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/universe/erms/records")}>
              Back to records
            </Button>
          )}
          <Text strong style={{ fontSize: 16 }}>{permit?.number || record.serialNo}</Text>
          <Tag color={PERMIT_TYPE_COLOR[permit?.type]}>{permit?.label || permit?.type}</Tag>
          {permit?.number && <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>{record.serialNo}</Text>}
        </Space>
        <Space size={8}>
          {canShare && (
            <Button icon={<ShareAltOutlined />} onClick={() => setSharing(true)}>
              Share
            </Button>
          )}
          {canWrite && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </Space>
      </div>

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

      <Tabs activeKey={tab} onChange={setTab} items={tabs} />

      <RecordFormModal open={editing} record={record} writableProvinces={writable} onClose={() => setEditing(false)} />
      <ShareDocumentModal open={sharing} serialNo={record.serialNo} fileName={doc?.fileName} onClose={() => setSharing(false)} />
      <AttachmentModal open={attaching} parent={record} onClose={() => setAttaching(false)} />
    </Space>
  );
};

export default RecordDetail;
