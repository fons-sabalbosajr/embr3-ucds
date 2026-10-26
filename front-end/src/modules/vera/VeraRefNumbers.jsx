import { useState } from "react";
import { Alert, Button, Card, Empty, InputNumber, Popconfirm, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, CloseOutlined, FileSearchOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { getRefNumberCheck, runRefNumberCheck } from "./veraService";
import { settleRefCheck } from "../erms/api/ermsService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Ref. numbers — VERA reads the Ref. No.
// printed on each Records scan and compares it with the one encoded. Where
// they differ she proposes the scan's number; the Developer applies it, keeps
// the encoded one, or undoes. The same check runs one record at a time from
// the record's page (server services/vera/refNoCheck).
// ---------------------------------------------------------------------------

const errorText = (e, fallback) => e?.response?.data?.message || fallback;
const CONFIDENCE = { high: "green", medium: "gold", low: "default" };
const STATUS = {
  applied: ["green", "applied"],
  kept: ["default", "encoded kept"],
  unreadable: ["gold", "no number read"],
  failed: ["red", "could not read"],
};
const KEY = ["vera", "ref-numbers"];
const mono = { fontFamily: "monospace" };
const recordLink = (s) => (
  <a href={`/e-universe/erms/records/${encodeURIComponent(s)}`} target="_blank" rel="noreferrer" style={mono}>{s}</a>
);

const VeraRefNumbers = () => {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(20);
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: getRefNumberCheck });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["erms"] });
  };

  const run = useMutation({
    mutationFn: () => runRefNumberCheck(limit),
    onSuccess: (r) => {
      refresh();
      const t = r.totals;
      message.success(`VERA read ${t.read} scan(s): ${t.match} match, ${t.differs + t.missing} to look at${t.unreadable ? `, ${t.unreadable} with no number read` : ""}${t.failed ? `, ${t.failed} could not be opened` : ""}.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  const settle = useMutation({
    mutationFn: settleRefCheck,
    onSuccess: (_, v) => {
      refresh();
      message.success(v.action === "apply" ? `${v.serialNo}: the Ref. No. now matches the scan.` : v.action === "undo" ? `${v.serialNo}: the earlier Ref. No. is back.` : `${v.serialNo}: the encoded Ref. No. stands.`);
    },
    onError: (e) => message.error(errorText(e, "That could not be done.")),
  });
  const busy = (serialNo, action) => settle.isPending && settle.variables?.serialNo === serialNo && settle.variables?.action === action;

  const columns = [
    { title: "Record", dataIndex: "serialNo", key: "serialNo", width: 130, render: recordLink },
    { title: "Project", key: "project", render: (_, r) => <Space direction="vertical" size={0}><Text>{r.projectTitle || "—"}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.proponentName || ""}</Text></Space> },
    { title: "Encoded", dataIndex: "encoded", key: "encoded", width: 200, render: (v) => (v ? <Text style={mono}>{v}</Text> : <Text type="secondary">none</Text>) },
    {
      title: "On the scan",
      key: "onScan",
      width: 240,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text strong style={mono}>{r.onScan}</Text>
          <Space size={4} wrap>
            {r.confidence && <Tag color={CONFIDENCE[r.confidence]}>{r.confidence}</Tag>}
            {r.encodedMentioned && <Tooltip title="The scan names the encoded number too — perhaps an amendment citing its original ECC."><Tag color="blue">cites the encoded</Tag></Tooltip>}
            {r.clash && <Tooltip title="The scan is probably filed against the wrong record: move it there from the record's page."><Tag color="red">already on {r.clash.serialNo}</Tag></Tooltip>}
          </Space>
        </Space>
      ),
    },
    {
      title: "",
      key: "act",
      width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Popconfirm title={`Change ${r.serialNo}'s Ref. No. to ${r.proposed}?`} okText="Apply" onConfirm={() => settle.mutate({ serialNo: r.serialNo, action: "apply" })} disabled={Boolean(r.clash)}>
            <Button size="small" type="primary" icon={<CheckOutlined />} disabled={Boolean(r.clash)} loading={busy(r.serialNo, "apply")}>Apply</Button>
          </Popconfirm>
          <Tooltip title="Keep the encoded number">
            <Button size="small" icon={<CloseOutlined />} loading={busy(r.serialNo, "keep")} onClick={() => settle.mutate({ serialNo: r.serialNo, action: "keep" })} aria-label="Keep the encoded number" />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const counts = data?.counts || {};
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        VERA reads the Ref. No. printed on each Records scan — without being told the encoded one — and compares the two, ignoring spacing, punctuation and zero padding. Where they differ she proposes the scan&rsquo;s number. Nothing changes until you apply it; the register link is then worked out again from the new number, and each change can be undone. A number already on another record means the scan is probably misfiled: move it from the record&rsquo;s page instead. One AI call per scan; each is read once, and a later check goes on to the next ones.
      </Paragraph>
      {data && !data.operational && <Alert type="warning" showIcon message="VERA's AI model is not available (Configuration tab), and this check needs it to read the scans." />}
      <Card
        size="small"
        loading={isLoading}
        title={<Space><FileSearchOutlined /><span>Ref. Nos. against the scan</span></Space>}
        extra={
          <Space wrap>
            <InputNumber min={1} max={100} value={limit} onChange={(v) => setLimit(v || 20)} style={{ width: 80 }} aria-label="Scans per check" />
            <Button icon={<FileSearchOutlined />} loading={run.isPending} disabled={!data?.operational} onClick={() => run.mutate()}>
              Check the next {limit}
            </Button>
          </Space>
        }
      >
        {data && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space size={32} wrap>
              <Statistic title="Scans read" value={data.checked} suffix={<Text type="secondary" style={{ fontSize: 13 }}>of {data.withScan}</Text>} />
              <Statistic title="Match" value={counts.match || 0} />
              <Statistic title="To look at" value={(counts.differs || 0) + (counts.missing || 0)} />
              <Statistic title="Applied" value={counts.applied || 0} />
              <Statistic title="Kept" value={counts.kept || 0} />
              <Statistic title="No number read" value={counts.unreadable || 0} />
            </Space>
            <Table
              size="small"
              rowKey="serialNo"
              columns={columns}
              dataSource={data.proposals}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.checked ? "Every scan read so far matches its Ref. No." : "No scan read yet"} /> }}
            />
            {data.recent.length > 0 && (
              <Table
                size="small"
                rowKey="serialNo"
                title={() => <Text strong>Applied, kept and unread</Text>}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                dataSource={data.recent}
                scroll={{ x: "max-content" }}
                columns={[
                  { title: "Record", dataIndex: "serialNo", key: "s", width: 130, render: recordLink },
                  { title: "Encoded", key: "e", render: (_, r) => <Text style={mono}>{(r.status === "applied" ? r.previous : r.encoded) || "—"}</Text> },
                  { title: "On the scan", dataIndex: "onScan", key: "o", render: (v, r) => (v ? <Text style={mono}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>{r.failure || "—"}</Text>) },
                  { title: "", dataIndex: "status", key: "st", render: (s, r) => <Space size={4}><Tag color={STATUS[s]?.[0]}>{STATUS[s]?.[1] || s}</Tag>{s === "applied" && <Text type="secondary" style={{ fontSize: 12 }}>{r.appliedBy} · {dayjs(r.appliedAt).format("MMM D")}</Text>}</Space> },
                  { title: "", key: "a", width: 90, render: (_, r) => r.status === "applied" && <Button size="small" icon={<UndoOutlined />} loading={busy(r.serialNo, "undo")} onClick={() => settle.mutate({ serialNo: r.serialNo, action: "undo" })}>Undo</Button> },
                ]}
              />
            )}
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default VeraRefNumbers;
