import { useState } from "react";
import { Alert, Badge, Button, Card, Skeleton, Space, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { CloudUploadOutlined, EditOutlined, FileTextOutlined, HistoryOutlined, InboxOutlined, PaperClipOutlined, ProfileOutlined, ShareAltOutlined } from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDocument } from "../api/ermsService";
import DocumentPanel from "../../../shared/components/DocumentPanel";
import { DetailHeader, Field, FieldGroup, Grid } from "../components/DetailParts";
import { useUnits } from "./useUnits";
import { formatValue, groupFields, unitTheme } from "./unitTheme";
import UnitUploadModal from "./UnitUploadModal";
import UnitScanModal from "./UnitScanModal";
import UnitHistoryPanel from "./UnitHistoryPanel";
import TrackingPanel from "../components/TrackingPanel";
import BoxAssignment from "../components/BoxAssignment";
import PrintLabel from "../components/PrintLabel";
import ScanTextPanel from "../components/ScanTextPanel";
import { fetchUnitTracking } from "../api/ermsService";

// ---------------------------------------------------------------------------
// One Legal or Laboratory document, laid out as a Records record is (the
// same DetailParts, the same tabs): its fields as the unit's form groups
// them, the scan (view only), its attachments (a Legal case keeps them
// together, and files new ones from here), the other documents on the same
// docket, and the document's history.
//
// On its own page (`/erms/:unit/documents/:serialNo`) or embedded in a dialog
// over the document list (`unit` + `serialNo` + `embedded`), as Records
// does. Embedded, a link to another document hands its serial to
// `onOpenDocument` instead of navigating, so the dialog follows it.
// ---------------------------------------------------------------------------

const dateTime = (d) => (d ? new Date(d).toLocaleString() : "");

const UnitDocumentDetail = ({ unit: unitProp, serialNo: serialProp, embedded = false, onOpenDocument }) => {
  const params = useParams();
  const unit = unitProp || params.unit;
  const serialNo = serialProp || params.serialNo;
  const navigate = useNavigate();
  const pageOf = (serial) => `/e-universe/erms/${unit}/documents/${encodeURIComponent(serial)}`;
  const docLink = (serial) =>
    embedded && onOpenDocument ? (
      <Typography.Link onClick={() => onOpenDocument(serial)}>{serial}</Typography.Link>
    ) : (
      <Link to={pageOf(serial)}>{serial}</Link>
    );
  const theme = unitTheme(unit);
  const { unit: unitOf } = useUnits();
  const unitConfig = unitOf(unit);
  const [editing, setEditing] = useState(false);
  const [filingScan, setFilingScan] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [tab, setTab] = useState("details");

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "unit", unit, "document", serialNo],
    queryFn: () => fetchUnitDocument(unit, serialNo),
  });
  // Its custody trail, for the Tracking tab.
  const { data: custodyTrail } = useQuery({ queryKey: ["erms", "unit", unit, "tracking", serialNo], queryFn: () => fetchUnitTracking(unit, serialNo), enabled: Boolean(serialNo) });

  if (isLoading) return <Skeleton active paragraph={{ rows: 12 }} />;
  if (error) return <Alert type="error" showIcon message="Could not load the document" description={describeApiError(error)} />;

  const doc = data.document;
  const docType = unitConfig?.docTypes.find((t) => t.code === doc.docType);
  const fields = docType?.fields || Object.keys(doc.fields || {}).map((key) => ({ key, label: key, type: "text" }));
  const sections = groupFields(unit, fields);
  const canFile = Boolean(unitConfig?.canFile);
  // What the document is known by besides its serial, as the list shows it.
  const known = (unit === "legal" ? doc.fields?.docketNo : doc.fields?.cocNo) || doc.serialNo;
  const related = data.related || [];
  const attachments = data.attachments || [];
  // A case document takes attachments where the unit files them (Legal).
  const takesAttachments = !doc.parentSerialNo && Boolean(unitConfig?.docTypes.some((t) => t.code === "attachment"));
  const docColumns = [
    { title: "Serial", dataIndex: "serialNo", render: (s) => docLink(s) },
    { title: "Type", dataIndex: "docTypeLabel", render: (v, r) => <Tag color={theme.color}>{r.fields?.documentType || v || r.docType}</Tag> },
    { title: "Uploaded", dataIndex: "createdAt", responsive: ["sm"], render: (v, r) => formatValue({ type: "date" }, r.document?.uploadedAt || v) },
    { title: "File", dataIndex: ["document", "fileName"], ellipsis: true, responsive: ["md"] },
  ];

  const tabs = [
    {
      key: "details",
      label: (
        <Space size={6}>
          <ProfileOutlined />
          Details
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Grid>
            <Field label="Title" value={doc.title} span />
            <Field label="Document type" value={doc.docTypeLabel || doc.docType} />
            <Field label="Serial" value={doc.serialNo} mono />
            <Field label="Province" value={doc.provinceLabel || "Unfiled"} />
          </Grid>
          {sections.map((section, i) => (
            <FieldGroup key={section.title || i} title={section.title}>
              {section.fields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={doc.fields?.[f.key] == null || doc.fields[f.key] === "" ? null : formatValue(f, doc.fields[f.key])}
                  warning={doc.fields?.[`${f.key}Raw`]}
                  span={f.type === "textarea"}
                />
              ))}
            </FieldGroup>
          ))}
          {doc.parentSerialNo && (
            <Alert type="info" showIcon message={<span>This is an attachment of {docLink(doc.parentSerialNo)}.</span>} />
          )}
        </Space>
      ),
    },
    {
      key: "document",
      label: (
        <Space size={6}>
          <FileTextOutlined />
          Document
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Grid>
            <Field label="File name" value={doc.document?.fileName} path span />
            <Field label="Uploaded" value={[dateTime(doc.document?.uploadedAt || doc.createdAt), doc.document?.uploadedBy || doc.createdBy].filter(Boolean).join(" by ")} />
            {doc.legacy && <Field label="From" value={`the desktop ERMS (${doc.legacy.table})`} />}
            {/* The API sends the path to developers only. */}
            {doc.document?.sharePath && <Field label="Location on the share" value={doc.document.sharePath} mono path span />}
          </Grid>
          {!doc.document?.fileName && canFile && (
            <Alert
              type="warning"
              showIcon
              message="No scan is filed for this document"
              action={<Button size="small" type="primary" icon={<CloudUploadOutlined />} onClick={() => setFilingScan(true)}>Upload scan</Button>}
            />
          )}
          <DocumentPanel serialNo={doc.serialNo} fileName={doc.document?.fileName} unit={unit} />
          <ScanTextPanel unit={unit} serialNo={doc.serialNo} text={doc.scanText} readAt={doc.scanTextAt} hasScan={Boolean(doc.document?.fileName)} />
          {doc.document?.fileName && canFile && (
            <div>
              <Button icon={<CloudUploadOutlined />} onClick={() => setFilingScan(true)}>Replace scan</Button>
            </div>
          )}
        </Space>
      ),
    },
    takesAttachments && {
      key: "attachments",
      label: (
        <Space size={6}>
          <PaperClipOutlined />
          Attachments
          {attachments.length > 0 && <Badge count={attachments.length} size="small" color={theme.accent} />}
        </Space>
      ),
      children: (
        <Card
          size="small"
          title={`Attachments (${attachments.length})`}
          extra={
            canFile && (
              <Button size="small" icon={<PaperClipOutlined />} onClick={() => setAttaching(true)}>
                Add attachment
              </Button>
            )
          }
        >
          {attachments.length ? (
            <Table rowKey="id" size="small" pagination={false} dataSource={attachments} columns={docColumns} />
          ) : (
            <Typography.Text type="secondary">An inspection report, a complaint, a letter or a copy filed with this case appears here, numbered after it.</Typography.Text>
          )}
        </Card>
      ),
    },
    related.length > 0 && {
      key: "docket",
      label: (
        <Space size={6}>
          <ShareAltOutlined />
          Same docket
          <Badge count={related.length} size="small" color={theme.accent} />
        </Space>
      ),
      children: (
        <Card size="small" title={`Docket ${doc.fields?.docketNo}`}>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={related}
            columns={docColumns}
          />
        </Card>
      ),
    },
    {
      key: "box",
      label: (
        <Space size={6}>
          <InboxOutlined />
          Archive box
          {doc.archive?.boxCode && <Tag style={{ marginInlineEnd: 0 }}>{doc.archive.boxCode}</Tag>}
        </Space>
      ),
      children: <BoxAssignment unit={unit} record={doc} canWrite={canFile} />,
    },
    {
      key: "history",
      label: (
        <Space size={6}>
          <HistoryOutlined />
          Tracking
        </Space>
      ),
      children: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {/* Who holds the paper file, and its movements — as a record's. */}
          <TrackingPanel
            unit={unit}
            serialNo={doc.serialNo}
            tracking={custodyTrail?.tracking || []}
            custody={custodyTrail?.custody}
            actions={custodyTrail?.actions || []}
            canWrite={canFile}
          />
          <UnitHistoryPanel unit={unit} serialNo={doc.serialNo} fields={fields} />
        </Space>
      ),
    },
  ].filter(Boolean);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <DetailHeader
        unit={unit}
        title={known}
        typeLabel={doc.docTypeLabel || doc.docType}
        serialNo={doc.serialNo}
        tags={
          doc.legacy && (
            <Tooltip title="Filed in the desktop ERMS and migrated">
              <Tag>desktop</Tag>
            </Tooltip>
          )
        }
        onBack={embedded ? null : () => navigate(`/e-universe/erms/${unit}/documents`)}
        actions={
          <>
            {canFile && (
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <PrintLabel
              code={doc.serialNo}
              path={`/e-universe/erms/${unit}/documents/${encodeURIComponent(doc.serialNo)}`}
              lines={[doc.docTypeLabel || doc.docType, doc.fields?.docketNo || doc.fields?.cocNo, doc.title]}
            />
          </>
        }
      />

      <Tabs activeKey={tab} onChange={setTab} items={tabs} />

      <UnitUploadModal unit={unit} unitConfig={unitConfig} open={editing} document={doc} onClose={() => setEditing(false)} />
      <UnitScanModal unit={unit} unitConfig={unitConfig} open={filingScan} document={doc} onClose={() => setFilingScan(false)} />
      {takesAttachments && <UnitUploadModal unit={unit} unitConfig={unitConfig} open={attaching} attachTo={doc} onClose={() => setAttaching(false)} />}
    </Space>
  );
};

export default UnitDocumentDetail;
