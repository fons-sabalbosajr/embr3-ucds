import { useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Timeline, Tooltip, Typography,
} from "antd";
import { CloudSyncOutlined, LineChartOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, UndoOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import PageHeader from "../../../shared/components/PageHeader";
import { message } from "../../../shared/feedback";
import { initializeSocket, getSocket } from "../../../api/socketService";
import { checkNow, createSeason, getProgress, rebaselineSeason, updateSeason } from "./progressService";
import "./progress.css";

dayjs.extend(relativeTime);
const { Text } = Typography;

// ---------------------------------------------------------------------------
// Admin Settings › Progress Tracker: the universe updating during an activity
// season, live from the Planning Unit's SharePoint working files.
//
//   - the newly issued permits already written into the RAW data (the
//     encoding's progress), overall and per province;
//   - the RAW data against its baseline: firms, permits, rows added and
//     changed (and in which section), rows coloured as updated;
//   - every file, its version and who saved it last;
//   - the season's activity: each save and what it moved.
//
// The server looks at the folders while the season is open and tells this
// screen when something changed; the figures come from the admin API.
// ---------------------------------------------------------------------------

const ACCENT = "#2f7ecb";
const KEY = ["admin", "progress-tracker"];
const errorText = (e, fallback) => e?.response?.data?.message || fallback;
const n = (v) => (Number(v) || 0).toLocaleString();
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const signed = (v) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : "0");
const KIND_LABEL = { ecc: "ECC / CNC", pto: "PTO", wwdp: "WWDP", haz: "Haz. waste ID", pco: "PCO", chemical: "Chemical permit", importer: "Importer clearance", tsd: "TSD", trc: "Transporter (TRC)" };
const SECTION_LABEL = { profile: "Profile", monitoring: "Monitoring", permits: "Permits", legal: "Legal" };
const fileLabel = (f) =>
  f.name
    .replace(/\.xls[xm]?$/i, "")
    .replace(/^(\d{4}_)?(Z_)?UNIVERSE_/i, "")
    .replace(/_RAW$/i, "")
    .replace(/_/g, " ");

const Delta = ({ value, good = "up" }) => {
  if (!value) return <Text type="secondary">±0</Text>;
  const up = value > 0;
  return <Text style={{ color: (up ? good === "up" : good === "down") ? "#389e0d" : "#cf1322", fontWeight: 600 }}>{signed(value)}</Text>;
};

function SeasonModal({ open, season, defaults, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      season
        ? { name: season.name, range: [dayjs(season.startsAt), dayjs(season.endsAt)], pollSeconds: season.pollSeconds, sources: season.sources }
        : { name: `${dayjs().year() + 1} UCD Updating`, range: [dayjs().startOf("day"), dayjs().add(2, "month").endOf("day")], pollSeconds: 60, sources: defaults?.sources || [] }
    );
  }, [open, season, defaults, form]);
  const save = useMutation({
    mutationFn: (v) => {
      const body = { name: v.name, startsAt: v.range[0].startOf("day").toISOString(), endsAt: v.range[1].endOf("day").toISOString(), pollSeconds: v.pollSeconds, sources: v.sources };
      return season ? updateSeason({ id: season.id, ...body }) : createSeason(body);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      message.success(season ? "Season saved." : "Season opened. The first look reads every file — about a minute.");
      onClose();
    },
    onError: (e) => message.error(errorText(e, "The season could not be saved.")),
  });
  return (
    <Modal open={open} title={season ? "Season settings" : "Open an activity season"} onCancel={onClose} onOk={() => form.submit()} okText={season ? "Save" : "Open season"} confirmLoading={save.isPending} width={720} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark={false}>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="Season" rules={[{ required: true, message: "Name the season" }]}>
              <Input placeholder="2027 UCD Updating" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="range" label="Activity dates" rules={[{ required: true, message: "Give the dates" }]} extra="The files are only watched between these dates.">
              <DatePicker.RangePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="pollSeconds" label="Look at the files every" extra="Seconds between looks. Only files saved since are read again.">
          <InputNumber min={30} max={3600} step={30} addonAfter="seconds" />
        </Form.Item>
        <Text strong>SharePoint folders</Text>
        <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
          Each must be shared as &ldquo;Anyone with the link can view&rdquo;. The tracker only reads.
        </Text>
        <Form.List name="sources">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Row key={f.key} gutter={8} align="top">
                  <Col xs={24} md={6}>
                    <Form.Item name={[f.name, "label"]} rules={[{ required: true, message: "Label" }]}>
                      <Input placeholder="Label" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name={[f.name, "kind"]} initialValue="raw">
                      <Select options={[{ value: "raw", label: "RAW data files" }, { value: "permits", label: "Newly issued permits" }]} />
                    </Form.Item>
                  </Col>
                  <Col xs={22} md={11}>
                    <Form.Item name={[f.name, "link"]} rules={[{ required: true, type: "url", message: "A SharePoint link" }]}>
                      <Input placeholder="https://…sharepoint.com/:f:/g/…" />
                    </Form.Item>
                  </Col>
                  <Col xs={2} md={1}>
                    <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(f.name)} aria-label="Remove folder" />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ kind: "raw" })} disabled={fields.length >= 6}>
                Add a folder
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

const ProgressTracker = () => {
  const queryClient = useQueryClient();
  const [seasonId, setSeasonId] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | "edit"
  const [, tick] = useState(0);

  const { data, isLoading, error } = useQuery({ queryKey: [...KEY, seasonId], queryFn: () => getProgress(seasonId), refetchInterval: 60 * 1000 });
  useEffect(() => {
    if (data && !seasonId) queryClient.setQueryData(KEY, data);
  }, [data, seasonId, queryClient]);

  // Live: the server says when a file changed; the figures are fetched again.
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    let t = null;
    const onUpdate = () => {
      clearTimeout(t);
      t = setTimeout(() => queryClient.invalidateQueries({ queryKey: KEY }), 400);
    };
    socket?.on("progress-tracker:update", onUpdate);
    const clock = setInterval(() => tick((x) => x + 1), 15 * 1000);
    return () => {
      socket?.off("progress-tracker:update", onUpdate);
      clearTimeout(t);
      clearInterval(clock);
    };
  }, [queryClient]);

  const check = useMutation({
    mutationFn: checkNow,
    onSuccess: (res) => {
      queryClient.setQueryData([...KEY, seasonId], res);
      message.success(res.changed ? `${res.changed} file(s) changed since the last look.` : "Nothing has changed since the last look.");
    },
    onError: (e) => message.error(errorText(e, "The files could not be checked.")),
  });
  const rebaseline = useMutation({
    mutationFn: () => rebaselineSeason(data.season.id),
    onSuccess: (res) => {
      queryClient.setQueryData([...KEY, seasonId], res);
      message.success("The baseline will be taken again from the files as they are now.");
    },
    onError: (e) => message.error(errorText(e, "The baseline could not be reset.")),
  });
  const close = useMutation({
    mutationFn: () => updateSeason({ id: data.season.id, status: data.season.status === "active" ? "closed" : "active" }),
    onSuccess: (res) => queryClient.setQueryData([...KEY, seasonId], res),
    onError: (e) => message.error(errorText(e, "The season could not be changed.")),
  });

  const season = data?.season;
  const s = data?.summary;
  const files = data?.files || [];
  const rawFiles = useMemo(() => files.filter((f) => f.kind === "raw"), [files]);
  const permitFiles = useMemo(() => files.filter((f) => f.kind === "permits"), [files]);
  const live = season?.open;
  const lastPoll = season?.lastPoll;

  const header = (
    <PageHeader
      accent={ACCENT}
      icon={<LineChartOutlined />}
      title="Progress Tracker"
      description="The universe updating during an activity season — read live from the Planning Unit's SharePoint working files."
      extra={
        season && (
          <Space size={8} wrap style={{ marginTop: 6 }}>
            <span className={`pt-live ${live ? "is-live" : ""}`}>
              <span className="pt-live-dot" />
              {live ? "Live" : season.status === "closed" ? "Season closed" : "Outside the season"}
            </span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {season.name} · {dayjs(season.startsAt).format("MMM D")} – {dayjs(season.endsAt).format("MMM D, YYYY")}
              {lastPoll?.at ? ` · checked ${dayjs(lastPoll.at).fromNow()}` : " · not checked yet"}
              {season.baselineAt ? ` · baseline ${dayjs(season.baselineAt).format("MMM D, h:mm A")}` : ""}
            </Text>
          </Space>
        )
      }
      actions={
        <>
          {data?.seasons?.length > 1 && (
            <Select
              size="middle"
              style={{ width: 220 }}
              value={season?.id}
              onChange={(v) => setSeasonId(v)}
              options={data.seasons.map((x) => ({ value: x.id, label: `${x.name}${x.status === "active" ? "" : " (closed)"}` }))}
            />
          )}
          {season && (
            <Button icon={<ReloadOutlined />} loading={check.isPending} disabled={!live} onClick={() => check.mutate()}>
              Check now
            </Button>
          )}
          {season && <Button icon={<SettingOutlined />} onClick={() => setEditing("edit")}>Season</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            New season
          </Button>
        </>
      }
    />
  );

  if (error) return <Space direction="vertical" style={{ width: "100%" }}>{header}<Alert type="error" showIcon message={errorText(error, "The tracker could not be loaded.")} /></Space>;

  const provinceRows = Object.entries(s?.permits?.byProvince || {})
    .filter(([p]) => p !== "(none)")
    .sort((a, b) => a[0].localeCompare(b[0]));

  const rawColumns = [
    {
      title: "File",
      key: "file",
      render: (_, f) => (
        <Space direction="vertical" size={0}>
          <Text strong>{fileLabel(f)}</Text>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            v{f.meta?.version} · {f.meta?.modifiedBy || "—"} · {f.meta?.modifiedAt ? dayjs(f.meta.modifiedAt).fromNow() : ""}
          </Text>
          {f.missing && <Tag color="red">No longer in the folder</Tag>}
        </Space>
      ),
    },
    { title: "Firms", key: "rows", align: "right", render: (_, f) => <Tooltip title={`Baseline ${n(f.baseline?.counts?.rows)}`}>{n(f.current?.counts?.rows)}</Tooltip> },
    { title: "Added", key: "added", align: "right", render: (_, f) => <Delta value={f.current?.compare?.added} /> },
    { title: "Changed", key: "modified", align: "right", render: (_, f) => n(f.current?.compare?.modified) },
    { title: "Coloured rows", key: "colored", align: "right", render: (_, f) => <Tooltip title={`Baseline ${n(f.baseline?.counts?.colored)}`}>{n(f.current?.counts?.colored)}</Tooltip> },
    { title: "Coloured permits", key: "cp", align: "right", render: (_, f) => n(f.current?.counts?.coloredPermit) },
    {
      title: "Permits",
      key: "permits",
      align: "right",
      render: (_, f) => {
        const t = (x) => Object.values(x || {}).reduce((a, v) => a + v, 0);
        const now = t(f.current?.counts?.permits);
        return (
          <Space size={4}>
            {n(now)}
            <Delta value={now - t(f.baseline?.counts?.permits)} />
          </Space>
        );
      },
    },
  ];

  const sheetColumns = [
    { title: "Sheet", dataIndex: "name" },
    { title: "Kind", dataIndex: "category", render: (v) => <Tag>{v === "main" ? "Main list" : v === "duplicate" ? "Duplicate" : v === "delisting" ? "For delisting" : "For deletion"}</Tag> },
    { title: "Rows", dataIndex: "rows", align: "right", render: n },
    { title: "Coloured", dataIndex: "colored", align: "right", render: n },
    { title: "Coloured permits", dataIndex: "coloredPermit", align: "right", render: n },
    {
      title: "Colours used",
      dataIndex: "colors",
      render: (c) => (
        <Space size={4} wrap>
          {Object.entries(c || {}).map(([rgb, k]) => (
            <Tooltip key={rgb} title={`#${rgb}: ${k} cell(s)`}>
              <span className="pt-swatch" style={{ background: `#${rgb}` }} />
            </Tooltip>
          ))}
        </Space>
      ),
    },
  ];

  const permitColumns = [
    {
      title: "File",
      key: "file",
      render: (_, f) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Text strong>{f.name.replace(/\.xls[xm]?$/i, "")}</Text>
            {f.reference && (
              <Tooltip title="Kept for reference (the Central Office's extract): shown, not counted in the progress.">
                <Tag>Reference</Tag>
              </Tooltip>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {f.path.includes("/") ? `${f.path.split("/").slice(0, -1).join(" › ")} · ` : ""}v{f.meta?.version} · {f.meta?.modifiedBy || "—"} · {f.meta?.modifiedAt ? dayjs(f.meta.modifiedAt).fromNow() : ""}
          </Text>
        </Space>
      ),
    },
    { title: "Permits listed", key: "rows", align: "right", render: (_, f) => n(f.current?.counts?.rows) },
    { title: "New since baseline", key: "new", align: "right", render: (_, f) => <Delta value={f.current?.compare?.newSinceBaseline} /> },
    {
      title: "Already in the RAW data",
      key: "inRaw",
      width: 260,
      render: (_, f) => {
        const total = f.current?.counts?.rows || 0;
        const done = f.current?.inRaw || 0;
        return total ? (
          <Space size={8} style={{ width: "100%" }}>
            <Progress percent={pct(done, total)} size="small" style={{ width: 140, margin: 0 }} strokeColor={ACCENT} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {n(done)} / {n(total)}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
  ];

  const events = (data?.events || []).slice(0, 40);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {header}

      {isLoading ? (
        <Card loading />
      ) : !season ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={4}>
                <Text>No activity season yet.</Text>
                <Text type="secondary">Open one with its dates; the tracker watches the RAW data and newly issued permit folders while it runs.</Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
              Open a season
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {lastPoll?.errors?.length > 0 && (
            <Alert type="warning" showIcon message="Some files could not be read on the last look" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{lastPoll.errors.map((e) => <li key={e}>{e}</li>)}</ul>} />
          )}
          {!season.baselineAt && (
            <Alert type="info" showIcon icon={<CloudSyncOutlined />} message={live ? "Taking the baseline: the first look reads every file — about a minute." : "The baseline is taken at the season's first look, once it opens."} />
          )}

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={9}>
              <Card size="small" title="Newly issued permits written into the RAW data" className="pt-card">
                <div className="pt-headline">
                  <Progress type="dashboard" percent={pct(s.permits.inRaw, s.permits.issued)} strokeColor={ACCENT} size={150} format={(p) => <span className="pt-headline-pct">{p}%</span>} />
                  <div>
                    <Statistic title="In the RAW data" value={s.permits.inRaw} suffix={<Text type="secondary" style={{ fontSize: 14 }}>/ {n(s.permits.issued)}</Text>} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {n(s.permits.issued - s.permits.inRaw)} still to encode · {signed(s.permits.newSinceBaseline)} listed since the baseline
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={15}>
              <Card size="small" title="By province" className="pt-card">
                <div className="pt-provinces">
                  {provinceRows.map(([p, v]) => (
                    <div key={p} className="pt-province">
                      <Text className="pt-province-name">{p.replace(/_/g, " ")}</Text>
                      <Progress percent={pct(v.inRaw, v.issued)} size="small" strokeColor={ACCENT} style={{ margin: 0, flex: 1 }} />
                      <Text type="secondary" className="pt-province-count">
                        {n(v.inRaw)} / {n(v.issued)}
                      </Text>
                    </div>
                  ))}
                  {!provinceRows.length && <Text type="secondary">No permit lists read yet.</Text>}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            {[
              { title: "Permits in the RAW data", value: s.raw.permitsNow, delta: s.raw.permitsNow - s.raw.permitsBaseline, note: `baseline ${n(s.raw.permitsBaseline)}` },
              { title: "Firms (main lists)", value: s.raw.rows, delta: s.raw.rows - s.raw.baselineRows, note: `baseline ${n(s.raw.baselineRows)} · ${n(s.raw.added)} added · ${n(s.raw.removed)} removed` },
              { title: "Rows changed since the baseline", value: s.raw.modified, note: Object.entries(s.raw.bySection).filter(([, v]) => v).map(([k, v]) => `${SECTION_LABEL[k]} ${n(v)}`).join(" · ") || "none yet" },
              { title: "Rows coloured as updated", value: s.raw.colored, delta: s.raw.colored - s.raw.baselineColored, note: `baseline ${n(s.raw.baselineColored)}` },
              { title: "Permit rows coloured", value: s.raw.coloredPermit, delta: s.raw.coloredPermit - s.raw.baselineColoredPermit, note: `baseline ${n(s.raw.baselineColoredPermit)}` },
              { title: "Firms with a permit", value: s.raw.withPermitNow, delta: s.raw.withPermitNow - s.raw.withPermitBaseline, note: `${pct(s.raw.withPermitNow, s.raw.rows)}% of the firms` },
            ].map((t) => (
              <Col key={t.title} xs={12} md={8} xl={4}>
                <Card size="small" className="pt-tile">
                  <Statistic title={t.title} value={t.value} />
                  <div className="pt-tile-foot">
                    {t.delta !== undefined && <Delta value={t.delta} />}
                    <Text type="secondary">{t.note}</Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={8}>
              <Card size="small" title="Permits by kind" className="pt-card">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="kind"
                  dataSource={Object.entries(s.raw.permitKinds).filter(([, v]) => v.baseline || v.now).map(([kind, v]) => ({ kind, ...v }))}
                  columns={[
                    { title: "Permit", dataIndex: "kind", render: (k) => KIND_LABEL[k] || k },
                    { title: "Baseline", dataIndex: "baseline", align: "right", render: n },
                    { title: "Now", dataIndex: "now", align: "right", render: n },
                    { title: "Change", key: "d", align: "right", render: (_, r) => <Delta value={r.now - r.baseline} /> },
                  ]}
                />
                <Table
                  size="small"
                  pagination={false}
                  rowKey="k"
                  style={{ marginTop: 12 }}
                  dataSource={[["duplicate", "Duplicates"], ["delisting", "For delisting"], ["deletion", "For deletion"]].map(([k, label]) => ({ k, label, ...s.raw.byCategory[k] }))}
                  columns={[
                    { title: "Set aside", dataIndex: "label" },
                    { title: "Baseline", dataIndex: "baseline", align: "right", render: n },
                    { title: "Now", dataIndex: "now", align: "right", render: n },
                    { title: "Change", key: "d", align: "right", render: (_, r) => <Delta value={r.now - r.baseline} good="neutral" /> },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={16}>
              <Card size="small" title={`RAW data files (${rawFiles.length})`} className="pt-card">
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  columns={rawColumns}
                  dataSource={rawFiles}
                  scroll={{ x: 760 }}
                  expandable={{ expandedRowRender: (f) => <Table size="small" rowKey="name" pagination={false} columns={sheetColumns} dataSource={f.current?.counts?.sheets || []} /> }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={14}>
              <Card size="small" title={`Newly issued permit files (${permitFiles.length})`} className="pt-card">
                <Table size="small" rowKey="id" pagination={false} columns={permitColumns} dataSource={permitFiles} scroll={{ x: 640 }} />
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card
                size="small"
                title="Activity"
                className="pt-card"
                extra={
                  <Space size={4}>
                    <Popconfirm title="Take the baseline again?" description="The comparison starts over from the files as they are now. The activity so far is kept." okText="Take it again" onConfirm={() => rebaseline.mutate()}>
                      <Button size="small" icon={<UndoOutlined />} loading={rebaseline.isPending}>
                        New baseline
                      </Button>
                    </Popconfirm>
                    <Popconfirm title={season.status === "active" ? "Close the season?" : "Reopen the season?"} description={season.status === "active" ? "The files stop being watched. The figures stay." : "The files are watched again between its dates."} onConfirm={() => close.mutate()}>
                      <Button size="small">{season.status === "active" ? "Close season" : "Reopen"}</Button>
                    </Popconfirm>
                  </Space>
                }
              >
                {events.length ? (
                  <Timeline
                    className="pt-timeline"
                    items={events.map((e) => ({
                      color: e.kind === "baseline" ? "gray" : ACCENT,
                      children:
                        e.kind === "baseline" ? (
                          <Text type="secondary">{dayjs(e.at).format("MMM D, h:mm A")} — {e.note}</Text>
                        ) : (
                          <Space direction="vertical" size={2}>
                            <Text>
                              <Text strong>{e.modifiedBy || "Someone"}</Text> saved <Text strong>{e.name.replace(/\.xls[xm]?$/i, "")}</Text> <Text type="secondary">v{e.version}</Text>
                            </Text>
                            <Space size={4} wrap>
                              <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(e.at).format("MMM D, h:mm A")}</Text>
                              {Object.entries(e.delta || {})
                                .filter(([, v]) => v)
                                .map(([k, v]) => (
                                  <Tag key={k} color={v > 0 ? "green" : "red"} style={{ marginInlineEnd: 0 }}>
                                    {signed(v)} {{ rows: "firms", colored: "coloured", coloredPermit: "coloured permits", permits: "permits", added: "added", modified: "changed", newSinceBaseline: "new" }[k] || k}
                                  </Tag>
                                ))}
                            </Space>
                          </Space>
                        ),
                    }))}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No saves since the baseline yet. They appear here as the files change." />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      <SeasonModal open={Boolean(editing)} season={editing === "edit" ? season : null} defaults={data?.defaults} onClose={() => setEditing(null)} />
    </Space>
  );
};

export default ProgressTracker;
