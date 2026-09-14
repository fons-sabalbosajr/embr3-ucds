import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Popconfirm, Space, Statistic, Table, Tag, Typography } from "antd";
import { CloudUploadOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import { message } from "../../../shared/feedback";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Generated report PDFs: move them out of MongoDB into the Records container.
//
// The database holds them as GridFS — `pdfFiles.files` (one row per file) and
// `pdfFiles.chunks` (the bytes, in 255 KB pieces). The two are one thing; a
// file cannot exist without its chunks, and dropping only the chunks leaves a
// broken file. So this screen treats them as a pair: move, verify on the
// share, and only then remove both.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const mb = (bytes) => (bytes == null ? "—" : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

const FOLDER_STATE = {
  ok: null,
  missing: "The folder does not exist on the share yet. Moving the files creates it.",
  denied: "The Records service account cannot read this folder.",
  disabled: "The Records container is switched off.",
  "not-configured": "The Records container is not configured.",
  unreachable: "The share could not be reached.",
};

const NasReportFilesCard = () => {
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'move' | 'remove'
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/nas/report-files");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not read the report file inventory.");
        return;
      }
      setInv(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = async () => {
    setBusy("move");
    try {
      const res = await api("/api/nas/report-files/move", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "The move did not complete.");
      } else {
        const okCount = (data.results || []).filter((r) => r.ok).length;
        message.success(`${okCount} of ${(data.results || []).length} file(s) verified on the share.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const res = await api("/api/nas/report-files/database", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) message.error(data.message || "The database copy was not removed.");
      else message.success(`${data.removed} file(s) removed from the database${data.bytes ? ` (${mb(data.bytes)} freed)` : ""}.`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const dbColumns = [
    { title: "File", dataIndex: "filename", ellipsis: true },
    { title: "Size", dataIndex: "bytes", width: 100, render: mb },
    {
      title: "Uploaded",
      dataIndex: "uploadedAt",
      width: 170,
      render: (v) => (v ? new Date(v).toLocaleString() : "—"),
    },
    { title: "Used by", dataIndex: "referencedBy", width: 90, render: (n) => `${n} report(s)` },
    {
      title: "On share",
      dataIndex: "verified",
      width: 130,
      render: (verified, row) =>
        verified ? (
          <Tag color="green">verified</Tag>
        ) : row.onShare ? (
          <Tag color="orange">size differs</Tag>
        ) : (
          <Tag>not yet</Tag>
        ),
    },
  ];

  const shareColumns = [
    { title: "File", dataIndex: "name", ellipsis: true },
    { title: "Size", dataIndex: "bytes", width: 100, render: mb },
    {
      title: "Modified",
      dataIndex: "modifiedAt",
      width: 170,
      render: (v) => (v ? new Date(v).toLocaleString() : "—"),
    },
  ];

  const folderNote = inv ? FOLDER_STATE[inv.folderState] : null;
  const inDatabase = inv?.databaseFiles > 0;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="Where generated reports live"
        description={
          <>
            Report PDFs used to be stored inside MongoDB as <Text code>pdfFiles.files</Text> and{" "}
            <Text code>pdfFiles.chunks</Text>. The chunks are the file bytes themselves, so the two
            collections are one thing and are removed together. Moving them into the Records
            container keeps the same download links working and frees the cluster.
          </>
        }
      />

      {error && <Alert type="error" showIcon message={error} />}

      <Card
        title="Report files"
        size="small"
        loading={loading && !inv}
        extra={
          <Button icon={<ReloadOutlined />} size="small" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      >
        {inv && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Folder">
                <Text code>{inv.folder}</Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  inside the Records container
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Folder state">
                {inv.folderState === "ok" ? <Tag color="green">reachable</Tag> : <Tag color="orange">{inv.folderState}</Tag>}
                {folderNote && <Text type="secondary" style={{ marginLeft: 8 }}>{folderNote}</Text>}
              </Descriptions.Item>
            </Descriptions>

            <Space size="large" wrap>
              <Statistic title="In the database" value={inv.databaseFiles} suffix="file(s)" />
              <Statistic title="Database size" value={mb(inv.databaseBytes)} />
              <Statistic title="Chunks" value={inv.databaseChunks} />
              <Statistic title="On the share" value={inv.shareFiles} suffix="file(s)" />
            </Space>

            {inDatabase ? (
              <>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  columns={dbColumns}
                  dataSource={inv.items}
                />
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<CloudUploadOutlined />}
                    loading={busy === "move"}
                    disabled={!inv.containerEnabled || busy === "remove"}
                    onClick={move}
                  >
                    Move to the share
                  </Button>
                  <Popconfirm
                    title="Remove the database copy?"
                    description="Both pdfFiles.files and pdfFiles.chunks are dropped. Only allowed once every file is verified on the share."
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                    onConfirm={remove}
                    disabled={!inv.allVerified || busy === "move"}
                  >
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      loading={busy === "remove"}
                      disabled={!inv.allVerified || busy === "move"}
                    >
                      Remove from the database
                    </Button>
                  </Popconfirm>
                  {!inv.allVerified && (
                    <Text type="secondary">Removal unlocks when every file is verified on the share.</Text>
                  )}
                </Space>
              </>
            ) : (
              <Alert
                type="success"
                showIcon
                message="Nothing left in the database"
                description="Every report is served from the share. New reports are written to the server's uploads folder, not to MongoDB."
              />
            )}

            <Card title="On the share" size="small" type="inner">
              {inv.shareItems?.length ? (
                <Table
                  size="small"
                  rowKey="name"
                  pagination={false}
                  columns={shareColumns}
                  dataSource={inv.shareItems}
                />
              ) : (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {folderNote || "The folder is empty."}
                </Paragraph>
              )}
            </Card>
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default NasReportFilesCard;
