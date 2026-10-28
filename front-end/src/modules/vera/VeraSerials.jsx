import { useState } from "react";
import { Alert, Button, Card, Empty, Popconfirm, Segmented, Space, Statistic, Table, Tag, Typography } from "antd";
import { NumberOutlined, ReloadOutlined, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { fixSerials, getSerialCheck, runSerialCheck } from "./veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Serial numbers — VERA's check of the
// serials in Records, Legal Services and Laboratory: two documents with one
// serial, serials in no series, counters behind the highest serial on file
// (the next save would take a used number), attachments whose record is
// missing, and numbers skipped. She fixes the counters herself; the rest is
// listed for the Developer, since renaming a serial breaks what names it.
// ---------------------------------------------------------------------------

const KIND = {
  duplicate: { label: "Same serial twice", color: "red" },
  malformed: { label: "Not in a series", color: "volcano" },
  behind: { label: "Counter behind", color: "orange" },
  orphan: { label: "Attachment without its record", color: "gold" },
  gaps: { label: "Numbers skipped", color: "default" },
};
const SEVERITY = { problem: "Problem", review: "To review", note: "Note" };
const errorText = (e, fallback) => e?.response?.data?.message || fallback;

const VeraSerials = () => {
  const queryClient = useQueryClient();
  const [unit, setUnit] = useState("all");
  const { data: report, isLoading } = useQuery({ queryKey: ["vera", "serials"], queryFn: getSerialCheck });
  const keep = (next) => queryClient.setQueryData(["vera", "serials"], next);

  const check = useMutation({
    mutationFn: runSerialCheck,
    onSuccess: (next) => {
      keep(next);
      message.success(`VERA checked the serials: ${next.totals.problems} problem(s), ${next.totals.review} to review.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  const fix = useMutation({
    mutationFn: fixSerials,
    onSuccess: (res) => {
      keep(res.report);
      queryClient.invalidateQueries({ queryKey: ["erms"] });
      message.success(res.fixed ? `VERA moved ${res.fixed} counter(s) up to the highest serial on file.` : "Nothing for VERA to fix.");
    },
    onError: (e) => message.error(errorText(e, "VERA could not fix the counters.")),
  });

  const units = report?.units || [];
  const findings = units
    .filter((u) => unit === "all" || u.unit === unit)
    .flatMap((u) => u.findings.map((f) => ({ ...f, unitLabel: u.label })));
  const columns = [
    { title: "Unit", dataIndex: "unitLabel", key: "unit", width: 130 },
    { title: "Issue", dataIndex: "kind", key: "kind", width: 220, render: (k) => <Tag color={KIND[k]?.color}>{KIND[k]?.label || k}</Tag> },
    { title: "Serial", dataIndex: "serialNo", key: "serialNo", width: 220, render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
    { title: "What VERA found", dataIndex: "detail", key: "detail" },
    { title: "", dataIndex: "severity", key: "severity", width: 100, render: (s, f) => (f.fix ? <Tag color="blue">VERA fixes</Tag> : <Text type="secondary">{SEVERITY[s]}</Text>) },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        VERA reads every serial in the three ERMS units. A counter behind the highest serial on file means the next save would take a number already used — she moves it up herself (never down, and nothing filed changes). Duplicates, serials outside any series and attachments without their record are listed for you: renaming a serial would break the labels, links and logs that name it.
      </Paragraph>
      <Card
        size="small"
        loading={isLoading}
        title={
          <Space>
            <NumberOutlined />
            <span>Serial numbers</span>
            {report && <Text type="secondary" style={{ fontSize: 12 }}>checked {dayjs(report.finishedAt).format("MMM D, YYYY h:mm A")}{report.by ? ` by ${report.by}` : ""}</Text>}
          </Space>
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={check.isPending} onClick={() => check.mutate()}>
              {report ? "Check again" : "Check the serials"}
            </Button>
            <Popconfirm
              title="Let VERA fix the counters?"
              description="Every counter behind the highest serial on file is moved up to it. Nothing already filed changes."
              okText="Fix them"
              onConfirm={() => fix.mutate()}
              disabled={!report?.totals?.fixable}
            >
              <Button type="primary" icon={<ToolOutlined />} loading={fix.isPending} disabled={!report?.totals?.fixable}>
                Let VERA fix it
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        {!report ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No check has been run yet. It takes a few seconds." />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space size={32} wrap>
              <Statistic title="Problems" value={report.totals.problems} valueStyle={report.totals.problems ? { color: "#cf1322" } : undefined} />
              <Statistic title="To review" value={report.totals.review} />
              <Statistic title="VERA can fix" value={report.totals.fixable} />
              {units.map((u) => (
                <Statistic key={u.unit} title={`${u.label} documents`} value={u.documents} />
              ))}
            </Space>
            {!report.totals.problems && !report.totals.review && <Alert type="success" showIcon message="Every serial is in order." />}
            <Table
              size="small"
              rowKey="key"
              title={() => <Text strong>Series</Text>}
              pagination={false}
              dataSource={units.flatMap((u) => u.series.map((s) => ({ ...s, key: `${u.unit}:${s.prefix}`, unitLabel: u.label })))}
              columns={[
                { title: "Unit", dataIndex: "unitLabel", key: "unit", width: 130 },
                { title: "Series", dataIndex: "series", key: "series" },
                { title: "Documents", dataIndex: "count", key: "count", align: "right" },
                { title: "Highest on file", dataIndex: "highest", key: "highest", render: (v) => <Text style={{ fontFamily: "monospace" }}>{v}</Text> },
                { title: "Counter", dataIndex: "counter", key: "counter", align: "right", render: (v) => v ?? <Text type="secondary">not started</Text> },
                { title: "Skipped", dataIndex: "missing", key: "missing", align: "right" },
              ]}
              tableLayout="fixed"
            />
            <Segmented
              value={unit}
              onChange={setUnit}
              options={[{ value: "all", label: "All units" }, ...units.map((u) => ({ value: u.unit, label: `${u.label} (${u.findings.length})` }))]}
            />
            <Table size="small" rowKey="id" columns={columns} dataSource={findings} pagination={{ pageSize: 20, hideOnSinglePage: true }} tableLayout="fixed" locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing found" /> }} />
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default VeraSerials;
