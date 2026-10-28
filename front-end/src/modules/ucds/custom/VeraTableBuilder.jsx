import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { message } from "../../../shared/feedback";
import { VeraFlame } from "../../vera/VeraMark";
import { buildTable, draftWithVera, getBuilderCatalog, previewBuild } from "./customTableService";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// VERA builds a Planning Unit table from the register.
//
// Say what you need — VERA drafts the columns, conditions and sort (or the
// per-group counts of a summary sheet) from the register's own fields and
// her permit check, never inventing one. The draft is a form: change any of
// it, preview the rows, then fill the table. Without the AI model the form
// is filled by hand. The table remembers how it was built, so "Refresh from
// the register" fills it again later.
// ---------------------------------------------------------------------------

const errMsg = (e, fallback) => e?.response?.data?.message || fallback;
const OP_LABEL = { eq: "is", ne: "is not", contains: "contains", in: "is one of", empty: "is empty", filled: "is filled", gt: ">", lt: "<", before: "before", after: "after", within_days: "within (days)" };
const EXAMPLES = [
  "Every establishment in Bulacan with an expired PTO: serial, name, city, PTO code and expiry, by city",
  "Firms whose discharge permit expires within 90 days, with their WWDP code and expiry",
  "How many establishments per province have a missing or expired permit, and how many have serious findings",
  "Poultry and piggery farms with their ECC, discharge permit, hazardous waste ID and section in charge",
];
const EMPTY_SPEC = { title: "", columns: [], filters: [], sort: null, limit: 2000 };

export default function VeraTableBuilder({ open, onClose, tableId, hasRows, onBuilt }) {
  const [request, setRequest] = useState("");
  const [spec, setSpec] = useState(EMPTY_SPEC);
  const [result, setResult] = useState(null); // { columns, rows, total, truncated, notes }

  useEffect(() => {
    if (!open) return;
    setResult(null);
  }, [open]);

  const { data: catalog } = useQuery({ queryKey: ["ucds", "table-builder", tableId], queryFn: () => getBuilderCatalog(tableId), enabled: open, staleTime: 10 * 60 * 1000 });
  const fields = useMemo(() => catalog?.fields || [], [catalog]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const fieldOptions = useMemo(() => {
    const groups = new Map();
    for (const f of fields) groups.set(f.group, [...(groups.get(f.group) || []), { value: f.key, label: f.label }]);
    return [...groups].map(([label, options]) => ({ label, options }));
  }, [fields]);

  const draft = useMutation({
    mutationFn: () => draftWithVera(tableId, request),
    onSuccess: (r) => {
      setSpec({ ...EMPTY_SPEC, ...r.spec });
      setResult(r);
    },
    onError: (e) => message.error(errMsg(e, "VERA could not draft that table.")),
  });
  const preview = useMutation({
    mutationFn: () => previewBuild(tableId, spec),
    onSuccess: (r) => {
      setSpec({ ...EMPTY_SPEC, ...r.spec });
      setResult(r);
    },
    onError: (e) => message.error(errMsg(e, "The preview could not be made.")),
  });
  const build = useMutation({
    mutationFn: () => buildTable(tableId, { spec }),
    onSuccess: (r) => {
      message.success(`VERA filled the table: ${r.rowCount} row(s)${r.truncated ? ` (the first ${r.rowCount} of ${r.total})` : ""}.`);
      onBuilt?.();
      onClose();
    },
    onError: (e) => message.error(errMsg(e, "The table could not be filled.")),
  });

  const set = (patch) => {
    setSpec((s) => ({ ...s, ...patch }));
    setResult((r) => (r ? { ...r, stale: true } : r));
  };
  const setAt = (key, i, patch) => set({ [key]: spec[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const removeAt = (key, i) => set({ [key]: spec[key].filter((_, j) => j !== i) });
  const move = (i, by) => {
    const n = [...spec.columns];
    const [c] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + by)), 0, c);
    set({ columns: n });
  };
  const grouped = Boolean(spec.group?.by?.length);
  const ready = spec.columns.length > 0 || grouped;

  const valueInput = (x, onChange) => {
    if (["empty", "filled"].includes(x.op)) return null;
    const f = byKey.get(x.field);
    if (f?.values?.length) {
      return (
        <Select
          size="small"
          mode={x.op === "in" ? "multiple" : undefined}
          showSearch
          allowClear
          style={{ minWidth: 180, flex: 1 }}
          value={x.op === "in" ? [].concat(x.value || []) : x.value || undefined}
          onChange={(v) => onChange(v ?? "")}
          options={f.values.map((v) => ({ value: v, label: v }))}
          placeholder="value"
        />
      );
    }
    if (["gt", "lt", "within_days"].includes(x.op)) return <InputNumber size="small" value={x.value === "" ? null : Number(x.value)} onChange={(v) => onChange(v ?? "")} style={{ width: 120 }} />;
    return <Input size="small" value={x.value} onChange={(e) => onChange(e.target.value)} placeholder={["before", "after"].includes(x.op) ? "m/d/yyyy" : "value"} style={{ minWidth: 160, flex: 1 }} />;
  };

  const previewColumns = (result?.columns || []).map((c) => ({
    title: c.type === "formula" ? `${c.name} (formula)` : c.name,
    dataIndex: ["values", c.name],
    key: c.name,
    width: 160,
    ellipsis: true,
    render: (v) => (c.type === "formula" ? <Text type="secondary">worked out in the table</Text> : String(v ?? "")),
  }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(1100px, 98vw)"
      destroyOnHidden
      title={
        <Space>
          <VeraFlame size={22} label="VERA" />
          Build this table with VERA
        </Space>
      }
      extra={
        <Space>
          <Button icon={<EyeOutlined />} disabled={!ready} loading={preview.isPending} onClick={() => preview.mutate()}>
            Preview
          </Button>
          <Popconfirm
            title="Fill the table from the register?"
            description={hasRows ? "Its columns and every row it holds now are replaced by what the preview shows." : "Its columns are set and the rows filled."}
            okText="Fill it"
            disabled={!ready}
            onConfirm={() => build.mutate()}
          >
            <Button type="primary" disabled={!ready} loading={build.isPending}>
              Create the table
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div>
          <Text strong>What do you need?</Text>
          <Input.TextArea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={600}
            placeholder="e.g. every establishment in Bulacan with an expired PTO, with its PTO code and expiry"
            style={{ marginTop: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey && request.trim().length > 3) {
                e.preventDefault();
                draft.mutate();
              }
            }}
          />
          <Space wrap size={[6, 6]} style={{ marginTop: 6 }}>
            {EXAMPLES.map((x) => (
              <Tag key={x} style={{ cursor: "pointer", whiteSpace: "normal" }} onClick={() => setRequest(x)}>
                {x}
              </Tag>
            ))}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Button type="primary" ghost icon={<SendOutlined />} loading={draft.isPending} disabled={request.trim().length < 4} onClick={() => draft.mutate()}>
              Draft it with VERA
            </Button>
            <Text type="secondary" style={{ marginInlineStart: 10, fontSize: 12 }}>
              VERA only chooses from the register&rsquo;s fields — she never sees or writes a record. Or fill the form below yourself.
            </Text>
          </div>
        </div>

        {result?.notes?.length > 0 && <Alert type="info" showIcon message="VERA's notes" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>} />}

        {/* The spec, as a form */}
        <div className="ct-design">
          <Text strong>{grouped ? "Summary — one row per" : "Columns"}</Text>
          {grouped ? (
            <Space direction="vertical" style={{ width: "100%", marginTop: 6 }}>
              <Select mode="multiple" maxCount={2} value={spec.group.by} onChange={(by) => set({ group: { ...spec.group, by } })} options={fieldOptions} style={{ width: "100%" }} placeholder="Group by…" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Each row counts the establishments; add a count for each condition to count among them.
              </Text>
              {(spec.group.counts || []).map((c, i) => (
                <Space key={i} wrap style={{ width: "100%" }}>
                  <Input size="small" value={c.name} onChange={(e) => set({ group: { ...spec.group, counts: spec.group.counts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } })} style={{ width: 200 }} placeholder="Column name" />
                  <Select size="small" value={c.field} options={fieldOptions} style={{ width: 230 }} showSearch optionFilterProp="label" onChange={(field) => set({ group: { ...spec.group, counts: spec.group.counts.map((x, j) => (j === i ? { ...x, field } : x)) } })} />
                  <Select size="small" value={c.op} style={{ width: 120 }} options={Object.entries(OP_LABEL).map(([value, label]) => ({ value, label }))} onChange={(op) => set({ group: { ...spec.group, counts: spec.group.counts.map((x, j) => (j === i ? { ...x, op } : x)) } })} />
                  {valueInput(c, (value) => set({ group: { ...spec.group, counts: spec.group.counts.map((x, j) => (j === i ? { ...x, value } : x)) } }))}
                  <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => set({ group: { ...spec.group, counts: spec.group.counts.filter((_, j) => j !== i) } })} aria-label="Remove count" />
                </Space>
              ))}
              <Space>
                <Button size="small" icon={<PlusOutlined />} onClick={() => set({ group: { ...spec.group, counts: [...(spec.group.counts || []), { name: `Count ${(spec.group.counts || []).length + 1}`, field: "vera_pto", op: "eq", value: "expired" }] } })}>
                  Add a count
                </Button>
                <Button size="small" type="link" onClick={() => set({ group: undefined })}>
                  Make it a list instead
                </Button>
              </Space>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: "100%", marginTop: 6 }}>
              {spec.columns.map((c, i) => (
                <Space key={i} wrap style={{ width: "100%" }}>
                  <Input size="small" value={c.name} onChange={(e) => setAt("columns", i, { name: e.target.value })} style={{ width: 220 }} placeholder="Column name" />
                  {c.formula !== undefined ? (
                    <Input size="small" value={c.formula} onChange={(e) => setAt("columns", i, { formula: e.target.value })} style={{ width: 320 }} placeholder="=[PTO expiry]" />
                  ) : (
                    <Select size="small" value={c.field} options={fieldOptions} style={{ width: 320 }} showSearch optionFilterProp="label" onChange={(field) => setAt("columns", i, { field, name: c.name || byKey.get(field)?.label })} />
                  )}
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={i === spec.columns.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
                  <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => removeAt("columns", i)} aria-label="Remove column" />
                </Space>
              ))}
              <Space wrap>
                <Select
                  size="small"
                  placeholder="Add a column from the register…"
                  value={null}
                  options={fieldOptions}
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 320 }}
                  onChange={(field) => set({ columns: [...spec.columns, { name: byKey.get(field)?.label || field, field }] })}
                />
                <Button size="small" onClick={() => set({ group: { by: ["province"], counts: [] } })}>
                  Make it a summary (counts per group)
                </Button>
              </Space>
            </Space>
          )}

          <Text strong style={{ display: "block", marginTop: 14 }}>
            Only the establishments where
          </Text>
          <Space direction="vertical" style={{ width: "100%", marginTop: 6 }}>
            {spec.filters.map((x, i) => (
              <Space key={i} wrap style={{ width: "100%" }}>
                <Select size="small" value={x.field} options={fieldOptions} style={{ width: 260 }} showSearch optionFilterProp="label" onChange={(field) => setAt("filters", i, { field, value: "" })} />
                <Select size="small" value={x.op} style={{ width: 130 }} options={Object.entries(OP_LABEL).map(([value, label]) => ({ value, label }))} onChange={(op) => setAt("filters", i, { op })} />
                {valueInput(x, (value) => setAt("filters", i, { value }))}
                <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => removeAt("filters", i)} aria-label="Remove condition" />
              </Space>
            ))}
            <Space wrap>
              <Button size="small" icon={<PlusOutlined />} onClick={() => set({ filters: [...spec.filters, { field: "province", op: "eq", value: "" }] })}>
                Add a condition
              </Button>
              {!grouped && (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Sort by
                  </Text>
                  <Select size="small" allowClear value={spec.sort?.field} options={fieldOptions} style={{ width: 220 }} showSearch optionFilterProp="label" onChange={(field) => set({ sort: field ? { field, dir: spec.sort?.dir || "asc" } : null })} />
                  <Select size="small" value={spec.sort?.dir || "asc"} disabled={!spec.sort} style={{ width: 110 }} options={[{ value: "asc", label: "A → Z" }, { value: "desc", label: "Z → A" }]} onChange={(dir) => set({ sort: { ...spec.sort, dir } })} />
                </>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                at most
              </Text>
              <InputNumber size="small" min={1} max={catalog?.maxRows || 2000} value={spec.limit} onChange={(limit) => set({ limit: limit || 2000 })} style={{ width: 90 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                rows
              </Text>
            </Space>
          </Space>
        </div>

        {/* The preview */}
        {result && result.columns?.length > 0 ? (
          <div>
            <Paragraph style={{ margin: "0 0 6px" }}>
              <Text strong>{result.total}</Text> {grouped ? "group(s)" : "establishment(s)"} match{result.truncated ? ` — the table takes the first ${spec.limit}` : ""}.{" "}
              {result.rows.length < result.total && <Text type="secondary">The first {result.rows.length} are shown here.</Text>}
              {result.stale && <Text type="warning"> Changed since — Preview again to see the rows.</Text>}
            </Paragraph>
            <Table size="small" bordered rowKey={(_, i) => i} columns={previewColumns} dataSource={result.rows} pagination={false} scroll={{ x: "max-content", y: 320 }} />
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Draft it with VERA, or choose columns and conditions, then Preview." />
        )}
      </Space>
    </Drawer>
  );
}
