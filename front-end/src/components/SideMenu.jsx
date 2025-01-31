import React, { useState, useEffect } from "react";
import { ConfigProvider, Layout, Menu, Button } from "antd";
import {
  DashboardTwoTone,
  CheckCircleTwoTone,
  PushpinTwoTone,
  SettingTwoTone,
  MedicineBoxTwoTone,
  ReconciliationTwoTone,
  EnvironmentTwoTone,
  DatabaseTwoTone,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
} from "@ant-design/icons";
import Logo from "./Logo";
import "./sidemenu.css";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useContext } from "react";
import { DataContext } from "./../menu-province/DataContext";

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

      <div>
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
              icon={<DashboardTwoTone />}
              className="menu-bar-item"
            >
              <Link to="/universe/dashboard" className="link-menu">
                Dashboard
              </Link>
            </Menu.Item>

            <Menu.SubMenu
              key="r3-monitoring"
              icon={<CheckCircleTwoTone />}
              title="Monitoring Plan"
            >
              {visibleProvinces.map((province) => (
                <Menu.Item
                  key={`/universe/province/${province}`}
                  onClick={() => handleProvinceSelect(province)}
                >
                  <Link to={`/universe/province/${province}`}>{province}</Link>
                </Menu.Item>
              ))}
            </Menu.SubMenu>

            <SubMenu
              key="healthcare"
              icon={<MedicineBoxTwoTone />}
              title="Healthcare"
            >
              <Menu.Item key="/universe/healthcare">
                <Link to="/universe/healthcare">Healthcare Industries</Link>
              </Menu.Item>
              <Menu.Item key="/universe/chemicals">
                <Link to="/universe/chemicals">
                  Chemical Industries
                </Link>
              </Menu.Item>
            </SubMenu>

            <Menu.Item key="/universe/survey" icon={<ReconciliationTwoTone />}>
              <Link to="/universe/survey" className="link-menu">Survey</Link>
            </Menu.Item>

            <Menu.Item key="/universe/mbu" icon={<EnvironmentTwoTone />}>
              <Link to="/universe/mbu" className="link-menu">Manila Bay Pipeline</Link>
            </Menu.Item>

            <Menu.Item key="/universe/eswm-database" icon={<DatabaseTwoTone />}>
              <Link to="/universe/eswm-database" className="link-menu">ESWM Database</Link>
            </Menu.Item>

            <SubMenu key="reports" icon={<PushpinTwoTone />} title="Reports">
              <Menu.Item key="/universe/extract">
                <Link to="/universe/extract">Extract Data</Link>
              </Menu.Item>
            </SubMenu>

            {canViewAdminPanel && (
              <SubMenu key="admin" icon={<SettingTwoTone />} title="Admin">
                <Menu.Item key="/universe/accounts">
                  <Link to="/universe/accounts">User Accounts</Link>
                </Menu.Item>
                <Menu.Item key="/universe/posting">
                  <Link to="/universe/posting">Post to Bulletin</Link>
                </Menu.Item>
                <Menu.Item key="/universe/activitylog">
                  <Link to="/universe/activitylog">Activity Logs</Link>
                </Menu.Item>
              </SubMenu>
            )}
          </Menu>
        </ConfigProvider>
      </div>
    </Sider>
  );
};

export default SideMenu;
