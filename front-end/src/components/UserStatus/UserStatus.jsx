import React, { useState, useEffect } from "react";
import { List } from "antd";
import NiceAvatar from "react-nice-avatar";
import axios from "axios";
import "./userstatus.css";

const UserStatus = () => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const response = await axios.get(
          "http://localhost:8081/api/online_users"
        );
        const allUsers = response.data.onlineUsers;

        // Separate online and offline users
        const online = allUsers.filter((user) => user.isLoggedIn);
        const offline = allUsers.filter((user) => !user.isLoggedIn);

        // Sort online users by recent login time (most recent first)
        online.sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

        // Sort offline users by recent logout time
        offline.sort((a, b) => {
          const timeA = new Date(a.logoutTime);
          const timeB = new Date(b.logoutTime);
          return timeB - timeA;
        });

        // Combine online and offline users
        const sortedUsers = [...online, ...offline];

        // Update onlineUsers state with the latest data
        setOnlineUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching online users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOnlineUsers();
    const intervalId = setInterval(fetchOnlineUsers, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const calculateTime = (time) => {
    const now = new Date();
    const diffMs = now - new Date(time);
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return "0 min ago";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else if (diffMinutes < 1440) {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} hr ago`;
    } else if (diffMinutes < 2880) {
      const diffDays = Math.floor(diffMinutes / 1440);
      return `${diffDays} day ago`;
    } else {
      return ""; // hide time for offline users older than 2 days
    }
  };

  return (
    <div>
      <h3 className="user-status-title">Online Users</h3>
      {onlineUsers.length > 0 ? (
        <div className="user-status-list-container">
          <List
            itemLayout="horizontal"
            dataSource={onlineUsers}
            renderItem={(user) => (
              <List.Item
                className="user-status-item"
                style={{ opacity: user.isLoggedIn ? 1 : 0.75 }}
              >
                <div style={{ position: "relative" }}>
                  {user.avatar ? (
                    typeof user.avatar === "string" ? (
                      <img
                        src={`http://localhost:8081${user.avatar}`}
                        alt="Avatar"
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      <NiceAvatar
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                        }}
                        {...user.avatar}
                      />
                    )
                  ) : (
                    <NiceAvatar style={{ width: "30px", height: "30px" }} />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 2,
                      right: 0,
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: user.isLoggedIn ? "#52c41a" : "#d9d9d9",
                      border: "2px solid white",
                    }}
                  />
                </div>
                <List.Item.Meta
                  title={
                    <div className="user-status-item-title">{user.name}</div>
                  }
                />
                {!user.isLoggedIn && (
                  <span className="user-status-item-time">
                    {calculateTime (user.logoutTime)}
                  </span>
                )}
              </List.Item>
            )}
          />
        </div>
      ) : (
        <p>No online users</p>
      )}
    </div>
  );
};

export default UserStatus;