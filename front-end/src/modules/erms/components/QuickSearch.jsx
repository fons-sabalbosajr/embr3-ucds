import { useState } from "react";
import { Alert, Button, Empty, Input, Modal, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, FilePdfOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PERMIT_TYPE_COLOR, PROVINCE_LABEL, describeApiError, fetchRecords, fetchUnitDocuments } from "../api/ermsService";
import { DocumentViewer } from "../../../shared/components/DocumentPanel";
import FloatingModal from "../../../shared/components/FloatingModal";
import RecordDetail from "../pages/RecordDetail";
import UnitDocumentDetail from "../units/UnitDocumentDetail";
import { unitTheme } from "../units/unitTheme";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Quick search, on a unit dashboard's title card: type a serial, a permit or
// docket number, a proponent, firm or project, and the matches open in a
// dialog over the dashboard — each with a quick view of its scan and a way
// into the record.
//
// Nothing is decided here. The list comes from the unit's own search (the
// Records library's, or Legal's / the Laboratory's), so it holds only what
// the account may read — its unit, its provinces. The scan opens through the
// shared viewer, which asks the server before showing anything: view only,
// the page limit and watermark applied, and anyone outside the unit pointed
// to the Document Portal.
// ---------------------------------------------------------------------------

const LIMIT = 20;
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/** A result in one shape, whichever unit it came from. */
const shape = (unit, row) =>
  unit === "records"
    ? {
        key: row.serialNo,
        serialNo: row.serialNo,
        number: row.permit?.number,
        kind: row.permit?.label || row.permit?.type,
        kindColor: PERMIT_TYPE_COLOR[row.permit?.type],
        title: row.projectTitle,
        who: row.proponentName,
        province: PROVINCE_LABEL[row.location?.province] || row.location?.province,
        uploadedAt: row.document?.uploadedAt,
        fileName: row.document?.fileName,
      }
    : {
        key: row.id || row.serialNo,
        serialNo: row.serialNo,
        number: row.fields?.docketNo || row.fields?.cocNo,
        kind: row.docTypeLabel || row.docType,
        title: row.title,
        who: row.fields?.companyAddress || row.fields?.address,
        province: row.provinceLabel || row.province,
        uploadedAt: row.document?.uploadedAt || row.createdAt,
        fileName: row.document?.fileName,
      };

const QuickSearch = ({ unit = "records" }) => {
  const theme = unitTheme(unit);
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null); // a result whose scan is open
  const [details, setDetails] = useState(null); // a serial whose record is open

  const results = useQuery({
    queryKey: ["erms", unit === "records" ? "records" : "unit", ...(unit === "records" ? [] : [unit, "documents"]), { quick: term }],
    queryFn: () =>
      unit === "records"
        ? fetchRecords({ search: term, page: 1, pageSize: LIMIT, sortBy: "document.uploadedAt", sortDir: -1 })
        : fetchUnitDocuments(unit, { search: term, page: 1, pageSize: LIMIT }),
    enabled: open && term.length > 0,
    retry: false,
  });

  const search = (value) => {
    const v = String(value || "").trim();
    if (!v) return;
    setDraft(v);
    setTerm(v);
    setOpen(true);
  };

  const rows = (results.data?.items || []).map((r) => shape(unit, r));
  const total = results.data?.total || 0;
  const library = unit === "records" ? "/e-universe/erms/records" : `/e-universe/erms/${unit}/documents`;

  const columns = [
    {
      title: "Serial",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 150,
      render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text>,
    },
    {
      title: unit === "records" ? "Permit / Ref. No." : unit === "legal" ? "Docket / Type" : "COC / Type",
      key: "number",
      width: 190,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ overflowWrap: "anywhere" }}>{r.number || "—"}</Text>
          {r.kind && (
            <Tag color={r.kindColor || theme.color} style={{ marginInlineEnd: 0, width: "fit-content" }}>
              {r.kind}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Details",
      key: "title",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.title || "—"}</Text>
          {r.who && <Text>{r.who}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[r.province, r.uploadedAt ? `uploaded ${when(r.uploadedAt)}` : null].filter(Boolean).join(" · ") || "—"}
          </Text>
        </Space>
      ),
    },
    {
      title: "Action",
      key: "actions",
      width: 96,
      align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={r.fileName ? "Quick view of the document" : "No scan filed"}>
            <Button size="small" type="primary" ghost icon={<FilePdfOutlined />} disabled={!r.fileName} onClick={() => setViewing(r)} aria-label="Quick view" />
          </Tooltip>
          <Tooltip title="Open the record">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetails(r.serialNo)} aria-label="Open the record" />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Input.Search
        allowClear
        placeholder={unit === "records" ? "Quick search: FSN, permit no., proponent…" : unit === "legal" ? "Quick search: serial, docket, company…" : "Quick search: serial, COC no., firm…"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onSearch={search}
        enterButton={<SearchOutlined />}
        style={{ width: 300, maxWidth: "100%" }}
        aria-label="Quick search for a document"
      />

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width="min(980px, 96vw)"
        style={{ top: 40 }}
        title={
          <Space size={8}>
            <SearchOutlined style={{ color: theme.accent }} />
            <span>Quick search</span>
          </Space>
        }
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Input.Search allowClear value={draft} onChange={(e) => setDraft(e.target.value)} onSearch={search} enterButton="Search" autoFocus />
          {results.error ? (
            <Alert type="error" showIcon message={describeApiError(results.error, "The search could not be run.")} />
          ) : (
            <Table
              rowKey="key"
              size="small"
              bordered
              tableLayout="fixed"
              loading={results.isFetching}
              columns={columns}
              dataSource={rows}
              pagination={false}
              scroll={{ x: 640, y: "56vh" }}
              onRow={(r) => ({ onDoubleClick: () => setDetails(r.serialNo), style: { cursor: "pointer" } })}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={term ? `Nothing on file matches “${term}”.` : "Type something to search for."} /> }}
            />
          )}
          {total > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {total > rows.length ? `The ${rows.length} newest of ${new Intl.NumberFormat().format(total)} matches.` : `${total} match${total === 1 ? "" : "es"}.`}
              </Text>
              <Link to={`${library}?search=${encodeURIComponent(term)}`} onClick={() => setOpen(false)}>
                All matches in the Document Library <RightOutlined style={{ fontSize: 10 }} />
              </Link>
            </div>
          )}
        </Space>
      </Modal>

      {/* The scan, over the results: view only, and only what the server allows. */}
      <DocumentViewer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        serialNo={viewing?.serialNo}
        unit={unit === "records" ? undefined : unit}
        fileName={viewing?.fileName}
        refNo={unit === "records" ? viewing?.number : undefined}
      />

      {/* The record itself, in a window over the results. */}
      <FloatingModal
        open={Boolean(details)}
        onCancel={() => setDetails(null)}
        width={1100}
        maxHeight="88vh"
        title={<Text type="secondary" style={{ fontSize: 13 }}>Record details · <span style={{ fontFamily: "monospace" }}>{details}</span></Text>}
        bodyStyle={{ paddingTop: 8 }}
      >
        {details &&
          (unit === "records" ? (
            <RecordDetail serialNo={details} embedded onOpenRecord={setDetails} />
          ) : (
            <UnitDocumentDetail unit={unit} serialNo={details} embedded onOpenDocument={setDetails} />
          ))}
      </FloatingModal>
    </>
  );
};

export default QuickSearch;
