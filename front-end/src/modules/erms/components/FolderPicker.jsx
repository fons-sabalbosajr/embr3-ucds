import { useEffect, useMemo, useState } from "react";
import { Button, Input, Popconfirm, Select, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, FolderAddOutlined, FolderOpenOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { createFolder, deleteFolder, describeApiError, fetchFolders } from "../api/ermsService";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Where a scan files on the share — the desktop system's folder step.
//
// The layout puts every document under province / years / <project folder>
// / <type folder>. The desktop ERMS had the clerk pick or make those folders
// on the share by hand; here the form derives the project folder from the
// project title (or the company, or the station), which files a scan for a
// project the share already knows under a second, slightly different name.
//
// So this shows the location the form's values lead to, and lets the clerk
// change it at two levels:
//
//   1. the project folder — choose one that exists at this province and
//      year, or make a new one;
//   2. a folder inside it — choose or make one, in place of the type folder
//      the layout would use (ECC Folder, NOV, …).
//
// An empty folder made by mistake can be removed; nothing with documents in
// it can. The choice is sent with the upload; left alone, the layout applies.
// ---------------------------------------------------------------------------

/** One level of folders: a list to choose from, a box to make one, a way to remove an empty one. */
const Level = ({ unit, params, within, value, onChange, suggested, placeholder, disabled, emptyText }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const listParams = useMemo(() => ({ ...params, folder: within || undefined }), [params, within]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["erms", "folders", unit, listParams],
    queryFn: () => fetchFolders(unit, listParams),
    enabled: Boolean(unit && params.province),
    staleTime: 30 * 1000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["erms", "folders", unit] });
  const make = useMutation({
    mutationFn: (name) => createFolder({ unit, ...params, folder: within || undefined, name }),
    onSuccess: (made) => {
      message.success(made.existed ? `“${made.folder}” was already there; selected.` : `Folder “${made.folder}” made.`);
      setDraft("");
      onChange?.(made.folder);
      refresh();
    },
    onError: (e) => message.error(describeApiError(e, "The folder could not be made.")),
  });
  const remove = useMutation({
    mutationFn: (name) => deleteFolder({ unit, ...params, folder: within || undefined, name }),
    onSuccess: (gone) => {
      message.success(`Folder “${gone.folder}” removed.`);
      if (value === gone.folder) onChange?.(null);
      refresh();
    },
    onError: (e) => message.error(describeApiError(e, "The folder could not be removed.")),
  });

  const folders = data?.folders || [];
  const options = [
    ...(suggested && !folders.includes(suggested) ? [{ value: suggested, label: `${suggested} (new — from the form)` }] : []),
    ...folders.map((f) => ({ value: f, label: f })),
  ];
  const chosenExists = value ? folders.includes(value) : false;

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Space.Compact style={{ width: "100%" }}>
        <Select
          showSearch
          allowClear
          disabled={disabled}
          loading={isFetching}
          value={value || null}
          placeholder={placeholder}
          options={options}
          onChange={(v) => onChange?.(v || null)}
          filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())}
          style={{ flex: 1 }}
          notFoundContent={isFetching ? "Looking…" : error ? describeApiError(error, "The share could not be listed.") : emptyText}
        />
        <Tooltip title="Look again">
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} disabled={disabled} />
        </Tooltip>
        <Popconfirm
          title={`Remove “${value}”?`}
          description="Only an empty folder can be removed."
          okText="Remove"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove.mutate(value)}
          disabled={!chosenExists || disabled}
        >
          <Tooltip title={chosenExists ? "Remove this folder (if empty)" : "Select an existing folder to remove it"}>
            <Button icon={<DeleteOutlined />} danger disabled={!chosenExists || disabled} loading={remove.isPending} />
          </Tooltip>
        </Popconfirm>
      </Space.Compact>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          prefix={<FolderAddOutlined />}
          placeholder="New folder name"
          value={draft}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={() => draft.trim() && make.mutate(draft.trim())}
        />
        <Button onClick={() => make.mutate(draft.trim())} disabled={!draft.trim() || disabled} loading={make.isPending}>
          Make folder
        </Button>
      </Space.Compact>
    </Space>
  );
};

const FolderPicker = ({ unit, province, date, hint, typeFolder, value, onChange, subfolder, onSubfolderChange, disabled }) => {
  const params = useMemo(() => ({ province, date: date || undefined }), [province, date]);
  const ready = Boolean(unit && province);

  // A folder chosen for one province is meaningless in another.
  useEffect(() => {
    onChange?.(null);
    onSubfolderChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province]);
  // A subfolder belongs to its project folder.
  useEffect(() => {
    onSubfolderChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // The listing of the top level also tells us where it is on the share.
  const { data: level } = useQuery({
    queryKey: ["erms", "folders", unit, { ...params, hint: hint || undefined }],
    queryFn: () => fetchFolders(unit, { ...params, hint: hint || undefined }),
    enabled: ready,
    staleTime: 30 * 1000,
    retry: false,
  });

  if (!ready) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        Choose the province first to see the location on the share.
      </Text>
    );
  }
  if (level && level.applicable === false) return null;

  const suggested = level?.suggested || null;
  const projectFolder = value || suggested || null;
  const leaf = subfolder || typeFolder || null;
  const pathParts = [level?.parent || "…", projectFolder || "…", leaf].filter(Boolean);

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Project folder</Text>
        <Level
          unit={unit}
          params={params}
          within={null}
          value={value}
          onChange={onChange}
          suggested={suggested}
          placeholder={suggested ? `Files under “${suggested}” unless you choose a folder` : "Choose a folder"}
          disabled={disabled}
          emptyText="No folders at this level yet"
        />
      </div>
      {projectFolder && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Folder inside “{projectFolder}” {typeFolder ? `(the layout uses “${typeFolder}” unless you choose one)` : "(optional)"}
          </Text>
          <Level
            unit={unit}
            params={params}
            within={projectFolder}
            value={subfolder}
            onChange={onSubfolderChange}
            suggested={typeFolder || null}
            placeholder={typeFolder ? `Files in “${typeFolder}” unless you choose a folder` : "Straight into the project folder unless you choose one"}
            disabled={disabled}
            emptyText="No folders inside it yet"
          />
        </div>
      )}
      <Text type="secondary" style={{ fontSize: 12 }}>
        <FolderOpenOutlined /> {pathParts.join("\\")}
      </Text>
    </Space>
  );
};

export default FolderPicker;
