import { useState } from "react";
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Space, Table, Typography } from "antd";
import { DownloadOutlined, FileTextOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import UnitHeader from "../components/UnitHeader";
import { message } from "../../../shared/feedback";
import { describeApiError, downloadReportCsv, fetchReport, fetchReports } from "../api/ermsService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// ERMS · Records › Reports: the ready-made reports (the inventory, records
// with no register entry, records needing review, records not yet in a box),
// each shown here and downloadable as CSV for a spreadsheet. Within the
// person's provinces, like every other Records screen.
// ---------------------------------------------------------------------------

const ErmsReports = () => {
  const [key, setKey] = useState(null);
  const { data: list, isLoading: listing, error: listError } = useQuery({ queryKey: ["erms", "reports"], queryFn: fetchReports, staleTime: 10 * 60 * 1000 });
  const reports = list || [];
  const chosen = key || reports[0]?.key;
  const { data: report, isFetching, error } = useQuery({ queryKey: ["erms", "report", chosen], queryFn: () => fetchReport(chosen), enabled: Boolean(chosen) });
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadReportCsv(chosen);
    } catch (e) {
      message.error(describeApiError(e, "The report could not be downloaded."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <UnitHeader unit="records" title="Reports" description="Ready-made lists of the Records collection, to read here or download for a spreadsheet." />
      {listError && <Alert type="error" showIcon message={describeApiError(listError, "Could not load the reports.")} />}
      <Row gutter={[12, 12]}>
        {listing
          ? [1, 2, 3, 4].map((i) => (
              <Col key={i} xs={24} sm={12} lg={6}>
                <Card size="small"><Skeleton active paragraph={{ rows: 2 }} /></Card>
              </Col>
            ))
          : reports.map((r) => (
              <Col key={r.key} xs={24} sm={12} lg={6}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => setKey(r.key)}
                  style={{ height: "100%", borderColor: r.key === chosen ? "var(--eu-accent)" : undefined, boxShadow: r.key === chosen ? "0 0 0 1px var(--eu-accent)" : undefined }}
                >
                  <Space direction="vertical" size={4}>
                    <Text strong><FileTextOutlined /> {r.label}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text>
                  </Space>
                </Card>
              </Col>
            ))}
      </Row>
      {chosen && (
        <Card
          size="small"
          title={report?.label || "Report"}
          extra={
            <Space>
              {report && <Text type="secondary">{new Intl.NumberFormat().format(report.total)} rows{report.limited ? ` (first ${report.rows.length.toLocaleString()} shown)` : ""}</Text>}
              <Button icon={<DownloadOutlined />} loading={downloading} onClick={download}>Download CSV</Button>
            </Space>
          }
        >
          {error ? (
            <Alert type="error" showIcon message={describeApiError(error, "The report could not be run.")} />
          ) : (
            <>
              {report?.description && <Paragraph type="secondary" style={{ fontSize: 12 }}>{report.description}</Paragraph>}
              <Table
                size="small"
                bordered
                loading={isFetching}
                rowKey={(r, i) => r.serialNo || i}
                dataSource={report?.rows || []}
                columns={(report?.columns || []).map((c) => ({
                  title: c.header,
                  // Rows come flat, keyed by the full field name ("permit.label").
                  dataIndex: c.field,
                  key: c.field,
                  render: (v) => (v instanceof Object ? JSON.stringify(v) : /date|At$/i.test(c.field) && v ? String(v).slice(0, 10) : v ?? "—"),
                }))}
                pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100] }}
                scroll={{ x: "max-content" }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in this report" /> }}
              />
            </>
          )}
        </Card>
      )}
    </Space>
  );
};

export default ErmsReports;
