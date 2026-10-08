import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { message } from "../../../shared/feedback";
import { fetchCurrentUser } from "../../../api/universeService";
import { useYear } from "../../../context/YearContext";
import { useUcdsSettings } from "../../../context/UcdsSettingsContext";
import { API_BASE_URL } from "../../../config/api";
import { withSessionToken } from "../../../shared/sessionToken";
import ErrorCard from "../../../shared/components/ErrorCard";
import ContentLoading from "../../../shared/components/ContentLoading";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// One screen for every yearly spreadsheet.
//
// The year folder holds a dozen different tables — complaints, CNC validation,
// ESWM accomplishment, AQMS profile — with nothing in common but being
// tabular. Rather than a screen per spreadsheet, this one takes its columns
// from whatever was imported and asks the server for one page at a time:
// paging, search and sort all happen there, so a 30,000-row sheet costs the
// browser one page of rows.
//
// The year is never in the URL. It is the session's active container, which
// the sidebar switches before navigating here.
// ---------------------------------------------------------------------------

const api = (path, options = {}) =>
  fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...options });

const useDebounced = (value, ms) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

const DatasetPage = () => {
  const { key } = useParams();
  const { activeYear } = useYear();
  const [me, setMe] = useState(null);
  const { settings: ucdsSettings } = useUcdsSettings();
  const [dataset, setDataset] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 400);
  const [sort, setSort] = useState({ by: null, dir: "asc" });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | { row } | { row: null } for new
  const [form] = Form.useForm();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const requestId = useRef(0);

  const isDeveloper = me?.role === "developer";
  // Both switches are enforced by the server; here they only decide what to draw.
  const editingOn = ucdsSettings?.datasets?.editing !== false;
  const exportOn = ucdsSettings?.datasets?.export !== false;
  const canEdit = me?.capabilities?.canManageData === true && editingOn;

  useEffect(() => {
    fetchCurrentUser().then(setMe).catch(() => setMe({}));
  }, []);

  // The configured page size applies the moment it is saved, even to a table
  // that is already open; the selector on the screen still overrides it here.
  const configuredPageSize = ucdsSettings?.datasets?.pageSize;
  useEffect(() => {
    if (configuredPageSize) {
      setPageSize(configuredPageSize);
      setPage(1);
    }
  }, [configuredPageSize]);

  const loadDataset = useCallback(async () => {
    setNotFound(false);
    const res = await api(`/api/ucds/datasets/${encodeURIComponent(key)}`);
    if (res.status === 404) {
      setNotFound(true);
      setDataset(null);
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.message || "Could not load the dataset.");
      return;
    }
    setDataset(body.dataset);
    setSheet((s) => s && body.dataset.sheets.some((x) => x.name === s) ? s : body.dataset.sheets[0]?.name || null);
  }, [key]);

  useEffect(() => {
    setPage(1);
    setQuery("");
    setSort({ by: null, dir: "asc" });
    setLoading(true);
    loadDataset().finally(() => setLoading(false));
  }, [loadDataset]);

  const loadRows = useCallback(async () => {
    if (!dataset?.imported || !sheet) {
      setData({ items: [], total: 0 });
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    try {
      const params = new URLSearchParams({ sheet, page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (sort.by) {
        params.set("sortBy", sort.by);
        params.set("sortDir", sort.dir);
      }
      const res = await api(`/api/ucds/datasets/${encodeURIComponent(key)}/rows?${params}`);
      const body = await res.json().catch(() => ({}));
      if (id !== requestId.current) return; // a newer request has superseded this one
      if (!res.ok) {
        setError(body.message || "Could not load rows.");
        return;
      }
      setData({ items: body.items, total: body.total });
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [dataset, sheet, page, pageSize, q, sort, key]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const currentSheet = useMemo(() => dataset?.sheets?.find((s) => s.name === sheet) || null, [dataset, sheet]);

  const columns = useMemo(() => {
    const cols = (currentSheet?.columns || []).map((c) => ({
      title: c,
      dataIndex: ["data", c],
      key: c,
      ellipsis: true,
      width: 180,
      sorter: true,
      sortOrder: sort.by === c ? (sort.dir === "asc" ? "ascend" : "descend") : null,
      render: (v) => (v == null || v === "" ? <Text type="secondary">—</Text> : String(v)),
    }));
    if (canEdit) {
      cols.push({
        title: "",
        key: "actions",
        fixed: "right",
        width: 96,
        render: (_, row) => (
          <Space size={2}>
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
            <Popconfirm
              title="Delete this row?"
              description="This removes it from the dataset for this year. It cannot be undone."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(row)}
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSheet, sort, canEdit]);

  const openEdit = (row) => {
    form.resetFields();
    form.setFieldsValue(row ? { ...row.data } : {});
    setEditing({ row });
  };

  const save = async (values) => {
    setBusy(true);
    try {
      const isNew = !editing?.row;
      const res = await api(
        isNew
          ? `/api/ucds/datasets/${encodeURIComponent(key)}/rows`
          : `/api/ucds/datasets/${encodeURIComponent(key)}/rows/${editing.row._id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheet, data: values }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(body.message || "Could not save the row.");
        return;
      }
      message.success(isNew ? "Row added." : "Row saved.");
      setEditing(null);
      await loadRows();
      if (isNew) await loadDataset();
    } finally {
      setBusy(false);
    }
  };

  // A new column is empty on every existing row of the sheet; the value is
  // then supplied row by row through the editor.
  const addColumn = async () => {
    const name = newColumn.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await api(`/api/ucds/datasets/${encodeURIComponent(key)}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(body.message || "Could not add the column.");
        return;
      }
      message.success(`Column "${name}" added.`);
      setAddingColumn(false);
      setNewColumn("");
      await loadDataset();
      await loadRows();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const res = await api(`/api/ucds/datasets/${encodeURIComponent(key)}/rows/${row._id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      message.error(body.message || "Could not delete the row.");
      return;
    }
    message.success("Row deleted.");
    await loadRows();
    await loadDataset();
  };

  const runImport = () => {
    Modal.confirm({
      title: dataset?.imported ? `Re-import ${dataset.label}?` : `Import ${dataset?.label}?`,
      content: dataset?.imported
        ? "The rows currently in the application for this year are replaced by the spreadsheet in the data folder. Edits made here since the last import are lost."
        : "The spreadsheet in this year's data folder is read into the application. This takes a moment for large files.",
      okText: dataset?.imported ? "Replace and import" : "Import",
      okButtonProps: { danger: Boolean(dataset?.imported) },
      onOk: async () => {
        const res = await api(`/api/ucds/datasets/${encodeURIComponent(key)}/import`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          message.error(body.message || "Import failed.");
          return;
        }
        message.success(`Imported ${body.rowCount} rows across ${body.sheets.length} sheet(s).`);
        await loadDataset();
      },
    });
  };

  if (loading) return <ContentLoading />;

  if (notFound || !dataset) {
    return (
      <ErrorCard
        kind="notfound"
        code="404"
        title={`No "${key}" dataset in the ${activeYear} container`}
        description="Pick a dataset from the year's list in the sidebar. If the spreadsheet was added to the data folder recently, it appears within a minute."
        details={error || undefined}
      />
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <Card
        size="small"
        title={
          <Space size={10}>
            <span>{dataset.label}</span>
            <Tag>{activeYear}</Tag>
            {dataset.imported ? (
              <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                {dataset.rowCount.toLocaleString()} rows · imported {new Date(dataset.importedAt).toLocaleDateString()}
              </Text>
            ) : (
              <Tag color="orange">not imported</Tag>
            )}
          </Space>
        }
        extra={
          <Space wrap>
            {dataset.imported && exportOn && (
              <Button
                size="small"
                icon={<DownloadOutlined />}
                href={withSessionToken(`${API_BASE_URL}/api/ucds/datasets/${encodeURIComponent(key)}/export.csv${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ""}`)}
              >
                Export CSV
              </Button>
            )}
            {isDeveloper && (
              <Button size="small" icon={<CloudUploadOutlined />} onClick={runImport}>
                {dataset.imported ? "Re-import" : "Import"}
              </Button>
            )}
            {dataset.imported && canEdit && (
              <>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingColumn(true)}>
                  Add column
                </Button>
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>
                  Add row
                </Button>
              </>
            )}
          </Space>
        }
      >
        {!dataset.imported ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              isDeveloper
                ? `${dataset.fileCount} spreadsheet file(s) in this year's folder have not been imported yet.`
                : "This dataset has not been imported yet. Ask the system developer."
            }
          >
            {isDeveloper && (
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={runImport}>
                Import now
              </Button>
            )}
          </Empty>
        ) : (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              {dataset.sheets.length > 1 && (
                <Select placeholder="Sheet"
                  value={sheet}
                  onChange={(v) => {
                    setSheet(v);
                    setPage(1);
                    setSort({ by: null, dir: "asc" });
                  }}
                  style={{ minWidth: 220 }}
                  options={dataset.sheets.map((s) => ({ value: s.name, label: `${s.name} (${s.rows})` }))}
                />
              )}
              <Input.Search
                allowClear
                placeholder="Search this sheet"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                style={{ width: 280 }}
              />
              <Button icon={<ReloadOutlined />} onClick={loadRows} loading={busy}>
                Refresh
              </Button>
            </Space>

            <Table
              size="small"
              rowKey="_id"
              loading={busy}
              columns={columns}
              dataSource={data.items}
              scroll={{ x: Math.max(900, columns.length * 180) }}
              onChange={(pagination, _filters, sorter) => {
                setPage(pagination.current);
                setPageSize(pagination.pageSize);
                if (sorter && sorter.columnKey && sorter.order) {
                  setSort({ by: sorter.columnKey, dir: sorter.order === "ascend" ? "asc" : "desc" });
                } else {
                  setSort({ by: null, dir: "asc" });
                }
              }}
              pagination={{
                current: page,
                pageSize,
                total: data.total,
                showSizeChanger: true,
                pageSizeOptions: [25, 50, 100, 200],
                showTotal: (t, [a, b]) => `${a}–${b} of ${t.toLocaleString()}`,
                size: "small",
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={q ? "No rows match" : "No rows"} /> }}
            />
          </>
        )}
      </Card>

      <Modal
        open={addingColumn}
        title={`Add a column to ${sheet}`}
        okText="Add column"
        okButtonProps={{ disabled: !newColumn.trim() }}
        confirmLoading={busy}
        onOk={addColumn}
        onCancel={() => {
          setAddingColumn(false);
          setNewColumn("");
        }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text type="secondary">
            The column is added to every row of this sheet, empty. Fill it in row by row afterwards.
          </Text>
          <Input
            autoFocus
            maxLength={80}
            placeholder="Column name"
            value={newColumn}
            onChange={(e) => setNewColumn(e.target.value)}
            onPressEnter={addColumn}
          />
        </Space>
      </Modal>

      <Modal
        open={editing !== null}
        title={editing?.row ? "Edit row" : `Add a row to ${sheet}`}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="Save"
        confirmLoading={busy}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={save} style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 8 }}>
          {(currentSheet?.columns || []).map((c) => (
            <Form.Item key={c} name={c} label={c} style={{ marginBottom: 10 }}>
              <Input placeholder={c} allowClear />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Space>
  );
};

export default DatasetPage;
