import React, { useState, useEffect } from "react";
import { List, Avatar } from "antd";
import axios from "axios";
import './userstatus.css'

const UserStatus = () => {
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const response = await axios.get("http://localhost:8081/api/online_users");
        const allUsers = response.data.onlineUsers;

        // Ensure we get the latest status for each user
        const latestOnlineUsers = allUsers.reduce((acc, user) => {
          const existingUser = acc.find((u) => u.userName === user.userName);
          if (!existingUser) {
            acc.push(user);
          } else if (user.isLoggedIn || new Date(user.logoutTime) > new Date(existingUser.logoutTime)) {
            // Replace user with the latest status (logged in or latest logout time)
            acc[acc.indexOf(existingUser)] = user;
          }
          return acc;
        }, []);

        // Sort users by status (online first) and then by logout time (offline users)
        const sortedUsers = latestOnlineUsers.sort((a, b) => {
          if (a.isLoggedIn && !b.isLoggedIn) return -1; // a is online, b is offline
          if (!a.isLoggedIn && b.isLoggedIn) return 1; // a is offline, b is online
          // Both users are online or both are offline, sort by logout time
          return new Date(b.logoutTime) - new Date(a.logoutTime);
        });

        // Update the onlineUsers state with the sorted users
        setOnlineUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching online users:", error);
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
      return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
    } else if (diffMinutes < 1440) { // Less than 1 day
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    } else { // Less than 1.5 days
      const diffDays = Math.floor(diffMinutes / 1440);
      const remainingMinutes = diffMinutes % 1440;
      const diffHours = Math.floor(remainingMinutes / 60);
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} and ${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    }
  };
  

  return (
    <div className="user-status-container">
    <h2 className="user-status-title">Online Users</h2>
    {onlineUsers.length > 0 ? (
      <List
        itemLayout="horizontal"
        dataSource={onlineUsers}
        renderItem={(user) => {
          //console.log(user);
          return (
            <List.Item className="user-status-item">
              <div style={{ position: 'relative' }}>
                <Avatar className="user-status-item-avatar">{user.name ? user.name[0] : ""}</Avatar>
                <div
                  className="user-status-dot"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: user.isLoggedIn ? '#52c41a' : '#d9d9d9',
                    border: '2px solid white'
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
          );
        }}
      />
    ) : (
      <p>No users available</p>
    )}
  </div>
  );
};

export default UserStatus;
