import { useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, FileExclamationOutlined, FileTextOutlined, LinkOutlined, ReloadOutlined, SearchOutlined, UpOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { API_BASE } from "../../../config/api";
// The same panel the Records Unit sees on a record, reaching the document
// through the UCDS-domain routes (domain="ucds").
import DocumentPanel from "../../../shared/components/DocumentPanel";
import "./establishmentrecords.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The record window's Documents tab: the permits, clearances and documents
// filed for this establishment in the Records Document Library — linked to
// its register serial, or holding one of its permit numbers (from 2027 the
// register is renumbered, and the permit numbers are what still match).
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
// When the list is not available the tab says why (the server answers
// { available: false, reason }) — it used to stay blank.
// ---------------------------------------------------------------------------

const PERMIT_COLOR = {
  "ecc-original": "green",
  "ecc-amended": "gold",
  cnc: "blue",
  "hw-generator": "volcano",
};

const WHY = {
  "no-access": {
    type: "info",
    message: "Documents are kept in ERMS, which your account does not open.",
    description: "Ask the Records Unit for a copy, or ask an administrator to give your account ERMS access.",
  },
  off: { type: "info", message: "The Records Document Library is switched off.", description: "An administrator can switch it on again in the settings." },
  error: { type: "warning", message: "The Document Library could not be reached just now.", description: "Try again in a moment." },
};

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

const fetchRecords = async (sortKey) => {
  const { data } = await axios.get(`${API_BASE}/ucds/establishments/${encodeURIComponent(sortKey)}/records?limit=200`, { withCredentials: true });
  return data;
};

const EstablishmentRecordsPanel = ({ sortKey }) => {
  const [expanded, setExpanded] = useState([]);
  const [q, setQ] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["ucds", "establishment-records", sortKey],
    queryFn: () => fetchRecords(sortKey),
    enabled: Boolean(sortKey),
    retry: false,
  });

  const records = useMemo(() => data?.records || [], [data]);
  const byType = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      const k = r.permit?.label || r.permit?.type || "Other";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return records;
    return records.filter((r) => [r.serialNo, r.permit?.number, r.permit?.label, r.projectTitle, r.proponentName, r.document?.fileName].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [records, q]);

  if (!sortKey) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This record has no serial yet, so no documents can be found for it." />;
  if (isLoading) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (isError) {
    const notFound = error?.response?.status === 404;
    return (
      <Alert
        type={notFound ? "info" : "warning"}
        showIcon
        message={notFound ? "This establishment is not in the register you are viewing." : "The documents could not be loaded."}
        description={notFound ? "It may be in another year's Monitoring Plan." : "Check the connection, then try again."}
        action={
          !notFound && (
            <Button size="small" onClick={() => refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }
  if (data && !data.available) {
    const why = WHY[data.reason] || WHY.error;
    return (
      <Alert
        type={why.type}
        showIcon
        message={why.message}
        description={why.description}
        action={
          data.reason === "error" && (
            <Button size="small" onClick={() => refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  const toggle = (serialNo) => setExpanded((keys) => (keys.includes(serialNo) ? keys.filter((k) => k !== serialNo) : [...keys, serialNo]));
  const withScan = records.filter((r) => r.document?.fileName).length;

  const columns = [
    {
      title: "Type",
      key: "type",
      width: 150,
      render: (_, r) => (
        <Tag color={PERMIT_COLOR[r.permit?.type]} style={{ marginInlineEnd: 0 }}>
          {r.permit?.label || r.permit?.type || "—"}
        </Tag>
      ),
    },
    {
      title: "Number",
      key: "number",
      width: 210,
      render: (_, r) => (r.permit?.number ? <Text className="er-mono">{r.permit.number}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: "Document",
      key: "document",
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Text ellipsis={{ tooltip: r.projectTitle || r.document?.fileName }} style={{ maxWidth: "100%" }}>
            {r.projectTitle || r.document?.fileName || "—"}
          </Text>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {r.serialNo}
            {r.proponentName ? ` · ${r.proponentName}` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Filed",
      key: "filed",
      width: 115,
      sorter: (a, b) => String(a.document?.uploadedAt || "").localeCompare(String(b.document?.uploadedAt || "")),
      render: (_, r) => (r.document?.uploadedAt ? dayjs(r.document.uploadedAt).format("MMM D, YYYY") : <Text type="secondary">—</Text>),
    },
    {
      title: "Found by",
      key: "matched",
      width: 120,
      render: (_, r) =>
        r.matchedBy === "permit" ? (
          <Tooltip title="Holds one of this establishment's permit numbers">
            <Tag style={{ marginInlineEnd: 0 }}>same permit no.</Tag>
          </Tooltip>
        ) : (
          <Tooltip title="Linked to this establishment in the Document Library">
            <Tag icon={<LinkOutlined />} color="geekblue" style={{ marginInlineEnd: 0 }}>
              linked
            </Tag>
          </Tooltip>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 104,
      align: "right",
      render: (_, r) =>
        r.document?.fileName ? (
          <Button size="small" type={expanded.includes(r.serialNo) ? "default" : "primary"} ghost={!expanded.includes(r.serialNo)} icon={expanded.includes(r.serialNo) ? <UpOutlined /> : <EyeOutlined />} onClick={() => toggle(r.serialNo)}>
            {expanded.includes(r.serialNo) ? "Close" : "Open"}
          </Button>
        ) : (
          <Tooltip title="No scanned document is filed for this record yet">
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FileExclamationOutlined /> no scan
            </Text>
          </Tooltip>
        ),
    },
  ];

  return (
    <div className="er">
      <div className="er-bar">
        <Space size={10} wrap>
          <FileTextOutlined />
          <Text strong>Permits, clearances and documents</Text>
          <Text type="secondary">
            {fmt(data.total)} found · {fmt(withScan)} with the scan
          </Text>
        </Space>
        <Space size={8} wrap>
          <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="Filter by number, title, serial" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
          <Tooltip title="Look again">
            <Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
          </Tooltip>
        </Space>
      </div>

      {byType.length > 1 && (
        <Space size={[6, 6]} wrap className="er-types">
          {byType.map(([label, n]) => (
            <Tag key={label} style={{ marginInlineEnd: 0 }}>
              {label} <b>{n}</b>
            </Tag>
          ))}
        </Space>
      )}

      {data.total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No document is filed for this establishment yet — none is linked to it, and none holds one of its permit numbers." />
      ) : (
        <>
          <Table
            size="small"
            rowKey="serialNo"
            columns={columns}
            dataSource={shown}
            tableLayout="fixed"
            pagination={shown.length > 10 ? { pageSize: 10, size: "small", showSizeChanger: false, showTotal: (t) => `${fmt(t)} document(s)` } : false}
            scroll={{ x: 820 }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing matches the filter." /> }}
            expandable={{
              expandedRowKeys: expanded,
              onExpandedRowsChange: (keys) => setExpanded([...keys]),
              rowExpandable: (r) => Boolean(r.document?.fileName),
              // Viewing, or asking to view, is the row's own business.
              expandedRowRender: (r) => <DocumentPanel serialNo={r.serialNo} fileName={r.document?.fileName} domain="ucds" />,
            }}
          />
          {data.total > records.length && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              The {fmt(records.length)} most recent of {fmt(data.total)} are listed; search the Document Library for the rest.
            </Text>
          )}
        </>
      )}
    </div>
  );
};

export default EstablishmentRecordsPanel;
