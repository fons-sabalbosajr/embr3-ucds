import { useEffect, useRef, useState } from "react";
import { Alert, Progress, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The application's own PDF viewer, used when the unit's rules ask for more
// than the browser's viewer can do: a watermark with the viewer's name, and
// a page limit for people viewing by approval.
//
// The limit is enforced on the server — the PDF arrives already cut to its
// first N pages, with the full count in a header — so what this draws for
// the withheld pages is a blurred placeholder, not a blurred page: nothing
// beyond the limit is in the browser at all.
//
// Two stages, each shown as a percentage: the download (bytes received
// against the content length) and the rendering (pages drawn against the
// page count). Pages appear as each one is drawn rather than all at once,
// so a large scan can be read from page 1 while the rest come in.
// ---------------------------------------------------------------------------

const PAGE_GAP = 12;

/** A page-shaped placeholder for a page the server withheld. */
const WithheldPage = ({ number, total, width, height }) => (
  <div
    style={{ width, height, position: "relative", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", overflow: "hidden" }}
    aria-label={`Page ${number} of ${total}, withheld`}
  >
    {/* Text-like lines, blurred: what a page looks like from across the room. */}
    <div style={{ position: "absolute", inset: 0, padding: "9% 10%", filter: "blur(6px)", opacity: 0.55 }}>
      {Array.from({ length: 28 }, (_, i) => (
        <div key={i} style={{ height: 8, marginBottom: 10, width: `${i % 7 === 6 ? 40 : 70 + ((i * 37) % 30)}%`, background: "#6b7280", borderRadius: 3 }} />
      ))}
    </div>
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, background: "rgba(255,255,255,.35)" }}>
      <LockOutlined style={{ fontSize: 28, color: "#6b7280" }} />
      <Text strong>Page {number} of {total} — withheld</Text>
      <Text type="secondary" style={{ fontSize: 12, textAlign: "center", maxWidth: "70%" }}>
        Only the first pages are shown with this approval. Ask the Records Unit for full access if you need the rest.
      </Text>
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

const PdfViewer = ({ src, watermark, height = "78vh" }) => {
  const containerRef = useRef(null);
  const [phase, setPhase] = useState({ stage: "download", percent: 0 }); // download | render | ready | error
  const [pages, setPages] = useState([]); // { canvas, width, height } in order
  const [withheld, setWithheld] = useState({ total: null, shown: null });

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    setPhase({ stage: "download", percent: 0 });
    setPages([]);

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

        doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setWithheld({ total: total || doc.numPages, shown: shown || doc.numPages });
        setPhase({ stage: "render", percent: 0, page: 0, of: doc.numPages });

        const width = Math.max(320, (containerRef.current?.clientWidth || 800) - 32);
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          if (watermark) {
            // Diagonal, repeated, faint: readable on a screenshot, not in the way.
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
          // Show this page now; the next ones follow.
          setPages((prev) => [...prev, { canvas, width, height: viewport.height / dpr }]);
          setPhase({ stage: n === doc.numPages ? "ready" : "render", percent: Math.round((n / doc.numPages) * 100), page: n, of: doc.numPages });
        }
      } catch (err) {
        if (!cancelled) setPhase({ stage: "error", message: err.message });
      }
    })();

    return () => {
      cancelled = true;
      if (doc) doc.destroy().catch(() => {});
    };
  }, [src, watermark]);

  // Canvases are DOM nodes made outside React; they are placed by ref.
  const mount = (el, canvas) => {
    if (el && canvas && el.firstChild !== canvas) el.replaceChildren(canvas);
  };

  const pageWidth = pages[0]?.width || 800;
  const pageHeight = pages[0]?.height || Math.round(pageWidth * 1.4142);
  const withheldCount = withheld.total && withheld.shown ? Math.max(0, withheld.total - withheld.shown) : 0;
  const busy = phase.stage === "download" || phase.stage === "render";

  return (
    <div ref={containerRef} style={{ height, overflow: "auto", background: "#e5e7eb", padding: 16, position: "relative" }}>
      {busy && (
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(255,255,255,.95)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {phase.stage === "download" ? "Downloading the document" : `Rendering page ${phase.page} of ${phase.of}`}
          </Text>
          <Progress percent={phase.percent} size="small" status="active" />
        </div>
      )}
      {phase.stage === "error" && <Alert type="error" showIcon message={phase.message} />}
      {(pages.length > 0 || phase.stage === "ready") && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: PAGE_GAP }}>
          {withheldCount > 0 && (
            <Alert
              type="info"
              showIcon
              icon={<LockOutlined />}
              style={{ width: pageWidth }}
              message={`Showing ${withheld.shown} of ${withheld.total} pages`}
              description="The remaining pages are withheld under this approval."
            />
          )}
          {pages.map((p, i) => (
            <div key={i} ref={(el) => mount(el, p.canvas)} style={{ boxShadow: "0 1px 4px rgba(0,0,0,.25)", lineHeight: 0 }} />
          ))}
          {phase.stage === "ready" &&
            Array.from({ length: withheldCount }, (_, i) => (
              <WithheldPage key={`w${i}`} number={withheld.shown + i + 1} total={withheld.total} width={pageWidth} height={pageHeight} />
            ))}
        </div>
      )}
    </div>
  );
};

export default PdfViewer;
