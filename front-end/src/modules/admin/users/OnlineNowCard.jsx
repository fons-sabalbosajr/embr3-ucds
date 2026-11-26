/* eslint-disable react/prop-types -- the application does not use PropTypes */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, Empty, List, Space, Tag, Typography, theme as antdTheme } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import DefaultAvatar from "../../../components/DefaultAvatar";
import { API_BASE_URL } from "../../../config/api";
import { getOnlineUsers } from "../../../api/userService";
import { initializeSocket, getSocket } from "../../../api/socketService";
import visibleInterval from "../../../shared/visibleInterval";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Who is signed in right now, at the top of Admin › Sign-in History.
//
// This replaces UserStatus, which was a small sidebar widget (a fixed grid
// with its own light/dark palette, driven by a `theme` prop) that had become
// the whole Admin home page: rendered full width and without the prop, it
// fell back to "theme-undefined" and lost its colours and layout. This is an
// ordinary card on the theme's tokens, so it is right in both modes.
//
// Live like the old widget: the server announces each sign-in and sign-out
// over the socket (presence:changed) and the list is fetched again; a
// 5-minute poll, paused while the tab is hidden, covers a missed notice.
// ---------------------------------------------------------------------------

const RECENT_SHOWN = 8;

const since = (time) => {
  if (!time) return "";
  const minutes = Math.max(0, dayjs().diff(dayjs(time), "minute"));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
};

const Person = ({ user, online }) => {
  const label = user.name || user.userName;
  const avatar = user.avatar ? (
    <Avatar src={`${API_BASE_URL}${user.avatar}`} size={36} alt={label} />
  ) : (
    <DefaultAvatar name={label} size={36} />
  );
  return (
    <List.Item>
      <List.Item.Meta
        avatar={
          <Badge dot status={online ? "success" : "default"} offset={[-4, 30]}>
            {avatar}
          </Badge>
        }
        title={
          <Space size={6} wrap>
            <Text strong>{label}</Text>
            {user.name && user.userName && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {user.userName}
              </Text>
            )}
          </Space>
        }
        description={
          online ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Signed in {dayjs(user.loginTime).format("h:mm A")} · {since(user.loginTime)}
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Signed out {user.logoutTime ? `${since(user.logoutTime)} ago` : ""}
            </Text>
          )
        }
      />
    </List.Item>
  );
};

const OnlineNowCard = () => {
  const { token } = antdTheme.useToken();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllRecent, setShowAllRecent] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOnlineUsers();
      setUsers(Array.isArray(data?.onlineUsers) ? data.onlineUsers : []);
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load who is online.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket() || initializeSocket();
    socket?.on("presence:changed", load);
    socket?.on("connect", load);
    const stopPolling = visibleInterval(load, 5 * 60 * 1000);
    return () => {
      socket?.off("presence:changed", load);
      socket?.off("connect", load);
      stopPolling();
    };
  }, [load]);

  const { online, recent } = useMemo(() => {
    const on = users.filter((u) => u.isLoggedIn).sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));
    // Signed out within the last week, newest first: older entries are in the
    // history table below.
    const weekAgo = dayjs().subtract(7, "day");
    const off = users
      .filter((u) => !u.isLoggedIn && u.logoutTime && dayjs(u.logoutTime).isAfter(weekAgo))
      .sort((a, b) => new Date(b.logoutTime) - new Date(a.logoutTime));
    return { online: on, recent: off };
  }, [users]);

  const recentShown = showAllRecent ? recent : recent.slice(0, RECENT_SHOWN);

  return (
    <Card
      title={
        <Space size={8}>
          <span>Who is online now</span>
          <Tag color={online.length ? "green" : "default"} style={{ marginInlineEnd: 0 }}>
            {online.length}
          </Tag>
        </Space>
      }
      extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={load} aria-label="Refresh" />}
    >
      {error && (
        <Text type="danger" style={{ display: "block", marginBottom: 12 }}>
          {error}
        </Text>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: token.marginLG,
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Signed in
          </Text>
          {online.length ? (
            <List loading={loading && !users.length} dataSource={online} rowKey={(u) => u.userId || u.userName} renderItem={(u) => <Person user={u} online />} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "Loading…" : "Nobody is signed in right now"} />
          )}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Signed out this week
          </Text>
          {recent.length ? (
            <>
              <List dataSource={recentShown} rowKey={(u) => u.userId || u.userName} renderItem={(u) => <Person user={u} online={false} />} />
              {recent.length > RECENT_SHOWN && (
                <Button type="link" style={{ paddingInline: 0 }} onClick={() => setShowAllRecent((v) => !v)}>
                  {showAllRecent ? "Show fewer" : `Show all ${recent.length}`}
                </Button>
              )}
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "Loading…" : "No sign-outs this week"} />
          )}
        </div>
      </div>
    </Card>
  );
};

export default OnlineNowCard;
