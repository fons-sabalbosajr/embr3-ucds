import React, { useEffect, useMemo, useState } from "react";
import { Card, Table, Space, Button, Input, message, Modal, Select, Tag, DatePicker } from "antd";
import { getActivityLogs, updateActivityLog, deleteActivityLog } from "../api/developerService";

const ActivityHistoryConfig = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [actionType, setActionType] = useState("");
  const [method, setMethod] = useState("");
  const [pathQ, setPathQ] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState([null, null]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs({
        username: username || undefined,
        actionType: actionType || undefined,
        method: method || undefined,
        path: pathQ || undefined,
        start: dateRange?.[0] ? dateRange[0].toDate().toISOString() : undefined,
        end: dateRange?.[1] ? dateRange[1].toDate().toISOString() : undefined,
        limit: pageSize,
        skip: (currentPage - 1) * pageSize,
      });
      setItems(data.items || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.items || []).length);
    } catch (e) {
      message.error(e?.message || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (record) => {
    let newMsg = record.message || "";
    Modal.confirm({
      title: "Edit message",
      content: (
        <Input.TextArea defaultValue={newMsg} onChange={(e)=>{ newMsg = e.target.value; }} rows={4} />
      ),
      onOk: async () => {
        try {
          await updateActivityLog(record._id, { message: newMsg });
          message.success("Updated");
          fetchData();
        } catch (e) {
          message.error(e?.message || "Update failed");
        }
      },
    });
  };

  const onDelete = (record) => {
    Modal.confirm({
      title: "Delete this log?",
      onOk: async () => {
        try {
          await deleteActivityLog(record._id);
          message.success("Deleted");
          fetchData();
        } catch (e) {
          message.error(e?.message || "Delete failed");
        }
      },
    });
  };

  useEffect(() => { fetchData(); }, [username, actionType, method, pathQ, pageSize, currentPage, dateRange]);

  const columns = useMemo(() => [
    { title: "User", dataIndex: "username", width: 140 },
    { title: "Action", dataIndex: "actionType", width: 150 },
    { title: "Method", dataIndex: "method", width: 110, render: (m) => m ? <Tag color={m==='GET'?'blue':m==='POST'?'green':m==='PUT'?'orange':'purple'}>{m}</Tag> : '' },
    { title: "Path", dataIndex: "path", ellipsis: true },
    { title: "Action Label", dataIndex: "actionLabel", ellipsis: true },
    { title: "At", dataIndex: "timestamp", width: 190, render: (d, r) => {
        const t = r.timestamp || r.createdAt || r.date;
        return t ? new Date(t).toLocaleString() : '';
      }
    },
    {
      title: "Actions",
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => onEdit(record)}>Edit</Button>
          <Button size="small" danger onClick={() => onDelete(record)}>Delete</Button>
        </Space>
      ),
    },
  ], [onEdit, onDelete]);

  return (
    <Card title="Developer • Activity History Configuration" extra={
      <Space>
        <Input placeholder="Filter by username" allowClear value={username} onChange={(e)=>setUsername(e.target.value)} style={{ width: 220 }} />
        <Input placeholder="Filter by action type" allowClear value={actionType} onChange={(e)=>setActionType(e.target.value)} style={{ width: 220 }} />
        <Select placeholder="Method" allowClear style={{ width: 140 }} value={method} onChange={setMethod} options={[{value:'GET'},{value:'POST'},{value:'PUT'},{value:'PATCH'}]} />
        <Input placeholder="Path contains" allowClear value={pathQ} onChange={(e)=>setPathQ(e.target.value)} style={{ width: 240 }} />
        <DatePicker.RangePicker
          allowEmpty={[true, true]}
          value={dateRange}
          onChange={(val)=>{ setDateRange(val || [null,null]); setCurrentPage(1); }}
          style={{ width: 320 }}
          showTime
        />
        <Button onClick={fetchData}>Refresh</Button>
      </Space>
    }>
      <Table
        rowKey="_id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              <div><strong>User ID:</strong> {record.userId || '-'}</div>
              <div><strong>Request Body:</strong></div>
              <pre style={{ margin: 0 }}>{JSON.stringify(record.requestData || {}, null, 2)}</pre>
            </div>
          ),
          rowExpandable: () => true,
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
          onChange: (page, ps) => {
            setCurrentPage(page);
            setPageSize(ps);
          },
        }}
      />
    </Card>
  );
};

export default ActivityHistoryConfig;
