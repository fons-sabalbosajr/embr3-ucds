import React, { useState } from "react";
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

const SideMenu = ({ theme, permissions }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const onCollapse = (collapsed) => {
    setCollapsed(collapsed);
  };

  const isMenuSelected = (path) => {
    return location.pathname.includes(path);
  };

  const handleExportDataClick = () => {
    navigate("/universe/exportdata"); // Navigate to Export Data
  };

  

  const storedPermissions =
    JSON.parse(localStorage.getItem("permission")) || [];
  const showAdminMenu =
    storedPermissions.includes("admin") ||
    storedPermissions.includes("developer");

  return (
    <Sider
      collapsed={collapsed}
      onCollapse={onCollapse}
      theme={theme}
      width={220}
      className="sider-container"
      trigger={null} // Remove default collapse trigger
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
                <Link to={`/universe/province/${province.toLowerCase()}`} className="link-menu">
                  {province}
                </Link>
              </Menu.Item>
            ))}
          </SubMenu>

          <SubMenu key="reports" icon={<PushpinFilled />} title="Reports">
            <Menu.Item key="/universe/survey">
              <Link
                to="/universe/survey"
                className={`link-menu-hover ${
                  isMenuSelected("survey") ? "selected" : ""
                }`}
              >
                Survey List
              </Link>
            </Menu.Item>
            <Menu.Item key="/universe/mbu">
              <Link
                to="/universe/mbu"
                className={`link-menu-hover ${
                  isMenuSelected("mbu") ? "selected" : ""
                }`}
              >
                MBU Pipeline
              </Link>
            </Menu.Item>
            <Menu.Item key="/universe/eswm-database">
              <Link
                to="/universe/eswm-database"
                className={`link-menu-hover ${
                  isMenuSelected("mbu") ? "selected" : ""
                }`}
              >
                ESWM Database
              </Link>
            </Menu.Item>
            <Menu.Item key="/universe/extract">
              <Link
                to="/universe/extract"
                className={`link-menu-hover ${
                  isMenuSelected("extract") ? "selected" : ""
                }`}
              >
                Extract Data (DEV)
              </Link>
            </Menu.Item>
            {/* <Menu.Item key="/universe/report">
              <Link
                to="/universe/report"
                className={`link-menu-hover ${
                  isMenuSelected("report") ? "selected" : ""
                }`}
              >
                Generate Report (DEV)
              </Link>
            </Menu.Item> */}
          </SubMenu>

          {showAdminMenu && (
            <SubMenu key="admin" icon={<SettingFilled />} title="Admin">
              <Menu.Item key="/universe/accounts">
                <Link
                  to="/universe/accounts"
                  className={`link-menu-hover ${
                    isMenuSelected("accounts") ? "selected" : ""
                  }`}
                >
                  User Accounts
                </Link>
              </Menu.Item>

              <Menu.Item key="/universe/posting">
                <Link
                  to="/universe/posting"
                  className={`link-menu-hover ${
                    isMenuSelected("posting") ? "selected" : ""
                  }`}
                >
                  Post to Bulletin
                </Link>
              </Menu.Item>

              <Menu.Item key="/universe/activitylog">
                <Link
                  to="/universe/activitylog"
                  className={`link-menu-hover ${
                    isMenuSelected("activitylog") ? "selected" : ""
                  }`}
                >
                  Activity Logs
                </Link>
              </Menu.Item>
              <Menu.Item key="/universe/duplicate-firms">
              <Link
                to="/universe/duplicate-firms"
                className={`link-menu-hover ${
                  isMenuSelected("duplicate-firms") ? "selected" : ""
                }`}
              >
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
