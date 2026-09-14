import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowUpOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  FolderFilled,
  HomeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../../config/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Records share explorer, for administration and troubleshooting.
//
// Every operation goes through the backend. The browser never speaks SMB,
// never sees a credential, and never learns the host or share name: it
// navigates by share-relative path, and the server resolves that inside the
// configured root. `?path=../../` is rejected there, not here — this component
// is a convenience, not a control.
// ---------------------------------------------------------------------------

const humanSize = (bytes) => {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
};

const fileUrl = (endpoint, container, path, download) =>
  `${API_BASE_URL}${endpoint}/file?container=${encodeURIComponent(container)}&path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;

// Browses one container at a time. The list comes from the elevated
// containers route — this screen only renders once the developer is verified.
//
// Two callers share it: the developer explorer (endpoint /api/nas, every
// container, elevated) and the Storage screen staff use (endpoint
// /api/storage, only the containers designated to them). The server decides
// what each may open; this component only asks.
const NasFileExplorer = ({ endpoint = "/api/nas", title = "NAS File Explorer", initialContainer = "records" }) => {
  const [containers, setContainers] = useState([]);
  const [container, setContainer] = useState(initialContainer);
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async (target, key = container) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}${endpoint}/browse?container=${encodeURIComponent(key)}&path=${encodeURIComponent(target || "")}`,
        { credentials: "include" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.code === "ELEVATION_REQUIRED" || body.code === "ELEVATION_EXPIRED"
            ? "Verify by email on this page to browse the share."
            : body.code === "NAS_INACTIVE" || body.code === "NAS_NOT_ACTIVE"
              ? "Document access is switched off right now. The Developer turns it on from Storage settings."
              : body.message || "Could not read that folder."
        );
        setData(null);
        return;
      }
      setData(body);
      setPath(body.path || "");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [container, endpoint]);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    // /api/nas/containers is the elevated developer list; /api/storage/containers
    // is what the signed-in person has been given. Both answer {containers}.
    fetch(`${API_BASE_URL}${endpoint}/containers`, { credentials: "include" })
      .then((r) => r.json())
      .then((s) => {
        const list = Array.isArray(s.containers) ? s.containers : [];
        setContainers(list);
        if (list.length && !list.some((c) => c.key === initialContainer)) setContainer(list[0].key);
      })
      .catch(() => setContainers([]));
  }, [endpoint, initialContainer]);

  const switchContainer = (key) => {
    setContainer(key);
    setPath("");
    setFilter("");
  };

  const segments = path ? path.split(/[\\/]/).filter(Boolean) : [];

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      align: "left",
      render: (name, row) =>
        row.type === "directory" ? (
          <Button type="link" style={{ padding: 0 }} onClick={() => load(row.path)}>
            <Space size={6}>
              <FolderFilled style={{ color: "#e8b339" }} />
              {name}
            </Space>
          </Button>
        ) : (
          <Space size={6}>
            <FileOutlined />
            <Text>{name}</Text>
          </Space>
        ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 130,
      render: (type, row) =>
        type === "directory" ? (
          <Tag>folder</Tag>
        ) : (
          <Tag color={row.previewable ? "blue" : "default"}>
            {(row.name.split(".").pop() || "file").toLowerCase()}
          </Tag>
        ),
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      width: 110,
      align: "right",
      render: (size, row) => (row.type === "directory" ? "—" : humanSize(size)),
      sorter: (a, b) => (a.size || 0) - (b.size || 0),
    },
    {
      title: "Modified",
      dataIndex: "modifiedAt",
      key: "modifiedAt",
      width: 170,
      render: (v) => (v ? dayjs(v).format("D MMM YYYY, h:mm A") : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 170,
      render: (_, row) =>
        row.type === "file" && (
          <Space size={4}>
            {row.previewable && (
              <Button size="small" icon={<EyeOutlined />} onClick={() => setPreview(row)}>
                View
              </Button>
            )}
            <Button
              size="small"
              icon={<DownloadOutlined />}
              href={fileUrl(endpoint, container, row.path, true)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </Button>
          </Space>
        ),
    },
  ];

  const rows = (data?.entries || []).filter((e) =>
    filter ? e.name.toLowerCase().includes(filter.toLowerCase()) : true
  );

  return (
    <Card
      title={title}
      extra={
        <Space>
          <Select
            size="small"
            value={container}
            onChange={switchContainer}
            style={{ width: 180 }}
            options={(containers.length ? containers : [{ key: initialContainer, label: "Records", enabled: true }]).map((c) => ({
              value: c.key,
              label: c.enabled === false ? `${c.label} (off)` : c.label,
              disabled: c.enabled === false,
            }))}
          />
          <Input.Search
            size="small"
            allowClear
            placeholder="Filter this folder"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 220 }}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => load(path)}>
            Refresh
          </Button>
        </Space>
      }
    >
      {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          size="small"
          icon={<ArrowUpOutlined />}
          disabled={!path}
          onClick={() => load(data?.parent || "")}
        >
          Up
        </Button>
        <Breadcrumb
          items={[
            {
              title: (
                <Button type="link" style={{ padding: 0 }} onClick={() => load("")}>
                  <HomeOutlined /> {containers.find((c) => c.key === container)?.label || "share"} root
                </Button>
              ),
            },
            ...segments.map((seg, i) => ({
              title:
                i === segments.length - 1 ? (
                  <Text>{seg}</Text>
                ) : (
                  <Button
                    type="link"
                    style={{ padding: 0 }}
                    onClick={() => load(segments.slice(0, i + 1).join("\\"))}
                  >
                    {seg}
                  </Button>
                ),
            })),
          ]}
        />
      </Space>

      <Table
        size="small"
        rowKey="path"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 50, showSizeChanger: true, size: "small" }}
        scroll={{ x: 780 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here" />,
        }}
      />

      <Modal
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        title={preview?.name}
        width="90vw"
        style={{ top: 24 }}
        footer={[
          <Button
            key="dl"
            icon={<DownloadOutlined />}
            href={preview ? fileUrl(endpoint, container, preview.path, true) : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreview(null)}>
            Close
          </Button>,
        ]}
        destroyOnClose
      >
        {preview && (
          <iframe
            title={preview.name}
            src={fileUrl(endpoint, container, preview.path, false)}
            style={{ width: "100%", height: "78vh", border: "none" }}
          />
        )}
      </Modal>
    </Card>
  );
};

export default NasFileExplorer;
