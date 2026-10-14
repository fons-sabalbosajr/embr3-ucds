import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Space, Spin, Tag, Tooltip, Typography, Upload } from "antd";
import {
  EyeOutlined,
  FileUnknownOutlined,
  LockOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser } from "../../api/universeService";
import FloatingModal from "./FloatingModal";
import { Link } from "react-router-dom";
import { ROUTES } from "../../config/routes";
import { message } from "../feedback";
import { withSessionToken } from "../sessionToken";
import { attachRecordFile, describeApiError, recordFileBase, unitFileBase } from "../api/recordDocuments";
import PdfViewer from "./PdfViewer";
import { ViewOnlyImage } from "./viewOnly";
import visibleInterval from "../visibleInterval";
import { explainFileProblem } from "../nasWords";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// The scanned document filed against a record.
//
// Everything here addresses the file by the record's serial. The stored path
// is never sent from the browser and never accepted from it: the server looks
// it up, resolves it inside the configured share and streams the bytes back.
// A clerk who cannot read the record cannot read its document either, because
// both go through the same province scope.
//
// View only. There is no download button and no download route: the office's
// rule is that scans are read here by the unit that keeps them. Anyone else
// asks in the E-Universe Document Portal, and reads the document there.
// ---------------------------------------------------------------------------

// A record's document, or — with `unit` — a Legal/Laboratory document's.
// `domain` is "ucds" when the panel sits on a planning screen: the same
// document, the same rule, reached through the route the UCDS domain holds.
const fileBase = (serialNo, unit, domain) =>
  unit ? unitFileBase(unit, serialNo) : recordFileBase(serialNo, { domain });
// The browser's PDF viewer honours these fragment parameters: no toolbar
// means no save or print button. It is a courtesy to the rule, not a lock.
// The iframe is loaded by the browser, so this tab's sign-in travels in the
// URL rather than a header (see shared/sessionToken).
const previewUrl = (serialNo, unit, domain, hideToolbar = true) =>
  withSessionToken(`${fileBase(serialNo, unit, domain)}/preview${hideToolbar ? "#toolbar=0&navpanes=0" : ""}`);

const humanSize = (bytes) => {
  if (!Number.isFinite(bytes)) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
};

// Each failure means something different to the person reading it; the
// sentences, in plain words, are in shared/nasWords.

/** What a person outside the Records Unit sees: where to ask — the Document Portal. */
const ApprovalPanel = ({ serialNo, fileName }) => (
  <Alert
    type="warning"
    showIcon
    icon={<LockOutlined />}
    style={{ marginTop: 12 }}
    message={fileName || "Document"}
    description={
      <Space direction="vertical" style={{ width: "100%" }}>
        <span>Only the Records Unit opens this document here. Request it in the E-Universe Document Portal, where you can read it once approved.</span>
        <Link to={`${ROUTES.documentPortal}?serial=${encodeURIComponent(serialNo)}`}>
          <Button type="primary" icon={<SendOutlined />}>
            Request in the Document Portal
          </Button>
        </Link>
      </Space>
    }
  />
);

/** File a scan against a record that has none, or whose scan is not on the share. */
const FileScan = ({ serialNo, missing, onFiled }) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const send = async (file) => {
    setBusy(true);
    try {
      await attachRecordFile({ serialNo, file, replace: missing ? "missing" : undefined });
      message.success(`Scan filed against ${serialNo}.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "record", serialNo] });
      onFiled();
    } catch (e) {
      message.error(describeApiError(e, "The scan could not be filed."));
    } finally {
      setBusy(false);
    }
    return false;
  };
  return (
    <Upload maxCount={1} showUploadList={false} accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx" beforeUpload={send}>
      <Button icon={<UploadOutlined />} loading={busy} style={{ marginTop: 8 }}>
        {missing ? "File the scan again" : "File a scan"}
      </Button>
    </Upload>
  );
};

/**
 * @param refNo  the document's reference number (a record's ECC Ref No), shown at the right of the viewer's title bar
 */
const DocumentPanel = ({ serialNo, fileName, unit, canFile, domain = "erms", refNo }) => {
  const [state, setState] = useState({ status: "loading" });
  const [preview, setPreview] = useState(false);
  // The Developer may select and copy a scan's text; everyone else views only.
  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchCurrentUser, staleTime: 5 * 60 * 1000, retry: false });
  const canCopy = me?.role === "developer";

  // `quiet`: a re-check in the background keeps what is on screen until the
  // answer is in. It used to reset to "loading" first, which unmounted the
  // viewer — the document closed under the reader every 45 seconds.
  const load = useCallback((quiet = false) => {
    let cancelled = false;
    if (!quiet) setState({ status: "loading" });
    fetch(fileBase(serialNo, unit, domain), { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setState({ status: "ready", info: data });
        else if (data.code === "APPROVAL_REQUIRED") setState({ status: "approval" });
        else setState({ status: "unavailable", code: data.code, message: data.message });
      })
      .catch(() => {
        if (!cancelled) setState((s) => (quiet && s.status === "ready" ? s : { status: "unavailable", code: navigator.onLine === false ? "NETWORK" : "NAS_UNREACHABLE" }));
      });
    return () => {
      cancelled = true;
    };
    // `fileName`: a scan filed or replaced from the page is checked at once,
    // not at the next 45-second look.
  }, [serialNo, unit, domain, fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  // The share can come back, or a scan be filed elsewhere; look again now
  // and then. Not while the document is open: nothing changes under a reader.
  useEffect(() => {
    if (preview) return undefined;
    return visibleInterval(() => load(true), 45000);
  }, [load, preview]);

  if (state.status === "loading") {
    return (
      <Space style={{ marginTop: 12 }}>
        <Spin size="small" />
        <Text type="secondary">Looking for the scanned document…</Text>
      </Space>
    );
  }

  if (state.status === "approval") {
    return <ApprovalPanel serialNo={serialNo} fileName={fileName} />;
  }

  if (state.status === "unavailable") {
    const { type, message: description } = explainFileProblem(state.code, state.message);
    const fileable = canFile && !unit && (state.code === "NO_DOCUMENT" || state.code === "FILE_MISSING");
    return (
      <Alert
        type={type}
        showIcon
        icon={<FileUnknownOutlined />}
        style={{ marginTop: 12 }}
        message={fileName || "Document unavailable"}
        description={
          <>
            {description}
            {fileable && <div><FileScan serialNo={serialNo} missing={state.code === "FILE_MISSING"} onFiled={() => load()} /></div>}
          </>
        }
      />
    );
  }

  const { info } = state;
  // The rest of a page-limited document is the administrators' to open.
  const owner = "the system administrator";

  return (
    <>
      <Space style={{ marginTop: 12 }} wrap>
        {info.previewable ? (
          <Button type="primary" icon={<EyeOutlined />} onClick={() => setPreview(true)}>
            View document
          </Button>
        ) : (
          <Tag icon={<FileUnknownOutlined />}>Cannot be shown in the browser</Tag>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {humanSize(info.size)} · view only
        </Text>
      </Space>
      {!info.previewable && (
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          This file type is not viewable here, and documents are not downloadable. Ask the Records
          Unit to see it on their screen.
        </Paragraph>
      )}

      {/* A window, not a dialog: moved aside, minimised or resized, so the
          scan can be read next to the record's details. No mask — the
          details behind it stay usable. */}
      <FloatingModal
        open={preview}
        onCancel={() => setPreview(false)}
        floating
        width={1100}
        height="86vh"
        bodyStyle={{ display: "flex", flexDirection: "column" }}
        title={
          <Space size={6}>
            <Text strong ellipsis style={{ maxWidth: 520 }}>{info.fileName}</Text>
            <Tag>{canCopy ? "copy allowed" : "view only"}</Tag>
          </Space>
        }
        extra={
          refNo ? (
            <Tooltip title="ECC Ref No">
              <Tag color="blue" style={{ marginInlineEnd: 0, fontFamily: "monospace" }}>{refNo}</Tag>
            </Tooltip>
          ) : null
        }
      >
        {/* Every scan through a view-only viewer: no download, no print,
            no right-click save. A PDF is drawn by the application's own
            viewer (the browser's carries download and print buttons); an
            image is shown without its context menu. Anything else the
            browser can show goes in a frame without its toolbar. */}
        {info.contentType === "application/pdf" ? (
          <PdfViewer
            src={`${fileBase(serialNo, unit, domain)}/preview`}
            height="100%"
            watermark={info.viewing?.watermark || null}
            blurWithheld={info.viewing?.blurWithheldPages !== false}
            owner={owner}
            // No page limit for this viewer, and a large scan: read by
            // ranges, the first page up as soon as its bytes are in. A small
            // one is quicker in one request.
            ranged={!(info.viewing?.pageLimit > 0) && info.size > 3 * 1024 * 1024}
            selectable={canCopy}
          />
        ) : String(info.contentType || "").startsWith("image/") ? (
          <ViewOnlyImage src={previewUrl(serialNo, unit, domain, false)} alt={info.fileName} />
        ) : (
          <iframe
            title={info.fileName}
            src={previewUrl(serialNo, unit, domain, true)}
            style={{ width: "100%", height: "100%", minHeight: 400, border: "none" }}
          />
        )}
      </FloatingModal>
    </>
  );
};

export default DocumentPanel;
