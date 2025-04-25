import React, { useState, useEffect } from "react";
import { List } from "antd";
import NiceAvatar from "react-nice-avatar";
import axios from "axios";
import "./userstatus.css";

const UserStatus = ({ theme }) => {
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

    // Fetch data initially
    fetchOnlineUsers();

    // Set up polling for real-time updates every 10 seconds
    const intervalId = setInterval(fetchOnlineUsers, 10000);

    // Clean up interval on component unmount
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%", // Make it fill the parent container
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <h3
          className="user-status-title"
          style={{ color: theme === "dark" ? "#ffffff" : "#000000" }}
        >
          Online Users
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#52c41a",
              }}
            ></div>
            <span style={{ fontSize: "10px" }}>Online</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#d9d9d9",
              }}
            ></div>
            <span style={{ fontSize: "10px" }}>Offline</span>
          </div>
        </div>
      </div>
      {onlineUsers.length > 0 ? (
        <div
          className="user-status-list-container"
          style={{
            flex: 1, // Allow the list to grow and fill the remaining space
            overflowY: "auto",
          }}
        >
          <List
            itemLayout="horizontal"
            size="large" // Increase the size of the list items
            dataSource={onlineUsers}
            renderItem={(user) => (
              <List.Item
                className="user-status-item"
                style={{
                  opacity: user.isLoggedIn ? 1 : 0.75,
                  padding: "0px", // Add padding to make items larger
                  alignItems: "center", // Center the content vertically
                }}
              >
                <div style={{ position: "relative" }}>
                  {user.avatar ? (
                    typeof user.avatar === "string" ? (
                      <img
                        src={`http://localhost:8081${user.avatar}`}
                        alt="Avatar"
                        style={{
                          width: "20px", // Increase avatar size
                          height: "20px",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      <NiceAvatar
                        style={{
                          width: "20px", // Increase avatar size
                          height: "20px",
                          borderRadius: "50%",
                        }}
                        {...user.avatar}
                      />
                    )
                  ) : (
                    <NiceAvatar style={{ width: "20px", height: "20px" }} />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 0,
                      width: "8px", // Increase status indicator size
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: user.isLoggedIn ? "#52c41a" : "#d9d9d9",
                      border: "1px solid white",
                    }}
                  />
                </div>
                <List.Item.Meta
                  title={
                    <div
                      className="user-status-item-title"
                      style={{ fontSize: "10px", marginBottom: "10px" }} // Larger font size
                    >
                      {user.name}
                    </div>
                  }
                />
                {!user.isLoggedIn && (
                  <span
                    className="user-status-item-time"
                    style={{ fontSize: "9px" }} // Larger font size for time
                  >
                    {calculateTime(user.logoutTime)}
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
