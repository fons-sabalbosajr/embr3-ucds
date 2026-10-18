import { useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Checkbox, Drawer, Dropdown, Empty, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tooltip, Typography,
} from "antd";
import {
  ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, FilterOutlined, FunctionOutlined, MessageOutlined, PlusOutlined,
  SearchOutlined, SettingOutlined, SnippetsOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { message } from "../../../shared/feedback";
import { copyText } from "../../../shared/copyText";
import { openVera } from "../../vera/veraService";
import { FullDate } from "../province/tabpanes/DateInputs";
import { FUNCTIONS, aggregate, computeRows, display } from "./formula";
import { addRows, deleteRows, exportTable, readTable, saveColumns, updateRow } from "./customTableService";
import "./customtable.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// A Planning Unit table: design its columns (text, number, date, choice,
// yes/no, or a formula worked out from the row's other columns), fill its
// rows in place or paste them from Excel, then search, filter, sort, total
// and export what is shown. VERA explains any of it ("Ask VERA").
// ---------------------------------------------------------------------------

const TYPE_LABEL = { text: "Text", number: "Number", date: "Date", select: "Choice", checkbox: "Yes / no", formula: "Formula" };
const TOTAL_LABEL = { sum: "Sum", avg: "Average", count: "Count", min: "Minimum", max: "Maximum" };
const OPS = [
  { value: "contains", label: "contains" },
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "ge", label: "≥" },
  { value: "le", label: "≤" },
  { value: "empty", label: "is empty" },
  { value: "filled", label: "is not empty" },
];
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;
const isErr = (v) => typeof v === "string" && v.startsWith("#");

/** A value as a sortable/comparable thing: a number, a date's time, or lower-case text. */
function comparable(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v ?? "").trim();
  if (s !== "" && !Number.isNaN(Number(s.replace(/,/g, "")))) return Number(s.replace(/,/g, ""));
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime();
  return s.toLowerCase();
}
function matches(v, op, want) {
  const blank = v === "" || v === null || v === undefined;
  if (op === "empty") return blank;
  if (op === "filled") return !blank;
  if (op === "contains") return String(display(v)).toLowerCase().includes(String(want ?? "").toLowerCase());
  const a = comparable(v);
  const b = comparable(want);
  const cmp = typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : String(a).localeCompare(String(b));
  return { eq: cmp === 0, ne: cmp !== 0, gt: cmp > 0, lt: cmp < 0, ge: cmp >= 0, le: cmp <= 0 }[op] ?? true;
}

// ── the columns designer ──────────────────────────────────────────────────────────

function ColumnsDesigner({ open, onClose, columns, rows, onSave, saving }) {
  const [draft, setDraft] = useState(columns);
  // Each opening starts from the saved design.
  useEffect(() => {
    if (open) setDraft(columns.map((c) => ({ ...c })));
  }, [open, columns]);
  const set = (i, patch) => setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, by) =>
    setDraft((d) => {
      const n = [...d];
      const [c] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + by)), 0, c);
      return n;
    });
  const add = (type = "text") => setDraft((d) => [...d, { key: "", name: `Column ${d.length + 1}`, type, ...(type === "formula" ? { formula: "=" } : {}) }]);

  // Each formula checked against the draft, with the first row's value as a preview.
  const preview = useMemo(() => {
    const keyed = draft.map((c, i) => ({ ...c, key: c.key || `new${i}` }));
    const { rows: out, errors } = computeRows(keyed, rows.slice(0, 1));
    return keyed.map((c) => {
      if (c.type !== "formula") return null;
      if (errors.has(c.key)) return { error: errors.get(c.key) };
      const v = out[0]?.values?.[c.key];
      return isErr(v) ? { error: v.slice(1) } : { value: out.length ? display(v) : null };
    });
  }, [draft, rows]);

  const names = draft.map((c) => c.name).filter(Boolean);
  return (
    <Drawer
      title="Columns"
      open={open}
      onClose={onClose}
      width="min(760px, 96vw)"
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={() => onSave(draft)}>
            Save columns
          </Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        A column is a name and a kind of value. A <b>formula</b> column is worked out for each row from its other columns — write it as in Excel, naming
        columns in square brackets: <code>=[Target] - [Done]</code>, <code>=PERCENT([Done], [Target])</code>, <code>{'=IF([Status] = "Done", 1, 0)'}</code>.
      </Text>
      <div className="ct-design">
        {draft.map((c, i) => (
          <div key={c.key || `new${i}`} className="ct-design-col">
            <div className="ct-design-row">
              <Input value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Column name" style={{ flex: 2 }} maxLength={60} />
              <Select value={c.type} onChange={(type) => set(i, { type, ...(type === "formula" && !c.formula ? { formula: "=" } : {}) })} style={{ width: 130 }} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              <Select
                allowClear
                placeholder="Total"
                value={c.total || undefined}
                onChange={(total) => set(i, { total: total || undefined })}
                style={{ width: 120 }}
                options={Object.entries(TOTAL_LABEL).map(([value, label]) => ({ value, label }))}
              />
              <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
              <Button size="small" icon={<ArrowDownOutlined />} disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
              <Popconfirm title="Remove this column?" description="Its values stay saved; adding a column of the same name does not bring them back." onConfirm={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove column" />
              </Popconfirm>
            </div>
            {c.type === "select" && (
              <Select mode="tags" value={c.options || []} onChange={(options) => set(i, { options })} placeholder="The choices — type one, press Enter" style={{ width: "100%", marginTop: 8 }} tokenSeparators={[","]} />
            )}
            {c.type === "formula" && (
              <div className="ct-formula">
                <Input
                  value={c.formula}
                  onChange={(e) => set(i, { formula: e.target.value })}
                  placeholder="=[Target] - [Done]"
                  prefix={<FunctionOutlined />}
                  spellCheck={false}
                  status={preview[i]?.error ? "error" : undefined}
                />
                <Space size={6} wrap style={{ marginTop: 6 }}>
                  <Dropdown menu={{ items: names.filter((n) => n !== c.name).map((n) => ({ key: n, label: n })), onClick: ({ key }) => set(i, { formula: `${c.formula || "="}[${key}]` }) }}>
                    <Button size="small">Insert column</Button>
                  </Dropdown>
                  <Dropdown menu={{ items: Object.entries(FUNCTIONS).map(([k, f]) => ({ key: k, label: <span title={f.help}>{f.help}</span> })), onClick: ({ key }) => set(i, { formula: `${c.formula || "="}${key}(` }), style: { maxHeight: 320, overflow: "auto" } }}>
                    <Button size="small">Insert function</Button>
                  </Dropdown>
                  {preview[i]?.error ? (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {preview[i].error}
                    </Text>
                  ) : preview[i]?.value !== null && preview[i]?.value !== undefined ? (
                    <Text type="success" style={{ fontSize: 12 }}>
                      first row: {String(preview[i].value) || "(empty)"}
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      reads well
                    </Text>
                  )}
                </Space>
              </div>
            )}
          </div>
        ))}
      </div>
      <Space wrap style={{ marginTop: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => add("text")}>
          Add a column
        </Button>
        <Button icon={<FunctionOutlined />} onClick={() => add("formula")}>
          Add a formula column
        </Button>
      </Space>
    </Drawer>
  );
}

// ── pasting rows from Excel ──────────────────────────────────────────────────────

function PasteRows({ open, onClose, columns, onAdd, adding }) {
  const [textValue, setTextValue] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const editable = columns.filter((c) => c.type !== "formula");
  const lines = textValue.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const grid = lines.map((l) => l.split("\t"));
  // With a header line, columns are matched by name; without, in order.
  const head = hasHeader ? grid[0] || [] : [];
  const map = hasHeader ? head.map((h) => editable.find((c) => c.name.toLowerCase() === String(h).trim().toLowerCase())) : editable;
  const body = hasHeader ? grid.slice(1) : grid;
  const rows = body.map((cells) => ({ values: Object.fromEntries(cells.map((v, i) => [map[i]?.key, v.trim()]).filter(([k]) => k)) }));
  const matched = map.filter(Boolean).length;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Paste rows from Excel"
      okText={`Add ${rows.length} row(s)`}
      okButtonProps={{ disabled: !rows.length || !matched, loading: adding }}
      onOk={() => onAdd(rows, () => setTextValue(""))}
      width="min(760px, 96vw)"
      destroyOnHidden
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        Copy the cells in Excel (with their heading row, if you like), click in the box, and press Ctrl+V. Formula columns are worked out, not pasted.
      </Text>
      <Input.TextArea value={textValue} onChange={(e) => setTextValue(e.target.value)} autoSize={{ minRows: 6, maxRows: 14 }} placeholder="Paste here" spellCheck={false} style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }} />
      <Space style={{ marginTop: 8 }} wrap>
        <Checkbox checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)}>
          The first line is the column names
        </Checkbox>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {rows.length} row(s) · {matched} of {editable.length} column(s) matched{hasHeader && head.length > matched ? ` — not matched: ${head.filter((_, i) => !map[i]).join(", ")}` : ""}
        </Text>
      </Space>
    </Modal>
  );
}

// ── the table ─────────────────────────────────────────────────────────────────────

export default function CustomTable({ id, label }) {
  const queryClient = useQueryClient();
  const key = ["ucds", "custom-table", id];
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: key, queryFn: () => readTable(id) });
  const [designing, setDesigning] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState({ key: null, order: null });
  const [showTotals, setShowTotals] = useState(true);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null); // { rowId, key }

  const columns = useMemo(() => data?.columns || [], [data]);
  const canEdit = data?.canEdit === true;
  const computed = useMemo(() => computeRows(columns, data?.rows || []), [columns, data]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = computed.rows.filter((r) => (!s || columns.some((c) => String(display(r.values[c.key])).toLowerCase().includes(s))) && filters.every((f) => !f.col || matches(r.values[f.col], f.op, f.value)));
    if (sort.key && sort.order) {
      const dir = sort.order === "ascend" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = comparable(a.values[sort.key]);
        const y = comparable(b.values[sort.key]);
        if (x === y) return 0;
        if (x === "" || x === null) return 1;
        if (y === "" || y === null) return -1;
        return (typeof x === typeof y ? (x < y ? -1 : 1) : String(x).localeCompare(String(y))) * dir;
      });
    }
    return list;
  }, [computed, q, filters, sort, columns]);
  const totals = useMemo(() => Object.fromEntries(columns.filter((c) => c.total).map((c) => [c.key, aggregate(c.total, shown.map((r) => r.values[c.key]))])), [columns, shown]);

  const patchCache = (fn) => queryClient.setQueryData(key, (old) => (old ? fn(old) : old));
  const saveCols = useMutation({
    mutationFn: (cols) => saveColumns(id, cols),
    onSuccess: (cols) => {
      patchCache((old) => ({ ...old, columns: cols }));
      setDesigning(false);
      message.success("Columns saved.");
    },
    onError: (e) => message.error(errMsg(e, "The columns could not be saved.")),
  });
  const add = useMutation({
    mutationFn: (rows) => addRows(id, rows),
    onSuccess: (r) => patchCache((old) => ({ ...old, rows: [...old.rows, ...r.rows] })),
    onError: (e) => message.error(errMsg(e, "The rows could not be added.")),
  });
  const update = useMutation({
    mutationFn: ({ rowId, values }) => updateRow(id, rowId, values),
    onMutate: ({ rowId, values }) => patchCache((old) => ({ ...old, rows: old.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, ...values } } : r)) })),
    onError: (e) => {
      message.error(errMsg(e, "The change could not be saved."));
      refetch();
    },
  });
  const remove = useMutation({
    mutationFn: (ids) => deleteRows(id, ids),
    onSuccess: (r, ids) => {
      patchCache((old) => ({ ...old, rows: old.rows.filter((x) => !ids.includes(x.id)) }));
      setSelected([]);
      message.success(`${r.deleted} row(s) deleted.`);
    },
    onError: (e) => message.error(errMsg(e, "The rows could not be deleted.")),
  });

  if (isLoading) return null;
  if (isError) return <Alert type="error" showIcon message={errMsg(error, "The table could not be loaded.")} action={<Button size="small" onClick={() => refetch()}>Try again</Button>} />;

  const commit = (row, col, value) => {
    setEditing(null);
    if ((row.values[col.key] ?? "") === value) return;
    update.mutate({ rowId: row.id, values: { [col.key]: value } });
  };

  // A cell: its value, or — clicked, by someone who may edit — its editor.
  const cell = (row, col) => {
    const v = row.values[col.key];
    if (col.type === "checkbox") return <Checkbox checked={v === true} disabled={!canEdit} onChange={(e) => commit(row, col, e.target.checked)} />;
    const isEditing = editing?.rowId === row.id && editing?.key === col.key;
    if (isEditing && canEdit && col.type !== "formula") {
      if (col.type === "number")
        return <InputNumber autoFocus size="small" defaultValue={v === "" ? null : v} style={{ width: "100%" }} onBlur={(e) => commit(row, col, e.target.value === "" ? "" : Number(String(e.target.value).replace(/,/g, "")))} onPressEnter={(e) => e.currentTarget.blur()} />;
      if (col.type === "date") return <FullDate value={v} onChange={(d) => commit(row, col, d)} />;
      if (col.type === "select")
        return <Select autoFocus open size="small" defaultValue={v || undefined} style={{ width: "100%" }} allowClear options={(col.options || []).map((o) => ({ value: o, label: o }))} onChange={(x) => commit(row, col, x ?? "")} onBlur={() => setEditing(null)} />;
      return <Input autoFocus size="small" defaultValue={v} onBlur={(e) => commit(row, col, e.target.value)} onPressEnter={(e) => e.currentTarget.blur()} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />;
    }
    const shownValue = display(v);
    return (
      <div
        className={`ct-cell${canEdit && col.type !== "formula" ? " is-editable" : ""}${col.type === "number" || typeof v === "number" ? " is-num" : ""}${isErr(v) ? " is-error" : ""}`}
        onClick={() => canEdit && col.type !== "formula" && setEditing({ rowId: row.id, key: col.key })}
        title={isErr(v) ? v.slice(1) : undefined}
      >
        {shownValue === "" ? <span className="ct-blank">—</span> : String(shownValue)}
      </div>
    );
  };

  const tableColumns = columns.map((c) => ({
    key: c.key,
    dataIndex: ["values", c.key],
    width: c.width || (c.type === "text" || c.type === "formula" ? 180 : c.type === "checkbox" ? 90 : 130),
    sorter: true,
    sortOrder: sort.key === c.key ? sort.order : null,
    title: (
      <Space size={4}>
        {c.type === "formula" && (
          <Tooltip title={computed.errors.get(c.key) ? `This formula cannot be read: ${computed.errors.get(c.key)}` : c.formula}>
            <FunctionOutlined className={computed.errors.get(c.key) ? "ct-fx-bad" : "ct-fx"} />
          </Tooltip>
        )}
        <span>{c.name}</span>
      </Space>
    ),
    render: (_, row) => cell(row, c),
  }));

  // What is shown, as a grid: for the Excel and CSV exports and the clipboard.
  const asGrid = () => ({
    headers: columns.map((c) => c.name),
    rows: shown.map((r) => columns.map((c) => {
      const v = r.values[c.key];
      return typeof v === "number" || typeof v === "boolean" ? v : String(display(v));
    })),
    totals: showTotals && Object.keys(totals).length ? columns.map((c, i) => (c.key in totals ? totals[c.key] : i === 0 ? "TOTAL" : "")) : null,
  });
  const exportExcel = async () => {
    try {
      const n = await exportTable(id, asGrid());
      message.success(`Exported ${n} row(s) to Excel.`);
    } catch (e) {
      message.error(errMsg(e, "The export failed."));
    }
  };
  const exportCsv = () => {
    const g = asGrid();
    const csv = Papa.unparse([g.headers, ...g.rows, ...(g.totals ? [g.totals] : [])]);
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(label || "table").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const copyShown = async () => {
    const g = asGrid();
    const tsv = [g.headers, ...g.rows, ...(g.totals ? [g.totals] : [])].map((r) => r.map((v) => String(v ?? "").replace(/[\t\n]/g, " ")).join("\t")).join("\n");
    if (await copyText(tsv)) message.success(`Copied ${g.rows.length} row(s) — paste them into Excel.`);
    else message.info("The browser would not copy it — use Export instead.");
  };

  const noColumns = !columns.length;

  return (
    <div className="ct">
      <div className="ct-bar">
        <Space size={8} wrap>
          <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="Search the table" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} disabled={noColumns} />
          <Button size="small" icon={<FilterOutlined />} disabled={noColumns} onClick={() => setFilters((f) => [...f, { id: Date.now(), col: columns[0]?.key, op: "contains", value: "" }])}>
            Add filter
          </Button>
          {Object.keys(totals).length > 0 && (
            <Space size={4}>
              <Switch size="small" checked={showTotals} onChange={setShowTotals} />
              <Text style={{ fontSize: 12.5 }}>Totals</Text>
            </Space>
          )}
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {shown.length === computed.rows.length ? `${computed.rows.length} row(s)` : `${shown.length} of ${computed.rows.length} row(s)`}
          </Text>
        </Space>
        <Space size={6} wrap>
          {canEdit && (
            <>
              <Button size="small" type="primary" icon={<PlusOutlined />} disabled={noColumns} loading={add.isPending} onClick={() => add.mutate([{ values: {} }])}>
                Add row
              </Button>
              <Button size="small" icon={<SnippetsOutlined />} disabled={noColumns} onClick={() => setPasting(true)}>
                Paste rows
              </Button>
              <Button size="small" icon={<SettingOutlined />} onClick={() => setDesigning(true)}>
                Columns
              </Button>
              {selected.length > 0 && (
                <Popconfirm title={`Delete ${selected.length} row(s)?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(selected)}>
                  <Button size="small" danger icon={<DeleteOutlined />} loading={remove.isPending}>
                    Delete ({selected.length})
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
          {data.canExport !== false && (
            <Dropdown
              disabled={noColumns}
              menu={{
                items: [
                  { key: "xlsx", icon: <DownloadOutlined />, label: "Excel (.xlsx) — what is shown", onClick: exportExcel },
                  { key: "csv", icon: <DownloadOutlined />, label: "CSV — what is shown", onClick: exportCsv },
                  { key: "copy", icon: <CopyOutlined />, label: "Copy, to paste into Excel", onClick: copyShown },
                ],
              }}
            >
              <Button size="small" icon={<DownloadOutlined />}>
                Export
              </Button>
            </Dropdown>
          )}
          <Tooltip title="VERA explains columns, formulas, filters and exports">
            <Button size="small" icon={<MessageOutlined />} onClick={() => openVera(noColumns ? "How do I set up the columns of my table?" : "How do I write a formula in my table?")}>
              Ask VERA
            </Button>
          </Tooltip>
        </Space>
      </div>

      {filters.length > 0 && (
        <div className="ct-filters">
          {filters.map((f) => (
            <Space key={f.id} size={4} className="ct-filter">
              <Select size="small" value={f.col} style={{ width: 160 }} options={columns.map((c) => ({ value: c.key, label: c.name }))} onChange={(col) => setFilters((all) => all.map((x) => (x.id === f.id ? { ...x, col } : x)))} />
              <Select size="small" value={f.op} style={{ width: 120 }} options={OPS} onChange={(op) => setFilters((all) => all.map((x) => (x.id === f.id ? { ...x, op } : x)))} />
              {!["empty", "filled"].includes(f.op) &&
                (columns.find((c) => c.key === f.col)?.type === "select" ? (
                  <Select size="small" value={f.value || undefined} style={{ width: 160 }} placeholder="value" options={(columns.find((c) => c.key === f.col)?.options || []).map((o) => ({ value: o, label: o }))} onChange={(value) => setFilters((all) => all.map((x) => (x.id === f.id ? { ...x, value } : x)))} />
                ) : (
                  <Input size="small" value={f.value} style={{ width: 160 }} placeholder="value" onChange={(e) => setFilters((all) => all.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))} />
                ))}
              <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => setFilters((all) => all.filter((x) => x.id !== f.id))} aria-label="Remove filter" />
            </Space>
          ))}
          <Button size="small" type="link" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      )}

      {noColumns ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={4}>
              <Text strong>No columns yet.</Text>
              <Text type="secondary">Design the table first: name its columns and choose what each holds — text, a number, a date, a choice, yes/no, or a formula.</Text>
            </Space>
          }
        >
          {canEdit ? (
            <Button type="primary" icon={<SettingOutlined />} onClick={() => setDesigning(true)}>
              Design the columns
            </Button>
          ) : (
            <Text type="secondary">An account that may manage the data designs it.</Text>
          )}
        </Empty>
      ) : (
        <Table
          size="small"
          bordered
          rowKey="id"
          className="ct-table"
          columns={tableColumns}
          dataSource={shown}
          tableLayout="fixed"
          scroll={{ x: "max-content" }}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200], size: "small", showTotal: (t) => `${t} row(s)` }}
          rowSelection={canEdit ? { selectedRowKeys: selected, onChange: (k) => setSelected(k), columnWidth: 36 } : undefined}
          onChange={(_, __, sorter) => setSort({ key: sorter?.columnKey || null, order: sorter?.order || null })}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={computed.rows.length ? "No row matches the search or filters." : canEdit ? "No rows yet — Add row, or Paste rows from Excel." : "No rows yet."} /> }}
          summary={() =>
            showTotals && Object.keys(totals).length ? (
              <Table.Summary fixed>
                <Table.Summary.Row className="ct-total-row">
                  {canEdit && <Table.Summary.Cell index={0} />}
                  {columns.map((c, i) => (
                    <Table.Summary.Cell key={c.key} index={i + (canEdit ? 1 : 0)} align={c.key in totals ? "right" : "left"}>
                      {c.key in totals ? (
                        <Tooltip title={TOTAL_LABEL[c.total]}>
                          <b>{String(display(totals[c.key]))}</b>
                        </Tooltip>
                      ) : i === 0 ? (
                        <b>TOTAL</b>
                      ) : null}
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      )}

      <ColumnsDesigner open={designing} onClose={() => setDesigning(false)} columns={columns} rows={data?.rows || []} saving={saveCols.isPending} onSave={(cols) => saveCols.mutate(cols)} />
      <PasteRows
        open={pasting}
        onClose={() => setPasting(false)}
        columns={columns}
        adding={add.isPending}
        onAdd={(rows, done) =>
          add.mutate(rows, {
            onSuccess: (r) => {
              message.success(`${r.rows.length} row(s) added.`);
              done();
              setPasting(false);
            },
          })
        }
      />
    </div>
  );
}

