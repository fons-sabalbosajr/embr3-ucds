import { useEffect, useState } from "react";
import { Button, Typography, Alert, Spin, Empty } from "antd";
import NasPdfViewer from "./NasPdfViewer";
import { API_BASE_URL } from "../../config/api";

// The SMB login form was removed in Phase 2: the server now reaches the share
// with a service account, so no one types an SMB password into the browser.
// Being signed in to the application is what grants access.
// See docs/UNIFICATION-PLAN.md.

const NasStorageBrowser = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPdf, setSelectedPdf] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/nas/files`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message || "Could not read the records share."
          );
        }
        if (!cancelled) setFiles(data.files || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <Spin size="large" tip="Loading files..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Records share unavailable"
        description={error}
        type="error"
        showIcon
      />
    );
  }

  if (!files.length) {
    return <Empty description="No files on the share." />;
  }

  return (
    <div>
      <Typography.Text strong>Records share:</Typography.Text>
      <ul style={{ marginTop: 12 }}>
        {files.map((file) => (
          <li key={file}>
            {file}{" "}
            {file.toLowerCase().endsWith(".pdf") && (
              <Button
                size="small"
                style={{ marginLeft: 8 }}
                onClick={() => setSelectedPdf(file)}
              >
                View PDF
              </Button>
            )}
          </li>
        ))}
      </ul>
      {selectedPdf && (
        <NasPdfViewer
          file={selectedPdf}
          onClose={() => setSelectedPdf(null)}
        />
      )}
    </div>
  );
};

export default NasStorageBrowser;
