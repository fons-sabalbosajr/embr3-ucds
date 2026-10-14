import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AutoComplete, Avatar, Badge, Button, Card, Checkbox, Col, Drawer, Empty, Form, Input, InputNumber, List, Modal, Progress, Row, Select, Space, Spin, Steps, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import {
  BellOutlined,
  CompassOutlined,
  DownloadOutlined,
  DownOutlined,
  FileProtectOutlined,
  UserOutlined,
  MoonOutlined,
  SunOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  EyeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HourglassOutlined,
  LockOutlined,
  LogoutOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SendOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../../config/api";
import { useTheme } from "../../theme/ThemeProvider";
import embLogo from "../../assets/emblogo.svg";
import bagongPilipinas from "../../assets/bagongpilipinas.png";
import VeraChat from "../vera/VeraChat";
import { message, modal, notification } from "../../shared/feedback";
import DocTitle from "./DocTitle";
import { docLabel, eccRefOf, refLabelOf } from "./docLabel";
import { DOC_CATEGORIES, UnitName, categoryOf, inkOf, unitName } from "./docTypes";
import { describeError, documentUrl, durationLabel, fetchMyChat, fetchRoom, fetchTerms, leaveRoom, postMyChat, searchDocuments, sendRequest } from "./portalService";
import ChatThread from "./ChatThread";
import PortalTour from "./PortalTour";
import { shouldShowTour } from "./tourState";
import { countdown, roughly, useNow, when } from "./time";
import statusTag from "./statusTag";
import SecureViewer from "./SecureViewer";
import "./portal.css";

const { Title, Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The E-Universe Document Portal — a public page, outside the application
// (/e-universe/document-portal). No sign-in.
//
// A room. A person comes in, finds a document — a Records Unit permit, a
// Legal Services or a Laboratory document — says who they are and why, and
// waits for the unit that keeps it; once approved they read it here, and
// only here, until the time runs out. Either side may write to the other
// about the request (a temporary conversation, gone after 12 idle hours).
// The room is closed on weekends when the Developer says so. Everyone sees who is in the room and how
// long each has left — a name and a clock, not the document — and the room
// moves as it changes, for everyone at once.
//
// The room holds 50. The 51st waits in line, told about how long, and is
// seated by the server the moment a seat frees.
//
// This browser's request is kept by the server against a ticket in an
// httpOnly cookie (server/modules/portal): close the page and come back, and
// it is still here; another computer does not see it.
// ---------------------------------------------------------------------------

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// ── Live updates ────────────────────────────────────────────────────────────

/**
 * The page's own connection: told when the room changes, and — once this
 * browser holds a ticket — when its own request does. Made again when the
 * request changes, so the connection carries the newest ticket cookie.
 */
function useLiveRoom(mineId) {
  const queryClient = useQueryClient();
  useEffect(() => {
    // Cookies for the portal ticket; never anyone's E-Universe sign-in (perTab, no token).
    const socket = io(SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"], auth: { perTab: true } });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal"] });
    socket.on("connect", () => {
      socket.emit("portal:watch", {});
      refresh();
    });
    socket.on("portal:room", refresh);
    // A message from the staff about this browser's request.
    socket.on("portal:chat", (n) => {
      refresh();
      if (!n?.title) return;
      notification.info({ key: "portal-chat", message: n.title, description: n.body, placement: "topRight", duration: 10, icon: <MessageOutlined /> });
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(n.title, { body: n.body, tag: "e-universe-portal-chat", icon: "/notice-icon.png" });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
    });
    socket.on("portal:mine", (n) => {
      refresh();
      if (!n?.title) return;
      const tone = ["approved", "pending"].includes(n.status) ? "success" : n.status === "declined" || n.status === "revoked" ? "warning" : "info";
      notification[tone]({ key: "portal-mine", message: n.title, description: n.body, placement: "topRight", duration: 0 });
      // The page is in the background: the computer's own notification, if allowed.
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        try {
          const shown = new Notification(n.title, { body: n.body, tag: "e-universe-portal", icon: "/notice-icon.png" });
          shown.onclick = () => {
            window.focus();
            shown.close();
          };
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
    });
    return () => socket.disconnect();
  }, [mineId, queryClient]);
}

function NotifyMe() {
  const [state, setState] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));
  if (state === "unsupported" || state === "granted") return null;
  if (state === "denied") {
    return <Text type="secondary" style={{ fontSize: 12 }}>Notifications are blocked for this site; keep this page open to see the decision.</Text>;
  }
  return (
    <Button size="small" icon={<BellOutlined />} onClick={() => Notification.requestPermission().then(setState)}>
      Notify me on this computer
    </Button>
  );
}

// ── The page frame ──────────────────────────────────────────────────────────

/**
 * The portal's own header: the EMB Region III and Bagong Pilipinas seals,
 * the office and the portal's name in the theme's own ink, and the light /
 * dark switch. Nothing that leads into E-Universe — this page is the
 * public's, and stands on its own.
 */
function TopBar({ themeRef, onTour }) {
  const { token } = antdTheme.useToken();
  const { mode, toggleMode } = useTheme();
  const dark = mode === "dark";
  return (
    <header className="portal-topbar" style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      <div className="portal-topbar-inner">
        <div className="portal-brand">
          <div className="portal-brand-seals">
            <img src={embLogo} alt="Environmental Management Bureau" />
            <span className="portal-brand-divider" style={{ background: token.colorBorder }} aria-hidden="true" />
            <img src={bagongPilipinas} alt="Bagong Pilipinas" />
          </div>
          <div className="portal-brand-text">
            <span className="portal-brand-agency" style={{ color: token.colorText }}>
              Environmental Management Bureau · Region III
            </span>
            <span className="portal-brand-product" style={{ color: token.colorTextSecondary }}>
              E-Universe <b style={{ color: token.colorPrimary }}>Document Portal</b>
            </span>
          </div>
        </div>
        <Space size={8}>
          <Button icon={<CompassOutlined />} onClick={onTour}>
            Take the tour
          </Button>
          <Tooltip title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            <span ref={themeRef}>
              <Button
                shape="circle"
                size="large"
                icon={dark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleMode}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              />
            </span>
          </Tooltip>
        </Space>
      </div>
    </header>
  );
}

function Header({ room, now }) {
  const { token } = antdTheme.useToken();
  const used = room?.seated || 0;
  const capacity = room?.capacity || 50;
  const closed = room?.roomState?.open === false;
  return (
    <div className="portal-hero" style={{ background: `linear-gradient(120deg, ${token.colorPrimary} 0%, ${token.colorPrimaryActive} 100%)` }}>
      <div className="portal-hero-text">
        <Space size={10} align="center">
          <div className="portal-hero-icon">
            <SafetyCertificateOutlined />
          </div>
          <div style={{ minWidth: 0 }}>
            <Title level={4} style={{ color: "#fff", margin: 0 }}>
              E-Universe Document Portal
            </Title>
            <Text className="portal-hero-tagline" style={{ color: "rgba(255,255,255,.88)" }}>
              Request a scanned EMB Region III document and read it here, securely, for the time approved. No account needed.
            </Text>
          </div>
        </Space>
      </div>
      <div className="portal-hero-stats">
        <div className="portal-stat">
          <span className="portal-stat-label">Seats in use</span>
          <span className="portal-stat-value">
            {used}
            <small> / {capacity}</small>
          </span>
          <Progress percent={Math.round((used / capacity) * 100)} showInfo={false} size="small" strokeColor="#fff" trailColor="rgba(255,255,255,.25)" />
        </div>
        <div className="portal-stat">
          <span className="portal-stat-label">Waiting line</span>
          <span className="portal-stat-value">{room?.waiting?.length || 0}</span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat-label">{room?.full && !closed ? "Next seat in about" : "Room"}</span>
          <span className="portal-stat-value">{closed ? "Closed" : room?.full ? (room.nextSeatAt ? roughly(new Date(room.nextSeatAt) - now) : "—") : "Open"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Asking ──────────────────────────────────────────────────────────────────

/**
 * Find the document: search, then the matches grouped by kind of document —
 * each kind in the colour of its law, as the Planning side shows them
 * (docTypes.js) — with chips to narrow to one kind.
 */
function FindDocument({ selected, onSelect, initialQuery }) {
  const dark = useTheme().mode === "dark";
  const [q, setQ] = useState(initialQuery || "");
  const [term, setTerm] = useState(initialQuery || "");
  const [only, setOnly] = useState("all");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching, error } = useQuery({
    queryKey: ["portal", "search", term],
    queryFn: () => searchDocuments(term),
    enabled: term.length >= 2,
    staleTime: 30000,
  });

  // The matches, by category, in the categories' own order.
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const r of data || []) {
      const c = categoryOf(r);
      if (!byKey.has(c.key)) byKey.set(c.key, { category: c, items: [] });
      byKey.get(c.key).items.push(r);
    }
    return DOC_CATEGORIES.filter((c) => byKey.has(c.key)).map((c) => byKey.get(c.key));
  }, [data]);
  useEffect(() => setOnly("all"), [term]);
  const shown = only === "all" ? groups : groups.filter((g) => g.category.key === only);

  const renderItem = (r, category) => {
    const active = selected?.serialNo === r.serialNo && selected?.source === r.source;
    return (
      <List.Item
        key={`${r.source}:${r.serialNo}`}
        className={`portal-result${active ? " is-selected" : ""}`}
        style={{ borderInlineStart: `4px solid ${category.color}` }}
        onClick={() => onSelect(r)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(r)}
        tabIndex={0}
        role="button"
        aria-pressed={active}
      >
        <List.Item.Meta
          avatar={<Avatar shape="square" icon={<FileTextOutlined />} style={{ background: `${category.color}22`, color: category.color }} />}
          title={
            <Space size={8} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>{refLabelOf(r)}</Text>
              <Text strong style={{ color: eccRefOf(r) ? inkOf(category, dark) : undefined }}>{eccRefOf(r) || "Not recorded"}</Text>
              <Tag color={category.color} style={{ marginInlineEnd: 0 }}>
                {r.permit?.label || category.short}
              </Tag>
              {r.isAttachment ? <Tag>Attachment</Tag> : null}
            </Space>
          }
          description={
            <Space direction="vertical" size={0}>
              <Text>{r.projectTitle || "Untitled"}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[r.proponentName, r.province].filter(Boolean).join(" · ")}
              </Text>
            </Space>
          }
        />
        {active ? <CheckCircleFilled className="portal-selected-mark" /> : <Button size="small">Select</Button>}
      </List.Item>
    );
  };

  return (
    <>
      <Input
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search by reference or docket number, or by title"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search for a document"
      />
      {groups.length > 0 && (
        <div className="portal-categories" role="group" aria-label="Kinds of document">
          <button type="button" className={`portal-category${only === "all" ? " is-on" : ""}`} onClick={() => setOnly("all")}>
            All <b>{data?.length || 0}</b>
          </button>
          {groups.map(({ category, items }) => (
            <button
              type="button"
              key={category.key}
              className={`portal-category${only === category.key ? " is-on" : ""}`}
              style={{ "--cat": category.color }}
              onClick={() => setOnly(category.key)}
              title={`${category.law} — ${category.title}`}
            >
              <span className="portal-category-dot" />
              {category.short} <b>{items.length}</b>
            </button>
          ))}
        </div>
      )}
      <div className="portal-results">
        {error && <Alert type="error" showIcon message={describeError(error, "The search did not work. Try again.")} />}
        {term.length < 2 ? (
          <Text type="secondary" className="portal-hint">
            Type at least two characters of a reference or docket number, a title or a company. Every office document with a scanned file is listed, grouped by kind.
          </Text>
        ) : isFetching && !data ? (
          <Spin style={{ display: "block", margin: "24px auto" }} />
        ) : !groups.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No document matches. Check the spelling, or try part of the reference number." />
        ) : (
          shown.map(({ category, items }) => (
            <div key={category.key} className="portal-group">
              <div className="portal-group-head" style={{ "--cat": category.color }}>
                <span className="portal-group-law">{category.law}</span>
                <span className="portal-group-title">{category.title}</span>
                <span className="portal-group-count">{items.length}</span>
              </div>
              <List dataSource={items} renderItem={(r) => renderItem(r, category)} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

/**
 * Designation for an EMB Region III employee: free text, with the office's
 * sections, units and divisions from HRPMS suggested as they type — written
 * in full, never as acronyms. Typing a short form still finds its unit.
 */
function DesignationInput({ id, value, onChange, options = [], placeholder }) {
  const typed = String(value || "").trim().toLowerCase();
  const matches = (options || [])
    .filter((o) => !typed || o.name.toLowerCase().includes(typed) || String(o.abbreviation || "").toLowerCase().startsWith(typed))
    .slice(0, 12)
    .map((o) => ({ value: o.name, label: <div className="portal-designation-option">{o.name}</div> }));
  return (
    <AutoComplete id={id} value={value} onChange={onChange} options={matches} popupMatchSelectWidth={420} maxLength={120}>
      <Input placeholder={placeholder} autoComplete="off" />
    </AutoComplete>
  );
}

const CUSTOM = "custom";

/**
 * Desired duration: a quick choice, or a custom length in hours or days.
 * The value is minutes. For a member of the public, three days is the
 * recommended maximum — longer asks draw questions — and the box says so.
 */
function DurationInput({ id, value, onChange, presets = [], min = 15, max = 43200, recommendedMax = 4320, isPublic = false }) {
  const isPreset = presets.includes(value);
  const [mode, setMode] = useState(isPreset || !value ? "preset" : CUSTOM);
  const [unit, setUnit] = useState(value && value % 1440 === 0 ? "days" : "hours");
  // The number as typed: changing the unit keeps it ("5" hours → "5" days).
  const [amount, setAmount] = useState(() => (value ? Math.round((value / (value % 1440 === 0 ? 1440 : 60)) * 100) / 100 : 1));
  const minutesFor = (n, u) => Math.max(min, Math.min(max, Math.round((Number(n) || 0) * (u === "days" ? 1440 : 60))));
  const over = isPublic && value > recommendedMax;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Select
          id={id}
          value={mode === CUSTOM ? CUSTOM : value}
          style={{ width: 200 }}
          options={[...presets.map((m) => ({ value: m, label: durationLabel(m) })), { value: CUSTOM, label: "Custom…" }]}
          onChange={(v) => {
            if (v === CUSTOM) {
              setMode(CUSTOM);
              onChange?.(minutesFor(amount, unit));
            } else {
              setMode("preset");
              onChange?.(v);
            }
          }}
        />
        {mode === CUSTOM && (
          <Space.Compact>
            <InputNumber
              min={unit === "days" ? 1 : 0.25}
              max={unit === "days" ? max / 1440 : max / 60}
              step={unit === "days" ? 1 : 0.5}
              value={amount}
              style={{ width: 110 }}
              aria-label="How long"
              onChange={(n) => {
                setAmount(n);
                onChange?.(minutesFor(n, unit));
              }}
            />
            <Select
              value={unit}
              style={{ width: 100 }}
              aria-label="Unit"
              options={[
                { value: "hours", label: "hours" },
                { value: "days", label: "days" },
              ]}
              onChange={(u) => {
                setUnit(u);
                onChange?.(minutesFor(amount, u));
              }}
            />
          </Space.Compact>
        )}
      </Space>
      {isPublic && (
        <Alert
          type={over ? "warning" : "info"}
          showIcon
          message={over ? `More than 3 days (${durationLabel(value)})` : "Three (3) days is the recommended maximum"}
          description={
            over
              ? "For members of the public, three days is the ideal maximum. Longer requests are more likely to be questioned or shortened by the office — consider asking for 3 days or less."
              : "For members of the public, asking for three days or less avoids questions about your request."
          }
        />
      )}
    </Space>
  );
}

/**
 * The terms, one step at a time, as the server serves them (server/modules/
 * portal/services/portalTerms.js): Freedom of Information then Data Privacy
 * for a member of the public, Data Privacy alone for an employee. Each must
 * be read to the end and agreed to before the next — and before the request
 * is sent.
 */
function TermsModal({ open, terms, steps, onCancel, onAccepted, sending }) {
  const { token } = antdTheme.useToken();
  const [index, setIndex] = useState(0);
  const [readToEnd, setReadToEnd] = useState({});
  const [agreed, setAgreed] = useState({});
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setReadToEnd({});
      setAgreed({});
    }
  }, [open]);

  const key = steps[index];
  const t = key === "foi" ? terms?.foi : terms?.privacy;
  const last = index === steps.length - 1;

  // Short enough to need no scrolling: read as soon as it is shown.
  useEffect(() => {
    const el = boxRef.current;
    if (open && el && el.scrollHeight <= el.clientHeight + 4) setReadToEnd((r) => ({ ...r, [key]: true }));
  }, [open, key]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd((r) => ({ ...r, [key]: true }));
  };

  const meta =
    key === "foi"
      ? { icon: <FileProtectOutlined />, kicker: "Executive Order No. 2, s. 2016", heading: "Freedom of Information", tone: token.colorPrimary }
      : { icon: <SafetyCertificateOutlined />, kicker: "Republic Act No. 10173", heading: "Data Privacy", tone: token.colorSuccess };

  if (!t) return null;
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={720}
      centered
      maskClosable={false}
      destroyOnClose
      className="portal-terms-modal"
      title={null}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>,
        index > 0 ? (
          <Button key="back" onClick={() => setIndex((i) => i - 1)} disabled={sending}>
            Back
          </Button>
        ) : null,
        <Button
          key="agree"
          type="primary"
          disabled={!agreed[key]}
          loading={last && sending}
          icon={last ? <SendOutlined /> : null}
          onClick={() => (last ? onAccepted() : setIndex((i) => i + 1))}
        >
          {last ? "I agree — send my request" : "I agree — continue"}
        </Button>,
      ]}
    >
      <div className="portal-terms-head" style={{ background: `linear-gradient(120deg, ${meta.tone} 0%, ${token.colorPrimaryActive} 100%)` }}>
        <div className="portal-terms-icon">{meta.icon}</div>
        <div>
          <div className="portal-terms-kicker">{meta.kicker}</div>
          <div className="portal-terms-heading">{meta.heading} — terms and conditions</div>
        </div>
        {steps.length > 1 && (
          <div className="portal-terms-step">
            Step {index + 1} of {steps.length}
          </div>
        )}
      </div>
      {steps.length > 1 && (
        <Steps
          size="small"
          current={index}
          style={{ margin: "16px 0 4px" }}
          items={steps.map((s) => ({ title: s === "foi" ? "Freedom of Information" : "Data Privacy" }))}
        />
      )}
      <div ref={boxRef} className="portal-terms-scroll" onScroll={onScroll} tabIndex={0} aria-label={t.title}>
        <Text strong>{t.title}</Text>
        <Paragraph style={{ margin: "8px 0 12px" }}>{t.intro}</Paragraph>
        <ol>
          {t.items.map((item) => (
            <li key={item.slice(0, 40)}>{item}</li>
          ))}
        </ol>
      </div>
      {!readToEnd[key] && (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
          <DownOutlined /> Scroll to the end to read every term before agreeing.
        </Text>
      )}
      <Checkbox
        style={{ marginTop: 12 }}
        disabled={!readToEnd[key]}
        checked={agreed[key] === true}
        onChange={(e) => setAgreed((a) => ({ ...a, [key]: e.target.checked }))}
      >
        {key === "foi"
          ? "I have read and agree to the Freedom of Information terms and conditions."
          : "I have read and agree to the Data Privacy terms and conditions, and consent to the processing of my personal information for this request."}
      </Checkbox>
      <Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 10 }}>
        Version {terms.version}. Your agreement is recorded with your request.
      </Text>
    </Modal>
  );
}

function RequestForm({ room, now, initialSerial, tourRefs }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(null); // the form's values while the terms are read
  const { data: terms, isLoading: termsLoading } = useQuery({ queryKey: ["portal", "terms"], queryFn: fetchTerms, staleTime: Infinity });
  const requesterType = Form.useWatch("requesterType", form);
  const kind = terms?.requesterTypes?.find((t) => t.value === requesterType) || null;
  const isPublic = kind?.public === true;

  const send = useMutation({
    mutationFn: sendRequest,
    onSuccess: (res) => {
      setPending(null);
      if (res.position) message.info(`The room is full. You are number ${res.position} in line; you will be seated automatically.`);
      else message.success(`You are in the room. ${UnitName(res.request)} has been notified.`);
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e) => {
      // The wording changed while the page was open: read the new terms.
      if (e?.response?.data?.code === "TERMS_CHANGED") {
        setPending(null);
        queryClient.invalidateQueries({ queryKey: ["portal", "terms"] });
      }
      message.error(describeError(e, "The request could not be sent."));
    },
  });

  // The request button: the form first, then the terms, then the request.
  const startRequest = async () => {
    if (!selected) {
      message.info("Find and select the document you need first.");
      return;
    }
    try {
      setPending(await form.validateFields());
    } catch {
      message.warning("Some details need attention before you can send the request.");
    }
  };

  const accepted = () =>
    send.mutate({
      // Where the document is kept — and so who decides.
      source: selected.source || "records",
      serialNo: selected.serialNo,
      requesterName: pending.requesterName,
      requesterType: pending.requesterType,
      designation: pending.designation,
      contact: isPublic ? pending.contact : null,
      idType: isPublic ? pending.idType : null,
      purpose: pending.purpose,
      desiredMinutes: pending.desiredMinutes,
      termsVersion: terms.version,
      acceptFoi: isPublic,
      acceptPrivacy: true,
    });

  // A different kind of requester: what was typed as designation belongs to the old choice.
  const onTypeChange = () => form.setFieldsValue({ designation: undefined });
  const queueAhead = room?.waiting?.length || 0;
  const closed = room?.roomState?.open === false;

  return (
    <Card
      className="portal-card"
      title={<Space><FileSearchOutlined />Request a document</Space>}
      extra={
        <span ref={tourRefs?.send}>
          <Button type="primary" icon={<SendOutlined />} onClick={startRequest} disabled={!selected || termsLoading || closed} loading={send.isPending}>
            {closed ? "The room is closed" : room?.full ? "Join the waiting line" : "Enter the room and send request"}
          </Button>
        </span>
      }
    >
      <Steps
        size="small"
        current={selected ? 1 : 0}
        className="portal-steps"
        items={[{ title: "Find the document" }, { title: "Your details" }, { title: "Unit review" }, { title: "Read it here" }]}
      />

      <div className="portal-section-label">1 · Find the document</div>
      <div ref={tourRefs?.search}>
        <FindDocument selected={selected} onSelect={setSelected} initialQuery={initialSerial} />
      </div>

      <div className="portal-section-label">2 · Your details</div>
      {room?.full && (
        <Alert
          type="warning"
          showIcon
          icon={<HourglassOutlined />}
          style={{ marginBottom: 16 }}
          message={`The room is full (${room.capacity} of ${room.capacity}).`}
          description={
            <>
              Send your request anyway to join the waiting line{queueAhead ? ` behind ${queueAhead} ${queueAhead === 1 ? "person" : "people"}` : ""}. The next seat is expected to free in about{" "}
              <b>{room.nextSeatAt ? roughly(new Date(room.nextSeatAt) - now) : "a while"}</b>; you will be seated and the unit told automatically.
            </>
          }
        />
      )}
      <Form form={form} layout="vertical" requiredMark="optional" disabled={!selected || termsLoading} initialValues={{ desiredMinutes: 60 }}>
        {!selected && <Alert type="info" showIcon message="Select a document above to fill in your request." style={{ marginBottom: 16 }} />}
        {selected && (
          <div className="portal-chosen">
            <FileTextOutlined />
            <DocTitle doc={selected} detail />
          </div>
        )}
        <div ref={tourRefs?.type}>
          <Form.Item
            name="requesterType"
            label="You are requesting as"
            rules={[{ required: true, message: "Choose whether you are an EMB Region III employee, a government employee, a student or a private citizen." }]}
            extra={
              kind
                ? isPublic
                  ? "As a member of the public, you request under the Freedom of Information order. You will be asked to agree to the FOI and Data Privacy terms."
                  : "As an EMB Region III employee, you will be asked to agree to the Data Privacy terms."
                : null
            }
          >
            <Select
              placeholder="Choose one"
              onChange={onTypeChange}
              options={(terms?.requesterTypes || []).map((t) => ({ value: t.value, label: t.label }))}
              style={{ maxWidth: 380 }}
            />
          </Form.Item>
        </div>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="requesterName" label="Requester name" rules={[{ required: true, whitespace: true, min: 2, message: "Enter your full name." }]}>
              <Input maxLength={120} placeholder="Full name" autoComplete="name" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="designation"
              label={kind ? kind.designationLabel : "Designation"}
              rules={[{ required: true, whitespace: true, min: 2, message: kind ? `Enter your ${kind.designationLabel.toLowerCase()}.` : "Enter your designation." }]}
              extra={kind ? kind.designationHint : "Choose who you are requesting as first."}
            >
              {requesterType === "emb-employee" ? (
                <DesignationInput options={room?.designations} placeholder={kind?.designationPlaceholder} />
              ) : (
                <Input maxLength={120} placeholder={kind?.designationPlaceholder || "Choose who you are requesting as first"} disabled={!kind} />
              )}
            </Form.Item>
          </Col>
        </Row>
        {isPublic && (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="contact"
                label="Contact (email or mobile number)"
                rules={[
                  { required: true, message: "Give an email address or a mobile number." },
                  {
                    pattern: /^([^\s@]+@[^\s@]+\.[^\s@]{2,}|(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4})$/,
                    message: "An email address, or a mobile number like 0917 123 4567.",
                  },
                ]}
                extra="Where the office can reach you about this request."
              >
                <Input maxLength={120} placeholder="name@example.com or 0917 123 4567" autoComplete="email" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="idType"
                label="Valid ID you will present"
                rules={[{ required: true, message: "Choose the valid ID you will present." }]}
                extra="The office may ask to see it. Only the kind of ID is recorded, never its number."
              >
                <Select placeholder="Choose an ID" options={(terms?.idTypes || []).map((t) => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Form.Item name="purpose" label="Purpose of request" rules={[{ required: true, whitespace: true, min: 5, message: "Say what you need the document for." }]}>
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="For example: preparing for the compliance inspection on Oct 20, or a school research paper." />
        </Form.Item>
        <Form.Item
          name="desiredMinutes"
          label="Desired duration"
          rules={[{ required: true, message: "Choose how long you need it." }]}
          extra="How long you need to read it. The office may approve a shorter time, and access ends 24 hours after you first open the document."
        >
          <DurationInput
            presets={room?.durations || [30, 60, 120, 240, 480, 1440, 4320]}
            min={room?.minMinutes}
            max={room?.maxMinutes}
            recommendedMax={room?.publicRecommendedMaxMinutes}
            isPublic={isPublic}
          />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <LockOutlined /> One request at a time from this browser. When you send it, you will be asked to agree to the {isPublic ? "Freedom of Information and Data Privacy" : "Data Privacy"} terms.
        </Text>
      </Form>

      <TermsModal
        open={Boolean(pending) && Boolean(terms)}
        terms={terms}
        steps={isPublic ? ["foi", "privacy"] : ["privacy"]}
        sending={send.isPending}
        onCancel={() => setPending(null)}
        onAccepted={accepted}
      />
    </Card>
  );
}

// ── My request ──────────────────────────────────────────────────────────────

function MyRequest({ mine, room, now, onOpen, onChat }) {
  const queryClient = useQueryClient();
  const unit = unitName(mine);
  const Unit = UnitName(mine);
  const closed = room?.roomState?.open === false;
  const leave = useMutation({
    mutationFn: leaveRoom,
    onSuccess: () => {
      message.success(mine.status === "waiting" ? "You left the waiting line." : "You left the room.");
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e) => message.error(describeError(e, "Could not leave.")),
  });
  const confirmLeave = () =>
    modal.confirm({
      title: mine.status === "approved" ? "Leave the room and end your access?" : mine.status === "waiting" ? "Leave the waiting line?" : "Leave the room and withdraw your request?",
      content: mine.status === "approved" ? "The document closes and your seat goes to the next person. You would need to ask again." : "Your place goes to the next person.",
      okText: "Leave",
      okButtonProps: { danger: true },
      onOk: () => leave.mutateAsync(),
    });

  const step = mine.status === "waiting" ? 0 : mine.status === "pending" ? 1 : 2;
  const position = room?.waiting?.find((w) => w.mine);
  const leftMs = mine.expiresAt ? new Date(mine.expiresAt) - now : 0;
  const total = (mine.grantedMinutes || 1) * 60000;

  return (
    <Card
      className="portal-card portal-mine"
      title={<Space><TeamOutlined />Your request</Space>}
      extra={
        <Space size={8}>
          <Badge count={room?.chatUnread || 0} size="small">
            <Button size="small" icon={<MessageOutlined />} onClick={onChat}>
              Messages
            </Button>
          </Badge>
          {statusTag(mine.status)}
        </Space>
      }
    >
      <Steps size="small" current={step} className="portal-steps" items={[{ title: "In line" }, { title: "Unit review" }, { title: "Viewing" }]} />
      <div className="portal-chosen">
        <FileTextOutlined />
        <DocTitle doc={mine} detail />
      </div>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        {mine.requesterName} · {mine.designation} · asked for {durationLabel(mine.desiredMinutes)} · “{mine.purpose}”
      </Paragraph>

      {mine.status === "waiting" && (
        <div className="portal-state">
          <HourglassOutlined className="portal-state-icon" />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              You are number {position?.position || "—"} in line
            </Title>
            <Text type="secondary">
              {position?.etaAt ? (
                <>
                  A seat is expected in about <b>{roughly(new Date(position.etaAt) - now)}</b> (around {when(position.etaAt)}).
                </>
              ) : (
                "You will be seated as soon as the people ahead of you are."
              )}{" "}
              You will be seated automatically. Keep this page open, or come back to it on this computer.
            </Text>
            <div style={{ marginTop: 8 }}>
              <NotifyMe />
            </div>
          </div>
        </div>
      )}

      {mine.status === "pending" && (
        <div className="portal-state">
          <ClockCircleOutlined className="portal-state-icon is-pending" />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Waiting for {unit}
            </Title>
            <Text type="secondary">
              You are in the room. This page updates the moment they decide. If nobody decides, your seat is held for another{" "}
              <b className="portal-clock">{countdown(new Date(mine.pendingUntil) - now)}</b>.
            </Text>
            <div style={{ marginTop: 8 }}>
              <NotifyMe />
            </div>
          </div>
        </div>
      )}

      {mine.status === "approved" && (
        <div className="portal-state is-approved">
          <div className="portal-ring">
            <Progress type="circle" size={96} percent={Math.max(0, Math.min(100, (leftMs / total) * 100))} format={() => <span className="portal-clock" style={{ fontSize: 14 }}>{countdown(leftMs)}</span>} strokeColor={leftMs < 5 * 60000 ? "#cf1322" : undefined} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Title level={4} style={{ margin: 0 }}>
              Approved — your document is ready
            </Title>
            <Space direction="vertical" size={2} style={{ marginTop: 6 }}>
              <Text type="secondary">
                Valid until <b>{when(mine.expiresAt)}</b> · {mine.pages?.all === false ? `pages ${mine.pages.spec} only` : "all pages"}
              </Text>
              {mine.decisionNote && <Text type="secondary">Note from {unit}: “{mine.decisionNote}”</Text>}
            </Space>
            {/* Opening starts a 24-hour limit (server: recordView). */}
            {mine.firstViewedAt ? (
              <Alert
                type="info"
                showIcon
                icon={<ClockCircleOutlined />}
                style={{ marginTop: 10 }}
                message={`First opened ${when(mine.firstViewedAt)}`}
                description="Access ends 24 hours after you first open a document — or sooner, if the approved time ends first."
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 10 }}
                message="Opening the document starts a 24-hour limit"
                description="Open it when you are ready to read: from the first opening, your access ends 24 hours later (or sooner, if the approved time ends first)."
              />
            )}
            <Space wrap style={{ marginTop: 12 }}>
              <Button type="primary" size="large" icon={<EyeOutlined />} onClick={onOpen} disabled={closed}>
                Open document
              </Button>
              {/* Only when the Developer allowed it for this seat. */}
              {mine.downloadAllowed && (
                <Button size="large" icon={<DownloadOutlined />} href={`${documentUrl()}?download=1`} target="_blank" rel="noopener">
                  Download
                </Button>
              )}
            </Space>
          </div>
        </div>
      )}

      {mine.status === "pending" && (
        <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 8 }}>
          {Unit} may write to you here with a question — press <b>Messages</b> to read and reply.
        </Text>
      )}
      <div className="portal-mine-foot">
        <Button danger icon={<LogoutOutlined />} onClick={confirmLeave} loading={leave.isPending}>
          {mine.status === "waiting" ? "Leave the line" : "Leave the room"}
        </Button>
      </div>
    </Card>
  );
}

/** How this browser's last request ended, shown above the form for a day. */
function LastOutcome({ last }) {
  const [hidden, setHidden] = useState(false);
  if (!last || hidden) return null;
  const words = {
    declined: ["warning", "Your last request was declined"],
    revoked: ["warning", "Your access was ended early"],
    expired: ["info", "Your last access has ended"],
    lapsed: ["info", "Your last request lapsed without a decision"],
    left: ["info", "You left the room"],
    cancelled: ["info", "You left the waiting line"],
  }[last.status];
  if (!words) return null;
  return (
    <Alert
      type={words[0]}
      showIcon
      closable
      onClose={() => setHidden(true)}
      message={`${words[1]} — ${docLabel(last)}`}
      description={last.decisionNote ? `Note from ${unitName(last)}: “${last.decisionNote}”` : "You may send a new request below."}
    />
  );
}

// ── The room ────────────────────────────────────────────────────────────────

function Room({ room, now, loading }) {
  return (
    <Card
      className="portal-card"
      title={<Space><TeamOutlined />In the room</Space>}
      extra={<Tag color={room?.full ? "red" : "green"}>{room ? `${room.seated} / ${room.capacity}` : "…"}</Tag>}
      styles={{ body: { padding: 0 } }}
    >
      <List
        loading={loading}
        className="portal-room-list"
        dataSource={room?.seats || []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody is in the room." /> }}
        renderItem={(s) => (
          <List.Item className={`portal-seat${s.mine ? " is-mine" : ""}`}>
            <span className="portal-seat-no">{s.position}</span>
            {/* Others are unnamed seats: names are for the person themself, ERMS staff and the Developer. */}
            <Avatar className={`portal-seat-avatar ${s.status}`} icon={s.name ? null : <UserOutlined />}>
              {s.name ? initials(s.name) : null}
            </Avatar>
            <div className="portal-seat-main">
              <Text strong ellipsis style={{ maxWidth: "100%" }} type={s.name ? undefined : "secondary"}>
                {s.name || "Private seat"}
                {s.mine ? <Tag color="blue" style={{ marginInlineStart: 6 }}>You</Tag> : null}
              </Text>
              <Space size={4}>
                {s.designation ? <Tag style={{ marginInlineEnd: 0 }}>{s.designation}</Tag> : null}
                <Text type="secondary" style={{ fontSize: 12 }}>{s.status === "approved" ? "Viewing" : "Awaiting approval"}</Text>
              </Space>
            </div>
            <Tooltip title={s.status === "approved" ? `Access ends ${when(s.expiresAt)}` : `Seat held until ${when(s.holdUntil)} unless decided`}>
              <Text className="portal-clock portal-seat-clock" type={s.status === "approved" ? undefined : "secondary"}>
                {s.status === "approved" ? countdown(new Date(s.expiresAt) - now) : <ClockCircleOutlined />}
              </Text>
            </Tooltip>
          </List.Item>
        )}
      />
      {room?.waiting?.length ? (
        <div className="portal-line">
          <div className="portal-line-title">
            <HourglassOutlined /> Waiting line · {room.waiting.length}
          </div>
          {room.waiting.map((w) => (
            <div key={w.position} className={`portal-line-row${w.mine ? " is-mine" : ""}`}>
              <span className="portal-seat-no">{w.position}</span>
              <Text ellipsis style={{ flex: 1 }} type={w.name ? undefined : "secondary"}>
                {w.name ? (
                  <>
                    {w.name} {w.designation ? <Text type="secondary">· {w.designation}</Text> : null}
                    {w.mine ? <Tag color="blue" style={{ marginInlineStart: 6 }}>You</Tag> : null}
                  </>
                ) : (
                  "Private seat"
                )}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{w.etaAt ? `~${roughly(new Date(w.etaAt) - now)}` : "—"}</Text>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Safeguards() {
  const items = [
    ["Only what was approved", "Pages not approved never reach your browser."],
    ["Recorded to you", "Each opening is recorded with your name, this computer's address and the time."],
    ["View only", "No download, print, copy or right-click. The document hides when you switch windows."],
    ["Time-limited", "It closes by itself the second your time ends, and your seat goes to the next person."],
    ["On the record", "Every request, decision and view is kept in the audit trail."],
  ];
  return (
    <Card className="portal-card" size="small" title={<Space><SafetyCertificateOutlined />How documents are protected</Space>}>
      <ul className="portal-safeguards">
        {items.map(([title, text]) => (
          <li key={title}>
            <CheckCircleFilled />
            <div>
              <Text strong>{title}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{text}</Text>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The conversation with the unit about this browser's request. */
function MyChat({ open, onClose, mine }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portal", "chat"], queryFn: fetchMyChat, enabled: open, refetchInterval: open ? 20000 : false });
  const send = useMutation({
    mutationFn: postMyChat,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal"] }),
    onError: (e) => message.error(describeError(e, "The message could not be sent.")),
  });
  const unit = unitName(mine);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      title={
        <Space>
          <MessageOutlined />
          Messages with {unit}
        </Space>
      }
      destroyOnHidden
      styles={{ body: { display: "flex", flexDirection: "column", padding: 16 } }}
    >
      <ChatThread
        side="requester"
        messages={data?.messages}
        expiresAt={data?.expiresAt}
        loading={isLoading}
        sending={send.isPending}
        onSend={(text) => send.mutateAsync(text)}
        otherName={unit}
        placeholder={`Ask ${unit} about your request`}
      />
    </Drawer>
  );
}

/** The room is closed (weekends, when the Developer has set it so): when it opens again. */
function ClosedBanner({ state }) {
  if (!state || state.open !== false) return null;
  return (
    <Alert
      type="warning"
      showIcon
      icon={<LockOutlined />}
      style={{ marginBottom: 16 }}
      message="The Document Portal is closed on weekends"
      description={
        <>
          New requests cannot be sent and documents cannot be opened until <b>{when(state.opensAt)}</b>. A request already in the room keeps its place, and
          weekend days do not count against the time the office has to decide it.
        </>
      }
    />
  );
}

// ── The page ────────────────────────────────────────────────────────────────

export default function DocumentPortal() {
  const { token } = antdTheme.useToken();
  const now = useNow();
  const [params] = useSearchParams();
  const [viewing, setViewing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { data: room, isLoading, error } = useQuery({ queryKey: ["portal", "room"], queryFn: fetchRoom, refetchInterval: 30000 });
  const mine = room?.mine || null;
  useLiveRoom(mine?.id || null);

  // The approval ended or was withdrawn while open: close it.
  // …or the room closed for the weekend.
  const closed = room?.roomState?.open === false;
  useEffect(() => {
    if (viewing && (mine?.status !== "approved" || closed)) setViewing(false);
  }, [viewing, mine?.status, closed]);
  // No request, no conversation.
  useEffect(() => {
    if (!mine) setChatOpen(false);
  }, [mine]);
  const initialSerial = useMemo(() => params.get("serial") || "", [params]);

  // The first-visit tour (PortalTour). Its targets live in several parts of the page.
  const tourRefs = { search: useRef(null), type: useRef(null), send: useRef(null), room: useRef(null), theme: useRef(null) };
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (!isLoading && shouldShowTour()) {
      const t = setTimeout(() => setTourOpen(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isLoading]);

  return (
    <div className="portal-page" style={{ background: token.colorBgLayout, color: token.colorText }}>
      <TopBar themeRef={tourRefs.theme} onTour={() => setTourOpen(true)} />
      <main className="portal">
        <Header room={room} now={now} />
        {error && <Alert type="error" showIcon message={describeError(error, "The Document Portal could not be loaded. Check your connection and try again.")} style={{ marginBottom: 16 }} />}
        <ClosedBanner state={room?.roomState} />
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={15}>
            <Space direction="vertical" size={20} style={{ width: "100%" }}>
              {!mine && <LastOutcome last={room?.last} />}
              {isLoading ? (
                <Card loading className="portal-card" />
              ) : mine ? (
                <MyRequest mine={mine} room={room} now={now} onOpen={() => setViewing(true)} onChat={() => setChatOpen(true)} />
              ) : (
                <RequestForm room={room} now={now} initialSerial={initialSerial} tourRefs={tourRefs} />
              )}
            </Space>
          </Col>
          <Col xs={24} xl={9}>
            <Space direction="vertical" size={20} style={{ width: "100%" }}>
              <div ref={tourRefs.room}>
                <Room room={room} now={now} loading={isLoading} />
              </div>
              <Safeguards />
            </Space>
          </Col>
        </Row>
        <footer className="portal-footer">
          <Text type="secondary" style={{ fontSize: 12 }}>
            Environmental Management Bureau Region III · E-Universe Document Portal. Requests are reviewed by the unit that keeps the document, during office hours on weekdays.
          </Text>
        </footer>
      </main>
      {mine && <MyChat open={chatOpen} onClose={() => setChatOpen(false)} mine={mine} />}
      {viewing && mine?.status === "approved" && <SecureViewer request={mine} now={now} onClose={() => setViewing(false)} canDownload={mine.downloadAllowed === true} />}
      <PortalTour open={tourOpen} onClose={() => setTourOpen(false)} refs={tourRefs} hasForm={!mine} />
      {/* VERA, the portal's guide: she introduces herself — after the tour — and answers questions about the portal only. */}
      <VeraChat variant="public" holdIntro={tourOpen} />
    </div>
  );
}
