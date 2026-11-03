import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Table, Spin, Alert, Empty, Tag, Typography } from "antd";
import moment from "moment";
import "./reportdrafts.css";
import { API_BASE_URL } from "../../../../../config/api";
import visibleInterval from "../../../../../shared/visibleInterval";

// The Reports log of the establishment open in the modal: the ICIR drafts
// saved for it, by anyone, newest first. It listed every draft the person
// had ever saved, for any establishment.
const ReportDrafts = ({ record }) => {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const recordId = record?._id || null;
  const title = record?.title || null;

  const fetchDraftReports = useCallback(async () => {
    if (!recordId && !title) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/api/draft-report`, { params: { recordId: recordId || undefined, title: title || undefined }, withCredentials: true });
      if (!Array.isArray(response.data)) throw new Error("Unexpected response format");
      setDrafts(
        response.data.map((draft) => ({
          reportId: draft._id,
          userName: draft.user?.name || "Unknown user",
          date: draft.date,
          purpose: draft.reportInfo?.purpose || null,
          title: draft.reportInfo?.title || "—",
          address: draft.reportInfo?.address || "—",
          fileName: draft.fileName || "",
          pdfUrl: draft.pdfUrl && draft.fileName ? `${API_BASE_URL}/api/files/${encodeURIComponent(draft.fileName)}` : null,
        }))
      );
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [recordId, title]);

  useEffect(() => {
    setLoading(true);
    fetchDraftReports();
    // Every 60 s while the tab is visible.
    return visibleInterval(fetchDraftReports, 60000);
  }, [fetchDraftReports]);

  const columns = [
    {
      title: "Date created / by",
      dataIndex: "date",
      key: "date",
      render: (date, row) => (
        <div>
          <div>{date ? moment(date).format("MMMM D, YYYY h:mm A") : "Unknown date"}</div>
          <Typography.Text type="secondary">{row.userName}</Typography.Text>
        </div>
      ),
    },
    { title: "Purpose", dataIndex: "purpose", key: "purpose", render: (p) => (p ? <Tag>{p}</Tag> : "—") },
    { title: "Address", dataIndex: "address", key: "address" },
    {
      title: "Draft file",
      dataIndex: "fileName",
      key: "fileName",
      render: (fileName, row) =>
        row.pdfUrl ? (
          <a href={row.pdfUrl} target="_blank" rel="noopener noreferrer">
            {fileName}
          </a>
        ) : (
          <Typography.Text type="secondary">{fileName || "—"} (no copy kept)</Typography.Text>
        ),
    },
  ];

  if (loading) return <Spin size="large" />;
  if (error) return <Alert message="The Reports log could not be loaded" description={error} type="error" />;

  return (
    <div>
      <div className="report-title">
        <h3>Report Logs — {title || record?.sort_key || "this establishment"}</h3>
        <p>The ICIR drafts saved for this establishment. Ensure the data is up to date before generating a report.</p>
      </div>
      {drafts.length ? <Table columns={columns} dataSource={drafts} rowKey="reportId" /> : <Empty description="No drafts saved for this establishment yet" />}
    </div>
  );
};

export default ReportDrafts;
