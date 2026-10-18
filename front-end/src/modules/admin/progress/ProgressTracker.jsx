import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Switch, Table, Tabs, Tag, Timeline, Tooltip, Typography } from "antd";
import { CloudSyncOutlined, CopyOutlined, FolderOpenOutlined, GlobalOutlined, HistoryOutlined, LineChartOutlined, MessageOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, SyncOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import PageHeader from "../../../shared/components/PageHeader";
import { message } from "../../../shared/feedback";
import { copyText } from "../../../shared/copyText";
import { initializeSocket, getSocket } from "../../../api/socketService";
import { useTheme } from "../../../theme/ThemeProvider";
import { ROUTES } from "../../../config/routes";
import { openVera } from "../../vera/veraService";
import { checkNow, createSeason, getProgress, readSnapshot, rebaselineSeason, saveShare, updateSeason, writeSnapshot } from "./progressService";
import { OpenFileButton, StackBar } from "./ProvinceMatrix";
import TrackerView, { ACCENT } from "./TrackerView";
import { KIND_LABEL, n, pct, signed } from "./palette";
import "./progress.css";

dayjs.extend(relativeTime);
const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The Progress Tracker (Developer only; reached from Admin Settings › System,
// no longer from the menu): the universe updating during an activity season,
// live from the Planning Unit's SharePoint working files. Only each RAW
// file's MAIN worksheet counts (the province sheet, or the healthcare lists'
// sheets); the ECP list is left out.
//
// The figures (TrackerView) are the same the public link shows. This screen
// adds what only the Developer has: the season's settings, the public link's
// settings, "Check now" and a new baseline, VERA, the files with their Excel
// buttons, and the activity. The server looks at the folders while the
// season is open and tells this screen when something changed.
// ---------------------------------------------------------------------------

const KEY = ["admin", "progress-tracker"];
const errorText = (e, fallback) => e?.response?.data?.message || fallback;
const fileLabel = (f) =>
  f.name
    .replace(/\.xls[xm]?$/i, "")
    .replace(/^(\d{4}_)?(Z_)?UNIVERSE_/i, "")
    .replace(/_RAW$/i, "")
    .replace(/_/g, " ");
const HEALTHCARE = new Set(["Healthcare Industries", "Chemical permits", "TSD / TRC", "Importers"]);
/** A file's group: the permit lists, or the group of the RAW list it holds. */
const fileGroup = (f) => {
  if (f.kind === "permits") return "permits";
  if (f.current?.counts?.mainSheet) return "province";
  const units = Object.keys(f.current?.counts?.units || {});
  return units.some((u) => HEALTHCARE.has(u)) || /healthcare/i.test(f.path) ? "healthcare" : "other";
};
/** The public page's address for a token. */
export const publicUrl = (token) => `${window.location.origin}${ROUTES.progressPublic.replace(":token", token)}`;

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
        : { name: `${dayjs().year() + 1} UCD Updating`, range: [dayjs().startOf("day"), dayjs().add(2, "month").endOf("day")], pollSeconds: 30, sources: defaults?.sources || [] }
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
            <Form.Item name="range" label="Activity dates" rules={[{ required: true, message: "Give the dates" }]} extra="The files are read from the moment the season is opened; until the start that reading is the baseline. Saves are recorded between these dates.">
              <DatePicker.RangePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="pollSeconds" label="Look at the files every" extra="Seconds between looks (15 or more). Only files saved since are read again.">
          <InputNumber min={15} max={3600} step={15} addonAfter="seconds" />
        </Form.Item>
        <Text strong>SharePoint / OneDrive links</Text>
        <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
          A folder (every Excel file in it) or a single Excel file, each shared as &ldquo;Anyone with the link can view&rdquo;. The tracker only reads.
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
                      <Input placeholder="https://…sharepoint.com/:f:/g/… or /:x:/g/…" />
                    </Form.Item>
                  </Col>
                  <Col xs={2} md={1}>
                    <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(f.name)} aria-label="Remove folder" />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ kind: "raw" })} disabled={fields.length >= 6}>
                Add a link
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

/**
 * The public link's settings: on or off, an end date, a new link. Anyone
 * with the link sees the figures only — no files, links, names or activity.
 */
function ShareModal({ open, season, onClose, queryKey }) {
  const queryClient = useQueryClient();
  const share = season?.share || {};
  // Each change is saved at once: a switch that only takes effect after a
  // separate Save left links "on" on screen and off on the server.
  const save = useMutation({
    mutationFn: (body) => saveShare({ id: season.id, ...body }),
    onSuccess: (data, body) => {
      queryClient.setQueryData(queryKey, data);
      const s = data?.season?.share || {};
      message.success(body.regenerate ? "A new link was made. The old one no longer opens." : body.enabled !== undefined ? (s.enabled ? "The public link is on." : "The public link is off.") : "End date saved.");
    },
    onError: (e) => message.error(errorText(e, "The public link could not be saved.")),
  });
  const link = share.token ? publicUrl(share.token) : null;
  const expired = Boolean(share.expiresAt && dayjs(share.expiresAt).isBefore(dayjs()));
  const working = Boolean(share.enabled && share.token && !expired);
  const expiresAt = share.expiresAt ? dayjs(share.expiresAt) : null;
  const copy = async () => {
    if (await copyText(link)) message.success("Link copied.");
    else message.info("Select the link and copy it (Ctrl+C).");
  };
  return (
    <Modal open={open} title={<Space><GlobalOutlined />Public link</Space>} onCancel={onClose} footer={<Button onClick={onClose}>Done</Button>} width={620} destroyOnHidden>
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        People without an E-Universe account can follow the season&rsquo;s figures: the tiles, the charts and the tables, read-only. They never see a file name, an Excel or SharePoint link, anyone&rsquo;s name, the activity, VERA or these settings. Changes here are saved at once.
      </Paragraph>
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <Space wrap>
          <Switch checked={Boolean(share.enabled)} loading={save.isPending} onChange={(v) => save.mutate({ enabled: v })} />
          <Text strong>{share.enabled ? "The link is on" : "The link is off"}</Text>
          {share.enabled && expired && <Tag color="red">Ended {dayjs(share.expiresAt).format("MMM D")} — set a later end date</Tag>}
        </Space>
        <Alert
          type={working ? "success" : "warning"}
          showIcon
          message={working ? "Anyone with the link can open it now." : share.enabled ? "The link has passed its end date: it shows “not available”." : "The link is off: anyone opening it sees “not available”. Turn it on above."}
        />
        <div>
          <Text strong style={{ display: "block", marginBottom: 4 }}>Ends</Text>
          <DatePicker
            value={expiresAt}
            onChange={(d) => save.mutate({ expiresAt: d ? d.endOf("day").toISOString() : null })}
            disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
            placeholder="No end date"
            allowClear
          />
          <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
            After this day the link stops opening. Clear it to keep the link until you turn it off.
          </Text>
        </div>
        {link ? (
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>The link</Text>
            <Space.Compact style={{ width: "100%" }}>
              <Input value={link} readOnly onFocus={(e) => e.target.select()} />
              <Button icon={<CopyOutlined />} onClick={copy}>Copy</Button>
            </Space.Compact>
            <Space size={8} style={{ marginTop: 8 }} wrap>
              <Button size="small" href={link} target="_blank" rel="noopener noreferrer" disabled={!working}>
                Open it
              </Button>
              <Popconfirm title="Make a new link?" description="The current link stops opening at once; share the new one." okText="Make a new link" onConfirm={() => save.mutate({ regenerate: true })}>
                <Button size="small" icon={<SyncOutlined />} loading={save.isPending}>
                  New link
                </Button>
              </Popconfirm>
              {share.updatedAt && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Changed {dayjs(share.updatedAt).fromNow()}
                  {share.updatedBy ? ` by ${share.updatedBy}` : ""}
                </Text>
              )}
            </Space>
          </div>
        ) : (
          <Text type="secondary">Turn the link on to make it.</Text>
        )}
      </Space>
    </Modal>
  );
}

const ProgressTracker = () => {
  const queryClient = useQueryClient();
  const { mode } = useTheme();
  const [fileTab, setFileTab] = useState("province");
  const [seasonId, setSeasonId] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | "edit"
  const [sharing, setSharing] = useState(false);
  const [, tick] = useState(0);
  const queryKey = [...KEY, seasonId];

  // The last figures this tab saw paint at once; the current ones follow.
  const snapKey = `admin.${seasonId || "current"}`;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getProgress(seasonId),
    // Every 15 s while someone is editing a workbook, every minute otherwise.
    refetchInterval: (query) => (query.state.data?.editing?.length ? 15 * 1000 : 60 * 1000),
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    initialData: () => readSnapshot("admin", snapKey)?.data,
    initialDataUpdatedAt: () => readSnapshot("admin", snapKey)?.at,
  });
  useEffect(() => {
    if (data) writeSnapshot("admin", snapKey, data);
  }, [data, snapKey]);
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
      queryClient.setQueryData(queryKey, res);
      message.success(res.changed ? `${res.changed} file(s) changed since the last look.` : "Nothing has changed since the last look.");
    },
    onError: (e) => message.error(errorText(e, "The files could not be checked.")),
  });
  const rebaseline = useMutation({
    mutationFn: () => rebaselineSeason(data.season.id),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKey, res);
      message.success("The baseline will be taken again from the files as they are now.");
    },
    onError: (e) => message.error(errorText(e, "The baseline could not be reset.")),
  });
  const close = useMutation({
    mutationFn: () => updateSeason({ id: data.season.id, status: data.season.status === "active" ? "closed" : "active" }),
    onSuccess: (res) => queryClient.setQueryData(queryKey, res),
    onError: (e) => message.error(errorText(e, "The season could not be changed.")),
  });

  const season = data?.season;
  const files = useMemo(() => data?.files || [], [data?.files]);
  const live = season?.open;
  const watched = season?.watched;
  const lastPoll = season?.lastPoll;
  const stale = Boolean(season?.baselineStale);
  const editingIds = useMemo(() => new Set((data?.editing || []).map((e) => e.id)), [data?.editing]);
  const shared = season?.share?.enabled && !(season.share.expiresAt && dayjs(season.share.expiresAt).isBefore(dayjs()));
  const filesByGroup = useMemo(() => {
    const out = { province: [], healthcare: [], other: [], permits: [] };
    for (const f of files) out[fileGroup(f)].push(f);
    return out;
  }, [files]);

  const header = (
    <PageHeader
      accent={ACCENT}
      icon={<LineChartOutlined />}
      title="Progress Tracker"
      description="The universe updating, read live from the main sheet of each RAW file."
      extra={
        season && (
          <Space size={8} wrap style={{ marginTop: 6 }}>
            <span className={`pt-live ${watched ? "is-live" : ""}`}>
              <span className="pt-live-dot" />
              {live ? "Live" : season.preSeason ? `Live · starts ${dayjs(season.startsAt).format("MMM D")}` : season.status === "closed" ? "Closed" : "Ended"}
            </span>
            {shared && (
              <Tag icon={<GlobalOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>
                Public link on
              </Tag>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {season.name} · {dayjs(season.startsAt).format("MMM D")} – {dayjs(season.endsAt).format("MMM D, YYYY")}
              {lastPoll?.at ? ` · checked ${dayjs(lastPoll.at).fromNow()}` : " · not checked yet"}
            </Text>
          </Space>
        )
      }
      actions={
        <>
          {data?.seasons?.length > 1 && (
            <Select
              size="middle"
              style={{ width: 200 }}
              value={season?.id}
              onChange={(v) => setSeasonId(v)}
              options={data.seasons.map((x) => ({ value: x.id, label: `${x.name}${x.status === "active" ? "" : " (closed)"}` }))}
            />
          )}
          {season && (
            <Button icon={<MessageOutlined />} onClick={() => openVera()}>
              Ask VERA
            </Button>
          )}
          {season && (
            <Button icon={<GlobalOutlined />} onClick={() => setSharing(true)}>
              Public link
            </Button>
          )}
          {season && (
            <Button icon={<ReloadOutlined />} loading={check.isPending} disabled={!watched} onClick={() => check.mutate()}>
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

  // --- the admin's own tabs: files and activity ------------------------------
  const sheetColumns = [
    { title: "Sheet", dataIndex: "name" },
    {
      title: "Counts as",
      dataIndex: "category",
      render: (v) =>
        ({
          main: <Tag color="blue">Main sheet</Tag>,
          review: <Tag color="gold">For review</Tag>,
          log: <Tag color="purple">Additions log</Tag>,
          duplicate: <Tag>Duplicate</Tag>,
          delisting: <Tag>For delisting</Tag>,
          deletion: <Tag>For deletion</Tag>,
        })[v] || <Tag>{v}</Tag>,
    },
    { title: "Rows", dataIndex: "rows", align: "right", render: n },
    { title: "Highlighted", dataIndex: "colored", align: "right", render: (v, r) => (r.category === "main" ? n(v) : <Text type="secondary">—</Text>) },
    {
      title: "Colours",
      dataIndex: "colors",
      render: (c, r) =>
        r.category === "log" ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {n(r.bySource?.erms)} ERMS · {n(r.bySource?.ecconline)} ECC Online
          </Text>
        ) : (
          <Space size={4} wrap>
            {Object.entries(c || {}).map(([rgb, k]) => (
              <Tooltip key={rgb} title={`#${rgb}: ${k} cell(s)`}>
                <span className="pt-swatch is-small" style={{ background: `#${rgb}` }} />
              </Tooltip>
            ))}
          </Space>
        ),
    },
  ];
  const openColumn = { title: "Excel", key: "open", width: 112, render: (_, f) => <OpenFileButton files={[f.open].filter(Boolean)} /> };
  const rawColumns = [
    {
      title: "File",
      key: "file",
      render: (_, f) => (
        <Space direction="vertical" size={0}>
          <Space size={6} wrap>
            <Text strong>{fileLabel(f)}</Text>
            {f.current?.counts?.mainSheet && <Tag color="blue">Main: {f.current.counts.mainSheet}</Tag>}
            {editingIds.has(f.id) && (
              <Tag color="processing" className="pt-editing-tag">
                <span className="pt-editing-live" />
                Editing now
              </Tag>
            )}
            {f.missing && <Tag color="red">No longer in the folder</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            v{f.meta?.version} · {f.meta?.modifiedBy || "—"} · {f.meta?.modifiedAt ? dayjs(f.meta.modifiedAt).fromNow() : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Firms",
      key: "rows",
      width: 220,
      render: (_, f) => {
        const c = f.current?.counts || {};
        const a = c.added || {};
        return (
          <div className="pt-cell">
            <b>{n(c.rows)}</b>
            <StackBar thin parts={[{ key: "base", value: c.base ?? c.rows, title: "Baseline" }, { key: "erms", value: a.erms, title: "ERMS" }, { key: "ecconline", value: a.ecconline, title: "ECC Online" }]} />
          </div>
        );
      },
    },
    { title: "Highlighted", key: "colored", align: "right", width: 110, render: (_, f) => n(f.current?.counts?.colored) },
    ...(stale
      ? []
      : [
          { title: "Added", key: "added", align: "right", width: 100, render: (_, f) => <Delta value={f.current?.compare?.added} /> },
          { title: "Changed", key: "modified", align: "right", width: 100, render: (_, f) => n(f.current?.compare?.modified) },
        ]),
    openColumn,
  ];
  const permitColumns = [
    {
      title: "File",
      key: "file",
      render: (_, f) => (
        <Space direction="vertical" size={0}>
          <Space size={6} wrap>
            <Text strong>{f.name.replace(/\.xls[xm]?$/i, "")}</Text>
            {f.reference && (
              <Tooltip title="Kept for reference (the Central Office's extract): shown, not counted in the progress.">
                <Tag>Reference</Tag>
              </Tooltip>
            )}
            {editingIds.has(f.id) && (
              <Tag color="processing" className="pt-editing-tag">
                <span className="pt-editing-live" />
                Editing now
              </Tag>
            )}
            {f.missing && <Tag color="red">No longer in the folder</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {f.path.includes("/") ? `${f.path.split("/").slice(0, -1).join(" › ")} · ` : ""}v{f.meta?.version} · {f.meta?.modifiedBy || "—"} · {f.meta?.modifiedAt ? dayjs(f.meta.modifiedAt).fromNow() : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Kind",
      key: "kind",
      width: 110,
      render: (_, f) => (
        <Space size={4} wrap>
          {Object.keys(f.current?.counts?.byKind || {}).map((k) => (
            <Tag key={k} style={{ marginInlineEnd: 0 }}>{KIND_LABEL[k] || k}</Tag>
          ))}
        </Space>
      ),
    },
    { title: "Listed", key: "rows", align: "right", width: 90, render: (_, f) => n(f.current?.counts?.rows) },
    {
      title: "In the RAW data",
      key: "inRaw",
      width: 240,
      render: (_, f) => {
        const t = f.current?.counts?.rows || 0;
        const done = f.current?.inRaw || 0;
        return t && !f.reference ? (
          <Space size={8} style={{ width: "100%" }}>
            <Progress percent={pct(done, t)} size="small" style={{ width: 130, margin: 0 }} strokeColor={ACCENT} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {n(done)}/{n(t)}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    openColumn,
  ];
  const fileTabs = [
    { key: "province", label: `Monitoring Plan (${filesByGroup.province.length})`, list: filesByGroup.province, columns: rawColumns, expand: true },
    { key: "healthcare", label: `Healthcare (${filesByGroup.healthcare.length})`, list: filesByGroup.healthcare, columns: rawColumns, expand: true },
    { key: "permits", label: `Newly issued (${filesByGroup.permits.length})`, list: filesByGroup.permits, columns: permitColumns },
  ].filter((t) => t.list.length);
  const filesPane = (
    <Card size="small" className="pt-card">
      {fileTabs.length ? (
        <Tabs
          size="small"
          activeKey={fileTabs.some((t) => t.key === fileTab) ? fileTab : fileTabs[0].key}
          onChange={setFileTab}
          items={fileTabs.map((t) => ({
            key: t.key,
            label: t.label,
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                columns={t.columns}
                dataSource={t.list}
                scroll={{ x: 820 }}
                expandable={t.expand ? { expandedRowRender: (f) => <Table size="small" rowKey="name" pagination={false} columns={sheetColumns} dataSource={f.current?.counts?.sheets || []} /> } : undefined}
              />
            ),
          }))}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No files read yet." />
      )}
    </Card>
  );

  const events = (data?.events || []).slice(0, 60);
  const saves = events.filter((e) => e.kind === "save").length;
  const activity = season && (
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
                          {signed(v)} {{ rows: "firms", colored: "highlighted", coloredPermit: "highlighted permits", permits: "permits", added: "added", modified: "changed", newSinceBaseline: "new" }[k] || k}
                        </Tag>
                      ))}
                  </Space>
                </Space>
              ),
          }))}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No saves since the baseline yet." />
      )}
    </Card>
  );

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
          {!season.baselineAt && watched && <Alert type="info" showIcon icon={<CloudSyncOutlined />} message="Taking the baseline: the first look reads every file — about a minute." />}
          {stale && (
            <Alert
              type="warning"
              showIcon
              message="The season baseline was read the old way"
              description="Changes “since the baseline” are hidden until a new baseline is taken."
              action={
                <Popconfirm title="Take the baseline again?" okText="Take it again" onConfirm={() => rebaseline.mutate()}>
                  <Button size="small" type="primary" loading={rebaseline.isPending}>
                    New baseline
                  </Button>
                </Popconfirm>
              }
            />
          )}

          <TrackerView
            data={data}
            mode="admin"
            theme={mode}
            queryKey={queryKey}
            extraTabs={[
              { key: "files", label: <span><FolderOpenOutlined /> Files</span>, children: filesPane },
              { key: "activity", label: <span><HistoryOutlined /> Activity{saves ? ` (${saves})` : ""}</span>, children: activity },
            ]}
          />
        </>
      )}

      <SeasonModal open={Boolean(editing)} season={editing === "edit" ? season : null} defaults={data?.defaults} onClose={() => setEditing(null)} />
      {season && <ShareModal open={sharing} season={season} onClose={() => setSharing(false)} queryKey={queryKey} />}
    </Space>
  );
};

export default ProgressTracker;
