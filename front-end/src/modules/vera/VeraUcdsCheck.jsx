import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Empty, Popconfirm, Row, Segmented, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, ReloadOutlined, RobotOutlined, ToolOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { VeraFlame } from "./VeraMark";
import { applyUcdsFixes, autoFixUcds, getUcdsCheck, runUcdsCheck, undoUcdsFix } from "./veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// VERA's check of the Universe Central DB register (the active year's).
//
// Fixes she proposes — spellings of places, industries, sections and
// provinces; coordinates entered the wrong way round — applied by a person,
// all or in part, each undoable. "Let VERA fix it" applies only what she is
// certain of. Below them, what needs a person: duplicate permits, missing
// essentials, coordinates outside the region, expired permits — with the
// serials to open in the province screens.
// ---------------------------------------------------------------------------

const errorText = (e, fallback) => e?.response?.data?.message || fallback;
const KEY = ["vera", "ucds-check"];

const VeraUcdsCheck = ({ year }) => {
  const queryClient = useQueryClient();
  const [field, setField] = useState("all");
  const [certainOnly, setCertainOnly] = useState(false);
  const [selected, setSelected] = useState([]);

  const { data, isLoading, error } = useQuery({ queryKey: [...KEY, year], queryFn: getUcdsCheck });
  const report = data?.current || null;
  const refresh = (next) => {
    const value = next?.report || (next?.current !== undefined ? next : null);
    if (value) queryClient.setQueryData([...KEY, year], value);
    else queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["ucds"] });
  };

  const check = useMutation({
    mutationFn: runUcdsCheck,
    onSuccess: (next) => {
      setSelected([]);
      refresh(next);
      const t = next.current?.totals || {};
      message.success(`VERA checked ${t.records || 0} records: ${t.proposals || 0} fix(es) proposed, ${t.review || 0} item(s) to review.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  const autoFix = useMutation({
    mutationFn: autoFixUcds,
    onSuccess: (res) => {
      setSelected([]);
      refresh(res);
      message.success(`VERA fixed ${res.applied} value(s) in ${res.changed} record(s).${res.left ? ` ${res.left} more need your eye.` : ""}`);
    },
    onError: (e) => message.error(errorText(e, "VERA could not fix the register.")),
  });
  const apply = useMutation({
    mutationFn: applyUcdsFixes,
    onSuccess: (res) => {
      setSelected([]);
      refresh(res);
      message.success(`Applied ${res.applied} fix(es); ${res.changed} record(s) updated.`);
    },
    onError: (e) => message.error(errorText(e, "The fixes could not be applied.")),
  });
  const undo = useMutation({
    mutationFn: undoUcdsFix,
    onSuccess: (res) => {
      refresh(res);
      message.success(`Undone: ${res.restored} record(s) put back.`);
    },
    onError: (e) => message.error(errorText(e, "That could not be undone.")),
  });

  const proposals = report?.proposals || [];
  const fields = useMemo(() => [...new Map(proposals.map((p) => [p.field, p.fieldLabel])).entries()], [proposals]);
  const rows = proposals.filter((p) => (field === "all" || p.field === field) && (!certainOnly || p.confidence === "certain"));
  const pending = proposals.filter((p) => !p.applied);
  const pendingRecords = pending.reduce((a, p) => a + p.count, 0);
  const busy = check.isPending || autoFix.isPending;

  if (error) return <Alert type="error" showIcon message={errorText(error, "VERA's report could not be loaded.")} />;

  const columns = [
    { title: "Field", dataIndex: "fieldLabel", width: 170, render: (v) => <Text strong style={{ fontSize: 12.5 }}>{v}</Text> },
    {
      title: "Now",
      dataIndex: "from",
      render: (v, p) => (
        <Text delete={p.applied} type={p.applied ? "secondary" : "danger"} style={{ whiteSpace: "pre-wrap" }}>
          {v}
        </Text>
      ),
    },
    { title: "Becomes", dataIndex: "to", render: (v) => <Text style={{ color: "#389e0d", fontWeight: 500 }}>{v}</Text> },
    { title: "Records", dataIndex: "count", width: 90, align: "right", sorter: (a, b) => a.count - b.count },
    {
      title: "Why",
      key: "why",
      width: 240,
      render: (_, p) => (
        <Space size={4} wrap>
          <Tag color={p.confidence === "certain" ? "green" : "gold"}>{p.reason}</Tag>
          {p.method === "vera-ai" && (
            <Tooltip title="Suggested by VERA's AI model, checked to be a spelling fix only">
              <Tag icon={<RobotOutlined />} color="purple">
                VERA AI
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "state",
      width: 200,
      render: (_, p) =>
        p.superseded ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Not needed — the spaced spelling was applied
          </Text>
        ) : p.applied ? (
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
          <Text type="secondary" style={{ fontSize: 12 }}>
            Waiting for you
          </Text>
        ),
    },
  ];

  const reviewColumns = [
    { title: "Serial", dataIndex: "sort_key", width: 200, render: (v) => <Text code>{v}</Text> },
    { title: "Firm", dataIndex: "title" },
    { title: "Province", dataIndex: "province", width: 120 },
    { title: "What VERA saw", dataIndex: "detail", render: (v) => <Text style={{ whiteSpace: "pre-wrap" }}>{v}</Text> },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        size="small"
        title={
          <Space>
            <VeraFlame size={22} label="VERA" />
            <span>VERA&rsquo;s check of the register{year ? ` — ${year}` : ""}</span>
            {report && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                checked {dayjs(report.finishedAt).format("MMM D, YYYY h:mm A")}
                {report.by ? ` by ${report.by}` : ""}
              </Text>
            )}
          </Space>
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={check.isPending} disabled={busy && !check.isPending} onClick={() => check.mutate()}>
              {report ? "Check again" : "Check the register"}
            </Button>
            <Popconfirm
              title="Let VERA fix the register?"
              description="She checks again, then changes every value she is certain of (the same wording written differently, province names, swapped coordinates). Near-identical spellings stay for you. Each change can be undone."
              okText="Fix it"
              onConfirm={() => autoFix.mutate()}
            >
              <Button type="primary" icon={<ToolOutlined />} loading={autoFix.isPending} disabled={busy && !autoFix.isPending}>
                Let VERA fix it
              </Button>
            </Popconfirm>
          </Space>
        }
        loading={isLoading}
      >
        {!report ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No check has been run on this year's register yet. VERA reads every record; it takes a few seconds."
          />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Row gutter={[16, 12]}>
              <Col xs={12} md={6}>
                <Statistic title="Records checked" value={report.totals?.records || 0} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="Fixes waiting" value={pending.length} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="Records they would change" value={pendingRecords} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="To review" value={report.totals?.review || 0} />
              </Col>
            </Row>
            {report.notes?.length > 0 && (
              <Collapse
                size="small"
                items={[
                  {
                    key: "notes",
                    label: "What VERA did",
                    children: (
                      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                        {report.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    ),
                  },
                ]}
              />
            )}

            <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
              <Space wrap>
                <Segmented
                  size="small"
                  value={field}
                  onChange={setField}
                  options={[{ label: "All", value: "all" }, ...fields.map(([value, label]) => ({ label, value }))]}
                />
                <Space size={6}>
                  <Switch size="small" checked={certainOnly} onChange={setCertainOnly} />
                  <Text style={{ fontSize: 12 }}>Only the certain ones</Text>
                </Space>
              </Space>
              <Space wrap>
                <Popconfirm
                  title={`Apply ${selected.length} fix(es)?`}
                  description="The records change in this year's register. Each can be undone here."
                  okText="Apply"
                  disabled={!selected.length}
                  onConfirm={() => apply.mutate({ reportId: report.id, ids: selected })}
                >
                  <Button disabled={!selected.length} loading={apply.isPending && !apply.variables?.all}>
                    Apply selected ({selected.length})
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`Apply all ${pending.length} waiting fixes?`}
                  description={`${pendingRecords} record(s) change in this year's register. Each fix can be undone here.`}
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
              pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} fix(es)` }}
              rowSelection={{ selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: (p) => ({ disabled: p.applied }) }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to fix here." /> }}
              scroll={{ x: 960 }}
            />
          </Space>
        )}
      </Card>

      {report?.review?.length > 0 && (
        <Card size="small" title="For you to review" extra={<Text type="secondary" style={{ fontSize: 12 }}>VERA does not change these — open the firm in its province.</Text>}>
          <Collapse
            items={report.review.map((r) => ({
              key: r.key,
              label: (
                <Space>
                  <Text strong>{r.label}</Text>
                  <Tag color={r.count ? "orange" : "green"}>{r.count}</Tag>
                </Space>
              ),
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    {r.hint}
                    {r.count > r.samples.length ? ` The first ${r.samples.length} of ${r.count} are listed.` : ""}
                  </Paragraph>
                  <Table size="small" rowKey={(x, i) => `${x.sort_key}-${i}`} columns={reviewColumns} dataSource={r.samples} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} />
                </Space>
              ),
            }))}
          />
        </Card>
      )}
    </Space>
  );
};

export default VeraUcdsCheck;
