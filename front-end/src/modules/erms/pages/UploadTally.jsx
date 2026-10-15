import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { CheckCircleOutlined, DownloadOutlined, ExclamationCircleOutlined, ReloadOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { message } from "../../../shared/feedback";
import { checkUploads, describeApiError, fetchUploadTally, uncheckUploads, uploadTallyCsvUrl } from "../api/ermsService";
import { useUnits } from "../units/useUnits";

const { Text, Title, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The upload tally — the desktop system's upload counter and collector.
//
// One row per day and person: how many of each kind they filed, the total,
// and whether a supervisor has checked it. Checking is done by someone other
// than the uploader (the server refuses one's own), with a remark, and a day
// that changed after it was checked says so. "By day" folds the people into
// one row a day, as the desktop collector did.
// ---------------------------------------------------------------------------

const UNIT_LABEL = { records: "Records Unit", legal: "Legal Services Unit", laboratory: "Laboratory Unit" };
const SKIP_REASON = {
  "own-uploads": "your own uploads are checked by someone else",
  "nothing-filed": "nothing is filed for that day any more",
  "bad-date": "the date was not valid",
};
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const dayLabel = (d) => dayjs(d).format("ddd, D MMM YYYY");

const CheckCell = ({ check }) => {
  if (!check) return <Tag icon={<ExclamationCircleOutlined />}>Not checked</Tag>;
  const who = check.checkedByName || check.checkedBy;
  const when = dayjs(check.checkedAt).format("D MMM YYYY");
  return (
    <Tooltip title={check.remarks ? `“${check.remarks}”` : undefined}>
      <Space size={4} wrap>
        <Tag color={check.changed ? "warning" : "success"} icon={check.changed ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}>
          {check.changed ? `Changed since checked (${check.total} then)` : "Checked"}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>{who} · {when}</Text>
      </Space>
    </Tooltip>
  );
};

const UploadTally = () => {
  const { unit: unitParam } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { units } = useUnits();
  const unit = unitParam || "records";
  const [range, setRange] = useState([dayjs().subtract(30, "day"), dayjs()]);
  const [view, setView] = useState("person");
  const [selected, setSelected] = useState([]);
  const [checking, setChecking] = useState(false);
  const [remarks, setRemarks] = useState("");

  const params = { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["erms", "upload-tally", unit, params],
    queryFn: () => fetchUploadTally(unit, params),
  });

  const settle = () => {
    setSelected([]);
    queryClient.invalidateQueries({ queryKey: ["erms", "upload-tally", unit] });
  };
  const check = useMutation({
    mutationFn: (entries) => checkUploads({ unit, entries, remarks: remarks.trim() || undefined }),
    onSuccess: (result) => {
      if (result.checked.length) message.success(`Checked ${result.checked.length} ${result.checked.length === 1 ? "entry" : "entries"}.`);
      for (const s of result.skipped) message.warning(`${s.date} · ${s.uploader}: not checked — ${SKIP_REASON[s.reason] || s.reason}.`);
      setChecking(false);
      setRemarks("");
      settle();
    },
    onError: (e) => message.error(describeApiError(e, "Could not record the check.")),
  });
  const uncheck = useMutation({
    mutationFn: uncheckUploads,
    onSuccess: () => {
      message.success("Check withdrawn.");
      settle();
    },
    onError: (e) => message.error(describeApiError(e, "Could not withdraw the check.")),
  });

  const kinds = data?.kinds || [];
  const rowKey = (r) => `${r.date}|${r.uploader}`;

  // "By day": the people folded together, as the desktop collector counted.
  const rows = useMemo(() => {
    const list = data?.rows || [];
    if (view === "person") return list;
    const byDay = new Map();
    for (const r of list) {
      if (!byDay.has(r.date)) byDay.set(r.date, { date: r.date, uploader: "", uploaderName: "", counts: {}, total: 0, people: 0, checked: 0, changed: 0 });
      const d = byDay.get(r.date);
      for (const [k, n] of Object.entries(r.counts)) d.counts[k] = (d.counts[k] || 0) + n;
      d.total += r.total;
      d.people += 1;
      if (r.check && !r.check.changed) d.checked += 1;
      if (r.check?.changed) d.changed += 1;
    }
    return [...byDay.values()];
  }, [data, view]);

  const selectable = (r) => data?.canCheck && !r.own && (!r.check || r.check.changed);

  const columns = [
    { title: "Date", dataIndex: "date", key: "date", fixed: "left", width: 140, render: dayLabel },
    view === "person"
      ? { title: "Uploaded by", dataIndex: "uploaderName", key: "who", fixed: "left", width: 180, render: (v, r) => <Space size={4}>{v}{r.own && <Tag>you</Tag>}</Space> }
      : { title: "People", dataIndex: "people", key: "people", width: 80, align: "right" },
    ...kinds.map((k) => ({
      title: k.label,
      key: k.code,
      align: "right",
      width: 96,
      render: (_, r) => (r.counts[k.code] ? fmt(r.counts[k.code]) : <Text type="secondary">·</Text>),
    })),
    { title: "Total", dataIndex: "total", key: "total", align: "right", width: 80, render: (v) => <Text strong>{fmt(v)}</Text> },
    view === "person"
      ? { title: "Check", key: "check", width: 300, render: (_, r) => <CheckCell check={r.check} /> }
      : {
          title: "Checked",
          key: "checked",
          width: 200,
          render: (_, r) => (
            <Space size={4}>
              <Tag color={r.checked === r.people ? "success" : r.checked ? "processing" : "default"}>{r.checked} of {r.people}</Tag>
              {r.changed > 0 && <Tag color="warning">{r.changed} changed</Tag>}
            </Space>
          ),
        },
    view === "person" && data?.canCheck && {
      title: "",
      key: "actions",
      width: 56,
      render: (_, r) =>
        r.check && !r.own ? (
          <Popconfirm title="Withdraw this check?" onConfirm={() => uncheck.mutate({ unit, date: r.date, uploader: r.uploader })}>
            <Button size="small" type="text" aria-label="Withdraw check" icon={<UndoOutlined />} />
          </Popconfirm>
        ) : null,
    },
  ].filter(Boolean);

  const totals = data?.totals;
  const entries = (data?.rows || []).filter((r) => selected.includes(rowKey(r))).map((r) => ({ date: r.date, uploader: r.uploader }));
  const unitChoices = units.filter((u) => ["records", "legal", "laboratory"].includes(u.key));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Upload tally</Title>
            <Text type="secondary">Who filed how many of what, each day — and the supervisor&rsquo;s check of the count.</Text>
          </div>
          <Space wrap>
            {unitChoices.length > 1 && (
              <Select placeholder="Unit" value={unit} onChange={(u) => navigate(`/e-universe/erms/upload-tally/${u}`)} options={unitChoices.map((u) => ({ value: u.key, label: UNIT_LABEL[u.key] || u.label }))} style={{ width: 190 }} />
            )}
            <DatePicker.RangePicker
              value={range}
              allowClear={false}
              disabledDate={(d) => d.isAfter(dayjs(), "day")}
              onChange={(v) => v && setRange(v)}
              presets={[
                { label: "Last 7 days", value: [dayjs().subtract(6, "day"), dayjs()] },
                { label: "Last 31 days", value: [dayjs().subtract(30, "day"), dayjs()] },
                { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
                { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
                { label: "This year", value: [dayjs().startOf("year"), dayjs()] },
              ]}
            />
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Refresh" />
            <Button icon={<DownloadOutlined />} href={uploadTallyCsvUrl(unit, params)}>CSV</Button>
          </Space>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={describeApiError(error, "Could not load the tally.")} />}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Uploads in the period" value={totals?.total || 0} formatter={fmt} loading={isLoading} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Checked" value={totals?.checked || 0} formatter={fmt} loading={isLoading} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Not checked" value={totals?.unchecked || 0} formatter={fmt} loading={isLoading} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Changed since checked" value={totals?.changed || 0} formatter={fmt} loading={isLoading} /></Card></Col>
      </Row>

      <Card
        size="small"
        title={
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              setSelected([]);
            }}
            options={[{ label: "By person", value: "person" }, { label: "By day", value: "day" }]}
          />
        }
        extra={
          data?.canCheck &&
          view === "person" && (
            <Button type="primary" icon={<CheckCircleOutlined />} disabled={!selected.length} onClick={() => setChecking(true)}>
              Check selected ({selected.length})
            </Button>
          )
        }
      >
        {data && !data.canCheck && (
          <Paragraph type="secondary" style={{ fontSize: 12 }}>Read only: the unit&rsquo;s own staff check the counts.</Paragraph>
        )}
        <Table
          size="small"
          rowKey={rowKey}
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          pagination={{ defaultPageSize: 50, hideOnSinglePage: true, showSizeChanger: true }}
          rowSelection={
            view === "person" && data?.canCheck
              ? { selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: (r) => ({ disabled: !selectable(r) }) }
              : undefined
          }
          summary={() =>
            rows.length ? (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  {view === "person" && data?.canCheck && <Table.Summary.Cell index={0} />}
                  <Table.Summary.Cell index={1} colSpan={2}><Text strong>Total</Text></Table.Summary.Cell>
                  {kinds.map((k, i) => (
                    <Table.Summary.Cell key={k.code} index={3 + i} align="right"><Text strong>{fmt(totals?.counts?.[k.code] || 0)}</Text></Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={3 + kinds.length} align="right"><Text strong>{fmt(totals?.total || 0)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4 + kinds.length} colSpan={columns.length - kinds.length - 3} />
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      </Card>

      <Modal
        open={checking}
        title={`Check ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        okText="Record the check"
        confirmLoading={check.isPending}
        onOk={() => check.mutate(entries)}
        onCancel={() => setChecking(false)}
        destroyOnHidden
      >
        <Paragraph type="secondary">
          The counts are read again when the check is recorded and kept with it, so a later change to these days shows on the tally.
        </Paragraph>
        <Input.TextArea rows={3} maxLength={500} showCount placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Modal>
    </Space>
  );
};

export default UploadTally;
