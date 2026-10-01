import { useState } from "react";
import { Alert, Button, Card, Descriptions, Divider, Skeleton, Space, Table, Tag, Typography } from "antd";
import { ArrowLeftOutlined, EditOutlined } from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { describeApiError, fetchUnitDocument } from "../api/ermsService";
import DocumentPanel from "../../../shared/components/DocumentPanel";
import { useUnits } from "./useUnits";
import { formatValue, groupFields, unitTheme } from "./unitTheme";
import UnitUploadModal from "./UnitUploadModal";

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// One Legal or Laboratory document: its fields as the unit's form groups
// them, the scan (view only), and the other documents on the same docket.
// ---------------------------------------------------------------------------

const UnitDocumentDetail = () => {
  const { unit, serialNo } = useParams();
  const navigate = useNavigate();
  const theme = unitTheme(unit);
  const { unit: unitOf } = useUnits();
  const unitConfig = unitOf(unit);
  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erms", "unit", unit, "document", serialNo],
    queryFn: () => fetchUnitDocument(unit, serialNo),
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (error) return <Alert type="error" showIcon message={describeApiError(error, "Could not load the document.")} />;

  const doc = data.document;
  const docType = unitConfig?.docTypes.find((t) => t.code === doc.docType);
  const sections = groupFields(unit, docType?.fields || Object.keys(doc.fields || {}).map((key) => ({ key, label: key, type: "text" })));

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/universe/erms/${unit}/documents`)}>
            Documents
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            <span style={{ color: theme.accent, marginRight: 8 }}>{theme.icon}</span>
            {doc.serialNo}
          </Title>
          <Tag color={theme.color}>{doc.docTypeLabel || doc.docType}</Tag>
          {doc.legacy && <Tag>from the desktop ERMS</Tag>}
        </Space>
        {unitConfig?.canFile && (
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )}
      </Space>

      <Card size="small" title={doc.title} style={{ borderTop: `3px solid ${theme.accent}` }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} bordered>
          <Descriptions.Item label="Province">{doc.provinceLabel || "—"}</Descriptions.Item>
          <Descriptions.Item label="Filed">{formatValue({ type: "date" }, doc.createdAt)} by {doc.createdBy || "—"}</Descriptions.Item>
          <Descriptions.Item label="File">{doc.document?.fileName || "—"}</Descriptions.Item>
          {doc.parentSerialNo && (
            <Descriptions.Item label="Attached to">
              <Link to={`/universe/erms/${unit}/documents/${encodeURIComponent(doc.parentSerialNo)}`}>{doc.parentSerialNo}</Link>
            </Descriptions.Item>
          )}
        </Descriptions>
        {sections.map((section, i) => (
          <div key={section.title || i}>
            <Divider orientation="left" plain>{section.title || "Details"}</Divider>
            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
              {section.fields.map((f) => (
                <Descriptions.Item key={f.key} label={f.label}>
                  {formatValue(f, doc.fields?.[f.key])}
                  {doc.fields?.[`${f.key}Raw`] && <Text type="warning" style={{ marginLeft: 6, fontSize: 12 }}>(as written: {doc.fields[`${f.key}Raw`]})</Text>}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </div>
        ))}
      </Card>

      <Card size="small" title="Scanned document">
        <DocumentPanel serialNo={doc.serialNo} fileName={doc.document?.fileName} unit={unit} />
      </Card>

      {data.related?.length > 0 && (
        <Card size="small" title={`Same docket — ${doc.fields?.docketNo}`}>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.related}
            columns={[
              { title: "Serial", dataIndex: "serialNo", render: (s) => <Link to={`/universe/erms/${unit}/documents/${encodeURIComponent(s)}`}>{s}</Link> },
              { title: "Type", dataIndex: "docTypeLabel", render: (v, r) => <Tag color={theme.color}>{v || r.docType}</Tag> },
              { title: "Filed", dataIndex: "createdAt", render: (v) => formatValue({ type: "date" }, v) },
              { title: "File", dataIndex: ["document", "fileName"], ellipsis: true },
            ]}
          />
        </Card>
      )}

      <UnitUploadModal unit={unit} unitConfig={unitConfig} open={editing} document={doc} onClose={() => setEditing(false)} />
    </Space>
  );
};

export default UnitDocumentDetail;
