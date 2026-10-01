import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Space, Spin, Tag, Typography, Upload } from "antd";
import {
  ClockCircleOutlined,
  EyeOutlined,
  FileUnknownOutlined,
  LockOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { message } from "../feedback";
import { withSessionToken } from "../sessionToken";
import { attachRecordFile, describeApiError, recordFileBase, requestDocumentAccess, unitFileBase } from "../api/recordDocuments";
import PdfViewer from "./PdfViewer";

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
// rule is that scans are read here, by the Records Unit, or by someone the
// Records Unit has approved for this record for a period. Anyone else is
// shown how to ask, and the state of their request.
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

/** Each failure means something different to the person reading it. */
const EXPLANATIONS = {
  NO_DOCUMENT: ["info", "No document is filed against this record."],
  FILE_MISSING: [
    "warning",
    "The record names a document, but it is not on the records share. It may have been moved or renamed since the record was created.",
  ],
  BAD_STORED_PATH: [
    "warning",
    "The stored file path for this record cannot be resolved. It needs correcting on the record.",
  ],
  NAS_NOT_CONFIGURED: [
    "info",
    "The records share is not configured on this server yet, so documents cannot be opened.",
  ],
  NAS_DISABLED: ["info", "Document access is currently turned off."],
  NAS_INACTIVE: ["info", "NAS files are not available right now."],
  NAS_UNREACHABLE: [
    "error",
    "The records share could not be reached. It may be offline, or this server may have lost its connection to it.",
  ],
  NAS_DENIED: [
    "error",
    "The server is not permitted to read this document. The share account may need access to this folder.",
  ],
  CONTAINER_FORBIDDEN: [
    "warning",
    "Document access has not been shared with your account. Ask the system developer.",
  ],
};

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** What a person outside the Records Unit sees: how to ask, or where their request stands. */
const ApprovalPanel = ({ serialNo, fileName, reason, request, domain, onChanged }) => {
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await requestDocumentAccess({ serialNo, reason: why, domain });
      setAsking(false);
      setWhy("");
      onChanged();
    } catch (e) {
      setError(e?.response?.data?.message || "The request could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (reason === "pending") {
    return (
      <Alert
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
        style={{ marginTop: 12 }}
        message={fileName || "Document"}
        description={
          <>
            Your request to view this document is with the Records Unit
            {request?.requestedAt ? ` (sent ${when(request.requestedAt)})` : ""}. This page updates when they decide.
          </>
        }
      />
    );
  }

  const declined = reason === "denied" || reason === "revoked";
  return (
    <Alert
      type="warning"
      showIcon
      icon={<LockOutlined />}
      style={{ marginTop: 12 }}
      message={fileName || "Document"}
      description={
        <Space direction="vertical" style={{ width: "100%" }}>
          <span>
            Viewing this document needs the approval of the Records Unit.
            {declined && request?.decidedAt && (
              <>
                {" "}Your last request was <b>{reason}</b> on {when(request.decidedAt)}
                {request.decisionNote ? ` — “${request.decisionNote}”` : ""}.
              </>
            )}
          </span>
          {asking ? (
            <>
              <Input.TextArea
                rows={2}
                maxLength={500}
                showCount
                placeholder="Why you need to see it (optional, but it helps the Records Unit decide)"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
              />
              {error && <Text type="danger">{error}</Text>}
              <Space>
                <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={send}>
                  Send request
                </Button>
                <Button onClick={() => setAsking(false)} disabled={sending}>
                  Cancel
                </Button>
              </Space>
            </>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={() => setAsking(true)}>
              {declined ? "Request again" : "Request access"}
            </Button>
          )}
        </Space>
      }
    />
  );
};

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

const DocumentPanel = ({ serialNo, fileName, unit, canFile, domain = "erms" }) => {
  const [state, setState] = useState({ status: "loading" });
  const [preview, setPreview] = useState(false);

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
        else if (data.code === "APPROVAL_REQUIRED")
          setState({ status: "approval", reason: data.reason, request: data.request });
        else setState({ status: "unavailable", code: data.code, message: data.message });
      })
      .catch(() => {
        if (!cancelled) setState((s) => (quiet && s.status === "ready" ? s : { status: "unavailable", code: "NAS_UNREACHABLE" }));
      });
    return () => {
      cancelled = true;
    };
  }, [serialNo, unit, domain]);

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  // A pending request is decided elsewhere; look again now and then so the
  // person does not have to reload the page to find out. Not while the
  // document is open: nothing about it changes under a reader.
  useEffect(() => {
    if (preview) return undefined;
    const poll = setInterval(() => load(true), 45000);
    return () => clearInterval(poll);
  }, [load, preview]);

  if (state.status === "loading") {
    return (
      <Space style={{ marginTop: 12 }}>
        <Spin size="small" />
        <Text type="secondary">Checking the records share…</Text>
      </Space>
    );
  }

  if (state.status === "approval") {
    return (
      <ApprovalPanel
        serialNo={serialNo}
        fileName={fileName}
        reason={state.reason}
        request={state.request}
        domain={domain}
        onChanged={() => load()}
      />
    );
  }

  if (state.status === "unavailable") {
    const [type, description] = EXPLANATIONS[state.code] || [
      "warning",
      state.message || "The document could not be opened.",
    ];
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
  const approvedUntil = info.access?.reason === "approved" ? info.access.expiresAt : null;

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
        {approvedUntil && (
          <Tag icon={<ClockCircleOutlined />} color="green">
            approved until {when(approvedUntil)}
          </Tag>
        )}
      </Space>
      {!info.previewable && (
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          This file type is not viewable here, and documents are not downloadable. Ask the Records
          Unit to see it on their screen.
        </Paragraph>
      )}

      <Modal
        open={preview}
        onCancel={() => setPreview(false)}
        title={
          <Space>
            {info.fileName}
            <Tag>view only</Tag>
          </Space>
        }
        width="90vw"
        style={{ top: 24 }}
        footer={[
          <Button key="close" type="primary" onClick={() => setPreview(false)}>
            Close
          </Button>,
        ]}
        destroyOnHidden
      >
        {/* A PDF under the unit's viewing rules — a page limit for this
            viewer, or a watermark — goes through the application's own
            viewer. Anything else is rendered by the browser's: the endpoint
            honours range requests, so a large scan pages in rather than
            loading whole. */}
        {info.contentType === "application/pdf" && (info.viewing?.pageLimit > 0 || info.viewing?.watermark) ? (
          <PdfViewer src={`${fileBase(serialNo, unit, domain)}/preview`} watermark={info.viewing?.watermark || null} />
        ) : (
          <iframe
            title={info.fileName}
            src={previewUrl(serialNo, unit, domain, info.viewing?.hideToolbar !== false)}
            style={{ width: "100%", height: "78vh", border: "none" }}
          />
        )}
        {info.viewing?.pageLimit > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            <LockOutlined /> Shown up to {info.viewing.pageLimit} pages under this approval.
          </Text>
        )}
      </Modal>
    </>
  );
};

export default DocumentPanel;
