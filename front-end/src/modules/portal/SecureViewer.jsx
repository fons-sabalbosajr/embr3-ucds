import { useEffect, useRef, useState } from "react";
import { Button, Modal, Space, Tag, Typography, theme as antdTheme } from "antd";
import { ClockCircleOutlined, CloseOutlined, DownloadOutlined, EyeInvisibleOutlined, LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import PdfViewer from "../../shared/components/PdfViewer";
import { message } from "../../shared/feedback";
import { documentUrl } from "./portalService";
import { countdown } from "./time";
import { eccRefOf, refLabelOf } from "./docLabel";
import { unitName } from "./docTypes";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The document, inside the room, for the person it was approved for.
//
// What reaches the browser is already cut to the approved pages and carries
// the reader's name in every page (server/modules/portal/services/
// portalDocument.js). Around it, this screen does what a web page can:
//
//   - nothing to download or print, no right-click, no dragging, and printing
//     the page prints a blank sheet (shared/components/viewOnly);
//   - no selecting or copying;
//   - the pages are covered whenever this window is not the one in front —
//     another window, the Snipping Tool, a screen-share picker — and briefly
//     after Print Screen, with the clipboard cleared where the browser allows;
//   - it closes itself the second the approval ends.
//
// None of this can stop a phone held up to the screen, or every screenshot
// tool; that is what the name on every page is for.
// ---------------------------------------------------------------------------

const SHIELD_AFTER_PRINTSCREEN_MS = 2500;

export default function SecureViewer({ request, now, onClose, canDownload = false }) {
  const { token } = antdTheme.useToken();
  const [shielded, setShielded] = useState(!document.hasFocus());
  const printTimer = useRef(null);
  const expiresAt = request?.expiresAt ? new Date(request.expiresAt) : null;
  const left = expiresAt ? expiresAt.getTime() - now.getTime() : 0;

  // The approval ends: the document goes with it.
  useEffect(() => {
    if (request && left <= 0) {
      message.info("The time approved for this document is over. It has been closed.");
      onClose();
    }
  }, [request, left, onClose]);

  useEffect(() => {
    const hide = () => setShielded(true);
    const show = () => {
      if (!printTimer.current) setShielded(false);
    };
    const visibility = () => (document.visibilityState === "hidden" ? hide() : show());
    const keys = (e) => {
      if (e.key === "PrintScreen") {
        setShielded(true);
        navigator.clipboard?.writeText?.("").catch(() => {});
        message.warning("Screenshots of Document Portal documents are not allowed. Every page carries your name and this computer's address.");
        clearTimeout(printTimer.current);
        printTimer.current = setTimeout(() => {
          printTimer.current = null;
          if (document.hasFocus()) setShielded(false);
        }, SHIELD_AFTER_PRINTSCREEN_MS);
      }
    };
    const block = (e) => e.preventDefault();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keyup", keys, true);
    window.addEventListener("keydown", keys, true);
    document.addEventListener("copy", block, true);
    document.addEventListener("cut", block, true);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keyup", keys, true);
      window.removeEventListener("keydown", keys, true);
      document.removeEventListener("copy", block, true);
      document.removeEventListener("cut", block, true);
      clearTimeout(printTimer.current);
    };
  }, []);

  if (!request) return null;
  const pages = request.pages?.all === false ? `Pages ${request.pages.spec}` : "All pages";
  const urgent = left < 5 * 60000;

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      destroyOnClose
      width="min(1240px, 96vw)"
      style={{ top: 16 }}
      styles={{ body: { padding: 0 } }}
      className="portal-viewer-modal"
    >
      <div className="portal-viewer-head" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
          <Text strong ellipsis style={{ fontSize: 15 }}>
            <SafetyCertificateOutlined style={{ color: token.colorPrimary }} /> {refLabelOf(request)} {eccRefOf(request) || "—"}
          </Text>
          <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
            {request.projectTitle}
          </Text>
        </Space>
        <Space wrap size={8}>
          <Tag icon={<LockOutlined />}>View only</Tag>
          <Tag>{pages}</Tag>
          <Tag color={urgent ? "red" : "blue"} icon={<ClockCircleOutlined />} className="portal-clock">
            {countdown(left)} left
          </Tag>
          {/* The Developer's viewer tools (server portalSettings / the request's own switch). */}
          {canDownload && (
            <Button icon={<DownloadOutlined />} href={`${documentUrl()}?download=1`} target="_blank" rel="noopener">
              Download
            </Button>
          )}
          <Button icon={<CloseOutlined />} onClick={onClose}>
            Close
          </Button>
        </Space>
      </div>
      <div className="portal-viewer-body">
        <PdfViewer src={documentUrl()} height="calc(100vh - 150px)" request={null} owner={unitName(request)} />
        {shielded && (
          <div className="portal-shield" role="status" onClick={() => document.hasFocus() && !printTimer.current && setShielded(false)}>
            <EyeInvisibleOutlined style={{ fontSize: 36 }} />
            <Text strong style={{ color: "#fff", fontSize: 16 }}>
              The document is hidden while this window is not in front
            </Text>
            <Text style={{ color: "rgba(255,255,255,.8)" }}>Click here to continue reading.</Text>
          </div>
        )}
      </div>
    </Modal>
  );
}
