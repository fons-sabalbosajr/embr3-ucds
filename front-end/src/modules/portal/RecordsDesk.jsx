import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, DatePicker, Drawer, Empty, Form, Input, Modal, Radio, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { CalendarOutlined, CheckOutlined, CloseOutlined, DownloadOutlined, FileProtectOutlined, MessageOutlined, SettingOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message, modal } from "../../shared/feedback";
import {
  adjustAccess,
  decideRequest,
  describeError,
  durationLabel,
  fetchChatSummary,
  fetchDesk,
  fetchPageCount,
  fetchRequestChat,
  postRequestChat,
  revokeRequest,
  saveRoomSettings,
} from "./portalService";
import { countdown, useNow, when } from "./time";
import statusTag from "./statusTag";
import { eccRefOf, refLabelOf } from "./docLabel";
import { DOC_CATEGORIES, categoryOf, categoryTag, inkOf } from "./docTypes";
import { useTheme } from "../../theme/ThemeProvider";
import ChatThread from "./ChatThread";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The desk in the Document Portal: the requests waiting for a decision
// (oldest first — they hold a seat while they wait), the people reading now,
// the line behind a full room, and what ended lately. Each unit sees the
// requests for its own documents — the Records Unit, Legal Services, the
// Laboratory — and the Developer and administrators every unit's
// (server: portalService.sourcesFor). Staff can write to a requester about
// their request; the conversation is deleted after 12 idle hours.
// ---------------------------------------------------------------------------

// Who asked, as they said (server/modules/portal/services/portalTerms.js).
const REQUESTER_TYPE = {
  "emb-employee": ["geekblue", "EMB Region III employee"],
  government: ["purple", "Government employee"],
  student: ["cyan", "Student"],
  citizen: ["gold", "Private citizen"],
};

const Who = ({ r, full = false }) => {
  const [color, label] = REQUESTER_TYPE[r.requesterType] || ["default", "Requester"];
  const publicRequester = r.requesterType && r.requesterType !== "emb-employee";
  return (
    <Space direction="vertical" size={2} style={{ maxWidth: 300 }}>
      <Text strong>{r.requesterName}</Text>
      <Space size={4} wrap>
        <Tag color={color} style={{ marginInlineEnd: 0 }}>{label}</Tag>
        {publicRequester ? (
          <Tooltip title="Requested under Freedom of Information (EO 2, s. 2016)">
            <Tag style={{ marginInlineEnd: 0 }}>FOI</Tag>
          </Tooltip>
        ) : null}
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: r.designation }}>
        {r.designation}
      </Text>
      {full && publicRequester ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.contact} · ID: {r.idType}
        </Text>
      ) : null}
      {full && r.consents ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Accepted {r.consents.foi ? "FOI and Data Privacy" : "Data Privacy"} terms ({r.consents.version}) · {when(r.consents.acceptedAt)}
        </Text>
      ) : null}
      {r.client?.ip ? (
        <Tooltip title="The computer the request came from">
          <Text type="secondary" style={{ fontSize: 12 }}>{String(r.client.ip).replace(/^::ffff:/, "")}</Text>
        </Tooltip>
      ) : null}
    </Space>
  );
};

// Named as the portal names it: the reference number (in its kind's colour)
// and the title; the serial and the file on the share below, for staff.
const Doc = ({ r }) => {
  const c = categoryOf(r);
  const dark = useTheme().mode === "dark";
  return (
  <Space direction="vertical" size={0} style={{ maxWidth: 340, borderInlineStart: `3px solid ${c.color}`, paddingInlineStart: 8 }}>
    <Space size={6} wrap>
      <Tag color={c.color} style={{ marginInlineEnd: 0 }}>{categoryTag(c)}</Tag>
      <Text type="secondary" style={{ fontSize: 12 }}>{refLabelOf(r)}</Text>
      <Text strong style={{ color: inkOf(c, dark) }}>{eccRefOf(r) || "—"}</Text>
    </Space>
    <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: r.projectTitle }}>{r.projectTitle}</Text>
    <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: `${r.serialNo} · ${r.fileName}` }}>
      {r.serialNo} · {r.fileName}
    </Text>
  </Space>
  );
};

function DecideModal({ request, durations, onClose }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const allPages = Form.useWatch("allPages", form);
  const { data: count } = useQuery({
    queryKey: ["portal", "pages", request?.id],
    queryFn: () => fetchPageCount(request.id),
    enabled: Boolean(request),
    retry: false,
    staleTime: 60000,
  });

  useEffect(() => {
    if (request) form.setFieldsValue({ minutes: request.desiredMinutes, allPages: true, pages: "", note: "" });
  }, [request, form]);

  const decide = useMutation({
    mutationFn: decideRequest,
    onSuccess: (r) => {
      message.success(r.status === "approved" ? `Approved for ${r.requesterName} until ${when(r.expiresAt)}.` : `Declined ${r.requesterName}’s request.`);
      queryClient.invalidateQueries({ queryKey: ["portal"] });
      onClose();
    },
    onError: (e) => message.error(describeError(e, "The decision could not be saved.")),
  });

  const submit = async (decision) => {
    const values = decision === "approved" ? await form.validateFields() : form.getFieldsValue();
    decide.mutate({
      id: request.id,
      decision,
      note: values.note || null,
      ...(decision === "approved" ? { minutes: values.minutes, allPages: values.allPages !== false, pages: values.allPages === false ? values.pages : null } : {}),
    });
  };

  return (
    <Modal
      open={Boolean(request)}
      title="Decide on a Document Portal request"
      onCancel={onClose}
      width={620}
      destroyOnClose
      footer={[
        <Button key="decline" danger icon={<CloseOutlined />} loading={decide.isPending && decide.variables?.decision === "declined"} onClick={() => submit("declined")}>
          Decline
        </Button>,
        <Button key="approve" type="primary" icon={<CheckOutlined />} loading={decide.isPending && decide.variables?.decision === "approved"} onClick={() => submit("approved")}>
          Approve
        </Button>,
      ]}
    >
      {request && (
        <>
          <div className="portal-decide-summary">
            <Who r={request} full />
            <Doc r={request} />
          </div>
          <Paragraph style={{ marginTop: 12 }}>
            <Text type="secondary">Purpose: </Text>
            {request.purpose}
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            Asked for {durationLabel(request.desiredMinutes)} · in the room since {when(request.enteredAt)}
          </Paragraph>
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="minutes" label="Valid for" rules={[{ required: true }]} extra="Counted from the moment you approve. The document closes for them when it runs out.">
              <Select options={[...new Set([...durations, request.desiredMinutes])].sort((a, b) => a - b).map((m) => ({ value: m, label: durationLabel(m) + (m === request.desiredMinutes ? " (as asked)" : "") }))} />
            </Form.Item>
            <Form.Item
              name="allPages"
              label={
                <Space>
                  Pages they may view
                  {count?.pages ? <Text type="secondary" style={{ fontWeight: 400 }}>· the document has {count.pages} page{count.pages === 1 ? "" : "s"}</Text> : null}
                </Space>
              }
            >
              <Radio.Group>
                <Radio value>Every page</Radio>
                <Radio value={false}>Only these pages</Radio>
              </Radio.Group>
            </Form.Item>
            {allPages === false && (
              <Form.Item
                name="pages"
                rules={[
                  { required: true, message: "List the pages, for example 1-3, 5." },
                  { pattern: /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, message: "Pages and ranges separated by commas, for example 1-3, 5, 8-10." },
                ]}
                extra="Pages not listed are never sent to their browser."
              >
                <Input placeholder="e.g. 1-3, 5, 8-10" />
              </Form.Item>
            )}
            <Form.Item name="note" label="Note to the requester (optional)">
              <Input.TextArea rows={2} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

/**
 * The Developer's changes to an approved seat: how long is left (from now),
 * which pages, and whether this one requester may download the file. Each
 * change is kept on the request and told to the requester.
 */
function AdjustModal({ request, durations, onClose }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const allPages = Form.useWatch("allPages", form);
  const changeTime = Form.useWatch("changeTime", form);

  useEffect(() => {
    if (request) {
      form.setFieldsValue({
        changeTime: false,
        minutes: 60,
        allPages: request.pages?.all !== false,
        pages: request.pages?.all === false ? request.pages.spec : "",
        downloadAllowed: request.downloadAllowed === true,
        note: "",
      });
    }
  }, [request, form]);

  const save = useMutation({
    mutationFn: adjustAccess,
    onSuccess: (r) => {
      message.success(`${r.requesterName}’s access was updated. They have been told.`);
      queryClient.invalidateQueries({ queryKey: ["portal"] });
      onClose();
    },
    onError: (e) => message.error(describeError(e, "The access could not be changed.")),
  });

  const submit = async () => {
    const v = await form.validateFields();
    save.mutate({
      id: request.id,
      ...(v.changeTime ? { minutes: v.minutes } : {}),
      allPages: v.allPages !== false,
      pages: v.allPages === false ? v.pages : null,
      downloadAllowed: v.downloadAllowed === true,
      note: v.note || null,
    });
  };

  return (
    <Modal
      open={Boolean(request)}
      title={
        <Space>
          <SettingOutlined /> Adjust access <Tag color="purple">Developer</Tag>
        </Space>
      }
      onCancel={onClose}
      width={600}
      destroyOnClose
      okText="Save changes"
      onOk={submit}
      confirmLoading={save.isPending}
    >
      {request && (
        <>
          <div className="portal-decide-summary">
            <Who r={request} />
            <Doc r={request} />
          </div>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10 }}>
            Approved by {request.decidedBy?.name || request.decidedBy?.username || "the Records Unit"} · ends {when(request.expiresAt)}
            {request.firstViewedAt ? ` · first opened ${when(request.firstViewedAt)}` : " · not opened yet"}
          </Paragraph>
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="changeTime" valuePropName="checked" style={{ marginBottom: 8 }}>
              <Checkbox>Change how long is left</Checkbox>
            </Form.Item>
            {changeTime && (
              <Form.Item name="minutes" label="Access ends after" extra="Counted from now. This may run past the 24 hours after the first opening.">
                <Select options={durations.map((m) => ({ value: m, label: durationLabel(m) }))} style={{ maxWidth: 240 }} />
              </Form.Item>
            )}
            <Form.Item name="allPages" label="Pages they may view">
              <Radio.Group>
                <Radio value>Every page</Radio>
                <Radio value={false}>Only these pages</Radio>
              </Radio.Group>
            </Form.Item>
            {allPages === false && (
              <Form.Item
                name="pages"
                rules={[
                  { required: true, message: "List the pages, for example 1-3, 5." },
                  { pattern: /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, message: "Pages and ranges separated by commas, for example 1-3, 5, 8-10." },
                ]}
              >
                <Input placeholder="e.g. 1-3, 5, 8-10" />
              </Form.Item>
            )}
            <Form.Item name="downloadAllowed" label="Download" valuePropName="checked" extra="A Download button for this requester only — the approved pages (with their name printed on them only when the room's watermark setting is on).">
              <Switch checkedChildren={<DownloadOutlined />} />
            </Form.Item>
            <Form.Item name="note" label="Reason (kept with the change)">
              <Input.TextArea rows={2} maxLength={300} showCount placeholder="e.g. Needs the file for the hearing on Oct 20." />
            </Form.Item>
          </Form>
          {request.adjustments?.length ? (
            <div className="portal-adjustments">
              <Text type="secondary" style={{ fontSize: 12 }}>
                Earlier changes
              </Text>
              {request.adjustments
                .slice()
                .reverse()
                .map((a) => (
                  <div key={String(a.at)} style={{ fontSize: 12 }}>
                    {when(a.at)} · {a.by?.name || a.by?.username} · {Object.entries(a.changes || {}).map(([k, v]) => `${k} ${v}`).join(", ")}
                    {a.note ? ` — “${a.note}”` : ""}
                  </div>
                ))}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}

/** One request's conversation, from the desk. */
function ChatDrawer({ request, onClose }) {
  const queryClient = useQueryClient();
  const id = request?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "chat", id],
    queryFn: () => fetchRequestChat(id),
    enabled: Boolean(id),
    refetchInterval: id ? 15000 : false,
  });
  // Reading it marks it read: the badges follow.
  useEffect(() => {
    if (data) queryClient.invalidateQueries({ queryKey: ["portal", "chats"] });
  }, [data, queryClient]);
  const send = useMutation({
    mutationFn: postRequestChat,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "chat", id] }),
    onError: (e) => message.error(describeError(e, "The message could not be sent.")),
  });
  return (
    <Drawer
      open={Boolean(request)}
      onClose={onClose}
      width={460}
      title={
        <Space>
          <MessageOutlined />
          {request?.requesterName}
        </Space>
      }
      destroyOnHidden
      styles={{ body: { display: "flex", flexDirection: "column", padding: 16, gap: 12 } }}
    >
      {request && (
        <>
          <Doc r={request} />
          <ChatThread
            side="staff"
            messages={data?.messages}
            expiresAt={data?.expiresAt}
            loading={isLoading}
            sending={send.isPending}
            onSend={(text) => send.mutateAsync({ id, text })}
            otherName={request.requesterName}
            placeholder={`Write to ${request.requesterName} — they see it on the portal page at once`}
          />
        </>
      )}
    </Drawer>
  );
}

/** The room's settings — the Developer's: closed on weekends, the watermark. */
function RoomSettings({ settings }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: saveRoomSettings,
    onSuccess: () => {
      message.success("Room settings saved.");
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e) => message.error(describeError(e, "The settings could not be saved.")),
  });
  const row = (key, icon, title, text) => (
    <div className="portal-setting">
      <div className="portal-setting-icon">{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong>{title}</Text>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>{text}</Text>
        </div>
      </div>
      <Switch checked={settings[key] === true} loading={save.isPending && key in (save.variables || {})} onChange={(on) => save.mutate({ [key]: on })} aria-label={title} />
    </div>
  );
  return (
    <Card
      size="small"
      className="portal-card"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <SettingOutlined /> Room settings <Tag color="purple">Developer</Tag>
        </Space>
      }
      extra={settings.updatedAt ? <Text type="secondary" style={{ fontSize: 12 }}>Last changed {when(settings.updatedAt)}{settings.updatedBy ? ` by ${settings.updatedBy}` : ""}</Text> : null}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {row(
          "closedOnWeekends",
          <CalendarOutlined />,
          "Closed on weekends",
          "Saturdays and Sundays (Philippine time): no new requests and no document opened until Monday. A waiting request's day to be decided counts weekdays only."
        )}
        {row(
          "watermark",
          <FileProtectOutlined />,
          "Watermark the pages",
          "Print the reader's name, computer and the time across every page. Off: pages are shown clean, as scanned — still only the approved pages."
        )}
      </Space>
    </Card>
  );
}

const OUTCOMES = [
  ["expired", "Expired"],
  ["revoked", "Withdrawn"],
  ["declined", "Declined"],
  ["lapsed", "Lapsed"],
  ["left", "Left"],
  ["cancelled", "Left the line"],
];

/** The desk's filters: words, requester type, document kind, outcome (for the history), when asked. */
function DeskFilters({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="portal-desk-filters">
      <Input.Search
        allowClear
        placeholder="Search requester, reference number, title, proponent…"
        defaultValue={value.q}
        onSearch={(q) => set({ q: q || undefined })}
        style={{ width: 300 }}
      />
      <Select
        allowClear
        placeholder="Requester type"
        value={value.requesterType}
        onChange={(requesterType) => set({ requesterType })}
        style={{ width: 210 }}
        options={Object.entries(REQUESTER_TYPE).map(([v, [, label]]) => ({ value: v, label }))}
      />
      <Select
        allowClear
        placeholder="Document kind"
        value={value.category}
        onChange={(category) => set({ category })}
        style={{ width: 220 }}
        options={DOC_CATEGORIES.map((c) => ({
          value: c.key,
          label: (
            <Space size={6}>
              <span className="portal-category-dot" style={{ background: c.color, display: "inline-block" }} />
              {c.law === "Other" ? c.title : categoryTag(c)}
            </Space>
          ),
        }))}
      />
      <Select allowClear placeholder="Outcome (history)" value={value.outcome} onChange={(outcome) => set({ outcome })} style={{ width: 170 }} options={OUTCOMES.map(([v, l]) => ({ value: v, label: l }))} />
      <DatePicker.RangePicker
        value={value.range}
        onChange={(range) => set({ range: range || undefined })}
        allowEmpty={[true, true]}
        placeholder={["Asked from", "to"]}
      />
      {Object.values(value).some(Boolean) && (
        <Button type="link" onClick={() => onChange({})}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** The filters as the desk's query (server: portalService.deskFilter). */
function toQuery({ q, requesterType, category, outcome, range } = {}) {
  const c = DOC_CATEGORIES.find((x) => x.key === category);
  return {
    q: q || undefined,
    requesterType: requesterType || undefined,
    // Legal Services and Laboratory are a unit each; the rest are Records kinds.
    source: c?.source || undefined,
    permitTypes: c && !c.source ? (c.key === "other" ? "other" : c.types.join(",")) : undefined,
    outcome: outcome || undefined,
    from: range?.[0] ? range[0].startOf("day").toISOString() : undefined,
    to: range?.[1] ? range[1].endOf("day").toISOString() : undefined,
  };
}

const UNIT_DESK = { records: "Records Unit", legal: "Legal Services", laboratory: "Laboratory" };
/** "Records Unit desk", "Legal Services desk", or — deciding for every unit — "All units". */
const deskTitle = (sources = []) =>
  sources.length > 1 ? "Desk · all units" : sources.length ? `${UNIT_DESK[sources[0]] || "Unit"} desk` : "Desk";

export default function RecordsDesk() {
  const now = useNow();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [deciding, setDeciding] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [chatting, setChatting] = useState(null);
  const [filters, setFilters] = useState({});
  const query = toQuery(filters);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["portal", "desk", query],
    queryFn: () => fetchDesk(query),
    refetchInterval: 30000,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const durations = data?.durations || [30, 60, 120, 240, 480, 1440, 4320];
  // Conversations in reach, and how many messages wait unread in each.
  const { data: chats } = useQuery({ queryKey: ["portal", "chats"], queryFn: fetchChatSummary, refetchInterval: 20000, retry: false });
  const chatOf = new Map((chats || []).map((c) => [c.requestId, c]));
  const chatButton = (r) => {
    const c = chatOf.get(r.id);
    return (
      <Tooltip title={c ? `${c.messages} message${c.messages === 1 ? "" : "s"}` : "Write to the requester"}>
        <Badge count={c?.unread || 0} size="small">
          <Button icon={<MessageOutlined />} onClick={() => setChatting(r)} aria-label={`Messages with ${r.requesterName}`} />
        </Badge>
      </Tooltip>
    );
  };
  // Changing an approved seat's access is the Developer's alone.
  const canAdjust = data?.canAdjustAccess === true;
  // Narrowed to an outcome: the history is what the person is looking for.
  useEffect(() => {
    if (filters.outcome) setTab("history");
  }, [filters.outcome]);

  const revoke = useMutation({
    mutationFn: revokeRequest,
    onSuccess: (r) => {
      message.success(`${r.requesterName}’s access was withdrawn. It is in Recently ended.`);
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e) => message.error(describeError(e, "It could not be withdrawn.")),
  });
  const confirmRevoke = (r) => {
    let why = "";
    modal.confirm({
      title: `End ${r.requesterName}’s access?`,
      content: (
        <Space direction="vertical" style={{ width: "100%" }}>
          <span>Their seat is freed and the document closes for them at once. This is kept in the history.</span>
          <Input.TextArea rows={2} maxLength={500} placeholder="Reason (optional — the requester sees it)" onChange={(e) => (why = e.target.value)} />
        </Space>
      ),
      okText: "End access",
      okButtonProps: { danger: true },
      onOk: () => revoke.mutateAsync({ id: r.id, note: why || null }),
    });
  };

  const left = (iso) => countdown(new Date(iso).getTime() - now.getTime());

  const columns = {
    pending: [
      { title: "Requester", key: "who", render: (_, r) => <Who r={r} /> },
      { title: "Document", key: "doc", render: (_, r) => <Doc r={r} /> },
      { title: "Purpose", dataIndex: "purpose", render: (p) => <Paragraph ellipsis={{ rows: 2, tooltip: p }} style={{ marginBottom: 0, maxWidth: 260 }}>{p}</Paragraph> },
      { title: "Asked for", dataIndex: "desiredMinutes", render: durationLabel, width: 110 },
      { title: "Seat held", key: "hold", width: 110, render: (_, r) => <Tooltip title={`Given back at ${when(r.pendingUntil)} if not decided`}><Text type="secondary">{left(r.pendingUntil)}</Text></Tooltip> },
      {
        title: "",
        key: "act",
        width: 150,
        render: (_, r) => (
          <Space>
            {chatButton(r)}
            <Button type="primary" onClick={() => setDeciding(r)}>Decide</Button>
          </Space>
        ),
      },
    ],
    approved: [
      { title: "Requester", key: "who", render: (_, r) => <Who r={r} /> },
      { title: "Document", key: "doc", render: (_, r) => <Doc r={r} /> },
      {
        title: "Access",
        key: "access",
        render: (_, r) => (
          <Space direction="vertical" size={2}>
            <Text>{r.pages?.all === false ? `Pages ${r.pages.spec}` : "All pages"}</Text>
            {r.downloadAllowed ? (
              <Tag color="purple" icon={<DownloadOutlined />} style={{ marginInlineEnd: 0 }}>
                Download allowed
              </Tag>
            ) : null}
            {r.adjustments?.length ? <Text type="secondary" style={{ fontSize: 12 }}>Adjusted {r.adjustments.length}×</Text> : null}
          </Space>
        ),
      },
      {
        title: "Opened",
        dataIndex: "views",
        width: 130,
        render: (v, r) =>
          r.firstViewedAt ? (
            <Tooltip title={`First opened ${when(r.firstViewedAt)} — access ends 24 hours after. Last ${when(r.lastViewedAt)}.`}>
              <Space direction="vertical" size={0}>
                <Text>{v || 0}×</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>first {when(r.firstViewedAt)}</Text>
              </Space>
            </Tooltip>
          ) : (
            <Text type="secondary">Not yet</Text>
          ),
      },
      { title: "Time left", key: "left", width: 110, render: (_, r) => <Text strong className="portal-clock">{left(r.expiresAt)}</Text> },
      {
        title: "",
        key: "act",
        width: canAdjust ? 270 : 170,
        render: (_, r) => (
          <Space>
            {chatButton(r)}
            {canAdjust && (
              <Button icon={<SettingOutlined />} onClick={() => setAdjusting(r)}>
                Adjust
              </Button>
            )}
            <Button danger icon={<StopOutlined />} onClick={() => confirmRevoke(r)}>
              End access
            </Button>
          </Space>
        ),
      },
    ],
    waiting: [
      { title: "#", key: "n", width: 48, render: (_, __, i) => i + 1 },
      { title: "Requester", key: "who", render: (_, r) => <Who r={r} /> },
      { title: "Document", key: "doc", render: (_, r) => <Doc r={r} /> },
      { title: "In line since", dataIndex: "createdAt", render: when },
      { title: "", key: "act", width: 70, render: (_, r) => chatButton(r) },
    ],
    history: [
      { title: "Requester", key: "who", render: (_, r) => <Who r={r} /> },
      { title: "Document", key: "doc", render: (_, r) => <Doc r={r} /> },
      { title: "Outcome", dataIndex: "status", render: statusTag, width: 120 },
      {
        title: "How it ended",
        key: "how",
        render: (_, r) => (
          <Space direction="vertical" size={0} style={{ maxWidth: 280 }}>
            <Text>{r.ended?.how || "—"}</Text>
            {r.ended?.by ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                by {r.ended.by.name || r.ended.by.username}
              </Text>
            ) : null}
            {r.ended?.note ? (
              <Text type="secondary" italic style={{ fontSize: 12 }}>
                “{r.ended.note}”
              </Text>
            ) : null}
          </Space>
        ),
      },
      {
        title: "Granted · opened",
        key: "use",
        width: 150,
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <Text>{r.grantedMinutes ? durationLabel(r.grantedMinutes) : "—"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.views ? `opened ${r.views}×` : "never opened"}
            </Text>
          </Space>
        ),
      },
      { title: "Ended", key: "ended", width: 140, render: (_, r) => when(r.endedAt || r.decidedAt) },
      // The conversation outlives the request by up to 12 idle hours.
      { title: "", key: "act", width: 70, render: (_, r) => (chatOf.has(r.id) ? chatButton(r) : null) },
    ],
  };

  const count = (k) => data?.[k]?.length || 0;
  const items = [
    ["pending", "Awaiting decision", count("pending"), "#d48806"],
    ["approved", "Viewing now", count("approved"), "#389e0d"],
    ["waiting", "Waiting line", count("waiting"), "#8c8c8c"],
    ["history", "Recently ended", count("history"), "#8c8c8c"],
  ].map(([key, label, n, color]) => ({
    key,
    label: (
      <Space size={6}>
        {label}
        {n ? <Badge count={n} color={color} overflowCount={999} /> : null}
      </Space>
    ),
    children: (
      <Table
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns[key]}
        dataSource={data?.[key] || []}
        pagination={key === "history" ? { pageSize: 15, hideOnSinglePage: true } : false}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(filters).some(Boolean) ? "Nothing matches these filters." : key === "pending" ? "No requests to decide." : "Nothing here."} /> }}
      />
    ),
  }));

  return (
    <>
    {data?.settings && <RoomSettings settings={data.settings} />}
    {data?.roomState?.open === false && (
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="The room is closed for the weekend"
        description={`Nobody can send a request or open a document until ${when(data.roomState.opensAt)}. Requests already waiting keep their place.`}
      />
    )}
    <Card
      className="portal-card"
      title={deskTitle(data?.sources)}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>Requests and messages reach you here and as notices, as they come in</Text>}
    >
      {error && <Alert type="error" showIcon message={describeError(error, "The desk could not be loaded.")} style={{ marginBottom: 12 }} />}
      <DeskFilters value={filters} onChange={setFilters} />
      <Tabs activeKey={tab} onChange={setTab} items={items} />
      <DecideModal request={deciding} durations={durations} onClose={() => setDeciding(null)} />
      <AdjustModal request={adjusting} durations={durations} onClose={() => setAdjusting(null)} />
      <ChatDrawer request={chatting} onClose={() => setChatting(null)} />
    </Card>
    </>
  );
}
