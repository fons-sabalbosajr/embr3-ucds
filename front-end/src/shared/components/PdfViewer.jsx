import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dropdown, Progress, Space, Tooltip, Typography, theme as antdTheme } from "antd";
import { CameraOutlined, CheckCircleOutlined, ClockCircleOutlined, ColumnWidthOutlined, CopyOutlined, DownloadOutlined, LockOutlined, SendOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useViewOnly } from "./viewOnly";
import { message } from "../feedback";
import { HEADER, getSessionToken } from "../sessionToken";
import "./pdftext.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Read a piece at a time: 1 MB per request, only what the pages in view need.
// (256 KB meant a couple of hundred requests for a large scan.)
const RANGE_CHUNK = 1024 * 1024;
// No new piece for this long: the reading has stalled; fetch the whole file.
const STALL_MS = 12000;

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
// limit is in the browser at all. After the last page shown comes one
// blurred placeholder page (or, when the unit turned blurring off, a note)
// saying how many more there are, with a way to ask the people who can grant
// it for the whole document — `request`. A 5-page limit shows 6 pages.
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
// A screenshot is drawn afresh at this scale (PDF points to pixels, about
// 180 dpi), whatever the zoom: sharp enough to read a scan's small print.
const SHOT_SCALE = 2.5;
const canCopyImages = () => typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.clipboard?.write) && typeof ClipboardItem !== "undefined";

/** Draw one page at `scale` (PDF points to canvas pixels), the watermark over it. */
async function paintPage(page, scale, watermark) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
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
  return canvas;
}

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
const WithheldPage = ({ number, total, width, height, request, owner, more = 0 }) => (
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
      {more > 0 && (
        <Text style={{ color: "#374151", fontSize: 12 }}>
          {more} more page{more === 1 ? "" : "s"} after this one {more === 1 ? "is" : "are"} not shown.
        </Text>
      )}
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
 * @param ranged        read the PDF by byte ranges (no page limit applies): the first page shows
 *                      once its own bytes are in, instead of after the whole scan has downloaded —
 *                      a large scan took about ten seconds to open the other way
 * @param selectable    the pages' text can be selected and copied (the Developer's): a text layer
 *                      over each page, and the right-click menu left alone
 * @param screenshot    a screenshot tool for the page in view — saved as a PNG or copied to the
 *                      clipboard (the Developer's only; everyone else views only)
 * @param name          the document's file name, which a screenshot's file name starts from
 */
const PdfViewer = ({ src, watermark, height = "78vh", blurWithheld = true, request = null, owner = "the unit that keeps it", ranged = false, selectable = false, screenshot = false, name = "document" }) => {
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
    let task = null;
    setDoc(null);
    drawn.current = new Map();
    setPhase({ stage: "download", percent: 0 });
    let watchdog = null;

    // By ranges: pdf.js asks the server for the pieces it needs (the server
    // honours Range on this route). Resolves to the open document, or null
    // when the reading stalls — a piece refused or never answered used to
    // leave the bar at 99% for good — so the whole file is fetched instead.
    const openRanged = () =>
      new Promise((resolve) => {
        const token = getSessionToken();
        task = pdfjsLib.getDocument({
          url: new URL(src, window.location.href).href,
          withCredentials: true,
          httpHeaders: token ? { [HEADER]: token } : undefined,
          rangeChunkSize: RANGE_CHUNK,
          disableAutoFetch: true,
          disableStream: true,
        });
        let last = Date.now();
        task.onProgress = ({ loaded, total }) => {
          last = Date.now();
          if (!cancelled && total) setPhase({ stage: "download", percent: Math.min(99, Math.round((loaded / total) * 100)) });
        };
        watchdog = setInterval(() => {
          if (Date.now() - last < STALL_MS) return;
          clearInterval(watchdog);
          const stalled = task;
          task = null;
          stalled.destroy().catch(() => {});
          resolve(null);
        }, 2000);
        task.promise
          .then(async (pdf) => {
            await pdf.getPage(1); // the first page's bytes, before "ready"
            clearInterval(watchdog);
            resolve(pdf);
          })
          .catch(() => {
            clearInterval(watchdog);
            // Any failure (a piece refused, cut off, the file gone): the
            // whole-file fetch below, which says in words what went wrong.
            resolve(null);
          });
      });

    (async () => {
      try {
        if (ranged) {
          opened = await openRanged();
          if (cancelled) return;
          if (opened) {
            const first = await opened.getPage(1);
            if (cancelled) return;
            const vp = first.getViewport({ scale: 1 });
            setRatio(vp.height / vp.width);
            setWithheld({ total: opened.numPages, shown: opened.numPages });
            setDoc(opened);
            setPhase({ stage: "ready" });
            return;
          }
          setPhase({ stage: "download", percent: 0 });
        }
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
        // Downloaded: the rest is reading it, said as such rather than a bar at 100%.
        setPhase({ stage: "download", percent: 100, opening: true });
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
      clearInterval(watchdog);
      if (opened) opened.destroy().catch(() => {});
      else if (task) task.destroy().catch(() => {});
    };
  }, [src, ranged]);

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
        const canvas = await paintPage(page, (width / base.width) * dpr, watermark);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${Math.round((base.height * width) / base.width)}px`;
        canvas.setAttribute("draggable", "false");
        // Selectable: the page's text, invisible, laid exactly over the
        // drawn page, so it can be selected and copied. A scan with no text
        // in it simply has nothing to select.
        let sheet = canvas;
        if (selectable) {
          sheet = document.createElement("div");
          sheet.style.position = "relative";
          sheet.style.width = canvas.style.width;
          sheet.style.height = canvas.style.height;
          sheet.appendChild(canvas);
          const layer = document.createElement("div");
          layer.className = "textLayer";
          const cssViewport = page.getViewport({ scale: width / base.width });
          layer.style.setProperty("--scale-factor", String(cssViewport.scale));
          sheet.appendChild(layer);
          try {
            await new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport: cssViewport }).render();
          } catch {
            /* no text to offer */
          }
        }
        page.cleanup();
        // Zoomed while it was drawing: throw it away, the new size is queued.
        if (key !== drawKeyRef.current) continue;
        drawn.current.set(n, sheet);
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

  // 3. The Developer's screenshot: the page most in view, drawn afresh at a
  // fixed resolution (not the zoom's), saved as a PNG or put on the clipboard.
  const [shooting, setShooting] = useState(false);
  const pageInView = () => {
    const box = containerRef.current?.getBoundingClientRect();
    let best = 1;
    let most = -Infinity;
    containerRef.current?.querySelectorAll("[data-page]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const seen = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
      if (seen > most) {
        most = seen;
        best = Number(el.dataset.page);
      }
    });
    return best;
  };
  const takeScreenshot = async (how) => {
    if (!doc || shooting) return;
    const n = pageInView();
    setShooting(true);
    try {
      const page = await doc.getPage(n);
      const canvas = await paintPage(page, SHOT_SCALE, watermark);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The page could not be turned into an image."))), "image/png")
      );
      if (how === "copy") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        message.success(`Page ${n} copied to the clipboard.`);
      } else {
        const base = String(name || "document").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${base} - page ${n}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        message.success(`Page ${n} saved as a PNG.`);
      }
    } catch (err) {
      message.error(err?.message || "The screenshot could not be taken.");
    } finally {
      setShooting(false);
    }
  };

  const shownCount = withheld.shown || doc?.numPages || 0;
  const withheldCount = withheld.total && withheld.shown ? Math.max(0, withheld.total - withheld.shown) : 0;
  const busy = phase.stage === "download";
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div {...(selectable ? {} : viewOnly)} style={{ height, display: "flex", flexDirection: "column", background: token.colorFillTertiary, borderRadius: 6, overflow: "hidden", border: `1px solid ${token.colorBorderSecondary}` }}>
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
          {screenshot && (
            <Dropdown
              trigger={["click"]}
              disabled={!doc || shooting}
              menu={{
                items: [
                  { key: "save", icon: <DownloadOutlined />, label: "Save page in view as PNG" },
                  { key: "copy", icon: <CopyOutlined />, label: "Copy page in view to clipboard", disabled: !canCopyImages() },
                ],
                onClick: ({ key }) => takeScreenshot(key),
              }}
            >
              <Button size="small" icon={<CameraOutlined />} loading={shooting} disabled={!doc} title="Developer only" style={{ marginInlineStart: 8 }}>
                Screenshot
              </Button>
            </Dropdown>
          )}
        </Space>
        <Space size={10}>
          {withheld.total ? (
            <Text style={{ fontSize: 12 }}>
              {withheldCount > 0 ? `${withheld.shown} of ${withheld.total} pages shown` : `${withheld.total} page${withheld.total === 1 ? "" : "s"}`}
            </Text>
          ) : null}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectable ? <>Text can be copied</> : <><LockOutlined /> View only</>}
          </Text>
        </Space>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, position: "relative" }}>
        {busy && (
          <div style={{ position: "sticky", top: 0, left: 0, zIndex: 2, background: token.colorBgElevated, borderRadius: 6, padding: "8px 12px", marginBottom: 12, boxShadow: token.boxShadowTertiary }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{phase.opening ? "Opening the document…" : "Downloading the document"}</Text>
            <Progress percent={phase.percent} size="small" status="active" showInfo={!phase.opening} />
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
                // One blurred page after the limit — page 6 of a 5-page limit —
                // and nothing after it: enough to show the document goes on,
                // without a scroll of placeholders for the rest.
                <WithheldPage
                  number={withheld.shown + 1}
                  total={withheld.total}
                  more={withheldCount - 1}
                  width={Math.max(pageWidth, 360)}
                  height={Math.round(Math.max(pageWidth, 360) * ratio)}
                  request={request}
                  owner={owner}
                />
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
