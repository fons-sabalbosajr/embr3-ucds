import { useEffect, useMemo, useState } from "react";
import { Alert, Breadcrumb, Button, Empty, Input, List, Popconfirm, Space, Spin, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { ArrowUpOutlined, CheckCircleFilled, DeleteOutlined, FolderAddOutlined, FolderFilled, FolderOpenFilled, HomeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { browseFolders, describeApiError, makeBrowseFolder, removeBrowseFolder } from "../api/ermsService";
import { explainFileProblem } from "../../../shared/nasWords";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Where a scan is filed — chosen the desktop ERMS's way.
//
// The browser opens on the account's own unit share (Records, Legal or
// Laboratory), at the province and year level the form points to. The
// clerk opens folders, goes back up by the trail, makes a folder where they
// need one — or removes one made by mistake (empty folders only; the share
// refuses one with anything in it) — and presses "File here". Left alone,
// the scan goes where the layout puts it (province / years / project / type
// folder), as before.
//
// The choice is a path relative to the unit's root (`value`), sent with the
// upload as `targetPath`; the server keeps it inside the root.
// ---------------------------------------------------------------------------

const split = (p) => String(p || "").split("\\").filter(Boolean);
const join = (parts) => parts.join("\\");

/**
 * @param unit      "records" | "legal" | "laboratory"
 * @param province  the form's province, for where to open
 * @param date      the form's year date (YYYY-MM-DD), for where to open
 * @param value     the chosen folder (relative to the unit's root), or null for the standard place
 * @param onChange  (path | null) => void
 * @param standardHint  how the standard place is described ("…\Project title\ECC Folder")
 */
const NasFolderBrowser = ({ unit, province, date, value, onChange, standardHint, disabled }) => {
  const { token } = antdTheme.useToken();
  const queryClient = useQueryClient();
  const [path, setPath] = useState(null); // null until the first answer says where to open
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");

  // Where the layout would file: asked once per province and year.
  const { data: start } = useQuery({
    queryKey: ["erms", "browse", unit, "start", province || null, date || null],
    queryFn: () => browseFolders(unit, { province, date }),
    enabled: Boolean(unit && province),
    staleTime: 60 * 1000,
    retry: false,
  });
  // Open at the chosen folder, else the standard level, else the root.
  useEffect(() => {
    setPath(value || start?.standard || "");
    // Only when the form's place changes or a choice is made from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.standard, unit]);

  const at = path ?? "";
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["erms", "browse", unit, at],
    queryFn: () => browseFolders(unit, { path: at || undefined }),
    enabled: Boolean(unit) && path !== null && !disabled,
    staleTime: 20 * 1000,
    retry: false,
  });

  const make = useMutation({
    mutationFn: (name) => makeBrowseFolder({ unit, path: at, name }),
    onSuccess: (made) => {
      message.success(made.existed ? `“${made.folder}” was already there — opened.` : `Folder “${made.folder}” made.`);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["erms", "browse", unit] });
      setPath(made.path);
      onChange?.(made.path);
    },
    onError: (e) => message.error(describeApiError(e, "The folder could not be made.")),
  });

  // Remove a folder made by mistake. The server removes empty folders only.
  const remove = useMutation({
    mutationFn: (target) => removeBrowseFolder({ unit, path: target }),
    onSuccess: (removed) => {
      message.success(`Folder “${removed.folder}” removed.`);
      queryClient.invalidateQueries({ queryKey: ["erms", "browse", unit] });
      const inside = (p) => p && (p === removed.path || p.startsWith(`${removed.path}\\`));
      // Out of it if we were in it; and the scan no longer goes there.
      if (inside(at)) setPath(removed.parent || "");
      if (inside(value)) onChange?.(null);
    },
    onError: (e) => message.error(describeApiError(e, "The folder could not be removed.")),
  });

  // In a span that keeps its clicks — the confirm's own buttons too, which
  // React bubbles through the portal — from opening the folder row.
  const removeButton = (target, name, props = {}) => (
    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
    <Popconfirm
      title={`Remove the folder “${name}”?`}
      description="Only an empty folder can be removed."
      okText="Remove"
      okButtonProps={{ danger: true }}
      onConfirm={() => remove.mutateAsync(target).catch(() => {})}
    >
      <Tooltip title="Remove this folder (empty folders only)">
        <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={disabled} loading={remove.isPending && remove.variables === target} aria-label={`Remove ${name}`} {...props} />
      </Tooltip>
    </Popconfirm>
    </span>
  );

  const folders = useMemo(() => {
    const all = data?.folders || [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((f) => f.toLowerCase().includes(q)) : all;
  }, [data, filter]);

  const rootName = data?.rootName || start?.rootName || "Share";
  const parts = split(at);
  const chosen = value ? split(value) : null;
  const here = (p) => setPath(p);

  // The same panel before there is anywhere to open, so the form does not
  // jump when the province is chosen.
  if (!province && !value) {
    return (
      <div style={{ border: `1px dashed ${token.colorBorder}`, borderRadius: token.borderRadiusLG, padding: "16px 12px", textAlign: "center" }}>
        <FolderFilled style={{ color: "#e0a526", fontSize: 22 }} />
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Choose the province first — the folders open where the form points.</Text>
        </div>
      </div>
    );
  }

  if (error && !data) {
    const code = error?.response?.data?.code || (error?.response ? "NAS_UNREACHABLE" : "NETWORK");
    const { type, message: why } = explainFileProblem(code, error?.response?.data?.message);
    return (
      <Alert
        type={type}
        showIcon
        message="The folders cannot be shown right now"
        description={why}
        action={<Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: "hidden" }}>
      {/* Where the scan will go. */}
      <div style={{ padding: "8px 12px", background: token.colorFillQuaternary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {chosen ? (
          <Space size={6} wrap>
            <CheckCircleFilled style={{ color: token.colorSuccess }} />
            <Text style={{ fontSize: 12 }}>
              Files in <Text strong style={{ fontSize: 12 }}>{[rootName, ...chosen].join(" \\ ")}</Text>
            </Text>
            <Button size="small" type="link" style={{ padding: 0, height: "auto" }} onClick={() => onChange?.(null)} disabled={disabled}>
              Use the standard place
            </Button>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Standard place{standardHint ? `: ${standardHint}` : ""}. Open a folder below and press <Text strong style={{ fontSize: 12 }}>File here</Text> to choose another.
          </Text>
        )}
      </div>

      {/* The trail, and the actions for the folder on show. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", flexWrap: "wrap" }}>
        <Breadcrumb
          items={[
            { title: <a onClick={() => here("")}><HomeOutlined /> {rootName}</a> },
            ...parts.map((p, i) => ({ title: i === parts.length - 1 ? <Text strong>{p}</Text> : <a onClick={() => here(join(parts.slice(0, i + 1)))}>{p}</a> })),
          ]}
        />
        <Space size={4}>
          <Button size="small" icon={<ArrowUpOutlined />} disabled={!parts.length || disabled} onClick={() => here(join(parts.slice(0, -1)))} aria-label="Up one folder" />
          <Button size="small" icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()} aria-label="Look again" />
          {parts.length > 0 && data?.exists !== false && !(data?.folders?.length) && removeButton(at, parts[parts.length - 1], { type: "default", children: "Remove this folder" })}
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleFilled />}
            disabled={disabled || !parts.length || value === at}
            onClick={() => onChange?.(at)}
          >
            {value === at ? "Chosen" : "File here"}
          </Button>
        </Space>
      </div>

      {(data?.folders?.length || 0) > 8 && (
        <div style={{ padding: "0 12px 6px" }}>
          <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Find a folder here" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      )}

      {/* The folders inside: open one by clicking it. */}
      <div style={{ maxHeight: 220, overflowY: "auto", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        {isFetching && !data ? (
          <div style={{ padding: 16, textAlign: "center" }}><Spin size="small" /></div>
        ) : folders.length ? (
          <List
            size="small"
            dataSource={folders}
            renderItem={(name) => {
              const full = join([...parts, name]);
              const isChosen = value === full;
              return (
                <List.Item
                  onClick={() => !disabled && here(full)}
                  style={{ cursor: disabled ? "default" : "pointer", padding: "6px 12px", background: isChosen ? token.colorPrimaryBg : undefined }}
                  className="nas-folder-row"
                >
                  <Space size={8} style={{ minWidth: 0 }}>
                    {isChosen ? <FolderOpenFilled style={{ color: token.colorPrimary }} /> : <FolderFilled style={{ color: "#e0a526" }} />}
                    <Text style={{ fontSize: 13, overflowWrap: "anywhere" }}>{name}</Text>
                    {isChosen && <Tag color="blue" style={{ marginInlineStart: 4 }}>chosen</Tag>}
                  </Space>
                  <span className="nas-folder-remove">{removeButton(full, name)}</span>
                </List.Item>
              );
            }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: "12px 0" }}
            description={data && data.exists === false ? "This folder is not on the share yet — make one below to start it." : filter ? "No folder matches." : "No folders inside this one."}
          />
        )}
      </div>

      {/* Make a folder inside the one on show. */}
      <div style={{ padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            size="small"
            prefix={<FolderAddOutlined />}
            placeholder={`New folder inside “${parts[parts.length - 1] || rootName}”`}
            value={newName}
            maxLength={120}
            disabled={disabled}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={() => newName.trim() && make.mutate(newName.trim())}
          />
          <Button size="small" onClick={() => make.mutate(newName.trim())} disabled={!newName.trim() || disabled} loading={make.isPending}>
            Make folder
          </Button>
        </Space.Compact>
      </div>
    </div>
  );
};

export default NasFolderBrowser;
