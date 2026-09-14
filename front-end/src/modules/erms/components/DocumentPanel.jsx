import { useEffect, useState } from "react";
import { Alert, Button, Modal, Space, Spin, Typography } from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FileUnknownOutlined,
} from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The scanned document filed against a record.
//
// Everything here addresses the file by the record's serial. The stored path
// is never sent from the browser and never accepted from it: the server looks
// it up, resolves it inside the configured share and streams the bytes back.
// A clerk who cannot read the record cannot read its document either, because
// both go through the same province scope.
// ---------------------------------------------------------------------------

const fileBase = (serialNo) =>
  `${API_BASE_URL}/api/erms/records/${encodeURIComponent(serialNo)}/file`;
const fileUrl = (serialNo, kind) => `${fileBase(serialNo)}/${kind}`;

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
  NAS_UNREACHABLE: [
    "error",
    "The records share could not be reached. It may be offline, or this server may have lost its connection to it.",
  ],
  NAS_DENIED: [
    "error",
    "The server is not permitted to read this document. The share account may need access to this folder.",
  ],
};

const DocumentPanel = ({ serialNo, fileName }) => {
  const [state, setState] = useState({ status: "loading" });
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch(fileBase(serialNo), { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setState({ status: "ready", info: data });
        else setState({ status: "unavailable", code: data.code, message: data.message });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable", code: "NAS_UNREACHABLE" });
      });

    return () => {
      cancelled = true;
    };
  }, [serialNo]);

  if (state.status === "loading") {
    return (
      <Space style={{ marginTop: 12 }}>
        <Spin size="small" />
        <Text type="secondary">Checking the records share…</Text>
      </Space>
    );
  }

  if (state.status === "unavailable") {
    const [type, description] = EXPLANATIONS[state.code] || [
      "warning",
      state.message || "The document could not be opened.",
    ];
    return (
      <Alert
        type={type}
        showIcon
        icon={<FileUnknownOutlined />}
        style={{ marginTop: 12 }}
        message={fileName || "Document unavailable"}
        description={description}
      />
    );
  }

  const { info } = state;

  return (
    <>
      <Space style={{ marginTop: 12 }} wrap>
        {info.previewable && (
          <Button type="primary" icon={<EyeOutlined />} onClick={() => setPreview(true)}>
            Open document
          </Button>
        )}
        <Button
          icon={<DownloadOutlined />}
          href={fileUrl(serialNo, "download")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {humanSize(info.size)}
          {info.previewable ? "" : " · this format opens in the application it belongs to"}
        </Text>
      </Space>

      <Modal
        open={preview}
        onCancel={() => setPreview(false)}
        title={info.fileName}
        width="90vw"
        style={{ top: 24 }}
        footer={[
          <Button
            key="download"
            icon={<DownloadOutlined />}
            href={fileUrl(serialNo, "download")}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreview(false)}>
            Close
          </Button>,
        ]}
        destroyOnClose
      >
        {/* Rendered by the browser's own viewer. The endpoint honours range
            requests, so a large scan pages in rather than loading whole. */}
        <iframe
          title={info.fileName}
          src={fileUrl(serialNo, "preview")}
          style={{ width: "100%", height: "78vh", border: "none" }}
        />
      </Modal>
    </>
  );
};

export default DocumentPanel;
