import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Form, InputNumber, Popconfirm, Select, Space, Statistic, Switch, Table, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, FileSearchOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { applyProjectTypes, getProjectTypeCheck, runProjectTypeCheck, saveProjectTypeSettings, settleProjectType } from "./veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Project types — VERA reads each Records
// document (the first pages of its scan, with its title and proponent) and
// says which project type it is. Where that differs from the record's, she
// proposes it, with her reason. The Developer applies, sets aside or undoes.
// ---------------------------------------------------------------------------

const errorText = (e, fallback) => e?.response?.data?.message || fallback;
const CONFIDENCE = { high: "green", medium: "gold", low: "default" };
const KEY = ["vera", "project-types"];

const VeraProjectTypes = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [selected, setSelected] = useState([]);
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: getProjectTypeCheck });
  useEffect(() => {
    if (data?.settings) form.setFieldsValue(data.settings);
  }, [data?.settings, form]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["erms"] });
  };

  const save = useMutation({
    mutationFn: saveProjectTypeSettings,
    onSuccess: () => {
      message.success("Project type check settings saved.");
      refresh();
    },
    onError: (e) => message.error(errorText(e, "The settings could not be saved.")),
  });
  const run = useMutation({
    mutationFn: runProjectTypeCheck,
    onSuccess: (r) => {
      refresh();
      message.success(`VERA read ${r.totals.read} document(s) (${r.totals.withScan} with the scan): ${r.totals.proposals} to correct, ${r.totals.agree} filed right${r.totals.unsure ? `, ${r.totals.unsure} too unsure to propose` : ""}.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  const apply = useMutation({
    mutationFn: applyProjectTypes,
    onSuccess: (r) => {
      setSelected([]);
      refresh();
      message.success(`Applied ${r.applied} correction(s); ${r.changed} record(s) updated.`);
    },
    onError: (e) => message.error(errorText(e, "The corrections could not be applied.")),
  });
  const settle = useMutation({
    mutationFn: settleProjectType,
    onSuccess: refresh,
    onError: (e) => message.error(errorText(e, "That could not be done.")),
  });

  const settings = data?.settings;
  const columns = [
    { title: "Record", dataIndex: "serialNo", key: "serialNo", width: 130, render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
    { title: "Project", key: "project", render: (_, r) => <Space direction="vertical" size={0}><Text>{r.projectTitle || "—"}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.proponentName || ""}</Text></Space> },
    { title: "On file", dataIndex: "current", key: "current", width: 200, render: (v) => v || <Text type="secondary">none</Text> },
    { title: "VERA reads it as", dataIndex: "suggested", key: "suggested", width: 220, render: (v, r) => <Space direction="vertical" size={2}><Text strong>{v}</Text><Space size={4}><Tag color={CONFIDENCE[r.confidence]}>{r.confidence}</Tag>{r.readScan ? <Tag icon={<FileSearchOutlined />}>from the scan</Tag> : <Tag>from the record</Tag>}</Space></Space> },
    { title: "Why", dataIndex: "reason", key: "reason", render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: "",
      key: "act",
      width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<CheckOutlined />} loading={apply.isPending && apply.variables?.serialNos?.includes(r.serialNo)} onClick={() => apply.mutate({ serialNos: [r.serialNo] })}>Apply</Button>
          <Button size="small" icon={<CloseOutlined />} onClick={() => settle.mutate({ serialNo: r.serialNo, action: "dismiss" })} aria-label="Set aside" />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        VERA reads each Records document — the first pages of its scan, with its title, proponent and specific project type — and says which project type it is, from the Records Unit&rsquo;s list. Where that differs from the record, she proposes the change and says why. Nothing changes until you apply it. Each document is read once; a later check goes on to the next ones. Reading a scan uses the AI model: one call per document.
      </Paragraph>

      <Card size="small" title="Settings" loading={isLoading}>
        <Form form={form} layout="inline" onFinish={(v) => save.mutate(v)} style={{ rowGap: 8 }}>
          <Form.Item name="enabled" label="Check project types" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="readScans" label="Read the scan" valuePropName="checked" tooltip="Off: VERA judges from the record's title, proponent and specific type only."><Switch /></Form.Item>
          <Form.Item name="pages" label="First pages" tooltip="How many pages of each scan VERA reads."><InputNumber min={1} max={5} style={{ width: 70 }} /></Form.Item>
          <Form.Item name="perRun" label="Documents per check" tooltip="One model call each."><InputNumber min={1} max={200} style={{ width: 90 }} /></Form.Item>
          <Form.Item name="minConfidence" label="Propose when VERA is at least">
            <Select style={{ width: 120 }} options={[{ value: "high", label: "Sure" }, { value: "medium", label: "Fairly sure" }, { value: "low", label: "Unsure" }]} />
          </Form.Item>
          <Button htmlType="submit" icon={<SaveOutlined />} loading={save.isPending}>Save</Button>
        </Form>
        {data && !data.operational && <Alert style={{ marginTop: 12 }} type="warning" showIcon message="VERA's AI model is not available (Configuration tab), and this check needs it to read the documents." />}
      </Card>

      <Card
        size="small"
        loading={isLoading}
        title={<Space><FileSearchOutlined /><span>Project types against the document</span></Space>}
        extra={
          <Space wrap>
            <Button icon={<FileSearchOutlined />} loading={run.isPending} disabled={!settings?.enabled || !data?.operational} onClick={() => run.mutate()}>
              Check the next {settings?.perRun || 20}
            </Button>
            <Popconfirm title={`Apply all ${data?.proposals?.length || 0} proposals?`} okText="Apply all" onConfirm={() => apply.mutate({ all: true })} disabled={!data?.proposals?.length}>
              <Button type="primary" icon={<CheckOutlined />} disabled={!data?.proposals?.length} loading={apply.isPending && apply.variables?.all}>Apply all</Button>
            </Popconfirm>
          </Space>
        }
      >
        {data && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space size={32} wrap>
              <Statistic title="Documents read" value={data.checked} suffix={<Text type="secondary" style={{ fontSize: 13 }}>of {data.records}</Text>} />
              <Statistic title="To correct" value={data.counts.proposed || 0} />
              <Statistic title="Filed right" value={data.counts.ok || 0} />
              <Statistic title="Applied" value={data.counts.applied || 0} />
              <Statistic title="Set aside" value={data.counts.dismissed || 0} />
            </Space>
            {selected.length > 0 && (
              <Button icon={<CheckOutlined />} onClick={() => apply.mutate({ serialNos: selected })} loading={apply.isPending}>Apply the {selected.length} ticked</Button>
            )}
            <Table
              size="small"
              rowKey="serialNo"
              columns={columns}
              dataSource={data.proposals}
              rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              tableLayout="fixed"
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.checked ? "Nothing to correct among the documents read" : "No document read yet"} /> }}
            />
            {data.recent.length > 0 && (
              <Table
                size="small"
                rowKey="serialNo"
                title={() => <Text strong>Applied, set aside and unsure</Text>}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                dataSource={data.recent}
                tableLayout="fixed"
                columns={[
                  { title: "Record", dataIndex: "serialNo", key: "s", width: 130, render: (s) => <Text style={{ fontFamily: "monospace" }}>{s}</Text> },
                  { title: "On file", dataIndex: "current", key: "c" },
                  { title: "VERA's reading", dataIndex: "suggested", key: "g" },
                  { title: "", dataIndex: "status", key: "st", render: (s, r) => <Space size={4}><Tag color={s === "applied" ? "green" : s === "unsure" ? "gold" : "default"}>{s === "unsure" ? "too unsure" : s === "dismissed" ? "set aside" : s}</Tag>{s === "applied" && <Text type="secondary" style={{ fontSize: 12 }}>{r.appliedBy} · {dayjs(r.appliedAt).format("MMM D")}</Text>}</Space> },
                  { title: "", key: "a", width: 90, render: (_, r) => r.status === "applied" && <Button size="small" icon={<UndoOutlined />} onClick={() => settle.mutate({ serialNo: r.serialNo, action: "undo" })}>Undo</Button> },
                ]}
              />
            )}
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default VeraProjectTypes;
