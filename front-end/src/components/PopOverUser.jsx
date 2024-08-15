import React, { useState } from "react";
import { Avatar, Typography, Menu, Modal } from "antd";
import {
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import ProfileSettings from "./Settings/Profile/Profile";

const { Text } = Typography;

const UserPopover = ({
  name,
  userHandle,
  theme,
  handleMenuItemClick,
  navigate,
  handleLogout,
  getInitials,
  toggleTheme,
  selection,
  handleVisibleChange,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState("");

  const showModal = (content) => {
    setModalContent(content);
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const renderModalContent = () => {
    switch (modalContent) {
      case "profile":
        return <ProfileSettings />;
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

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div style={{ textAlign: "center" }}>
        <Text strong style={{ fontSize: "11px" }}>
          {name}
        </Text>
      </div>
      <Text type="secondary" style={{ fontSize:"11px"  }}>@{userHandle}</Text>
      <Menu
        selectedKeys={[selection]}
        onClick={({ key }) => {
          if (key === "logout") {
            handleLogout();
          } else {
            showModal(key);
          }
        }}
      >
        <Menu.Item key="profile" icon={<UserOutlined />} style={{ fontSize:"12px"  }}>
          Profile Setting
        </Menu.Item>
        <Menu.Item key="help" icon={<QuestionCircleOutlined />}  style={{ fontSize:"12px"  }}>
          Help
        </Menu.Item>
        <Menu.Item key="feature" icon={<BulbOutlined />}  style={{ fontSize:"12px"  }}>
          Suggest a feature{" "}
          <span style={{ color: "red", marginLeft: "5px" ,  }} >Beta</span>
        </Menu.Item>
        <Menu.Item key="logout" icon={<LogoutOutlined />}  style={{ fontSize:"12px"  }}>
          Log Out
        </Menu.Item>
      </Menu>

      <Modal
        title={
          modalContent === "profile"
            ? "Profile Setting"
            : modalContent === "settings"
            ? "Settings"
            : modalContent === "help"
            ? "Help"
            : modalContent === "feature"
            ? "Suggest a Feature"
            : ""
        }
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="OK"
        cancelText="Cancel"
        width={600}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default UserPopover;
