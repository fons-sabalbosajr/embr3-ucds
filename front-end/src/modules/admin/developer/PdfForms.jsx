import React, { useEffect, useState } from "react";
import { Typography, Card, Table, Button, Upload, Space, message, Modal } from "antd";
import { getPdfForms, uploadPdfForm, deletePdfForm, pdfFormPreviewUrl } from "../../../api/developerService";
import { UploadOutlined } from "@ant-design/icons";

const PdfForms = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getPdfForms();
      setItems(data.items || []);
    } catch (e) {
      message.error(e?.message || "Failed to load forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const columns = [
    { title: "Title", dataIndex: "title" },
    { title: "Original Name", dataIndex: "originalName" },
    { title: "Type", dataIndex: "mimetype", width: 160 },
    { title: "Size (KB)", dataIndex: "size", width: 110, render: (s) => Math.round((s||0)/102.4)/10 },
    { title: "Uploaded", dataIndex: "createdAt", width: 180, render: (d) => (d ? new Date(d).toLocaleString() : "") },
    {
      title: "Actions",
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => onPreview(record)}>Preview</Button>
          <Button size="small" danger onClick={() => onDelete(record)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const onPreview = (record) => {
    if (record.mimetype !== "application/pdf") {
      message.warning("Preview only supported for PDF files.");
      return;
    }
    const url = pdfFormPreviewUrl(record._id);
    window.open(url, "_blank");
  };

  const onDelete = (record) => {
    Modal.confirm({
      title: `Delete form ${record.title || record.originalName}?`,
      onOk: async () => {
        try {
          await deletePdfForm(record._id);
          message.success("Deleted");
          fetchData();
        } catch (e) {
          message.error(e?.message || "Delete failed");
        }
      }
    });
  };

  const beforeUpload = () => false; // prevent auto, we submit manually

  const handleUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await uploadPdfForm(formData);
      onSuccess && onSuccess();
      message.success("Uploaded");
      fetchData();
    } catch (e) {
      onError && onError(e);
      message.error(e?.message || "Upload failed");
    }
  };

  return (
    <Card title="Developer • PDF Forms" extra={
      <Upload multiple={false} beforeUpload={beforeUpload} customRequest={handleUpload} showUploadList={false}>
        <Button type="primary" icon={<UploadOutlined />}>Upload PDF/PSD</Button>
      </Upload>
    }>
      <Typography.Paragraph>
        Manage forms used in the app: list, add/enroll PSD forms, delete, and preview (PDF only).
      </Typography.Paragraph>
      <Table
        rowKey="_id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={{
          current: currentPage,
          pageSize,
          total: items.length,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
          onChange: (page, ps) => {
            setCurrentPage(page);
            setPageSize(ps);
          },
        }}
        locale={{
          emptyText: (
            <div style={{ textAlign: 'center' }}>
              <div>No forms yet.</div>
              <div style={{ marginTop: 8 }}>
                <Upload multiple={false} beforeUpload={beforeUpload} customRequest={handleUpload} showUploadList={false}>
                  <Button type="primary" icon={<UploadOutlined />}>Upload a PDF/PSD</Button>
                </Upload>
              </div>
            </div>
          ),
        }}
      />
    </Card>
  );
};

export default PdfForms;
