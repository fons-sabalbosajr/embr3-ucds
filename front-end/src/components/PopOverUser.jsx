import React, { useState, lazy, Suspense } from "react";
import { Avatar, Typography, Menu, Modal, Spin } from "antd";
import {
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

// Lazy load the Profile component
const Profile = lazy(() => import("./Settings/Profile/Profile"));

const { Text } = Typography;

const UserPopover = ({ name, userHandle, handleLogout, selection }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [prefetchedUserData, setPrefetchedUserData] = useState(null);

  const showModal = (content) => {
    setModalContent(content);
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
  };

  const renderModalContent = () => {
    switch (modalContent) {
      case "profile":
        return (
          <Suspense fallback={<Spin size="large" tip="Loading Profile..." />}>
            <Profile
              userHandle={userHandle}
              prefetchedUserData={prefetchedUserData}
            />
          </Suspense>
        );
      case "settings":
        return <div>Settings content</div>;
      case "help":
        return <div>Help content</div>;
      case "feature":
        return <div>Suggest a feature content</div>;
      default:
        return null;
    }
  };

  const prefetchUserData = () => {
    fetch(`http://localhost:8081/api/users?username=${userHandle}`)
      .then((response) => response.json())
      .then((data) => setPrefetchedUserData(data[0]))
      .catch((error) => console.error("Error prefetching user data:", error));
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div style={{ textAlign: "center" }}>
        <Text strong style={{ fontSize: "11px" }}>
          {name}
        </Text>
      </div>
      <Text type="secondary" style={{ fontSize: "11px" }}>
        @{userHandle}
      </Text>
      <Menu
        selectedKeys={[selection]}
        onClick={({ key }) => {
          if (key === "logout") {
            handleLogout();
          } else {
            showModal(key);
          }
        }}
        style={{
          width: "100%",
          borderRadius: "2px",
        }}
        mode="vertical"
        theme="light"
      >
        <Menu.Item
          key="profile"
          icon={<UserOutlined />}
          onMouseEnter={prefetchUserData} // Prefetch data on hover
        >
          Profile Setting
        </Menu.Item>

        <Menu.Item key="help" icon={<QuestionCircleOutlined />}>
          Help
        </Menu.Item>

        <Menu.Item key="feature" icon={<BulbOutlined />}>
          Suggest a feature{" "}
          <span style={{ color: "red", marginLeft: "5px" }}>Beta</span>
        </Menu.Item>

        <Menu.Item key="logout" icon={<LogoutOutlined />}>
          Log Out
        </Menu.Item>
      </Menu>

      <Modal
        title={
          modalContent === "profile"
            ? "Profile Details"
            : modalContent === "settings"
            ? "Settings"
            : modalContent === "help"
            ? "Help"
            : modalContent === "feature"
            ? "Suggest a Feature"
            : ""
        }
        open={isModalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={400}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default UserPopover;
