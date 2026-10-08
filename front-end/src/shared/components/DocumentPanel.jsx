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
import { attachRecordFile, describeApiError, recordFileBase, requestDocumentAccess, requestRecordFullAccess, requestUnitFullAccess, unitFileBase } from "../api/recordDocuments";
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

// Each failure means something different to the person reading it; the
// sentences, in plain words, are in shared/nasWords.

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
  const [requestingFull, setRequestingFull] = useState(false);
  const [fullSentAt, setFullSentAt] = useState(null);

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

  // A pending request is decided elsewhere; look again now and then so the
  // person does not have to reload the page to find out. Not while the
  // document is open: nothing about it changes under a reader.
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
  const approvedUntil = info.access?.reason === "approved" ? info.access.expiresAt : null;

  // Who can open the rest of a page-limited document, and how to ask them.
  //   - someone viewing a record by approval: the Records Unit, through its
  //     approval inbox (the same request, marked "every page");
  //   - the unit's own staff — the Records Unit on a record, Legal or
  //     Laboratory on theirs: the administrators, by an ERMS message.
  const byApproval = !unit && info.access?.reason !== "records-unit";
  const owner = byApproval ? "the Records Unit" : "the administrators";
  const limited = info.contentType === "application/pdf" && info.viewing?.pageLimit > 0;
  const askedAt = fullSentAt || info.access?.fullAccessRequestedAt || null;
  const pending = byApproval ? info.access?.fullAccessRequested === true || Boolean(fullSentAt) : Boolean(askedAt);
  const requestFullAccess = async () => {
    setRequestingFull(true);
    try {
      if (byApproval) {
        await requestDocumentAccess({ serialNo, domain, full: true, reason: "The whole document, asked from the viewer." });
        setFullSentAt(new Date().toISOString());
        message.success("Your request for the whole document was sent to the Records Unit.");
        load(true);
      } else {
        const res = unit
          ? await requestUnitFullAccess({ unit, serialNo, reason: "Asked from the document viewer." })
          : await requestRecordFullAccess({ serialNo, reason: "Asked from the document viewer." });
        setFullSentAt(res.at || new Date().toISOString());
        message.success(res.already ? "You already asked the administrators today." : "Your request for the whole document was sent to the administrators.");
      }
    } catch (e) {
      message.error(describeApiError(e, "The request could not be sent. Please try again."));
    } finally {
      setRequestingFull(false);
    }
  };
  const fullRequest = !limited || info.access?.fullAccess === true
    ? null
    : pending
      ? {
          state: "pending",
          note: byApproval
            ? "Your request for the whole document is with the Records Unit. This updates when they decide."
            : `You asked the administrators for the whole document${askedAt ? ` on ${when(askedAt)}` : ""}. They have it in their ERMS messages.`,
        }
      : { state: requestingFull ? "sending" : "idle", send: requestFullAccess, label: byApproval ? "Request full access from the Records Unit" : "Request full access from the administrator" };

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
        {/* Every scan through a view-only viewer: no download, no print,
            no right-click save. A PDF is drawn by the application's own
            viewer (the browser's carries download and print buttons); an
            image is shown without its context menu. Anything else the
            browser can show goes in a frame without its toolbar. */}
        {info.contentType === "application/pdf" ? (
          <PdfViewer
            src={`${fileBase(serialNo, unit, domain)}/preview`}
            watermark={info.viewing?.watermark || null}
            blurWithheld={info.viewing?.blurWithheldPages !== false}
            request={fullRequest}
            owner={owner}
          />
        ) : String(info.contentType || "").startsWith("image/") ? (
          <ViewOnlyImage src={previewUrl(serialNo, unit, domain, false)} alt={info.fileName} />
        ) : (
          <iframe
            title={info.fileName}
            src={previewUrl(serialNo, unit, domain, true)}
            style={{ width: "100%", height: "78vh", border: "none" }}
          />
        )}
      </Modal>
    </>
  );
};

export default DocumentPanel;
