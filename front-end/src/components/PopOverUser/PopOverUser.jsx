import React, { useState, useEffect } from "react";
import { Avatar, Typography, Menu, Modal } from "antd";
import {
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import Profile from "../Settings/Profile/Profile";
import Help from "../Settings/Help/Help";
import Suggestion from "../Settings/Suggestion/Suggestion";
import { fetchUserByUsername } from "../../api/userService";
import "./popoveruser.css";

const { Text } = Typography;

const UserPopover = ({ name, userHandle, handleLogout, selection, theme }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [prefetchedUserData, setPrefetchedUserData] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getModalWidth = () => {
    if (modalContent === "help") return 700;
    if (modalContent === "feature") return 600;
    if (modalContent === "profile") {
      return windowWidth <= 1080 ? 600 : 400;
    }
    return 400;
  };

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
    fetchUserByUsername(userHandle)
      .then((user) => setPrefetchedUserData(user))
      .catch((error) => console.error("Error prefetching user data:", error));
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div style={{ textAlign: "center" }}>
        <Text strong className="popover-user-name" style={{ fontSize: "11px" }}>
          {name}
        </Text>
      </div>
      <Text
        type="secondary"
        className="popover-user-handle"
        style={{ fontSize: "11px" }}
      >
        @{userHandle}
      </Text>
      <Menu
        className="popover-user-menu"
        selectedKeys={[selection]}
        onClick={({ key }) => {
          if (key === "logout") {
            handleLogout();
          } else {
            showModal(key);
          }
        }}
        style={{
          background: "transparent",
        }}
        mode="vertical"
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
        width={getModalWidth()}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default UserPopover;
