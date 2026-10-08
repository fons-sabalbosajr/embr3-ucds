import { useEffect, useRef, useState } from "react";
import { Alert, Button, Progress, Space, Tooltip, Typography, theme as antdTheme } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, ColumnWidthOutlined, LockOutlined, SendOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useViewOnly } from "./viewOnly";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The application's own PDF viewer — every scanned PDF opens here.
//
// View only. The browser's built-in viewer carries download and print
// buttons, a "save as" on right-click and a page that prints, so scans are
// not shown in it at all. This one draws the pages onto canvases and offers
// zoom and nothing else; right-click, Ctrl+S and Ctrl+P do nothing while it
// is open, and a printed page comes out blank (see viewOnly.jsx). It is a
// courtesy to the office's rule, not a lock — a screen can always be
// photographed — which is what the watermark is for.
//
// A page limit is enforced on the server: the PDF arrives already cut to its
// first N pages, with the full count in a header, so nothing beyond the
// limit is in the browser at all. The withheld pages are drawn as blurred
// placeholders (or, when the unit turned blurring off, as one note at the
// end), each with a way to ask the people who can grant it for the whole
// document — `request`.
//
// Fast to open: the download is shown as a percentage, and pages are drawn
// only as they come near the visible area — one at a time, nearest first —
// instead of every page up front. A page not drawn yet is a blank sheet of
// the right size, so the scroll bar is right from the start; zooming redraws
// only what is in view.
// ---------------------------------------------------------------------------

const PAGE_GAP = 12;
// 50% opens a whole page in view; "fit to width" is 100%.
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM = 0.5;
// Sharpness on high-density screens costs time and memory per page; past
// 1.5x the difference cannot be seen on a scan.
const MAX_DPR = 1.5;
// How far beyond the visible area pages are drawn ahead of the scroll.
const LOOKAHEAD = "1200px 0px";

/** How to ask for the rest, and where that request stands. */
const RequestFull = ({ request, owner, compact = false, onPaper = false }) => {
  // On a page sheet the background is white in either theme, so the ink is fixed.
  const ink = onPaper ? { color: "#374151" } : undefined;
  if (!request) {
    return (
      <Text type="secondary" style={{ fontSize: 12, textAlign: "center", ...ink }}>
        Ask {owner} if you need the rest of the document.
      </Text>
    );
  }
  if (request.state === "pending" || request.state === "sent") {
    const Icon = request.state === "sent" ? CheckCircleOutlined : ClockCircleOutlined;
    return (
      <Space size={6} align="start">
        <Icon style={{ color: request.state === "sent" ? "#389e0d" : "#d48806", marginTop: 3 }} />
        <Text style={{ fontSize: 12, ...ink }}>{request.note || `Your request for the whole document is with ${owner}.`}</Text>
      </Space>
    );
  }
  return (
    <Button type="primary" size={compact ? "small" : "middle"} icon={<SendOutlined />} loading={request.state === "sending"} onClick={request.send}>
      {request.label || `Request full access from ${owner}`}
    </Button>
  );
};

/** A page-shaped placeholder for a page the server withheld. */
const WithheldPage = ({ number, total, width, height, request, owner }) => (
  <div
    style={{ width, height, position: "relative", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", overflow: "hidden" }}
    aria-label={`Page ${number} of ${total}, withheld`}
  >
    {/* Text-like lines, blurred: what a page looks like from across the room. */}
    <div style={{ position: "absolute", inset: 0, padding: "9% 10%", filter: "blur(6px)", opacity: 0.55, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {Array.from({ length: 34 }, (_, i) => (
        <div key={i} style={{ height: 8, width: `${i % 7 === 6 ? 40 : 70 + ((i * 37) % 30)}%`, background: "#6b7280", borderRadius: 3 }} />
      ))}
    </div>
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, background: "rgba(255,255,255,.4)", padding: 16, textAlign: "center" }}>
      <LockOutlined style={{ fontSize: 28, color: "#6b7280" }} />
      <Text strong style={{ color: "#1f2937" }}>Page {number} of {total} — not included in your access</Text>
      <RequestFull request={request} owner={owner} compact onPaper />
    </div>
  </div>
);

/** Read a response body, reporting the fraction received when the length is known. */
async function readWithProgress(res, onProgress) {
  const length = Number(res.headers.get("Content-Length")) || 0;
  if (!res.body || !length) {
    const buf = await res.arrayBuffer();
    onProgress(100);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(99, Math.round((received / length) * 100)));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  onProgress(100);
  return out.buffer;
}

/**
 * @param src           the preview URL (fetched with credentials)
 * @param watermark     text drawn across every page, or null
 * @param blurWithheld  blurred placeholders for withheld pages (default), or one note
 * @param request       { state: "idle"|"sending"|"pending"|"sent", send, label, note } — how to ask for the
 *                      rest; null to only say whom to ask
 * @param owner         who grants it, in words ("the Records Unit")
 */
const PdfViewer = ({ src, watermark, height = "78vh", blurWithheld = true, request = null, owner = "the unit that keeps it" }) => {
  const containerRef = useRef(null);
  const viewOnly = useViewOnly();
  const { token } = antdTheme.useToken();
  const [doc, setDoc] = useState(null);
  const [phase, setPhase] = useState({ stage: "download", percent: 0 }); // download | ready | error
  const [withheld, setWithheld] = useState({ total: null, shown: null });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [ratio, setRatio] = useState(1.4142); // height / width of page 1
  const [fitWidth, setFitWidth] = useState(800);
  // Drawn canvases by page number, for the current zoom; a version number
  // re-renders the slots when one is added.
  const drawn = useRef(new Map());
  const [, setVersion] = useState(0);

  // 1. Fetch and open the document — once per source, not again on zoom.
  useEffect(() => {
    let cancelled = false;
    let opened = null;
    setDoc(null);
    drawn.current = new Map();
    setPhase({ stage: "download", percent: 0 });
    (async () => {
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `The document could not be loaded (${res.status}).`);
        }
        const total = Number(res.headers.get("X-Document-Pages")) || null;
        const shown = Number(res.headers.get("X-Document-Pages-Shown")) || null;
        const data = await readWithProgress(res, (percent) => {
          if (!cancelled) setPhase({ stage: "download", percent });
        });
        if (cancelled) return;
        opened = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        const first = await opened.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(vp.height / vp.width);
        setWithheld({ total: total || opened.numPages, shown: shown || opened.numPages });
        setDoc(opened);
        setPhase({ stage: "ready" });
      } catch (err) {
        if (!cancelled) setPhase({ stage: "error", message: err.message });
      }
    })();
    return () => {
      cancelled = true;
      if (opened) opened.destroy().catch(() => {});
    };
  }, [src]);

  // The width "fit" means, from the viewer's own width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setFitWidth(Math.max(320, el.clientWidth - 32));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.round(fitWidth * zoom);
  const pageHeight = Math.round(pageWidth * ratio);

  // 2. Draw pages on demand: a queue, nearest first, one at a time.
  const queue = useRef([]);
  const busyDrawing = useRef(false);
  const drawKey = `${pageWidth}|${watermark || ""}`;
  const drawKeyRef = useRef(drawKey);
  useEffect(() => {
    // A new zoom or width: what was drawn is the wrong size.
    drawKeyRef.current = drawKey;
    drawn.current = new Map();
    queue.current = [];
    setVersion((v) => v + 1);
  }, [drawKey, doc]);

  const pump = async () => {
    if (busyDrawing.current || !doc) return;
    busyDrawing.current = true;
    try {
      while (queue.current.length) {
        const n = queue.current.shift();
        const key = drawKeyRef.current;
        if (drawn.current.has(n)) continue;
        const page = await doc.getPage(n);
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const base = page.getViewport({ scale: 1 });
        const width = pageWidth;
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
        canvas.setAttribute("draggable", "false");
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (watermark) {
          // Diagonal, repeated, faint: readable on a photograph, not in the way.
          ctx.save();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#1f2937";
          ctx.font = `${Math.round(viewport.width / 22)}px sans-serif`;
          ctx.translate(viewport.width / 2, viewport.height / 2);
          ctx.rotate(-Math.PI / 6);
          const step = viewport.height / 3;
          const textWidth = ctx.measureText(watermark).width;
          for (let y = -viewport.height; y <= viewport.height; y += step) ctx.fillText(watermark, -textWidth / 2, y);
          ctx.restore();
        }
        page.cleanup();
        // Zoomed while it was drawing: throw it away, the new size is queued.
        if (key !== drawKeyRef.current) continue;
        drawn.current.set(n, canvas);
        setVersion((v) => v + 1);
      }
    } catch (err) {
      setPhase({ stage: "error", message: err.message });
    } finally {
      busyDrawing.current = false;
    }
  };

  // Watch the page slots; a slot near the view asks for its page.
  const observer = useRef(null);
  useEffect(() => {
    if (!doc) return undefined;
    observer.current = new IntersectionObserver(
      (entries) => {
        const wanted = entries.filter((e) => e.isIntersecting).map((e) => Number(e.target.dataset.page));
        if (!wanted.length) return;
        // Nearest the top of the view first.
        wanted.sort((a, b) => a - b);
        queue.current = [...new Set([...wanted, ...queue.current])].filter((n) => !drawn.current.has(n));
        pump();
      },
      { root: containerRef.current, rootMargin: LOOKAHEAD }
    );
    containerRef.current?.querySelectorAll("[data-page]").forEach((el) => observer.current.observe(el));
    return () => observer.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, drawKey]);

  // A slot: the drawn canvas when there is one, a blank sheet until then.
  const slotRef = (n) => (el) => {
    if (!el) return;
    if (observer.current && !el.dataset.watched) {
      el.dataset.watched = "1";
      observer.current.observe(el);
    }
    const canvas = drawn.current.get(n);
    if (canvas && el.firstChild !== canvas) el.replaceChildren(canvas);
    else if (!canvas && el.firstChild) el.replaceChildren();
  };

  const shownCount = withheld.shown || doc?.numPages || 0;
  const withheldCount = withheld.total && withheld.shown ? Math.max(0, withheld.total - withheld.shown) : 0;
  const busy = phase.stage === "download";
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div {...viewOnly} style={{ height, display: "flex", flexDirection: "column", background: token.colorFillTertiary, borderRadius: 6, overflow: "hidden", border: `1px solid ${token.colorBorderSecondary}` }}>
      {/* Zoom and the page count — and nothing to download or print. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, flexWrap: "wrap" }}>
        <Space size={4}>
          <Tooltip title="Zoom out">
            <Button size="small" icon={<ZoomOutOutlined />} disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])} aria-label="Zoom out" />
          </Tooltip>
          <Text style={{ fontSize: 12, minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</Text>
          <Tooltip title="Zoom in">
            <Button size="small" icon={<ZoomInOutlined />} disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])} aria-label="Zoom in" />
          </Tooltip>
          <Tooltip title="Fit to width">
            <Button size="small" icon={<ColumnWidthOutlined />} disabled={zoom === 1} onClick={() => setZoom(1)} aria-label="Fit to width" />
          </Tooltip>
        </Space>
        <Space size={10}>
          {withheld.total ? (
            <Text style={{ fontSize: 12 }}>
              {withheldCount > 0 ? `${withheld.shown} of ${withheld.total} pages shown` : `${withheld.total} page${withheld.total === 1 ? "" : "s"}`}
            </Text>
          ) : null}
          <Text type="secondary" style={{ fontSize: 12 }}>
            <LockOutlined /> View only
          </Text>
        </Space>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, position: "relative" }}>
        {busy && (
          <div style={{ position: "sticky", top: 0, left: 0, zIndex: 2, background: token.colorBgElevated, borderRadius: 6, padding: "8px 12px", marginBottom: 12, boxShadow: token.boxShadowTertiary }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Downloading the document</Text>
            <Progress percent={phase.percent} size="small" status="active" />
          </div>
        )}
        {phase.stage === "error" && <Alert type="error" showIcon message={phase.message} />}
        {doc && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: PAGE_GAP, minWidth: "fit-content" }}>
            {withheldCount > 0 && (
              <Alert
                type="info"
                showIcon
                icon={<LockOutlined />}
                style={{ width: Math.max(pageWidth, 360), maxWidth: "100%" }}
                message={`Showing ${withheld.shown} of ${withheld.total} pages`}
                description={
                  <Space direction="vertical" size={8}>
                    <span>Your access covers the first {withheld.shown} pages. The rest are shown blurred below; {owner} can open them for you on request.</span>
                    <RequestFull request={request} owner={owner} compact />
                  </Space>
                }
              />
            )}
            {Array.from({ length: shownCount }, (_, i) => (
              <div
                key={`p${i + 1}:${drawKey}`}
                data-page={i + 1}
                ref={slotRef(i + 1)}
                aria-label={`Page ${i + 1}`}
                style={{ width: pageWidth, minHeight: pageHeight, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", lineHeight: 0 }}
              />
            ))}
            {withheldCount > 0 &&
              (blurWithheld ? (
                Array.from({ length: withheldCount }, (_, i) => (
                  <WithheldPage key={`w${i}`} number={withheld.shown + i + 1} total={withheld.total} width={Math.max(pageWidth, 360)} height={Math.round(Math.max(pageWidth, 360) * ratio)} request={request} owner={owner} />
                ))
              ) : (
                <div style={{ width: Math.max(pageWidth, 360), maxWidth: "100%", padding: 16, background: token.colorBgContainer, borderRadius: 6, textAlign: "center" }}>
                  <Space direction="vertical" size={8}>
                    <Text strong>
                      <LockOutlined /> Pages {withheld.shown + 1}–{withheld.total} are not included in your access
                    </Text>
                    <RequestFull request={request} owner={owner} />
                  </Space>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
