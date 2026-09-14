import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { DownloadOutlined, WarningOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  describeApiError,
  fetchFilterOptions,
  fetchOverdue,
  reportCsvUrl,
  runReport,
} from "../api/ermsService";

const PREVIEW_LIMIT = 200;

const cell = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString();
  }
  return String(v);
};

const ErmsReports = () => {
  const [selected, setSelected] = useState(null);

  const { data: options } = useQuery({
    queryKey: ["erms", "filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  const { data: overdue = [] } = useQuery({
    queryKey: ["erms", "overdue"],
    queryFn: fetchOverdue,
  });

  const {
    data: report,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["erms", "report", selected],
    queryFn: () => runReport({ key: selected, limit: PREVIEW_LIMIT }),
    enabled: Boolean(selected),
  });

  const reports = options?.reports || [];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {overdue.length > 0 && (
        <Card size="small" title={<Space><WarningOutlined />Records out past their due date</Space>}>
          <List
            size="small"
            dataSource={overdue}
            renderItem={(o) => (
              <List.Item>
                <Space size={8} wrap>
                  <Link to={`/universe/erms/records/${encodeURIComponent(o.recordSerialNo)}`}>
                    {o.recordSerialNo}
                  </Link>
                  <Typography.Text>{o.record?.proponentName}</Typography.Text>
                  <Tag color="volcano">
                    due {new Date(o.dueDate).toLocaleDateString()}
                  </Tag>
                  {o.toParty && <Typography.Text type="secondary">with {o.toParty}</Typography.Text>}
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      <Card title="Reports">
        <Typography.Paragraph type="secondary">
          Every report covers only the provinces assigned to your account. The
          preview shows the first {PREVIEW_LIMIT} rows; the CSV contains all of them.
        </Typography.Paragraph>

        <List
          itemLayout="horizontal"
          dataSource={reports}
          renderItem={(r) => (
            <List.Item
              actions={[
                <Button key="run" size="small" onClick={() => setSelected(r.key)}>
                  Preview
                </Button>,
                <Button
                  key="csv"
                  size="small"
                  type="primary"
                  icon={<DownloadOutlined />}
                  href={reportCsvUrl(r.key)}
                >
                  CSV
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={r.label}
                description={<Typography.Text type="secondary">{r.description}</Typography.Text>}
              />
            </List.Item>
          )}
          locale={{ emptyText: <Empty description="No reports available" /> }}
        />
      </Card>

      {selected && (
        <Card
          title={report?.label || "Report"}
          extra={
            report && (
              <Space>
                <Typography.Text type="secondary">
                  {new Intl.NumberFormat().format(report.total)} rows
                </Typography.Text>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  href={reportCsvUrl(selected)}
                >
                  Download all as CSV
                </Button>
              </Space>
            )
          }
        >
          {error && (
            <Alert
              type="error"
              showIcon
              message="Could not run the report"
              description={describeApiError(error)}
            />
          )}

          {isFetching && <Skeleton active paragraph={{ rows: 6 }} />}

          {report && !isFetching && (
            <>
              {report.limited && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={`Showing the first ${PREVIEW_LIMIT} of ${new Intl.NumberFormat().format(report.total)} rows. Download the CSV for the full set.`}
                />
              )}
              <Table
                rowKey={(_, i) => i}
                size="small"
                bordered
                dataSource={report.rows}
                pagination={{ pageSize: 25, hideOnSinglePage: true }}
                scroll={{ x: "max-content" }}
                columns={report.columns.map((c) => ({
                  title: c.header,
                  key: c.field,
                  dataIndex: c.field,
                  ellipsis: true,
                  render: cell,
                }))}
              />
            </>
          )}
        </Card>
      )}
    </Space>
  );
};

export default ErmsReports;
