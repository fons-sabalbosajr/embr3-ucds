import React, { useState, useEffect } from "react";
import { List, Avatar, Spin } from "antd";
import NiceAvatar from "react-nice-avatar";
import axios from "axios";
import "./userstatus.css";

const UserStatus = ({ avatar, name }) => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const response = await axios.get(" https://embr3-ucds.onrender.com/api/online_users");
        const allUsers = response.data.onlineUsers;

        const latestOnlineUsers = allUsers.reduce((acc, user) => {
          const existingUser = acc.find((u) => u.userName === user.userName);
          if (!existingUser) {
            acc.push(user);
          } else if (
            user.isLoggedIn ||
            new Date(user.logoutTime) > new Date(existingUser.logoutTime)
          ) {
            acc[acc.indexOf(existingUser)] = user;
          }
          return acc;
        }, []);

        const sortedUsers = latestOnlineUsers.sort((a, b) => {
          if (a.isLoggedIn && !b.isLoggedIn) return -1;
          if (!a.isLoggedIn && b.isLoggedIn) return 1;
          return new Date(b.logoutTime) - new Date(a.logoutTime);
        });

        setOnlineUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching online users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOnlineUsers();
    const intervalId = setInterval(fetchOnlineUsers, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const calculateOfflineTime = (logoutTime) => {
    const now = new Date();
    const diffMs = now - new Date(logoutTime);
    const diffMinutes = Math.floor(diffMs / 60000);

    // More than 1.5 days (2160 minutes)
    if (diffMinutes > 2160) {
      return ""; // Remove calculation for long offline duration
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min${diffMinutes !== 1 ? "" : ""} ago`;
    } else if (diffMinutes < 1440) {
      // Less than 1 day
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} hr${diffHours !== 1 ? "s" : ""} ago`;
    } else {
      // Less than 1.5 days
      const diffDays = Math.floor(diffMinutes / 1440);
      const remainingMinutes = diffMinutes % 1440;
      const diffHours = Math.floor(remainingMinutes / 60);
      return `${diffDays} day${
        diffDays !== 1 ? "s" : ""
      } and ${diffHours} hr${diffHours !== 1 ? "s" : ""} ago`;
    }
  };


  return (
    <div>
      <h2 className="user-status-title">Online Users</h2>
      {onlineUsers.length > 0 ? (
        <List
          itemLayout="horizontal"
          dataSource={onlineUsers}
          renderItem={(user) => (
            <List.Item className="user-status-item" style={{ opacity: user.isLoggedIn ? 1 : 0.75 }}>
              <div style={{ position: "relative" }}>
                {user.avatar ? (
                  <NiceAvatar style={{ width: '40px', height: '40px' }} {...user.avatar} />
                ) : (
                  <NiceAvatar style={{ width: '40px', height: '40px' }} />
                )}
                <div
                  className="user-status-dot"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: user.isLoggedIn
                      ? "#52c41a"
                      : "#d9d9d9",
                    border: "2px solid white",
                  }}
                />
              </div>
              <List.Item.Meta
                title={<div className="user-status-item-title">{user.name}</div>}
              />
              <span className="user-status-item-time">
                {!user.isLoggedIn ? calculateOfflineTime(user.logoutTime) : ""}
              </span>
            </List.Item>
          )}
        />
      ) : (
        <p>No online users</p>
      )}
    </div>
  );
};

export default UserStatus;
