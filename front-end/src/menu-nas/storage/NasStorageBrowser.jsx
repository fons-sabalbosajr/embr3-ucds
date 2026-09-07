import React, { useState } from "react";
import { Form, Input, Button, Typography, Alert, Spin } from "antd";
import NasPdfViewer from "./NasPdfViewer";
import { API_BASE_URL } from "../../config/api";

// FileList is moved here or imported
const FileList = ({ onFileSelect }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    fetch(`${API_BASE_URL}/api/nas/files`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || "Failed to load files.");
          });
        }
        return res.json();
      })
      .then((data) => {
        setFiles(data.files || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <Spin size="large" tip="Loading files..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon />;
  }

  return (
    <div>
      <Typography.Text strong>Mapped Drive Files:</Typography.Text>
      <ul style={{ marginTop: 12 }}>
        {files.map((file) => (
          <li key={file}>
            {file}{" "}
            {file.endsWith(".pdf") && (
              <Button
                size="small"
                style={{ marginLeft: 8 }}
                onClick={() => onFileSelect(file)}
              >
                View PDF
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const { Title } = Typography;

const NasStorageBrowser = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPDF, setSelectedPDF] = useState(null);
  const [form] = Form.useForm();

  const handleLogin = async (values) => {
    setIsLoading(true);
    setError(null);

    const rawUsername = values.username.trim();
    let domain = "";
    let username = rawUsername;

    if (rawUsername.includes("\\")) {
      [domain, username] = rawUsername.split("\\");
    } else {
      // fallback to known domain or PC name
      domain = "EMBR3SYNOLOGY"; // <-- Adjust this if needed
    }

    const payload = {
      share: values.share.trim().replace(/^\\{1,2}/, "\\\\"),
      username,
      password: values.password,
      domain,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/nas/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      if (data.success) {
        setIsAuthenticated(true);
      } else {
        throw new Error(data.message || "Authentication failed.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <>
        <FileList onFileSelect={setSelectedPDF} />
        {selectedPDF && (
          <NasPdfViewer file={selectedPDF} onClose={() => setSelectedPDF(null)} />
        )}
      </>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ textAlign: "center" }}>
        Network Drive Authentication
      </Title>
      <Form form={form} layout="vertical" onFinish={handleLogin}>
        <Form.Item
          name="share"
          label="Network Share Path"
          rules={[{ required: true, message: "Enter network share path." }]}
        >
          <Input placeholder="\\\\10.14.76.167\\IDMS_Records_Database" />
        </Form.Item>

        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: "Enter your username." }]}
        >
          <Input placeholder="EMBR3SYNOLOG\\RecordsDB User" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: "Enter your password." }]}
        >
          <Input.Password />
        </Form.Item>

        {error && (
          <Alert
            message="Authentication Error"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={isLoading}
            block
          >
            Login
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default NasStorageBrowser;
