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
import { useContext } from "react";
import { DataContext } from "./../menu-province/DataContext"

const { Sider } = Layout;
const { SubMenu } = Menu;

const SideMenu = ({ theme, currentUser }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { setCurrentProvince } = useContext(DataContext);
  
  //console.log("Current User in SideMenu:", currentUser);

  // Extract permissions from currentUser
  const permissions = currentUser?.permissions || [];
  const visibleProvinces = [
    { key: "Aurora", visible: permissions[5] },
    { key: "Bataan", visible: permissions[6] },
    { key: "Bulacan", visible: permissions[7] },
    { key: "Nueva_Ecija", visible: permissions[8] },
    { key: "Pampanga", visible: permissions[9] },
    { key: "Tarlac", visible: permissions[10] },
    { key: "Zambales", visible: permissions[11] },
  ]
    .filter((province) => province.visible) // Show only visible provinces
    .map((province) => province.key);

  const canViewAdminPanel = permissions[2]; // Example permission
  const onCollapse = (collapsed) => {
    setCollapsed(collapsed);
  };

  const handleProvinceSelect = (province) => {
    setCurrentProvince(province); // Update currentProvince in DataContext
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
          <Menu.SubMenu
            key="r3-monitoring"
            icon={<CheckCircleFilled />}
            title="Monitoring Plan"
          >
            {visibleProvinces.map((province) => (
              <Menu.Item key={`/universe/province/${province}`} onClick={() => handleProvinceSelect(province)}>
                <Link to={`/universe/province/${province}`}>{province}</Link>
              </Menu.Item>
            ))}
          </Menu.SubMenu>

          <SubMenu key="reports" icon={<PushpinFilled />} title="Reports">
            <>
              <Menu.Item key="/universe/survey">
                <Link to="/universe/survey">Survey List 2024</Link>
              </Menu.Item>
              <Menu.Item key="/universe/survey2025">
                <Link to="/universe/survey2025">Survey List 2025</Link>
              </Menu.Item>
              <Menu.Item key="/universe/healthcare">
                <Link to="/universe/healthcare">Healthcare Permits</Link>
              </Menu.Item>
              <Menu.Item key="/universe/chemicals">
                <Link to="/universe/chemicals">Chemical Permits</Link>
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
