import React, { useEffect, useState } from "react";
import { Alert, Card, Empty, Space, Spin, Tag, Typography } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import NasFileExplorer from "../admin/developer/NasFileExplorer";
import { API_BASE_URL } from "../../config/api";

const { Paragraph, Text } = Typography;

// ---------------------------------------------------------------------------
// Storage, as staff see it.
//
// A Planning or Records admin opens the containers the Developer has shared
// with their account — nothing else exists from here. There is no share path,
// no credential and no drive letter on this screen; the server reads the
// files and every read is audited with the container and the person.
//
// Whether anything can be opened right now is the activation window, which
// the Developer controls. When it is off the explorer says so instead of
// pretending the share is broken.
// ---------------------------------------------------------------------------

const StorageBrowser = () => {
  const [state, setState] = useState({ loading: true, active: false, containers: [], error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/storage/containers`, { credentials: "include" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setState({ loading: false, active: false, containers: [], error: body.message || "Could not load storage." });
          return;
        }
        setState({ loading: false, active: body.active === true, containers: body.containers || [], error: null });
      })
      .catch(() => !cancelled && setState({ loading: false, active: false, containers: [], error: "Could not reach the server." }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {state.error && <Alert type="error" showIcon message={state.error} />}

      <Card
        title={
          <Space>
            <FolderOpenOutlined />
            Storage
          </Space>
        }
        size="small"
      >
        <Paragraph style={{ marginBottom: 8 }}>
          Files from the office storage that have been shared with your account. Open or download
          them here; nothing is copied to your computer unless you download it.
        </Paragraph>
        <Space wrap>
          <Text type="secondary">Shared with you:</Text>
          {state.containers.length ? (
            state.containers.map((c) => <Tag key={c.key}>{c.label}</Tag>)
          ) : (
            <Text type="secondary">nothing yet</Text>
          )}
          <Tag color={state.active ? "green" : "default"}>
            {state.active ? "document access on" : "document access off"}
          </Tag>
        </Space>
      </Card>

      {!state.containers.length ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No storage has been shared with your account. Ask the system developer to designate a container."
          />
        </Card>
      ) : !state.active ? (
        <Alert
          type="warning"
          showIcon
          message="Document access is switched off right now"
          description="The Developer turns it on for a set window from Storage settings. Your containers will open here as soon as it is on."
        />
      ) : (
        <NasFileExplorer
          endpoint="/api/storage"
          title="Shared files"
          initialContainer={state.containers[0].key}
        />
      )}
    </Space>
  );
};

export default StorageBrowser;
