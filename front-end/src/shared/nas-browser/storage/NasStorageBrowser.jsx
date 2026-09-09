import { useEffect, useState } from "react";
import { Alert, Empty, List, Space, Spin, Tag, Typography } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../../../config/api";

const { Text, Paragraph } = Typography;

// The SMB login form was removed in Phase 2: the server reaches the share with
// a service account, so no one types an SMB password into the browser. Being
// signed in to the application is what grants access.
//
// In Phase 7 this stopped being a file browser. It lists the share root only,
// as a diagnostic — one level, no navigation. Walking the share from a browser
// was the "browse arbitrary NAS directories" capability the design forbids,
// and nobody needs it: documents are reached through their record. Reading the
// root is developer-only and behind the same emailed code as the rest of the
// share configuration.
//
// See docs/UNIFICATION-PLAN.md, Phase 7.

const NasStorageBrowser = () => {
  const [entries, setEntries] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/nas/files`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.code === "ELEVATION_REQUIRED" || data.code === "ELEVATION_EXPIRED"
              ? "Verify by email on the NAS Settings screen to read the share."
              : data.message || "Could not read the records share."
          );
        }
        if (!cancelled) {
          setEntries(data.entries || []);
          setCount(data.entryCount ?? (data.entries || []).length);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Alert type="warning" showIcon message="Share not readable" description={error} />;
  }

  if (!entries.length) {
    return <Empty description="Nothing at the share root" />;
  }

  return (
    <>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        The top level of the records share, shown to confirm the server is
        reading the right place. Documents are opened from their record, not
        from here.
      </Paragraph>
      <List
        size="small"
        bordered
        dataSource={entries}
        header={
          <Text strong>
            Share root <Tag>{count} entries</Tag>
          </Text>
        }
        renderItem={(name) => (
          <List.Item>
            <Space>
              <FolderOutlined />
              <Text>{name}</Text>
            </Space>
          </List.Item>
        )}
      />
    </>
  );
};

export default NasStorageBrowser;
