import { useState } from "react";
import { Button, Card, Empty, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, FileTextOutlined, FileExclamationOutlined, UpOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { API_BASE } from "../../../config/api";
// The same panel the Records Unit sees on a record, reaching the document
// through the UCDS-domain routes (domain="ucds").
import DocumentPanel from "../../../shared/components/DocumentPanel";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Permits, clearances and documents filed against this establishment.
//
// This is where records live now. The standalone Records screens were removed,
// so this panel had to stop being a list of links into them and start being
// the place a document is actually opened.
//
// Every document is addressed by its record serial. The stored share path is
// never sent from the browser and never accepted from it: the server looks it
// up, resolves it inside the configured share and streams the bytes. Whoever
// cannot read the record cannot read its document either, because both go
// through the same province scope.
//
// Opening a document follows the Records Unit's rule: the Records Unit views;
// a Planning Admin or an Encoder asks from the row, and views once approved.
// The row expands to the document panel, which shows whichever applies.
//
// Renders nothing when the records module is unavailable to the viewer: the
// API answers { available: false } rather than an error, so a Monitoring Plan
// screen never breaks because document access is off.
// ---------------------------------------------------------------------------

const PERMIT_COLOR = {
  "ecc-original": "green",
  "ecc-amended": "gold",
  cnc: "blue",
  "hw-generator": "volcano",
};

const fetchRecords = async (sortKey) => {
  const { data } = await axios.get(
    `${API_BASE}/ucds/establishments/${encodeURIComponent(sortKey)}/records?limit=50`,
    { withCredentials: true }
  );
  return data;
};

const EstablishmentRecordsPanel = ({ sortKey, limit = 25 }) => {
  const [expanded, setExpanded] = useState([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ucds", "establishment-records", sortKey],
    queryFn: () => fetchRecords(sortKey),
    enabled: Boolean(sortKey),
    retry: false,
  });

  // Silent by design — an unavailable records module is not a planning error.
  if (isError || (data && !data.available)) return null;
  if (!sortKey) return null;

  if (isLoading) {
    return (
      <Card size="small" title="Related permits, clearances and documents">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  const toggle = (serialNo) =>
    setExpanded((keys) => (keys.includes(serialNo) ? keys.filter((k) => k !== serialNo) : [...keys, serialNo]));

  const columns = [
    {
      title: "Type",
      dataIndex: ["permit", "label"],
      key: "type",
      width: 150,
      render: (label, r) => (
        <Tag color={PERMIT_COLOR[r.permit?.type]} style={{ marginInlineEnd: 0 }}>
          {label || r.permit?.type || "—"}
        </Tag>
      ),
    },
    {
      title: "Number",
      dataIndex: ["permit", "number"],
      key: "number",
      width: 190,
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "Document",
      key: "document",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text ellipsis style={{ maxWidth: 420 }}>
            {r.document?.fileName || r.projectTitle || "—"}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.serialNo}
            {r.document?.fileClass ? ` · ${r.document.fileClass}` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Filed",
      key: "filed",
      width: 120,
      render: (_, r) =>
        r.document?.uploadedAt ? (
          dayjs(r.document.uploadedAt).format("D MMM YYYY")
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_, r) =>
        r.document?.fileName ? (
          <Button
            size="small"
            icon={expanded.includes(r.serialNo) ? <UpOutlined /> : <EyeOutlined />}
            onClick={() => toggle(r.serialNo)}
          >
            {expanded.includes(r.serialNo) ? "Close" : "Open"}
          </Button>
        ) : (
          <Tooltip title="This record has no scanned document filed against it">
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FileExclamationOutlined /> no file
            </Text>
          </Tooltip>
        ),
    },
  ];

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <FileTextOutlined />
          <span>Related permits, clearances and documents</span>
          <Text type="secondary">{new Intl.NumberFormat().format(data.total)}</Text>
        </Space>
      }
    >
      {data.total === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No records are linked to this establishment"
        />
      ) : (
        <>
          <Table
            size="small"
            rowKey="serialNo"
            columns={columns}
            dataSource={data.records.slice(0, limit)}
            pagination={false}
            scroll={{ x: 820 }}
            expandable={{
              expandedRowKeys: expanded,
              onExpandedRowsChange: (keys) => setExpanded([...keys]),
              rowExpandable: (r) => Boolean(r.document?.fileName),
              // Viewing, or asking to view, is the row's own business.
              expandedRowRender: (r) => (
                <DocumentPanel serialNo={r.serialNo} fileName={r.document?.fileName} domain="ucds" />
              ),
            }}
          />
          {data.total > limit && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Showing {limit} of {new Intl.NumberFormat().format(data.total)}.
            </Text>
          )}
        </>
      )}
    </Card>
  );
};

export default EstablishmentRecordsPanel;
