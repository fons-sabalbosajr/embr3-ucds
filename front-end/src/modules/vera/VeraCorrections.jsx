import { useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Popconfirm, Segmented, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, ReloadOutlined, RobotOutlined, ThunderboltOutlined, ToolOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { applyCorrections, autoFixCorrections, getCorrections, runCorrectionsCheck, undoCorrection } from "./veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Data corrections — VERA's report to the
// Developer on the Records project types and specific project types.
//
// VERA checks every value in the Document Library and proposes one spelling
// for each: the same wording with different capitals or spacing, values the
// desktop system cut short, and (with the AI model on) misspellings. Nothing
// changes until the Developer applies it — all, or the ones ticked — and
// each applied change can be undone, back to exactly the records it touched.
// ---------------------------------------------------------------------------

const errorText = (e, fallback) => e?.response?.data?.message || fallback;

const VeraCorrections = () => {
  const queryClient = useQueryClient();
  const [field, setField] = useState("all");
  const [certainOnly, setCertainOnly] = useState(false);
  const [selected, setSelected] = useState([]);

  const { data, isLoading, error } = useQuery({ queryKey: ["vera", "corrections"], queryFn: getCorrections });
  const report = data?.current || null;
  const refresh = (next) => {
    if (next?.report || next?.current) queryClient.setQueryData(["vera", "corrections"], next.report || next);
    else queryClient.invalidateQueries({ queryKey: ["vera", "corrections"] });
    queryClient.invalidateQueries({ queryKey: ["erms"] });
  };

  const check = useMutation({
    mutationFn: runCorrectionsCheck,
    onSuccess: (next) => {
      setSelected([]);
      refresh(next);
      message.success(`VERA checked the Document Library: ${next.current?.totals?.proposals || 0} correction(s) proposed.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  // VERA fixes what she is sure of — the same value written several ways,
  // values cut short — and leaves spellings and near-identical names for review.
  const autoFix = useMutation({
    mutationFn: autoFixCorrections,
    onSuccess: (res) => {
      setSelected([]);
      refresh(res);
      message.success(`VERA fixed ${res.applied} value(s) in ${res.changed} record(s).${res.left ? ` ${res.left} more need your eye — they are in the report.` : ""}`);
    },
    onError: (e) => message.error(errorText(e, "VERA could not fix the data.")),
  });
  const apply = useMutation({
    mutationFn: applyCorrections,
    onSuccess: (res) => {
      setSelected([]);
      refresh(res);
      message.success(`Applied ${res.applied} correction(s); ${res.changed} record(s) updated.`);
    },
    onError: (e) => message.error(errorText(e, "The corrections could not be applied.")),
  });
  const undo = useMutation({
    mutationFn: undoCorrection,
    onSuccess: (res) => {
      refresh(res);
      message.success(`Undone: ${res.restored} record(s) put back.`);
    },
    onError: (e) => message.error(errorText(e, "That could not be undone.")),
  });

  const rows = useMemo(
    () =>
      (report?.proposals || []).filter(
        (p) => (field === "all" || p.field === field) && (!certainOnly || p.confidence === "certain")
      ),
    [report, field, certainOnly]
  );
  const pending = (report?.proposals || []).filter((p) => !p.applied);
  const pendingRecords = pending.reduce((a, p) => a + p.count, 0);
  const appliedCount = (report?.proposals || []).filter((p) => p.applied).length;

  if (error) return <Alert type="error" showIcon message={errorText(error, "The report could not be loaded.")} />;

  const columns = [
    { title: "Field", dataIndex: "fieldLabel", width: 150, render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: "Now",
      dataIndex: "from",
      render: (v, p) => <Text delete={p.applied} type={p.applied ? "secondary" : "danger"} style={{ whiteSpace: "pre-wrap" }}>{v}</Text>,
    },
    { title: "Becomes", dataIndex: "to", render: (v) => <Text style={{ color: "#389e0d", fontWeight: 500 }}>{v}</Text> },
    { title: "Records", dataIndex: "count", width: 90, align: "right", sorter: (a, b) => a.count - b.count },
    {
      title: "Why",
      key: "why",
      width: 230,
      render: (_, p) => (
        <Space size={4} wrap>
          <Tag color={p.confidence === "certain" ? "green" : "gold"}>{p.reason}</Tag>
          {p.method === "vera-ai" && (
            <Tooltip title="Suggested by VERA's AI model, checked to be a spelling fix only">
              <Tag icon={<RobotOutlined />} color="purple">VERA AI</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "state",
      width: 190,
      render: (_, p) =>
        p.applied ? (
          <Space size={4} direction="vertical">
            <Text type="success" style={{ fontSize: 12 }}>
              <CheckOutlined /> {p.changed} updated · {p.appliedBy} · {dayjs(p.appliedAt).format("MMM D, h:mm A")}
            </Text>
            <Popconfirm title="Put these records back as they were?" okText="Undo" onConfirm={() => undo.mutate({ reportId: report.id, proposalId: p.id })}>
              <Button size="small" icon={<UndoOutlined />} loading={undo.isPending && undo.variables?.proposalId === p.id}>
                Undo
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Waiting for you</Text>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        VERA checks the <Text strong>project types</Text>, <Text strong>specific project types</Text>, <Text strong>project titles</Text>,{" "}
        <Text strong>proponents</Text> and <Text strong>places</Text> of every record in the Records Document Library and proposes one spelling for
        each: the same wording written with different capitals or spacing, values the desktop system cut short, and — with the AI model on —
        misspelled project types. Nothing changes until you apply it, and every change can be undone.
      </Paragraph>

      <Card
        size="small"
        title={
          <Space>
            <ThunderboltOutlined />
            <span>VERA&rsquo;s report</span>
            {report && <Text type="secondary" style={{ fontSize: 12 }}>checked {dayjs(report.finishedAt).format("MMM D, YYYY h:mm A")}{report.by ? ` by ${report.by}` : ""}</Text>}
          </Space>
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={check.isPending} disabled={autoFix.isPending} onClick={() => check.mutate()}>
              {report ? "Check again" : "Check the data"}
            </Button>
            <Popconfirm
              title="Let VERA fix the data?"
              description="She checks again, then changes every value she is certain of (the same wording written differently, values cut short). Spellings and near-identical names stay for you to review. Each change can be undone."
              okText="Fix it"
              onConfirm={() => autoFix.mutate()}
            >
              <Button type="primary" icon={<ToolOutlined />} loading={autoFix.isPending} disabled={check.isPending}>
                Let VERA fix it
              </Button>
            </Popconfirm>
          </Space>
        }
        loading={isLoading}
      >
        {!report ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No check has been run yet. VERA reads every record; it takes a few seconds." />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space size={32} wrap>
              <Statistic title="Corrections waiting" value={pending.length} />
              <Statistic title="Records they would change" value={pendingRecords} />
              <Statistic title="Applied" value={appliedCount} />
            </Space>
            {report.notes?.length > 0 && (
              <Alert type="info" showIcon message="What VERA did" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>} />
            )}

            <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
              <Space wrap>
                <Segmented
                  size="small"
                  value={field}
                  onChange={setField}
                  options={[
                    { label: "All", value: "all" },
                    { label: "Project type", value: "project.type" },
                    { label: "Specific project type", value: "project.otherType" },
                    { label: "Project title", value: "projectTitle" },
                    { label: "Proponent", value: "proponentName" },
                    { label: "City", value: "location.city" },
                    { label: "Barangay", value: "location.barangay" },
                  ].map((o) => (o.value === "all" ? o : { ...o, label: `${o.label} (${(report?.proposals || []).filter((p) => p.field === o.value && !p.applied).length})` }))}
                />
                <Space size={6}>
                  <Switch size="small" checked={certainOnly} onChange={setCertainOnly} />
                  <Text style={{ fontSize: 12 }}>Only the certain ones</Text>
                </Space>
              </Space>
              <Space wrap>
                <Popconfirm
                  title={`Apply ${selected.length} correction(s)?`}
                  description="The records change in the Document Library. Each can be undone here."
                  okText="Apply"
                  disabled={!selected.length}
                  onConfirm={() => apply.mutate({ reportId: report.id, ids: selected })}
                >
                  <Button disabled={!selected.length} loading={apply.isPending && !apply.variables?.all}>
                    Apply selected ({selected.length})
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`Apply all ${pending.length} waiting corrections?`}
                  description={`${pendingRecords} record(s) change in the Document Library. Each correction can be undone here.`}
                  okText="Apply all"
                  disabled={!pending.length}
                  onConfirm={() => apply.mutate({ reportId: report.id, all: true })}
                >
                  <Button type="primary" icon={<CheckOutlined />} disabled={!pending.length} loading={apply.isPending && apply.variables?.all}>
                    Apply all
                  </Button>
                </Popconfirm>
              </Space>
            </Space>

            <Table
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} correction(s)` }}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys),
                getCheckboxProps: (p) => ({ disabled: p.applied }),
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to correct here." /> }}
              tableLayout="fixed"
            />
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default VeraCorrections;
