import React, { useState } from "react";
import { Avatar, Typography, Menu, Modal } from "antd";
import {
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import Profile from "./Settings/Profile/Profile";
import Help from "./Settings/Help/Help";
import Suggestion from "./Settings/Suggestion/Suggestion";

const { Text } = Typography;

const UserPopover = ({ name, userHandle, handleLogout, selection, theme }) => {
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
        return <Profile name={name} username={userHandle} />; // Pass name and username
      case "help":
        return <Help name={name} username={userHandle} theme={theme} />;
      case "feature":
        return <Suggestion name={name} username={userHandle} theme={theme} />;
      default:
        return null;
    }
  };

  const prefetchUserData = () => {
    fetch(`http://10.14.77.100:8081/api/users?username=${userHandle}`)
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
          background: "transparent", // Remove background
        }}
        mode="vertical"
        theme="light"
      >
        <Menu.Item
          key="profile"
          icon={<UserOutlined />}
          onMouseEnter={prefetchUserData}
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
            ? ""
            : modalContent === "help"
            ? ""
            : modalContent === "feature"
            ? ""
            : ""
        }
        open={isModalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={
          modalContent === "help" ? 700 : modalContent === "feature" ? 600 : 400
        }
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default UserPopover;
