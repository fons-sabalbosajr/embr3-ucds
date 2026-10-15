import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Grid, theme as antdTheme } from "antd";
import { SendOutlined, CloseOutlined, MinusOutlined, ReloadOutlined, DeleteOutlined, WarningOutlined, MessageOutlined } from "@ant-design/icons";

import { VeraFlame, VeraOrb } from "./VeraMark";
import { BorderBeam } from "border-beam";
import { getVeraStatus, askVera, getVeraPublicStatus, askVeraPublic, pageKeyFromPath } from "./veraService";
import { useTheme } from "../../theme/ThemeProvider";
import "./vera.css";

// ---------------------------------------------------------------------------
// VERA — the in-app assistant: a floating launcher and a chat window (a
// bottom sheet on a phone). The mark is the animated dotted flame; a border
// beam runs round the launcher's own rounded edge. The flame's state follows
// what VERA is doing — burning at rest, listening while you type, thinking /
// searching / working while an answer is on its way. Colours follow the app's
// light or dark mode.
//
// VERA answers from a help library about how E-Universe works, phrased by an
// AI model when one is switched on. It cannot read any record, so it never
// quotes one.
//
// Two variants:
//   staff  (default) — signed in. Knowledge follows the account: Planning gets
//          the register, the units get the document library, administrators
//          get configuration.
//   public — the sign-in pages. A separate, much narrower knowledge base; the
//          server refuses every account or record lookup there.
// ---------------------------------------------------------------------------

/** Turns of context sent back. The server caps this again. */
const HISTORY_TURNS = 8;

/**
 * VERA's answer, rendered as TEXT — never HTML — so a reply can never inject
 * markup. A small safe subset of Markdown is honoured: **bold**, `code`,
 * numbered and bulleted lists, paragraphs.
 */
function AnswerText({ children }) {
  const blocks = String(children || "").split(/\n{2,}/);
  const inline = (line, key) => (
    <span key={key}>
      {String(line)
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        .map((p, i) => {
          if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
          if (/^`[^`]+`$/.test(p)) return <code key={i} className="vera-code">{p.slice(1, -1)}</code>;
          return <span key={i}>{p}</span>;
        })}
    </span>
  );
  return (
    <div className="vera-answer">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*(\d+[.)]|[-•*])\s+/.test(l));
        if (isList) {
          const ListTag = /^\s*\d+[.)]/.test(lines[0]) ? "ol" : "ul";
          return (
            <ListTag key={bi} className="vera-answer__list">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*(\d+[.)]|[-•*])\s+/, ""), li)}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={bi} className="vera-answer__p">
            {lines.map((l, li) => (
              <span key={li}>
                {inline(l, li)}
                {li < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function VeraChat({ variant = "staff", holdIntro = false }) {
  const isPublic = variant === "public";
  const fetchStatus = isPublic ? getVeraPublicStatus : getVeraStatus;
  const sendMessage = isPublic ? askVeraPublic : askVera;

  const location = useLocation();
  const { mode } = useTheme();
  // The beam in the app's own accent, as the panel's colours are (vera.css).
  const accent = antdTheme.useToken().token.colorPrimary;
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;
  const pageKey = useMemo(() => pageKeyFromPath(location.pathname), [location.pathname]);

  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]); // { id, role, content, source?, notice?, retry? }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkStage, setThinkStage] = useState(0);
  const [typing, setTyping] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const msgSeq = useRef(0);

  // The status decides whether the launcher shows at all: fetched once per
  // mount (and per public page, whose greeting differs), not on every open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await (isPublic ? fetchStatus(pageKey) : fetchStatus());
        if (!cancelled) setStatus(res);
      } catch {
        // No assistant, quietly — never an error banner for an optional feature.
        if (!cancelled) setStatus({ available: false, showLauncher: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, isPublic, isPublic ? pageKey : null]);

  const name = status?.name || "VERA";

  // Where the page asks for it (the Document Portal), VERA says hello by
  // herself: a moment after the page settles, her flame ignites beside the
  // launcher and her greeting types itself out. Once per tab: dismissed or
  // opened, she waits to be asked after that.
  const INTRO_KEY = `eu.vera.intro.${pageKey}`;
  const [introReady, setIntroReady] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(`eu.vera.intro.${pageKeyFromPath(window.location.pathname)}`) === "1";
    } catch {
      return false;
    }
  });
  const dismissIntro = useCallback(() => {
    setIntroDismissed(true);
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* private window: she may say hello again on reload */
    }
  }, [INTRO_KEY]);
  // The page may ask her to wait (the portal's tour is showing).
  useEffect(() => {
    if (!status?.introduce || introDismissed || holdIntro) return undefined;
    const t = setTimeout(() => setIntroReady(true), 1400);
    return () => clearTimeout(t);
  }, [status?.introduce, introDismissed, holdIntro]);
  const introText = useMemo(() => String(status?.welcomeMessage || "").split(/\n\n/)[0] || "", [status?.welcomeMessage]);
  const [typed, setTyped] = useState(0);
  // Her mark comes alive while she introduces herself: it ignites, speaks
  // while the greeting types out, then settles to its resting flame.
  const [introFlame, setIntroFlame] = useState("igniting");
  const speaking = introReady && typed < introText.length;
  useEffect(() => {
    if (!introReady || introDismissed) return undefined;
    setTyped(0);
    setIntroFlame("igniting");
    const lit = setTimeout(() => setIntroFlame("working"), 1200);
    const tick = setInterval(() => setTyped((n) => (n >= introText.length ? n : n + 2)), 28);
    return () => {
      clearTimeout(lit);
      clearInterval(tick);
    };
  }, [introReady, introDismissed, introText]);
  useEffect(() => {
    if (introReady && introText && typed >= introText.length) {
      const t = setTimeout(() => setIntroFlame("burning"), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [introReady, typed, introText]);

  // Rotating "thinking" copy, so a slow model call does not look frozen.
  const thinkingMessages = useMemo(
    () => [`${name} is thinking…`, `${name} is checking the help library…`, `${name} is preparing the steps…`],
    [name]
  );
  useEffect(() => {
    if (!sending) {
      setThinkStage(0);
      return undefined;
    }
    const id = setInterval(() => setThinkStage((s) => (s + 1) % thinkingMessages.length), 2200);
    return () => clearInterval(id);
  }, [sending, thinkingMessages.length]);

  // One state for every flame on screen: the stage of a pending answer
  // (thinking → checking the library → preparing the steps), listening while
  // a question is being typed, burning at rest. The dot-by-dot hand-off from
  // the orb back to the flame is what an arriving answer looks like.
  const flameState = sending
    ? ["thinking", "searching", "working"][thinkStage % 3]
    : typing && draft.trim()
      ? "listening"
      : "burning";

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);
  useEffect(() => {
    if (open && !minimized) scrollToEnd();
  }, [open, minimized, messages, sending, scrollToEnd]);

  const closeWindow = useCallback(() => {
    setOpen(false);
    setMinimized(false);
    // Focus back to the launcher, so keyboard users are not stranded.
    requestAnimationFrame(() => launcherRef.current?.focus?.());
  }, []);

  const send = async (text) => {
    const message = String(text ?? draft).trim();
    if (!message || sending) return;
    setDraft("");
    const userMsg = { id: ++msgSeq.current, role: "user", content: message };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setSending(true);
    try {
      const res = await sendMessage({
        message,
        history: nextMessages.slice(-HISTORY_TURNS * 2).map((m) => ({ role: m.role, content: m.content })),
        page: status?.sendPageContext === false ? "" : pageKey,
      });
      setMessages((prev) => [
        ...prev,
        res?.success === false
          ? { id: ++msgSeq.current, role: "assistant", content: res.message || `${name} could not answer that right now.`, source: "error", retry: true }
          : { id: ++msgSeq.current, role: "assistant", content: res.answer, source: res.source, notice: res.notice },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgSeq.current,
          role: "assistant",
          content: err?.response?.data?.message || `${name} is unreachable right now. Please try again.`,
          source: "error",
          retry: true,
        },
      ]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus?.());
    }
  };

  /** Ask the last question again, dropping the failed answer. */
  const retryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.filter((m) => m.source !== "error"));
    send(lastUser.content);
  };

  if (!status?.available || status?.showLauncher === false) return null;

  const showIntro = Boolean(status.introduce) && !open && !introDismissed && introReady;
  const starters = status.starters || [];
  const showGreeting = messages.length === 0;
  const modelOn = Boolean(status.modelAvailable);

  return (
    // data-theme scopes the palette in vera.css, and is the [data-theme] the
    // canvases fall back to.
    <div className="vera-root" data-theme={mode}>
      {showIntro && (
        <div className="vera-intro" role="status" aria-live="polite">
          <div className="vera-intro__head">
            <span className={`vera-intro__mark${speaking ? " is-speaking" : ""}`}>
              <VeraFlame size={52} state={introFlame} theme={mode} label="" />
            </span>
            <div className="vera-intro__who">
              <span className="vera-intro__name">{name}</span>
              <span className="vera-intro__role">{status.fullName || "Your guide"}</span>
            </div>
            <button type="button" className="vera-icon-btn vera-intro__close" aria-label="Dismiss" title="Dismiss" onClick={dismissIntro}>
              ×
            </button>
          </div>
          <p className="vera-intro__text">
            {introText.slice(0, typed)}
            {typed < introText.length ? <span className="vera-intro__caret" aria-hidden="true" /> : null}
          </p>
          <div className="vera-intro__actions">
            <button
              type="button"
              className="vera-intro__primary"
              onClick={() => {
                dismissIntro();
                setOpen(true);
                setMinimized(false);
              }}
            >
              Ask {name}
            </button>
            <button type="button" className="vera-intro__secondary" onClick={dismissIntro}>
              Maybe later
            </button>
          </div>
        </div>
      )}
      {!open && (
        // VERA's own flame on the launcher, with a beam running its edge
        // (border-beam, libraries.dev). The beam's box is what sits fixed in
        // the corner; the button inside it takes the beam's shape.
        <BorderBeam className="vera-launcher-dock" size="sm" colorVariant="ocean" theme={mode === "dark" ? "dark" : "light"} duration={2.6}>
        <button
          type="button"
          ref={launcherRef}
          className="vera-launcher"
          aria-label={`Open ${name}, the ${status.fullName || "assistant"}`}
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
        >
          <VeraFlame size={isMobile ? 40 : 36} state="burning" theme={mode} glow={false} label="" />
          <span className="vera-launcher__text">
            <span className="vera-launcher__label">Ask {name}</span>
            <span className="vera-launcher__sub">{status.introduce ? "Your Document Portal guide" : modelOn ? "Your E-Universe assistant" : "Help library"}</span>
          </span>
        </button>
        </BorderBeam>
      )}

      {open && (
        <section
          className={["vera-window", minimized ? "vera-window--min" : "", isMobile ? "vera-window--mobile" : ""].filter(Boolean).join(" ")}
          role="dialog"
          aria-label={`${name} assistant chat`}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeWindow();
          }}
        >
          <header className="vera-header">
            <div className="vera-header__id">
              <span className="vera-header__mark">
                <VeraFlame size={34} state={flameState} theme={mode} label="" />
              </span>
              <div className="vera-header__text">
                <div className="vera-header__name">{name}</div>
                <div className="vera-header__sub">
                  <span className={`vera-status-dot vera-status-dot--${sending ? "busy" : modelOn ? "online" : "lite"}`} />
                  {sending ? "Answering…" : modelOn ? "Online" : "Online · Help library"}
                </div>
              </div>
            </div>
            <div className="vera-header__actions">
              <button
                type="button"
                className="vera-icon-btn"
                aria-label={minimized ? "Expand chat" : "Minimize chat"}
                title={minimized ? "Expand" : "Minimize"}
                onClick={() => setMinimized((m) => !m)}
              >
                <MinusOutlined />
              </button>
              <button type="button" className="vera-icon-btn" aria-label="Close chat" title="Close" onClick={closeWindow}>
                <CloseOutlined />
              </button>
            </div>
          </header>

          {!minimized && (
            <>
              <div className="vera-fullname">{status.fullName}</div>

              <div className="vera-messages" ref={scrollRef} aria-live="polite">
                {showGreeting && (
                  <div className="vera-msg vera-msg--assistant">
                    <div className="vera-bubble">
                      <AnswerText>{status.welcomeMessage}</AnswerText>
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={`vera-msg vera-msg--${m.role === "user" ? "user" : "assistant"}`}>
                    <div className={`vera-bubble${m.source === "error" ? " vera-bubble--error" : ""}`}>
                      {m.role === "user" ? (
                        <span>{m.content}</span>
                      ) : (
                        <>
                          {m.source === "error" ? <WarningOutlined style={{ marginRight: 6 }} /> : null}
                          <AnswerText>{m.content}</AnswerText>
                          {m.notice ? <div className="vera-notice">{m.notice}</div> : null}
                          {m.retry && !sending ? (
                            <button type="button" className="vera-retry-btn" onClick={retryLast}>
                              <ReloadOutlined /> Retry
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="vera-msg vera-msg--assistant">
                    <div className="vera-bubble vera-thinking" aria-live="assertive">
                      <VeraOrb size={20} state={flameState} theme={mode} color={accent} label="" />
                      <span className="vera-thinking__text">{thinkingMessages[thinkStage]}</span>
                    </div>
                  </div>
                )}

                {showGreeting && starters.length > 0 && (
                  <div className="vera-starters">
                    <div className="vera-starters__label">Try asking:</div>
                    {starters.map((q) => (
                      <button key={q} type="button" className="vera-starter-chip" onClick={() => send(q)} disabled={sending}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {messages.length > 0 && (
                <div className="vera-quick-actions">
                  <button type="button" className="vera-quick-btn vera-quick-btn--clear" onClick={() => setMessages([])} disabled={sending}>
                    <DeleteOutlined /> Clear
                  </button>
                </div>
              )}

              <form
                className="vera-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  ref={inputRef}
                  className="vera-input"
                  value={draft}
                  maxLength={status.maxInputChars || 1000}
                  rows={1}
                  placeholder={isPublic ? `Ask ${name} about signing in…` : `Ask ${name} how to do something…`}
                  aria-label={`Message to ${name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="submit" className="vera-send-btn" aria-label="Send message" disabled={!draft.trim() || sending}>
                  <SendOutlined />
                </button>
              </form>

              <div className="vera-disclaimer">
                <MessageOutlined />
                <span>
                  {isPublic
                    ? `${name} explains how to get into E-Universe. It cannot see or confirm any account — contact the administrator for anything about yours.`
                    : `${name} explains how E-Universe works and can count and total what your account can see. It cannot open a record, establishment or document, so check the details on the screen itself.`}
                </span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
