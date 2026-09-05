import React, { useState, useEffect, useRef } from "react";
import { List, Modal, Button, Row, Col } from "antd";
import NiceAvatar from "react-nice-avatar";
import "./userstatus.css";
import { API_BASE_URL } from "../../config/api";
import { getOnlineUsers } from "../../api/userService"; // Import the new service

const UserStatus = ({ theme }) => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const listContainerRef = useRef(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [isAllUsersModalVisible, setIsAllUsersModalVisible] = useState(false);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const responseData = await getOnlineUsers();
        const allUsers = responseData.onlineUsers;

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

        const sortedUsers = [...online, ...offline];

        setOnlineUsers(sortedUsers);
      } catch (error) {
        console.error(
          "Error in UserStatus component while fetching online users:",
          error
        );

        setOnlineUsers([]);
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

  useEffect(() => {
    // Check for scrollbar after onlineUsers are updated and rendered
    if (listContainerRef.current) {
      const { scrollHeight, clientHeight } = listContainerRef.current;
      setShowScrollIndicator(scrollHeight > clientHeight);
    } else {
      setShowScrollIndicator(false);
    }
  }, [onlineUsers, loading]); // Rerun when onlineUsers or loading state changes

  const calculateTime = (time) => {
    const now = new Date();
    const diffMs = now - new Date(time);
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return "0 min ago";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min`;
    } else if (diffMinutes < 1440) {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} hr`;
    } else if (diffMinutes < 2880) {
      const diffDays = Math.floor(diffMinutes / 1440);
      return `${diffDays} day`;
    } else {
      return ""; // hide time for offline users older than 2 days
    }
  };

  const handleOpenAllUsersModal = () => {
    setIsAllUsersModalVisible(true);
  };

  const handleCloseAllUsersModal = () => {
    setIsAllUsersModalVisible(false);
  };

  const modalOnlineUsers = onlineUsers
    .filter((user) => user.isLoggedIn)
    .sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));
  const modalOfflineUsers = onlineUsers
    .filter((user) => !user.isLoggedIn)
    .sort((a, b) => new Date(b.logoutTime) - new Date(a.logoutTime));

  const indicators = (
    <div className="user-status-indicators">
      <div className="user-status-indicator">
        <div className="user-status-indicator-dot online"></div>
        <span className="user-status-indicator-text">
          Online ({onlineUsers.filter((user) => user.isLoggedIn).length})
        </span>
      </div>
      <div className="user-status-indicator">
        <div className="user-status-indicator-dot offline"></div>
        <span className="user-status-indicator-text">Offline</span>
      </div>
    </div>
  );

  return (
    <div
      className={`user-status-wrapper ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
     <div className="user-status-header">
        <h3 className="user-status-title">Online Users</h3>
        {indicators}
      </div>
      {onlineUsers.length > 0 ? (
        <>
          <div ref={listContainerRef} className="user-status-list-container">
            <List
              itemLayout="horizontal"
              size="small"
              className="user-status-list"
              dataSource={onlineUsers}
              renderItem={(user, index) => (
                <List.Item
                  key={user.userName || user.userId || index}
                  className={`user-status-item ${
                    !user.isLoggedIn ? "offline-user" : ""
                  }`}
                >
                  <div className="user-status-item-avatar-wrapper">
                    {user.avatar ? (
                      typeof user.avatar === "string" ? (
                        <img
                          src={`${API_BASE_URL}${user.avatar}`}
                          alt="Avatar"
                          className="user-status-item-avatar"
                        />
                      ) : (
                        <NiceAvatar
                          className="user-status-item-avatar"
                          {...user.avatar}
                        />
                      )
                    ) : (
                      <NiceAvatar className="user-status-item-avatar" />
                    )}
                    <div
                      className={`user-status-dot ${
                        user.isLoggedIn ? "online" : "offline"
                      }`}
                    />
                  </div>
                  <List.Item.Meta
                    title={
                      <div className="user-status-item-title">{user.name}</div>
                    }
                  />
                  {!user.isLoggedIn && (
                    <span className="user-status-item-time">
                      {calculateTime(user.logoutTime)}
                    </span>
                  )}
                </List.Item>
              )}
            />
          </div>
          {showScrollIndicator && (
            <Button
              type="primary"
              size="small"
              onClick={handleOpenAllUsersModal}
              className="user-status-view-all-button"
            >
              View all users
            </Button>
          )}
        </>
      ) : (
        <p className="user-status-no-users">No online users</p>
      )}

      <Modal
        className="user-status-modal"
        title="All Users Status"
        open={isAllUsersModalVisible}
        onCancel={handleCloseAllUsersModal}
        footer={null}
        width={700} // Keep a max width for larger screens
      >
        {/* Use responsive Col props to stack columns on smaller screens */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={12} xl={12}>
            <h4 className="user-status-modal-section-title">
              Online ({modalOnlineUsers.length})
            </h4>
            <List
              itemLayout="horizontal"
              dataSource={modalOnlineUsers}
              className="user-status-modal-list"
              renderItem={(user, index) => (
                <List.Item
                  key={user.userName || user.userId || index}
                  className="user-status-item" // Re-uses base item styles, modal-list will override padding
                >
                  <div className="user-status-item-avatar-wrapper">
                    {user.avatar ? (
                      typeof user.avatar === "string" ? (
                        <img
                          src={`${API_BASE_URL}${user.avatar}`}
                          alt="Avatar"
                          className="user-status-item-avatar" // modal-list will target this for size
                        />
                      ) : (
                        <NiceAvatar
                          className="user-status-item-avatar" // modal-list will target this for size
                          {...user.avatar}
                        />
                      )
                    ) : (
                      <NiceAvatar className="user-status-item-avatar" /> // modal-list will target this for size
                    )}
                    <div
                      className="user-status-dot online" // modal-list will target this for size/pos
                    />
                  </div>
                  <List.Item.Meta
                    title={
                      <span className="user-status-modal-item-name">
                        {user.name}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} xl={12}>
            <h4 className="user-status-modal-section-title">
              Offline ({modalOfflineUsers.length})
            </h4>
            <List
              itemLayout="horizontal"
              dataSource={modalOfflineUsers}
              className="user-status-modal-list"
              renderItem={(user, index) => (
                <List.Item
                  key={user.userName || user.userId || index}
                  className="user-status-item offline-user" // Re-uses base item styles
                >
                  <div className="user-status-item-avatar-wrapper">
                    {user.avatar ? (
                      typeof user.avatar === "string" ? (
                        <img
                          src={`${API_BASE_URL}${user.avatar}`}
                          alt="Avatar"
                          className="user-status-item-avatar" // modal-list will target this for size
                        />
                      ) : (
                        <NiceAvatar
                          className="user-status-item-avatar" // modal-list will target this for size
                          {...user.avatar}
                        />
                      )
                    ) : (
                      <NiceAvatar className="user-status-item-avatar" /> // modal-list will target this for size
                    )}
                    <div
                      className="user-status-dot offline" // modal-list will target this for size/pos
                    />
                  </div>
                  <List.Item.Meta
                    title={
                      <span className="user-status-modal-item-name">
                        {user.name}
                      </span>
                    }
                  />
                  <span className="user-status-modal-item-time">
                    {calculateTime(user.logoutTime)}
                  </span>
                </List.Item>
              )}
            />
          </Col>
        </Row>
      </Modal>
    </div>
  );
};

export default UserStatus;
