import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Empty, Input, Popconfirm, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, LinkOutlined, ReloadOutlined, RobotOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { message } from "../../shared/feedback";
import { applyRegisterLinks, getRegisterLinks, runRegisterLinksCheck, undoRegisterLink } from "./veraService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › VERA Assistant › Register links — VERA's report to the
// Developer on Records Document Library entries that are not linked to their
// establishment in the Universe central register.
//
// VERA reads each unlinked record's reference (permit) number the way a person
// would — the letter O for a zero, a date run into the number, two numbers in
// one cell — and, where the number is not in the register at all, looks for
// the proponent instead, asking the AI model to compare the two when she is
// not sure. Nothing is linked until the Developer applies it; every link can
// be undone.
// ---------------------------------------------------------------------------

const errorText = (e, fallback) => e?.response?.data?.message || fallback;

const CONFIDENCE = {
  certain: { color: "green", label: "Certain" },
  likely: { color: "blue", label: "Likely" },
  review: { color: "gold", label: "Check first" },
};

const VeraRegisterLinks = () => {
  const queryClient = useQueryClient();
  const [confidence, setConfidence] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  const { data, isLoading, error } = useQuery({ queryKey: ["vera", "register-links"], queryFn: getRegisterLinks });
  const report = data?.current || null;
  const refresh = (next) => {
    if (next?.current) queryClient.setQueryData(["vera", "register-links"], next);
    else if (next?.report) queryClient.setQueryData(["vera", "register-links"], next.report);
    else queryClient.invalidateQueries({ queryKey: ["vera", "register-links"] });
    queryClient.invalidateQueries({ queryKey: ["vera", "register-links", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["erms"] });
  };

  const check = useMutation({
    mutationFn: runRegisterLinksCheck,
    onSuccess: (next) => {
      setSelected([]);
      refresh(next);
      message.success(`VERA checked the unlinked records: ${next.current?.totals?.proposals || 0} link(s) proposed.`);
    },
    onError: (e) => message.error(errorText(e, "The check could not be run.")),
  });
  const apply = useMutation({
    mutationFn: applyRegisterLinks,
    onSuccess: (res) => {
      setSelected([]);
      refresh(res);
      message.success(
        `Linked ${res.applied} record(s).${res.skipped ? ` ${res.skipped} were already linked since the check and were left alone.` : ""}`
      );
    },
    onError: (e) => message.error(errorText(e, "The links could not be applied.")),
  });
  const undo = useMutation({
    mutationFn: undoRegisterLink,
    onSuccess: (res) => {
      refresh(res);
      message.success(res.restored ? "Undone: the record is unlinked again." : "The record had changed since; nothing was undone.");
    },
    onError: (e) => message.error(errorText(e, "That could not be undone.")),
  });

  const proposals = useMemo(() => report?.proposals || [], [report]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter(
      (p) =>
        (confidence === "all" || p.confidence === confidence) &&
        (!q ||
          [p.serialNo, p.permitNumber, p.proponentName, p.projectTitle, p.sortKey, p.registerName, p.registerTitle, p.registerPermits]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    );
  }, [proposals, confidence, search]);
  const pending = proposals.filter((p) => !p.applied);
  const sure = pending.filter((p) => p.confidence !== "review");
  const appliedCount = proposals.length - pending.length;
  const count = (c) => pending.filter((p) => p.confidence === c).length;

  if (error) return <Alert type="error" showIcon message={errorText(error, "The report could not be loaded.")} />;

  const columns = [
    {
      title: "Record",
      key: "record",
      render: (_, p) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          {p.serialNo ? (
            <Link to={`/universe/erms/records/${encodeURIComponent(p.serialNo)}`} style={{ fontSize: 12 }}>
              {p.serialNo}
            </Link>
          ) : null}
          <Text style={{ whiteSpace: "pre-wrap" }}>{p.proponentName || "—"}</Text>
          {p.projectTitle && p.projectTitle !== p.proponentName && (
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{p.projectTitle}</Text>
          )}
          <Text code style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{p.permitNumber || "no number"}</Text>
        </Space>
      ),
    },
    {
      title: "Links to",
      key: "register",
      render: (_, p) => (
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Text style={{ fontSize: 12 }} type="secondary">
            <LinkOutlined /> {p.sortKey}
            {p.registerProvince ? ` · ${String(p.registerProvince).replace(/_/g, " ").trim()}` : ""}
          </Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{p.registerName || p.registerTitle || "—"}</Text>
          {p.registerName && p.registerTitle && (
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{p.registerTitle}</Text>
          )}
          {p.registerPermits && (
            <Text code style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{p.registerPermits}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Why",
      key: "why",
      width: 230,
      filters: Object.entries(CONFIDENCE).map(([value, c]) => ({ text: c.label, value })),
      onFilter: (value, p) => p.confidence === value,
      render: (_, p) => (
        <Space size={4} wrap>
          <Tag color={CONFIDENCE[p.confidence]?.color}>{CONFIDENCE[p.confidence]?.label}</Tag>
          <Text style={{ fontSize: 12 }}>{p.reason}</Text>
          {p.method === "vera-ai" && (
            <Tooltip title="VERA's AI model read both and judged them the same establishment">
              <Tag icon={<RobotOutlined />} color="purple">VERA AI</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "state",
      width: 170,
      render: (_, p) =>
        p.applied ? (
          <Space size={4} direction="vertical">
            <Text type="success" style={{ fontSize: 12 }}>
              <CheckOutlined /> Linked · {p.appliedBy} · {dayjs(p.appliedAt).format("MMM D, h:mm A")}
            </Text>
            <Popconfirm title="Unlink this record again?" okText="Undo" onConfirm={() => undo.mutate({ reportId: report.id, proposalId: p.id })}>
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
        VERA reads the reference number of every record in the Records Document Library that is <Text strong>not linked</Text> to the Universe
        central register — the letter O typed for a zero, a date run into the number, two numbers in one cell — and, where the number is not in
        the register at all, looks for the same proponent instead, asking the AI model when she is not sure. Nothing is linked until you apply
        it, and every link can be undone.
      </Paragraph>

      <Card
        size="small"
        title={
          <Space>
            <LinkOutlined />
            <span>VERA&rsquo;s report</span>
            {report && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                checked {dayjs(report.finishedAt).format("MMM D, YYYY h:mm A")}
                {report.by ? ` by ${report.by}` : ""}
              </Text>
            )}
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} loading={check.isPending} onClick={() => check.mutate()}>
            {report ? "Check again" : "Check the unlinked records"}
          </Button>
        }
        loading={isLoading}
      >
        {check.isPending && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="VERA is reading the unlinked records"
            description="With the AI model on, comparing the uncertain ones can take a minute or two. You can stay on this page."
          />
        )}
        {!report ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No check has been run yet." />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space size={32} wrap>
              <Statistic title="Unlinked records read" value={report.totals?.unlinked || 0} />
              <Statistic title="Links waiting" value={pending.length} />
              <Statistic title="Certain" value={count("certain")} valueStyle={{ color: "#389e0d" }} />
              <Statistic title="Likely" value={count("likely")} />
              <Statistic title="Check first" value={count("review")} />
              <Statistic title="Applied" value={appliedCount} />
            </Space>
            {report.notes?.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="What VERA found"
                description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              />
            )}

            <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
              <Space wrap>
                <Segmented
                  size="small"
                  value={confidence}
                  onChange={(v) => {
                    setConfidence(v);
                    setSelected([]);
                  }}
                  options={[
                    { label: "All", value: "all" },
                    { label: "Certain", value: "certain" },
                    { label: "Likely", value: "likely" },
                    { label: "Check first", value: "review" },
                  ]}
                />
                <Input.Search
                  allowClear
                  size="small"
                  placeholder="Search number, proponent or establishment"
                  style={{ width: 280 }}
                  onSearch={setSearch}
                  onChange={(e) => !e.target.value && setSearch("")}
                />
              </Space>
              <Space wrap>
                <Popconfirm
                  title={`Link ${selected.length} record(s)?`}
                  description="Each record is linked to the establishment shown. Each link can be undone here."
                  okText="Link"
                  disabled={!selected.length}
                  onConfirm={() => apply.mutate({ reportId: report.id, ids: selected })}
                >
                  <Button disabled={!selected.length} loading={apply.isPending && apply.variables?.ids === selected}>
                    Link selected ({selected.length})
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`Link all ${sure.length} certain and likely records?`}
                  description="The ones marked “Check first” are left for you to tick one by one. Each link can be undone here."
                  okText="Link them"
                  disabled={!sure.length}
                  onConfirm={() => apply.mutate({ reportId: report.id, ids: sure.map((p) => p.id) })}
                >
                  <Button type="primary" icon={<CheckOutlined />} disabled={!sure.length} loading={apply.isPending && apply.variables?.ids !== selected}>
                    Link certain &amp; likely ({sure.length})
                  </Button>
                </Popconfirm>
              </Space>
            </Space>

            <Table
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} link(s)` }}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys),
                getCheckboxProps: (p) => ({ disabled: p.applied }),
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to link here." /> }}
              scroll={{ x: 960 }}
            />
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default VeraRegisterLinks;
