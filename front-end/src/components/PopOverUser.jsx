import React from 'react';
import { Avatar, Typography, Menu } from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  LogoutOutlined
} from '@ant-design/icons';

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
  handleVisibleChange
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Avatar
        src={getInitials(name)}
        icon={<UserOutlined />}
        style={{ marginBottom: "10px" }}
      >
        {name}
      </Avatar>
      <div style={{ textAlign: "center" }}>
        <Text strong>{name}</Text>
      </div>
      <Text type="secondary">@{userHandle}</Text>
      <Menu
        selectedKeys={[selection]}
        onClick={({ key }) => handleMenuItemClick(key)}
      >
        <Menu.Item
          key="profile"
          icon={<UserOutlined />}
          onClick={() => navigate("/profile")}
        >
          Profile Setting
        </Menu.Item>
        <Menu.Item key="settings" icon={<SettingOutlined />}>
          Settings
        </Menu.Item>
        <Menu.Item key="help" icon={<QuestionCircleOutlined />}>
          Help
        </Menu.Item>
        <Menu.Item key="feature" icon={<BulbOutlined />}>
          Suggest a feature{" "}
          <span style={{ color: "red", marginLeft: "5px" }}>
            Beta
          </span>
        </Menu.Item>
        <Menu.Item key="logout" onClick={handleLogout}>
          <LogoutOutlined /> Log Out
        </Menu.Item>
      </Menu>
    </div>
  );
};

export default UserPopover;
