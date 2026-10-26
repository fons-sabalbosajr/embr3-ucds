import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
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
  CheckCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  LinkOutlined,
  PaperClipOutlined,
  ProfileOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PERMIT_TYPE_COLOR,
  PROVINCE_LABEL,
  describeApiError,
  fetchFilterOptions,
  fetchRecord,
  markRecordReviewed,
} from "../api/ermsService";
import { message } from "../../../shared/feedback";
import TrackingPanel from "../components/TrackingPanel";
import RecordFormModal from "../components/RecordFormModal";
import BoxAssignment from "../components/BoxAssignment";
import AttachmentModal from "../components/AttachmentModal";
import DocumentPanel from "../../../shared/components/DocumentPanel";
import MoveFileModal from "../components/MoveFileModal";
import PrintLabel from "../components/PrintLabel";
import ScanTextPanel from "../components/ScanTextPanel";
import RefNoCheckPanel from "../components/RefNoCheckPanel";
import { fetchCurrentUser } from "../../../api/universeService";
import { DetailHeader, Field, Grid } from "../components/DetailParts";

const { Text } = Typography;

const date = (d) => (d ? new Date(d).toLocaleDateString() : "");
const dateTime = (d) => (d ? new Date(d).toLocaleString() : "");

// ---------------------------------------------------------------------------
// One record, laid out like the form that made it: the same fields, in the
// same groups, as labelled text on tab pages (DetailParts — the Legal and
// Laboratory documents are drawn from the same parts) — and the Edit button
// opens the same layout with the fields live. Tracking merges the custody
// trail kept here with the desktop system's own log for the record (see
// trackingService).
// ---------------------------------------------------------------------------

/**
 * One record. On its own page (`/erms/records/:serialNo`) or embedded in a
 * dialog over the register (`serialNo` + `embedded`); when embedded, links
 * to other records hand the serial to `onOpenRecord` instead of navigating.
 */
const RecordDetail = ({ serialNo: serialProp, embedded = false, onOpenRecord }) => {
  const params = useParams();
  const serialNo = serialProp || params.serialNo;
  const navigate = useNavigate();
  const goToRecord = (serial) => (embedded && onOpenRecord ? onOpenRecord(serial) : navigate(`/e-universe/erms/records/${encodeURIComponent(serial)}`));
  const RecordLink = ({ serial, children }) => (
    <a href={`/e-universe/erms/records/${encodeURIComponent(serial)}`} onClick={(e) => { e.preventDefault(); goToRecord(serial); }}>
      {children || serial}
    </a>
  );

  const [editing, setEditing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [moving, setMoving] = useState(false);
  // Moving a scan to another record is the Developer's or an administrator's.
  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchCurrentUser, staleTime: 5 * 60 * 1000, retry: false });
  const canMove = ["developer", "admin"].includes(me?.role);
  const [tab, setTab] = useState("record");

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "record", serialNo],
    queryFn: () => fetchRecord(serialNo),
    retry: false,
  });

  // Off "Needs review" by hand; the dashboard's count and the lists follow at once.
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: () => markRecordReviewed({ serialNo }),
    onSuccess: () => {
      message.success(`${serialNo} is off "Needs review".`);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
    },
    onError: (e) => message.error(describeApiError(e, "The record could not be marked reviewed.")),
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
            <Button type="primary" onClick={() => navigate("/e-universe/erms/records")}>
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
            <Field label="Permit / Ref. No." value={permit?.number} mono copy />
            <Field label="Process" value={permit?.processSource} />
            <Field label="Serial (FSN)" value={record.serialNo} mono />
            <Field label="Date approved" value={date(permit?.dateApproved)} warning={permit?.dateApprovedRaw} />
            <Field label="Date amended" value={date(permit?.dateAmended)} warning={permit?.dateAmendedRaw} />
            {/* The record's other ECC Ref Nos — an amendment's, a re-issue's — each with its date approved. */}
            {(permit?.refs || []).map((r, i) => (
              <Field key={`ref${i}`} label={r.label ? `Other Ref. No. (${r.label})` : "Other Ref. No."} value={[r.number, r.dateApproved ? `approved ${date(r.dateApproved)}` : null].filter(Boolean).join(" · ")} mono span copy={r.number || false} />
            ))}
            <Field label="Project type" value={project?.type} span />
            <Field label="Specific project type" value={project?.otherType} span />
            <Field label="Remarks" value={record.remarks} span />
          </Grid>
          {/* The encoded Ref. No. against the one printed on the scan. An
              attachment carries its record's number, so it is checked there. */}
          {!record.isAttachment && (doc?.fileName || doc?.sharePath) && (
            <RefNoCheckPanel serialNo={record.serialNo} canWrite={canWrite} onOpenRecord={embedded && onOpenRecord ? onOpenRecord : null} />
          )}
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
            <Field label="File name" value={doc?.fileName} path span />
            <Field label="Classification" value={doc?.fileClass} />
            <Field label="Uploaded" value={[dateTime(doc?.uploadedAt), doc?.uploadedBy].filter(Boolean).join(" by ")} />
            {/* The API sends the path to developers only — it describes the
                internal layout of the share, and nobody filing a record
                needs it. Absent for everyone else. */}
            {doc?.sharePath && <Field label="Location on the share" value={doc.sharePath} mono path span />}
          </Grid>
          <DocumentPanel serialNo={record.serialNo} fileName={doc?.fileName} canFile={canWrite} refNo={permit?.number} />
          <ScanTextPanel unit="records" serialNo={record.serialNo} text={record.scanText} readAt={record.scanTextAt} hasScan={Boolean(doc?.fileName || doc?.sharePath)} />
          {canMove && (doc?.fileName || doc?.sharePath) && (
            <Space size={8} wrap>
              <Button icon={<SwapOutlined />} onClick={() => setMoving(true)}>
                Move scan to another record
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>Filed against the wrong record? VERA suggests where it belongs.</Text>
            </Space>
          )}
          {(doc?.movedFrom || doc?.movedTo) && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {doc.movedFrom ? `Scan moved here from ${doc.movedFrom}` : `Scan moved to ${doc.movedTo}`}
              {doc.movedBy ? ` by ${doc.movedBy}` : ""}
              {doc.movedAt ? ` on ${dateTime(doc.movedAt)}` : ""}.
            </Text>
          )}
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
      <DetailHeader
        unit="records"
        title={permit?.number || record.serialNo}
        typeLabel={permit?.label || permit?.type}
        typeColor={PERMIT_TYPE_COLOR[permit?.type]}
        serialNo={record.serialNo}
        onBack={embedded ? null : () => navigate("/e-universe/erms/records")}
        // In the dialog the right edge is the close X's: the Edit button sits
        // on the left, with the title, rather than crowded against it.
        actionsFirst={embedded}
        actions={
          <>
            {canWrite && (
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {/* For the paper file's folder: the FSN, what it is, and a QR code to it. */}
            <PrintLabel
              code={record.serialNo}
              path={`/e-universe/erms/records/${encodeURIComponent(record.serialNo)}`}
              lines={[[permit?.label, permit?.number].filter(Boolean).join(" · "), record.proponentName, record.projectTitle]}
            />
          </>
        }
      />

      {dataQuality?.clean === false && (
        <Alert
          type="warning"
          showIcon
          message="This record has a value that could not be interpreted"
          action={
            canWrite ? (
              <Tooltip title="Put the value right with Edit and the flag clears by itself. If what is left is correct as it stands, mark it reviewed.">
                <Button size="small" icon={<CheckCircleOutlined />} loading={review.isPending} onClick={() => review.mutate()}>
                  Mark as reviewed
                </Button>
              </Tooltip>
            ) : null
          }
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
      <AttachmentModal open={attaching} parent={record} onClose={() => setAttaching(false)} />
      <MoveFileModal open={moving} record={record} onClose={(res) => { setMoving(false); if (res && embedded && onOpenRecord) onOpenRecord(res.to); }} />
    </Space>
  );
};

export default RecordDetail;
