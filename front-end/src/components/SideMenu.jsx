import React, { useState, useEffect } from "react";
import { ConfigProvider, Layout, Menu, Button } from "antd";
import {
  DashboardFilled,
  CheckCircleFilled,
  PushpinFilled,
  SettingFilled,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import Logo from "./Logo";
import "./sidemenu.css";
import { Link, useNavigate, useLocation } from "react-router-dom";

const { Sider } = Layout;
const { SubMenu } = Menu;

const SideMenu = ({ theme, currentUser }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const canGenerateData = permissions[0];
  const canManageData = permissions[1];
  const canViewAdminPanel = permissions[2];
  const canViewDataHistory = permissions[3];

  // useEffect(() => {
  //   if (currentUser) {
  //     console.log("Can Generate Data:", canGenerateData);
  //     console.log("Can Manage Data Data:", canManageData);
  //     console.log("Can View Admin Panel:", canViewAdminPanel);
  //     console.log("Can View Data History:", canViewDataHistory);
  //   }
  // }, [currentUser]);

  const onCollapse = (collapsed) => {
    setCollapsed(collapsed);
  };

  const isMenuSelected = (path) => {
    return location.pathname.includes(path);
  };

  const handleExportDataClick = () => {
    navigate("/universe/exportdata"); 
  };

  return (
    <Sider
      collapsed={collapsed}
      onCollapse={onCollapse}
      theme={theme}
      width={220}
      className="sider-container"
      trigger={null}
    >
      <div className="sider-header">
        <Logo theme={theme} collapsed={collapsed} />
      </div>

      <div>
        <Button
          type="primary"
          onClick={() => setCollapsed(!collapsed)}
          className="collapse-toggle-button"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          size="small"
        />
      </div>
      <ConfigProvider>
        <Menu
          theme={theme}
          defaultSelectedKeys={["1"]}
          mode="inline"
          selectedKeys={[location.pathname]}
          inlineCollapsed={collapsed}
          className="menu-container"
        >
          <Menu.Item
            key="/universe/dashboard"
            icon={<DashboardFilled />}
            className="menu-bar-item"
          >
            <Link to="/universe/dashboard" className="link-menu">
              Dashboard
            </Link>
          </Menu.Item>

          <SubMenu
            key="r3-monitoring"
            icon={<CheckCircleFilled />}
            title="R3 Monitoring Plan"
          >
            {[
              "Aurora",
              "Bataan",
              "Bulacan",
              "Nueva_Ecija",
              "Pampanga",
              "Tarlac",
              "Zambales",
            ].map((province) => (
              <Menu.Item key={`/universe/province/${province.toLowerCase()}`}>
                <Link
                  to={`/universe/province/${province.toLowerCase()}`}
                  className="link-menu"
                >
                  {province}
                </Link>
              </Menu.Item>
            ))}
          </SubMenu>

          <SubMenu key="reports" icon={<PushpinFilled />} title="Reports">
            <>
              <Menu.Item key="/universe/survey">
                <Link to="/universe/survey">Survey List</Link>
              </Menu.Item>
              <Menu.Item key="/universe/mbu">
                <Link to="/universe/mbu">MBU Pipeline</Link>
              </Menu.Item>
              <Menu.Item key="/universe/eswm-database">
                <Link to="/universe/eswm-database">ESWM Database</Link>
              </Menu.Item>
              <Menu.Item key="/universe/extract">
                <Link to="/universe/extract">Extract Data (DEV)</Link>
              </Menu.Item>
            </>
          </SubMenu>

          {canViewAdminPanel && (
            <SubMenu key="admin" icon={<SettingFilled />} title="Admin">
              <Menu.Item key="/universe/accounts">
                <Link to="/universe/accounts">User Accounts</Link>
              </Menu.Item>
              <Menu.Item key="/universe/posting">
                <Link to="/universe/posting">Post to Bulletin</Link>
              </Menu.Item>
              <Menu.Item key="/universe/activitylog">
                <Link to="/universe/activitylog">Activity Logs</Link>
              </Menu.Item>
              <Menu.Item key="/universe/duplicate-firms">
                <Link to="/universe/duplicate-firms">
                  Duplicated Firms List
                </Link>
              </Menu.Item>
            </SubMenu>
          )}
        </Menu>
      </ConfigProvider>
    </Sider>
  );
};

export default SideMenu;
