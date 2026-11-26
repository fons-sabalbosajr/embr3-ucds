/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Checkbox, Divider, Dropdown, Empty, Input, Popover, Select, Space, Table, Tabs, Tag, Tooltip, Typography,
  theme as antdTheme,
} from "antd";
import {
  ClearOutlined, CopyOutlined, DatabaseOutlined, DeleteOutlined, DownloadOutlined, FilterOutlined, PlusOutlined, ReloadOutlined,
  TableOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";
import { withSessionToken } from "../../../shared/sessionToken";
import { message } from "../../../shared/feedback";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The legacy ERMS data explorer (Storage › SQL Server › Open data explorer).
//
// Read-only. The server pages, sorts and filters on the SQL Server itself
// (services/legacySql.js queryTable), so a table of any size opens at once,
// and an export streams the whole filtered result straight to a file
// (exportTable). This screen sends only names it was given by the server
// and values; it never builds SQL. Opening a table and every export are in
// the audit trail (Admin Settings › Audit Logs › Admin).
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
const json = async (res) => res.json().catch(() => ({}));

const OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "equals", label: "is" },
  { value: "notEquals", label: "is not" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "empty", label: "is empty", noValue: true },
  { value: "notEmpty", label: "is not empty", noValue: true },
  { value: "gt", label: "after / greater than" },
  { value: "lt", label: "before / less than" },
];
const NO_VALUE = new Set(OPERATORS.filter((o) => o.noValue).map((o) => o.value));

const EXPORTS = [
  { key: "csv", label: "CSV (.csv)", note: "up to 500,000 rows" },
  { key: "xlsx", label: "Excel (.xlsx)", note: "up to 100,000 rows" },
  { key: "json", label: "JSON (.json)", note: "up to 500,000 rows" },
];

const cellText = (v) => (v == null ? "" : String(v));
const toCsv = (columns, rows) => {
  const cell = (v) => {
    const s = cellText(v);
    return /[",\r\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(cell).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
};

/** The filter builder: column, operator, value, any number of rows. */
const FilterBuilder = ({ columns, value, onApply }) => {
  const [rows, setRows] = useState(value.length ? value : [{ column: columns[0]?.name, op: "contains", value: "" }]);
  const usable = columns.filter((c) => !c.binary);
  const set = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Space direction="vertical" style={{ width: 560, maxWidth: "80vw" }}>
      {rows.map((r, i) => (
        <Space key={i} wrap size={6}>
          <Select
            showSearch
            value={r.column}
            onChange={(column) => set(i, { column })}
            style={{ width: 190 }}
            options={usable.map((c) => ({ value: c.name, label: c.name }))}
          />
          <Select value={r.op} onChange={(op) => set(i, { op })} style={{ width: 160 }} options={OPERATORS} />
          {!NO_VALUE.has(r.op) && (
            <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Value" style={{ width: 150 }} onPressEnter={() => onApply(rows)} />
          )}
          <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove filter" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} />
        </Space>
      ))}
      <Space>
        <Button icon={<PlusOutlined />} onClick={() => setRows((list) => [...list, { column: usable[0]?.name, op: "contains", value: "" }])}>
          Add a filter
        </Button>
        <Button type="primary" onClick={() => onApply(rows.filter((r) => r.column && (NO_VALUE.has(r.op) || String(r.value).trim() !== "")))}>
          Apply
        </Button>
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }}>
        All filters must match. Values compare as text: for a date, use the form the table stores, e.g. 2024-05-31.
      </Text>
    </Space>
  );
};

const ColumnChooser = ({ columns, chosen, onChange }) => {
  const all = columns.map((c) => c.name);
  return (
    <Space direction="vertical" style={{ maxHeight: 360, overflow: "auto", minWidth: 220 }}>
      <Space>
        <Button size="small" onClick={() => onChange(all)}>All</Button>
        <Button size="small" onClick={() => onChange(all.slice(0, 1))}>None</Button>
      </Space>
      <Checkbox.Group value={chosen} onChange={(v) => onChange(v.length ? v : all.slice(0, 1))}>
        <Space direction="vertical">
          {columns.map((c) => (
            <Checkbox key={c.name} value={c.name}>
              {c.name} <Text type="secondary" style={{ fontSize: 11 }}>{c.type}</Text>
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
    </Space>
  );
};

const LegacySqlExplorer = ({ databases }) => {
  const { token } = antdTheme.useToken();
  const [db, setDb] = useState(databases[0]);
  const [tables, setTables] = useState([]);
  const [tableQuery, setTableQuery] = useState("");
  const [loadingTables, setLoadingTables] = useState(false);
  const [current, setCurrent] = useState(null); // { schema, table, columns }
  const [view, setView] = useState("data");
  const [error, setError] = useState(null);

  // The query
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    const res = await api(`/api/legacy-sql/tables?db=${encodeURIComponent(db)}`);
    const body = await json(res);
    setLoadingTables(false);
    if (!res.ok) {
      setTables([]);
      setError(body.message || "Could not list the tables.");
      return;
    }
    setTables(body.tables || []);
  }, [db]);

  useEffect(() => {
    setCurrent(null);
    setResult(null);
    loadTables();
  }, [loadTables]);

  const openTable = async (t) => {
    setError(null);
    setResult(null);
    const q = new URLSearchParams({ db, schema: t.schema, table: t.table });
    const res = await api(`/api/legacy-sql/table?${q}`);
    const body = await json(res);
    if (!res.ok) {
      setError(body.message || "Could not open the table.");
      return;
    }
    setSearch("");
    setFilters([]);
    setSort(null);
    setPage(1);
    setChosen(body.columns.filter((c) => !c.binary).map((c) => c.name));
    setCurrent({ schema: body.schema, table: body.table, columns: body.columns });
    setView("data");
  };

  const spec = useMemo(
    () =>
      current && {
        db,
        schema: current.schema,
        table: current.table,
        filters,
        search: search || undefined,
        sort: sort || undefined,
        columns: chosen,
      },
    [db, current, filters, search, sort, chosen]
  );

  const runQuery = useCallback(async () => {
    if (!spec) return;
    setLoading(true);
    setError(null);
    const res = await api("/api/legacy-sql/query", { method: "POST", body: JSON.stringify({ ...spec, page, pageSize }) });
    const body = await json(res);
    setLoading(false);
    if (!res.ok) {
      setError(body.message || "Could not read the table.");
      return;
    }
    setResult(body);
  }, [spec, page, pageSize]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const exportAs = (format) => {
    if (!spec) return;
    const url = withSessionToken(
      `${API_BASE_URL}/api/legacy-sql/export?format=${format}&spec=${encodeURIComponent(JSON.stringify(spec))}`
    );
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    message.info(`Preparing the ${format.toUpperCase()} file. It downloads when ready.`);
  };

  const copyPage = async () => {
    if (!result?.rows?.length) return;
    try {
      await navigator.clipboard.writeText(toCsv(result.columns, result.rows));
      message.success(`Copied ${result.rows.length} rows`);
    } catch {
      message.error("The browser did not allow copying.");
    }
  };

  const visibleTables = tables.filter((t) => `${t.schema}.${t.table}`.toLowerCase().includes(tableQuery.toLowerCase()));
  const active = filters.length + (search ? 1 : 0);

  const dataColumns = (result?.columns || []).map((c) => ({
    title: c,
    dataIndex: c,
    key: c,
    sorter: true,
    sortOrder: sort?.column === c ? (sort.dir === "desc" ? "descend" : "ascend") : null,
    ellipsis: { showTitle: false },
    width: 180,
    render: (v) =>
      v == null || v === "" ? (
        <Text type="secondary">—</Text>
      ) : (
        <Tooltip title={cellText(v)} placement="topLeft">
          <span>{cellText(v)}</span>
        </Tooltip>
      ),
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: token.margin, minHeight: "70vh" }}>
      {/* Tables */}
      <div style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, paddingRight: token.margin, minWidth: 0 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select value={db} onChange={setDb} style={{ width: "100%" }} options={databases.map((d) => ({ value: d, label: d }))} suffixIcon={<DatabaseOutlined />} />
          <Space.Compact style={{ width: "100%" }}>
            <Input allowClear placeholder="Find a table" value={tableQuery} onChange={(e) => setTableQuery(e.target.value)} />
            <Button icon={<ReloadOutlined />} loading={loadingTables} onClick={loadTables} aria-label="Refresh tables" />
          </Space.Compact>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {tables.length} tables
          </Text>
          <div style={{ maxHeight: "62vh", overflow: "auto" }}>
            {visibleTables.map((t) => {
              const selected = current && current.schema === t.schema && current.table === t.table;
              return (
                <div
                  key={`${t.schema}.${t.table}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTable(t)}
                  onKeyDown={(e) => e.key === "Enter" && openTable(t)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: token.borderRadius,
                    cursor: "pointer",
                    background: selected ? token.controlItemBgActive : "transparent",
                  }}
                >
                  <Text strong={selected} ellipsis style={{ minWidth: 0 }}>
                    <TableOutlined style={{ marginRight: 6, color: token.colorTextTertiary }} />
                    {t.schema === "dbo" ? t.table : `${t.schema}.${t.table}`}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, flex: "none" }}>
                    {t.rows == null ? "" : t.rows.toLocaleString()}
                  </Text>
                </div>
              );
            })}
            {!visibleTables.length && !loadingTables && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tables" />}
          </div>
        </Space>
      </div>

      {/* The open table */}
      <div style={{ minWidth: 0 }}>
        {error && <Alert type="error" showIcon closable message={error} style={{ marginBottom: 12 }} onClose={() => setError(null)} />}
        {!current ? (
          <Empty description="Choose a table on the left" style={{ marginTop: 80 }} />
        ) : (
          <>
            <Space style={{ marginBottom: 8 }} wrap>
              <Text strong style={{ fontSize: 16 }}>
                {db}.{current.schema}.{current.table}
              </Text>
              {result && (
                <Tag color={active ? "blue" : "default"}>
                  {result.total.toLocaleString()} row{result.total === 1 ? "" : "s"}
                  {active ? " match" : ""}
                </Tag>
              )}
            </Space>
            <Tabs
              activeKey={view}
              onChange={setView}
              items={[
                {
                  key: "data",
                  label: <span><TableOutlined /> Data</span>,
                  children: (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Space wrap>
                        <Input.Search
                          allowClear
                          placeholder="Search every column"
                          defaultValue={search}
                          onSearch={(v) => {
                            setSearch(v.trim());
                            setPage(1);
                          }}
                          style={{ width: 260 }}
                        />
                        <Popover
                          trigger="click"
                          open={filterOpen}
                          onOpenChange={setFilterOpen}
                          placement="bottomLeft"
                          title="Filters"
                          content={
                            <FilterBuilder
                              key={`${current.table}:${filters.length}`}
                              columns={current.columns}
                              value={filters}
                              onApply={(next) => {
                                setFilters(next);
                                setPage(1);
                                setFilterOpen(false);
                              }}
                            />
                          }
                        >
                          <Badge count={filters.length} size="small">
                            <Button icon={<FilterOutlined />}>Filters</Button>
                          </Badge>
                        </Popover>
                        <Popover
                          trigger="click"
                          placement="bottomLeft"
                          title="Columns to show and export"
                          content={<ColumnChooser columns={current.columns.filter((c) => !c.binary)} chosen={chosen} onChange={setChosen} />}
                        >
                          <Button icon={<UnorderedListOutlined />}>
                            Columns {chosen.length}/{current.columns.filter((c) => !c.binary).length}
                          </Button>
                        </Popover>
                        {active > 0 && (
                          <Button
                            icon={<ClearOutlined />}
                            onClick={() => {
                              setFilters([]);
                              setSearch("");
                              setSort(null);
                              setPage(1);
                            }}
                          >
                            Clear
                          </Button>
                        )}
                        <Divider type="vertical" />
                        <Tooltip title="Copy this page as CSV">
                          <Button icon={<CopyOutlined />} onClick={copyPage} disabled={!result?.rows?.length} />
                        </Tooltip>
                        <Dropdown
                          menu={{
                            items: EXPORTS.map((e) => ({ key: e.key, label: <Space>{e.label}<Text type="secondary" style={{ fontSize: 12 }}>{e.note}</Text></Space> })),
                            onClick: ({ key }) => exportAs(key),
                          }}
                        >
                          <Button type="primary" icon={<DownloadOutlined />}>
                            Export
                          </Button>
                        </Dropdown>
                        <Button icon={<ReloadOutlined />} loading={loading} onClick={runQuery} aria-label="Refresh" />
                      </Space>
                      {filters.length > 0 && (
                        <Space wrap size={4}>
                          {filters.map((f, i) => (
                            <Tag
                              key={i}
                              closable
                              onClose={() => {
                                setFilters((list) => list.filter((_, j) => j !== i));
                                setPage(1);
                              }}
                            >
                              {f.column} {OPERATORS.find((o) => o.value === f.op)?.label} {NO_VALUE.has(f.op) ? "" : `"${f.value}"`}
                            </Tag>
                          ))}
                        </Space>
                      )}
                      <Table
                        size="small"
                        bordered
                        rowKey={(_, i) => `${page}-${i}`}
                        loading={loading}
                        columns={dataColumns}
                        dataSource={result?.rows || []}
                        scroll={{ x: "max-content", y: "52vh" }}
                        onChange={(pagination, _f, sorter) => {
                          const s = Array.isArray(sorter) ? sorter[0] : sorter;
                          const nextSort = s?.order ? { column: s.field, dir: s.order === "descend" ? "desc" : "asc" } : null;
                          if (JSON.stringify(nextSort) !== JSON.stringify(sort)) {
                            setSort(nextSort);
                            setPage(1);
                          } else {
                            setPage(pagination.current);
                            setPageSize(pagination.pageSize);
                          }
                        }}
                        pagination={{
                          current: page,
                          pageSize,
                          total: result?.total || 0,
                          showSizeChanger: true,
                          pageSizeOptions: [25, 50, 100, 200, 500],
                          showTotal: (t, r) => `${r[0].toLocaleString()}–${r[1].toLocaleString()} of ${t.toLocaleString()}`,
                        }}
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={active ? "No rows match" : "The table is empty"} /> }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Read-only. Exports use the filters, search, sort and columns above. Password and photo columns are never shown or exported.
                      </Text>
                    </Space>
                  ),
                },
                {
                  key: "columns",
                  label: <span><UnorderedListOutlined /> Columns</span>,
                  children: (
                    <Table
                      size="small"
                      rowKey="name"
                      pagination={false}
                      dataSource={current.columns}
                      scroll={{ y: "60vh" }}
                      columns={[
                        { title: "Column", dataIndex: "name", render: (v) => <Text strong>{v}</Text> },
                        { title: "Type", dataIndex: "type", width: 140, render: (v, c) => <>{v}{c.binary && <Tag style={{ marginLeft: 6 }}>not shown</Tag>}</> },
                        { title: "Length", dataIndex: "maxLength", width: 100, render: (v) => (v == null ? "—" : v === -1 ? "max" : v) },
                        { title: "Can be empty", dataIndex: "nullable", width: 120, render: (v) => (v ? "yes" : "no") },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default LegacySqlExplorer;
