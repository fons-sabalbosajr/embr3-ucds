import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Card, Empty, Modal, Space, Spin, Tag, Typography } from "antd";
import { CalendarOutlined, DisconnectOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { initializeSocket, getSocket } from "../../api/socketService";
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
  const [state, setState] = useState({ loading: true, active: false, containers: [], error: null, reason: null, message: null, nextOpensAt: null });

  // Whether the NAS is offered changes under the page: the Developer flips a
  // switch, the schedule closes, or the bridge server is shut down. The
  // server pushes every change over the socket; the poll is the fallback.
  const load = useCallback((cancelledRef) => {
    fetch(`${API_BASE_URL}/api/storage/containers`, { credentials: "include" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelledRef.cancelled) return;
        if (!ok) {
          setState({ loading: false, active: false, containers: [], error: body.message || "Could not load storage." });
          return;
        }
        setState({
          loading: false,
          active: body.active === true,
          containers: body.containers || [],
          error: null,
          reason: body.reason || null,
          message: body.message || null,
          nextOpensAt: body.nextOpensAt || null,
        });
      })
      .catch(() => !cancelledRef.cancelled && setState({ loading: false, active: false, containers: [], error: "Could not reach the server." }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ref = { get cancelled() { return cancelled; } };
    load(ref);
    const socket = getSocket() || initializeSocket();
    const onAvailability = () => load(ref);
    socket?.on("nas:availability", onAvailability);
    const poll = setInterval(() => load(ref), 60000);
    return () => {
      cancelled = true;
      socket?.off("nas:availability", onAvailability);
      clearInterval(poll);
    };
  }, [load]);

  // Outside the schedule the person is told in the Developer's words — once,
  // as a prompt, and then in the panel below so it stays readable.
  const scheduled = !state.active && state.reason === "outside-schedule";
  const bridgeDown = !state.active && (state.reason === "bridge-offline" || state.reason === "nas-offline");
  const promptedFor = useRef(null);
  useEffect(() => {
    if (!(scheduled || bridgeDown) || !state.containers.length) {
      if (state.active) promptedFor.current = null;
      return;
    }
    // Once per outage, not on every poll.
    if (promptedFor.current === state.reason) return;
    promptedFor.current = state.reason;
    Modal.info({
      title: "NAS files are not available right now",
      icon: bridgeDown ? <DisconnectOutlined /> : <CalendarOutlined />,
      content: (
        <div>
          <p style={{ marginBottom: state.nextOpensAt ? 8 : 0 }}>{state.message}</p>
          {state.nextOpensAt && <Text type="secondary">Next available: {new Date(state.nextOpensAt).toLocaleString()}</Text>}
        </div>
      ),
      okText: "Understood",
    });
  }, [scheduled, bridgeDown, state.active, state.reason, state.containers.length, state.message, state.nextOpensAt]);

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
      ) : bridgeDown ? (
        <Alert
          type="warning"
          showIcon
          icon={<DisconnectOutlined />}
          message="The NAS is not reachable right now"
          description={state.message}
        />
      ) : scheduled ? (
        <Alert
          type="info"
          showIcon
          icon={<CalendarOutlined />}
          message="NAS files are available on a schedule"
          description={
            <>
              {state.message}
              {state.nextOpensAt && (
                <>
                  <br />
                  <Text type="secondary">Next available: {new Date(state.nextOpensAt).toLocaleString()}</Text>
                </>
              )}
            </>
          }
        />
      ) : !state.active ? (
        <Alert
          type="warning"
          showIcon
          message={state.reason === "master-off" ? "The NAS is switched off for everyone" : "Document access is switched off right now"}
          description={state.message || "The Developer turns it on for a set window from Storage settings. Your containers will open here as soon as it is on."}
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
