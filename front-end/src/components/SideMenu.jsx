import React from "react";
import { ConfigProvider, Layout, Menu } from "antd";
import {
  DashboardFilled,
  CheckCircleFilled,
  PushpinFilled,
  DownCircleFilled,
  SettingFilled,
} from "@ant-design/icons";
import Logo from "./Logo";
import "./sidemenu.css";
import { Link, useNavigate, useLocation } from "react-router-dom";

const { Sider } = Layout;

const SideMenu = ({ theme, collapsed, setCollapsed, permissions }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const onCollapse = (collapsed) => {
    setCollapsed(collapsed);
  };

  //console.log("Permissions:", permissions);

  const isMenuSelected = (path) => {
    return location.pathname.includes(path);
  };

  const handleExportDataClick = () => {
    navigate("/universe/exportdata"); // navigate to Export Data
  };

   // Check localStorage for permissions
   const storedPermissions = JSON.parse(localStorage.getItem("permission")) || [];
   const showAdminMenu = storedPermissions.includes("admin") || storedPermissions.includes("developer");
 
  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      theme={theme}
      width={230}
    >
      <Logo theme="dark" collapsed={collapsed} />

      <ConfigProvider>
        <div className="menu-bar-container">
          <Menu theme={theme} defaultSelectedKeys={["1"]} mode="inline">
            <Menu.Item
              key="1"
              icon={<DashboardFilled />}
              className="menu-bar-item"
            >
              <Link
                to="/universe/dashboard"
                className="link-menu"
              >
                Dashboard
              </Link>
            </Menu.Item>

            <Menu.SubMenu
              key="2"
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
                <Menu.Item key={province.toLowerCase()}>
                  <Link to={`/universe/province/${province.toLowerCase()}`}>
                    {province}
                  </Link>
                </Menu.Item>
              ))}
            </Menu.SubMenu>

            <Menu.SubMenu key="3" icon={<PushpinFilled />} title="Reports">
              <Menu.Item key="subreports-1">
                <Link
                  to="/universe/survey"
                  className={`link-menu-hover ${
                    isMenuSelected("survey") ? "selected" : ""
                  }`}
                >
                  Survey List
                </Link>
              </Menu.Item>
              <Menu.Item key="subreports-2">
                <Link
                  to="/universe/mbu"
                  className={`link-menu-hover ${
                    isMenuSelected("mbu") ? "selected" : ""
                  }`}
                >
                  Manila Bay Unit
                </Link>
              </Menu.Item>
              <Menu.Item key="subreports-3">
                <Link
                  to="/universe/extract"
                  className={`link-menu-hover ${
                    isMenuSelected("extract") ? "selected" : ""
                  }`}
                >
                  Extract Data
                </Link>
              </Menu.Item>
              <Menu.Item key="subreports-4">
                  <Link
                    to="/universe/report"
                    className={`link-menu-hover ${
                      isMenuSelected("report") ? "selected" : ""
                    }`}
                  >
                    Generate Report
                  </Link>
                </Menu.Item>

            </Menu.SubMenu>


            {showAdminMenu && (
              <Menu.SubMenu key="admin" icon={<SettingFilled />} title="Admin">
                <Menu.Item key="admin-1">
                  <Link
                    to="/universe/accounts"
                    className={`link-menu-hover ${
                      isMenuSelected("accounts") ? "selected" : ""
                    }`}
                  >
                    User Accounts
                  </Link>
                </Menu.Item>
                
                <Menu.Item key="admin-2">
                  <Link
                    to="/universe/posting"
                    className={`link-menu-hover ${
                      isMenuSelected("posting") ? "selected" : ""
                    }`}
                  >
                    Post to Bulletin
                  </Link>
                </Menu.Item>
              </Menu.SubMenu>
            )}
          </Menu>
        </div>
      </ConfigProvider>
    </Sider>
  );
};

export default SideMenu;
