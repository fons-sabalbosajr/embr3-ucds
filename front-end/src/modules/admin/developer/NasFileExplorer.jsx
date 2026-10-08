import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Dropdown, Empty, Input, Modal, Spin, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { message } from "../../../shared/feedback";
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  BarsOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FolderFilled,
  FolderOpenFilled,
  HddOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../../config/api";
import { getPreference, setPreference } from "../../../shared/preferences";
import { withSessionToken } from "../../../shared/sessionToken";
import PdfViewer from "../../../shared/components/PdfViewer";
import { ViewOnlyImage } from "../../../shared/components/viewOnly";
import "./nasexplorer.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The NAS explorer, laid out like the Windows 10 File Explorer people already
// know: containers in the navigation pane on the left (where drives would
// be), an address bar with back / forward / up, a details list or icon tiles
// in the middle, a details pane on the right, and a status bar underneath.
//
// It is only a way of looking. Every operation goes through the backend: the
// browser never speaks SMB, never sees a credential, and never learns the
// host or share name. It navigates by share-relative path, and the server
// resolves that inside the configured root; `..` is rejected there, not here.
//
// Two callers share it: the developer explorer (endpoint /api/nas, every
// container, elevated) and the Storage screen staff use (/api/storage, only
// the containers designated to them). The server decides what each may open.
// ---------------------------------------------------------------------------

const humanSize = (bytes) => {
  if (bytes == null) return "";
  const units = ["bytes", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
};

// Loaded by the browser (the preview iframe, a download tab), so this tab's
// sign-in travels in the URL rather than a header (see shared/sessionToken).
const fileUrl = (endpoint, container, path, download) =>
  withSessionToken(
    `${API_BASE_URL}${endpoint}/file?container=${encodeURIComponent(container)}&path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`
  );

const EXT_TYPES = {
  pdf: ["PDF Document", FilePdfOutlined, "#d93025"],
  doc: ["Word Document", FileWordOutlined, "#2b579a"],
  docx: ["Word Document", FileWordOutlined, "#2b579a"],
  xls: ["Excel Worksheet", FileExcelOutlined, "#217346"],
  xlsx: ["Excel Worksheet", FileExcelOutlined, "#217346"],
  csv: ["CSV File", FileExcelOutlined, "#217346"],
  txt: ["Text Document", FileTextOutlined, "#6b7280"],
  jpg: ["JPG File", FileImageOutlined, "#0f766e"],
  jpeg: ["JPEG File", FileImageOutlined, "#0f766e"],
  png: ["PNG File", FileImageOutlined, "#0f766e"],
  gif: ["GIF File", FileImageOutlined, "#0f766e"],
  zip: ["Compressed (zipped) Folder", FileZipOutlined, "#b45309"],
  rar: ["RAR Archive", FileZipOutlined, "#b45309"],
};

const kindOf = (entry) => {
  if (entry.type === "directory") return { label: "File folder", Icon: FolderFilled, color: "#e8b339" };
  const ext = (entry.name.split(".").pop() || "").toLowerCase();
  const known = EXT_TYPES[ext];
  if (known) return { label: known[0], Icon: known[1], color: known[2] };
  return { label: ext ? `${ext.toUpperCase()} File` : "File", Icon: FileOutlined, color: "#6b7280" };
};

const NasFileExplorer = ({ endpoint = "/api/nas", title = "NAS File Explorer", initialContainer = "records" }) => {
  const { token } = antdTheme.useToken();
  const [containers, setContainers] = useState([]);
  const [container, setContainer] = useState(initialContainer);
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [rootFolders, setRootFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState(() => getPreference("eu-explorer-view", "details"));
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detailsPane, setDetailsPane] = useState(true);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [sort, setSort] = useState({ by: "name", dir: "asc" });
  // Deep search: typing filters the folder on screen at once; Enter asks the
  // server to walk the subfolders too. `search` holds that result set.
  const [search, setSearch] = useState(null); // null | { query, loading, results, truncated, scanned, error }
  // Back / forward, like the browser's: a list of {container, path} and a cursor.
  const history = useRef({ items: [], index: -1 });
  const [, bump] = useState(0);

  const load = useCallback(
    async (target, key = container, { record = true } = {}) => {
      setLoading(true);
      setError(null);
      setSelected(null);
      setSearch(null);
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
                ? ["outside-schedule", "master-off", "bridge-offline", "nas-offline"].includes(body.reason)
                  ? body.message
                  : "Document access is switched off right now. The Developer turns it on from Storage settings."
                : body.message || "Could not read that folder."
          );
          setData(null);
          return;
        }
        setData(body);
        setPath(body.path || "");
        if (!body.path) setRootFolders((body.entries || []).filter((e) => e.type === "directory"));
        if (record) {
          const h = history.current;
          h.items = h.items.slice(0, h.index + 1);
          h.items.push({ container: key, path: body.path || "" });
          h.index = h.items.length - 1;
          bump((n) => n + 1);
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    },
    [container, endpoint]
  );

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, endpoint]);

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
    if (key === container) {
      load("");
      return;
    }
    setContainer(key);
    setPath("");
    setFilter("");
    setRootFolders([]);
  };

  const go = (delta) => {
    const h = history.current;
    const next = h.index + delta;
    if (next < 0 || next >= h.items.length) return;
    h.index = next;
    const target = h.items[next];
    if (target.container !== container) setContainer(target.container);
    load(target.path, target.container, { record: false });
  };

  const runSearch = async () => {
    const q = filter.trim();
    if (q.length < 2) return;
    setSearch({ query: q, loading: true, results: [], truncated: false, scanned: 0, error: null });
    setSelected(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}${endpoint}/search?container=${encodeURIComponent(container)}&path=${encodeURIComponent(path || "")}&q=${encodeURIComponent(q)}`,
        { credentials: "include" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearch({ query: q, loading: false, results: [], truncated: false, scanned: 0, error: body.message || "The search did not complete." });
        return;
      }
      setSearch({ query: q, loading: false, results: body.results || [], truncated: Boolean(body.truncated), scanned: body.scannedFolders || 0, error: null });
    } catch {
      setSearch({ query: q, loading: false, results: [], truncated: false, scanned: 0, error: "Could not reach the server." });
    }
  };

  const closeSearch = () => {
    setSearch(null);
    setFilter("");
  };

  // Staff view, never download. Only the Developer's elevated explorer
  // (/api/nas) saves files; the shared storage screen (/api/storage) is
  // view-only, and the server ignores download=1 there anyway.
  const canDownload = endpoint === "/api/nas";

  const openEntry = (entry) => {
    if (entry.type === "directory") load(entry.path);
    else if (entry.previewable) setPreview(entry);
    else if (canDownload) window.open(fileUrl(endpoint, container, entry.path, true), "_blank", "noopener");
    else message.info("This file type cannot be shown in the browser, and files are not downloadable here.");
  };

  const containerLabel = containers.find((c) => c.key === container)?.label || "Records";
  const segments = path ? path.split(/[\\/]/).filter(Boolean) : [];

  const submitAddress = () => {
    setEditingAddress(false);
    const typed = addressDraft.trim().replace(/^[\\/]+|[\\/]+$/g, "");
    // "Records\RECORDS\Database" or just "RECORDS\Database": the first
    // segment names a container only if it matches one.
    const parts = typed.split(/[\\/]/).filter(Boolean);
    const first = containers.find((c) => c.label.toLowerCase() === (parts[0] || "").toLowerCase() || c.key === (parts[0] || "").toLowerCase());
    if (first) {
      if (first.key !== container) setContainer(first.key);
      load(parts.slice(1).join("\\"), first.key);
    } else {
      load(parts.join("\\"));
    }
  };

  const entries = useMemo(() => {
    const list = (data?.entries || []).filter((e) => (filter ? e.name.toLowerCase().includes(filter.toLowerCase()) : true));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      if (sort.by === "size") return ((a.size || 0) - (b.size || 0)) * dir;
      if (sort.by === "modified") return (new Date(a.modifiedAt || 0) - new Date(b.modifiedAt || 0)) * dir;
      if (sort.by === "type") return kindOf(a).label.localeCompare(kindOf(b).label) * dir;
      return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir;
    });
  }, [data, filter, sort]);

  const toggleSort = (by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }));
  const sortMark = (by) => (sort.by === by ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const setViewPersist = (v) => {
    setView(v);
    setPreference("eu-explorer-view", v);
  };

  const contextItems = (entry) => ({
    items: [
      { key: "open", label: entry.type === "directory" ? "Open" : entry.previewable ? "View" : canDownload ? "Download" : "View", icon: entry.type === "directory" ? <FolderOpenFilled /> : entry.previewable || !canDownload ? <EyeOutlined /> : <DownloadOutlined /> },
      ...(entry.type === "file" && canDownload ? [{ key: "download", label: "Download", icon: <DownloadOutlined /> }] : []),
      { type: "divider" },
      { key: "details", label: "Details", icon: <InfoCircleOutlined /> },
    ],
    onClick: ({ key }) => {
      if (key === "open") openEntry(entry);
      else if (key === "download") window.open(fileUrl(endpoint, container, entry.path, true), "_blank", "noopener");
      else if (key === "details") {
        setSelected(entry);
        setDetailsPane(true);
      }
    },
  });

  const folderCount = entries.filter((e) => e.type === "directory").length;
  const h = history.current;

  const rowProps = (entry) => ({
    className: `eu-explorer-row${selected?.path === entry.path ? " is-selected" : ""}`,
    onClick: () => setSelected(entry),
    onDoubleClick: () => openEntry(entry),
    onKeyDown: (e) => {
      if (e.key === "Enter") openEntry(entry);
    },
    tabIndex: 0,
  });

  return (
    <div
      className="eu-explorer"
      style={{
        "--x-bg": token.colorBgContainer,
        "--x-bg-alt": token.colorBgLayout,
        "--x-line": token.colorBorderSecondary,
        "--x-ink": token.colorText,
        "--x-muted": token.colorTextTertiary,
        "--x-select": token.colorPrimaryBg,
        "--x-select-line": token.colorPrimaryBorder,
        "--x-hover": token.colorFillTertiary,
        "--x-radius": `${token.borderRadius}px`,
      }}
    >
      {/* Title bar */}
      <div className="eu-explorer-titlebar">
        <HddOutlined />
        <Text strong>{title}</Text>
        <Text type="secondary" className="eu-explorer-titlebar-path">
          {containerLabel}
          {segments.length ? ` › ${segments.join(" › ")}` : ""}
        </Text>
      </div>

      {/* Address row */}
      <div className="eu-explorer-address">
        <Tooltip title="Back">
          <Button type="text" icon={<ArrowLeftOutlined />} disabled={h.index <= 0} onClick={() => go(-1)} />
        </Tooltip>
        <Tooltip title="Forward">
          <Button type="text" icon={<ArrowRightOutlined />} disabled={h.index >= h.items.length - 1} onClick={() => go(1)} />
        </Tooltip>
        <Tooltip title="Up">
          <Button type="text" icon={<ArrowUpOutlined />} disabled={!path} onClick={() => load(data?.parent || "")} />
        </Tooltip>

        {editingAddress ? (
          <Input placeholder="Type a path, e.g. Records/2024"
            autoFocus
            className="eu-explorer-addressbar"
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            onPressEnter={submitAddress}
            onBlur={() => setEditingAddress(false)}
            onKeyDown={(e) => e.key === "Escape" && setEditingAddress(false)}
          />
        ) : (
          <div
            className="eu-explorer-addressbar"
            role="button"
            tabIndex={0}
            title="Click to type a path"
            onClick={() => {
              setAddressDraft([containerLabel, ...segments].join("\\"));
              setEditingAddress(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && setEditingAddress(true)}
          >
            <span className="eu-explorer-crumb" onClick={(e) => { e.stopPropagation(); load(""); }}>
              <HddOutlined /> {containerLabel}
            </span>
            {segments.map((seg, i) => (
              <span key={`${i}-${seg}`} className="eu-explorer-crumb-wrap">
                <span className="eu-explorer-crumb-sep">›</span>
                <span
                  className="eu-explorer-crumb"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (i < segments.length - 1) load(segments.slice(0, i + 1).join("\\"));
                  }}
                >
                  {seg}
                </span>
              </span>
            ))}
          </div>
        )}

        <Tooltip title="Refresh">
          <Button type="text" icon={<ReloadOutlined />} onClick={() => load(path, container, { record: false })} />
        </Tooltip>
        <Input
          className="eu-explorer-search"
          allowClear
          prefix={<SearchOutlined style={{ color: "var(--x-muted)" }} />}
          placeholder={`Search ${segments.length ? segments[segments.length - 1] : containerLabel} — Enter for subfolders`}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            if (!e.target.value) setSearch(null);
          }}
          onPressEnter={runSearch}
          title="Typing filters this folder; Enter searches every folder beneath it"
        />
      </div>

      {error && <Alert type="warning" showIcon message={error} className="eu-explorer-alert" />}

      <div className="eu-explorer-body">
        {/* Navigation pane */}
        <div className="eu-explorer-nav">
          <div className="eu-explorer-nav-heading">Containers</div>
          {(containers.length ? containers : [{ key: initialContainer, label: "Records", enabled: true }]).map((c) => (
            <div
              key={c.key}
              className={`eu-explorer-nav-item${c.key === container ? " is-current" : ""}${c.enabled === false ? " is-off" : ""}`}
              onClick={() => c.enabled !== false && switchContainer(c.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && c.enabled !== false && switchContainer(c.key)}
              title={c.enabled === false ? `${c.label} is switched off` : c.label}
            >
              <HddOutlined />
              <span className="eu-explorer-nav-label">{c.label}</span>
              {c.enabled === false && <span className="eu-explorer-nav-off">off</span>}
            </div>
          ))}
          {rootFolders.length > 0 && (
            <>
              <div className="eu-explorer-nav-heading">{containerLabel}</div>
              {rootFolders.map((d) => (
                <div
                  key={d.path}
                  className={`eu-explorer-nav-item is-folder${segments[0] === d.name ? " is-current" : ""}`}
                  onClick={() => load(d.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && load(d.path)}
                >
                  <FolderFilled style={{ color: "#e8b339" }} />
                  <span className="eu-explorer-nav-label">{d.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Content pane */}
        <div className="eu-explorer-content" onClick={() => setSelected(null)}>
          {search ? (
            <div onClick={(e) => e.stopPropagation()}>
              <div className="eu-explorer-searchbar">
                <SearchOutlined />
                <span>
                  {search.loading
                    ? `Searching for “${search.query}” in ${segments.length ? segments[segments.length - 1] : containerLabel} and its subfolders…`
                    : `${search.results.length} result${search.results.length === 1 ? "" : "s"} for “${search.query}” in ${segments.length ? segments[segments.length - 1] : containerLabel}${search.truncated ? " (first matches only — search a narrower folder)" : ""}`}
                </span>
                <Button size="small" type="text" onClick={closeSearch}>
                  Close search
                </Button>
              </div>
              {search.error && <Alert type="warning" showIcon message={search.error} className="eu-explorer-alert" />}
              {search.loading ? (
                <div className="eu-explorer-loading">
                  <Spin />
                </div>
              ) : !search.results.length ? (
                !search.error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items match your search." style={{ marginTop: 48 }} />
              ) : (
                <table className="eu-explorer-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="col-folder">Folder</th>
                      <th className="col-type">Type</th>
                      <th className="col-size">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.results.map((entry) => {
                      const kind = kindOf(entry);
                      return (
                        <Dropdown key={entry.path} menu={contextItems(entry)} trigger={["contextMenu"]}>
                          <tr {...rowProps(entry)}>
                            <td>
                              <kind.Icon style={{ color: kind.color }} />
                              <span className="eu-explorer-name">{entry.name}</span>
                            </td>
                            <td className="col-folder" title={entry.folder}>
                              <span className="eu-explorer-folder-link" onClick={(e) => { e.stopPropagation(); load(entry.folder || ""); }}>
                                {entry.folder ? entry.folder.split("\\").join(" › ") : containerLabel}
                              </span>
                            </td>
                            <td className="col-type">{kind.label}</td>
                            <td className="col-size">{entry.type === "file" ? humanSize(entry.size) : ""}</td>
                          </tr>
                        </Dropdown>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : loading ? (
            <div className="eu-explorer-loading">
              <Spin />
            </div>
          ) : !entries.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter ? "No items match your search." : "This folder is empty."} style={{ marginTop: 48 }} />
          ) : view === "details" ? (
            <table className="eu-explorer-table" onClick={(e) => e.stopPropagation()}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort("name")}>Name{sortMark("name")}</th>
                  <th onClick={() => toggleSort("modified")} className="col-date">Date modified{sortMark("modified")}</th>
                  <th onClick={() => toggleSort("type")} className="col-type">Type{sortMark("type")}</th>
                  <th onClick={() => toggleSort("size")} className="col-size">Size{sortMark("size")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const kind = kindOf(entry);
                  return (
                    <Dropdown key={entry.path} menu={contextItems(entry)} trigger={["contextMenu"]}>
                      <tr {...rowProps(entry)}>
                        <td>
                          <kind.Icon style={{ color: kind.color }} />
                          <span className="eu-explorer-name">{entry.name}</span>
                        </td>
                        <td className="col-date">{entry.modifiedAt ? dayjs(entry.modifiedAt).format("M/D/YYYY h:mm A") : ""}</td>
                        <td className="col-type">{kind.label}</td>
                        <td className="col-size">{entry.type === "file" ? humanSize(entry.size) : ""}</td>
                      </tr>
                    </Dropdown>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="eu-explorer-grid" onClick={(e) => e.stopPropagation()}>
              {entries.map((entry) => {
                const kind = kindOf(entry);
                return (
                  <Dropdown key={entry.path} menu={contextItems(entry)} trigger={["contextMenu"]}>
                    <div {...rowProps(entry)} className={`eu-explorer-tile${selected?.path === entry.path ? " is-selected" : ""}`} title={entry.name}>
                      <kind.Icon style={{ color: kind.color, fontSize: 44 }} />
                      <span className="eu-explorer-tile-name">{entry.name}</span>
                    </div>
                  </Dropdown>
                );
              })}
            </div>
          )}
        </div>

        {/* Details pane */}
        {detailsPane && (
          <div className="eu-explorer-details">
            {selected ? (
              (() => {
                const kind = kindOf(selected);
                return (
                  <>
                    <div className="eu-explorer-details-icon">
                      <kind.Icon style={{ color: kind.color, fontSize: 56 }} />
                    </div>
                    <Text strong className="eu-explorer-details-name">{selected.name}</Text>
                    <Text type="secondary">{kind.label}</Text>
                    <dl className="eu-explorer-details-list">
                      {selected.type === "file" && (
                        <>
                          <dt>Size</dt>
                          <dd>{humanSize(selected.size)}</dd>
                        </>
                      )}
                      <dt>Date modified</dt>
                      <dd>{selected.modifiedAt ? dayjs(selected.modifiedAt).format("D MMM YYYY, h:mm A") : "—"}</dd>
                      <dt>Location</dt>
                      <dd>{[containerLabel, ...segments].join(" › ")}</dd>
                    </dl>
                    {selected.type === "file" ? (
                      <div className="eu-explorer-details-actions">
                        {selected.previewable && (
                          <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => setPreview(selected)}>
                            View
                          </Button>
                        )}
                        {canDownload ? (
                          <Button size="small" icon={<DownloadOutlined />} href={fileUrl(endpoint, container, selected.path, true)} target="_blank" rel="noopener noreferrer">
                            Download
                          </Button>
                        ) : (
                          <Tag>view only</Tag>
                        )}
                      </div>
                    ) : (
                      <div className="eu-explorer-details-actions">
                        <Button size="small" type="primary" icon={<FolderOpenFilled />} onClick={() => load(selected.path)}>
                          Open
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div className="eu-explorer-details-empty">
                <InfoCircleOutlined style={{ fontSize: 28 }} />
                <Text type="secondary">Select a file or folder to see its details.</Text>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="eu-explorer-status">
        <span>
          {search && !search.loading ? `${search.results.length} result${search.results.length === 1 ? "" : "s"} across ${search.scanned} folder${search.scanned === 1 ? "" : "s"}` : `${entries.length} item${entries.length === 1 ? "" : "s"}`}
          {folderCount ? ` (${folderCount} folder${folderCount === 1 ? "" : "s"})` : ""}
          {selected ? `  |  1 item selected${selected.type === "file" ? `  ${humanSize(selected.size)}` : ""}` : ""}
        </span>
        <span className="eu-explorer-status-right">
          <Tooltip title="Details pane">
            <Button type="text" size="small" icon={<InfoCircleOutlined />} className={detailsPane ? "is-on" : ""} onClick={() => setDetailsPane((v) => !v)} />
          </Tooltip>
          <Tooltip title="Details view">
            <Button type="text" size="small" icon={<BarsOutlined />} className={view === "details" ? "is-on" : ""} onClick={() => setViewPersist("details")} />
          </Tooltip>
          <Tooltip title="Large icons">
            <Button type="text" size="small" icon={<AppstoreOutlined />} className={view === "icons" ? "is-on" : ""} onClick={() => setViewPersist("icons")} />
          </Tooltip>
        </span>
      </div>

      <Modal
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        title={preview?.name}
        width="90vw"
        style={{ top: 24 }}
        footer={[
          canDownload && (
            <Button key="dl" icon={<DownloadOutlined />} href={preview ? fileUrl(endpoint, container, preview.path, true) : undefined} target="_blank" rel="noopener noreferrer">
              Download
            </Button>
          ),
          <Button key="close" type="primary" onClick={() => setPreview(null)}>
            Close
          </Button>,
        ]}
        destroyOnClose
      >
        {/* The Developer's explorer shows files as the browser does, with
            Download beside it. Staff see scans view only — the app's own
            PDF viewer and an image without its context menu — so nothing
            on the Storage page can be saved or printed. */}
        {preview && !canDownload && /\.pdf$/i.test(preview.name) ? (
          <PdfViewer src={fileUrl(endpoint, container, preview.path, false)} owner="the system administrator" />
        ) : preview && !canDownload && /\.(png|jpe?g|gif|bmp|webp)$/i.test(preview.name) ? (
          <ViewOnlyImage src={fileUrl(endpoint, container, preview.path, false)} alt={preview.name} />
        ) : preview ? (
          <iframe title={preview.name} src={fileUrl(endpoint, container, preview.path, false) + (canDownload ? "" : "#toolbar=0&navpanes=0")} style={{ width: "100%", height: "78vh", border: "none" }} />
        ) : null}
      </Modal>
    </div>
  );
};

export default NasFileExplorer;
