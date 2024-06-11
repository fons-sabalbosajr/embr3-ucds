import React, { useState } from "react";
import { ConfigProvider, Menu, Button, Tooltip, Switch } from "antd";
import {
  DashboardFilled,
  CheckCircleFilled,
  PushpinFilled,
  DownCircleFilled,
  SettingFilled,
} from "@ant-design/icons";
import { Link, useNavigate, useLocation } from "react-router-dom";

const MenuList = ({ refreshDashboard, theme, toggleTheme }) => {
  const location = useLocation();
  const navigate = useNavigate(); // Initialize the navigate function from `react-router-dom`

  const handleDashboardClick = () => {
    refreshDashboard(); // Call the refresh function
  };

  const handleExportDataClick = () => {
    navigate("/universe/exportdata"); // navigate to Export Data
  };

  const handleAdminDataClick = () => {
    navigate("/universe/admin"); // navigate to Admin
  };

  const isMenuSelected = (path) => {
    return location.pathname.includes(path);
  };

  return (
    <ConfigProvider>
      <div className="menu-bar-container">
        <Menu
          mode="inline"
          className="menu-bar"
          theme={theme}
          //selectedKeys={location.pathname === "/universe/dashboard" ? ["dashboard"] : []}
          defaultOpenKeys={["reports"]}
        >
          <Menu.Item
            key="dashboard"
            icon={<DashboardFilled />}
            className="menu-bar-item"
          >
            <Link
              to="/universe/dashboard"
              className="link-menu"
              //onClick={handleDashboardClick}
            >
              Dashboard
            </Link>
          </Menu.Item>

          <Menu.SubMenu
            key="submonitoring"
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

          <Menu.SubMenu
            key="subreports"
            icon={<PushpinFilled />}
            title="Reports"
          >
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
          </Menu.SubMenu>

          <Menu.Item key="export" icon={<DownCircleFilled />}>
            <Link
              to="/universe/exportdata"
              className="link-menu"
              onClick={handleExportDataClick}
            >
              Export Data
            </Link>
          </Menu.Item>

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
                to="/universe/extract"
                className={`link-menu-hover ${
                  isMenuSelected("extract") ? "selected" : ""
                }`}
              >
                Extract Data
              </Link>
            </Menu.Item>
            <Menu.Item key="admin-3">
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
        </Menu>
        {/* <div className="theme-switch">
        <Switch
          checked={theme === "dark"}
          onChange={toggleTheme}
          checkedChildren="Dark"
          unCheckedChildren="Light"
        />
      </div> */}
      </div>
    </ConfigProvider>
  );
};

export default MenuList;
