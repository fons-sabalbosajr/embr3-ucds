import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { describeApiError } from "../api/ermsService";

const { Paragraph } = Typography;

// ---------------------------------------------------------------------------
// One menu (a lookup list the forms offer) at a time: pick the list, edit
// its entries, save the whole list. Used by Admin Settings › ERMS Config,
// which edits every list, and by a unit's own Settings › ERMS › Menus, which
// edits that unit's lists — as the desktop system let the Legal Unit keep its
// officers and the Laboratory its parameter groups.
//
// The fields an entry carries besides its label (a code, a category) are
// shown and kept; a new entry is just a label.
// ---------------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 8);

/**
 * @param kinds      [{ value, label }] the lists to choose from
 * @param load       (kind) => Promise<{ items, count?, unit?, description? }>
 * @param save       ({ kind, items }) => Promise
 * @param queryKey   (kind) => the react-query key the list is cached under
 * @param onSaved    called after a save, to refresh what depends on the list
 * @param canEdit    false shows the list read-only
 */
const LookupListEditor = ({ kinds, load, save, queryKey, onSaved, canEdit = true, title = "Menu" }) => {
  const [kind, setKind] = useState(kinds[0]?.value || null);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!kinds.some((k) => k.value === kind)) setKind(kinds[0]?.value || null);
  }, [kinds, kind]);

  const { data, isFetching } = useQuery({ queryKey: queryKey(kind), queryFn: () => load(kind), enabled: Boolean(kind) });
  useEffect(() => {
    if (data) {
      setRows((data.items || []).map((it) => ({ ...it, _id: uid() })));
      setDirty(false);
    }
  }, [data]);

  const saving = useMutation({
    mutationFn: () =>
      save({
        kind,
        items: rows.filter((r) => String(r.label || "").trim()).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_id"))),
      }),
    onSuccess: () => {
      message.success("Menu saved.");
      setDirty(false);
      onSaved?.(kind);
    },
    onError: (e) => message.error(describeApiError(e, "Could not save the menu.")),
  });

  const patch = (id, changes) => {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...changes } : r)));
    setDirty(true);
  };
  const extraKeys = useMemo(() => {
    const keys = new Set();
    for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) if (!["_id", "label"].includes(k) && typeof r[k] === "string") keys.add(k);
    return [...keys].slice(0, 3);
  }, [rows]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? rows.filter((r) => String(r.label || "").toLowerCase().includes(f)) : rows;
  }, [rows, filter]);

  const columns = [
    { title: "Label", dataIndex: "label", render: (v, r) => (canEdit ? <Input placeholder="Entry as it appears in the menu" value={v} onChange={(e) => patch(r._id, { label: e.target.value })} /> : v) },
    ...extraKeys.map((k) => ({ title: k, dataIndex: k, width: 200, render: (v, r) => (canEdit ? <Input placeholder={k} value={v || ""} onChange={(e) => patch(r._id, { [k]: e.target.value })} /> : v) })),
    canEdit && {
      title: "",
      width: 40,
      render: (_, r) => (
        <Button type="text" danger size="small" aria-label="Remove entry" icon={<DeleteOutlined />} onClick={() => { setRows((rs) => rs.filter((x) => x._id !== r._id)); setDirty(true); }} />
      ),
    },
  ].filter(Boolean);

  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <span>{title}</span>
          <Select placeholder="Choose a menu" value={kind} onChange={setKind} options={kinds} style={{ width: 240 }} />
          {data && <Tag>{rows.length} items{data.unit ? ` · ${data.unit}` : ""}</Tag>}
        </Space>
      }
      extra={
        canEdit && (
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => { setFilter(""); setRows((rs) => [{ _id: uid(), label: "" }, ...rs]); setDirty(true); }}>Add</Button>
            <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving.isPending} onClick={() => saving.mutate()}>Save menu</Button>
          </Space>
        )
      }
    >
      {data?.description && <Paragraph type="secondary">{data.description}</Paragraph>}
      {rows.length > 20 && <Input.Search allowClear placeholder="Find an entry" style={{ maxWidth: 320, marginBottom: 8 }} onChange={(e) => setFilter(e.target.value)} value={filter} />}
      {dirty && <Alert type="info" showIcon style={{ marginBottom: 8 }} message="Unsaved changes. The forms offer the saved list until you save." />}
      <Table rowKey="_id" size="small" loading={isFetching} columns={columns} dataSource={shown} pagination={{ defaultPageSize: 50, hideOnSinglePage: true }} />
    </Card>
  );
};

export default LookupListEditor;
