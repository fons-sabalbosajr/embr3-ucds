import React, { useState, useEffect } from "react";
import {
  Layout,
  Button,
  Tooltip,
  Dropdown,
  Menu,
  Avatar,
  Badge,
  Spin,
  Popover,
  List,
  Switch,
} from "antd";
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { Routes, Route, useNavigate } from "react-router-dom";
import axios from "axios";
import Logo from "./components/Logo";
import MenuList from "./components/MenuList";
import Dashboard from "./menu-component/Dashboard";
import Province from "./menu-province/Province";
import Survey from "./menu-component/Survey";
import MBU from "./menu-component/MBU";
import ExportData from "./menu-component/ExportData";
import Admin from "./menu-component/Admin";
import "./index.css";
import { DataProvider } from "./menu-province/DataContext";
import embLogo from "./assets/emblogomenu.png";

const { Header, Sider, Content } = Layout;

const Universe = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [notifications, setNotifications] = useState([]); // For notification badge
  const navigate = useNavigate();

  const [theme, setTheme] = useState("dark");

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    // You can also apply theme changes to your application here
  };

  axios.defaults.withCredentials = true;

  // Check authentication status on component mount
  useEffect(() => {
    axios
      .get("/check-auth", { withCredentials: true })
      .then((res) => {
        if (res.data.status === "Success") {
          setAuth(true);
          setName(res.data.name);
          setNotifications(res.data.notifications || []); // Set notifications if available
        } else {
          setAuth(false);
          navigate("/login", { replace: true });
        }
      })
      .catch((err) => {
        setAuth(false);
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  // Handle user logout
  const handleLogout = () => {
    axios
      .get("/logout", { withCredentials: true })
      .then((res) => {
        if (res.data.status === "Logout Success") {
          localStorage.removeItem("authToken"); // Clear token from local storage
          navigate("/login", { replace: true });
        } else {
          console.error("Unexpected response during logout:", res.data);
        }
      })
      .catch((err) => {
        console.error("Error during logout:", err.message);
      });
  };

  // User menu for profile and logout options
  const userMenu = (
    <Menu>
      <Menu.Item key="profile" onClick={() => navigate("/profile")}>
        View Profile
      </Menu.Item>
      <Menu.Item key="logout" onClick={handleLogout}>
        <LogoutOutlined /> Logout
      </Menu.Item>
    </Menu>
  );

  const popoverContent = (
    <List
      dataSource={notifications}
      renderItem={(item) => <List.Item>{item.message}</List.Item>}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {auth && (
        <Sider
          width={250}
          collapsible
          trigger={null}
          collapsed={collapsed}
          className="sidebar"
          theme={theme}
        >
          {!collapsed && <Logo theme={theme} />}{" "}
          {/* Render the Logo component only when the menu is expanded */}
          {collapsed && (
            <div
              className={`logo ${
                theme === "dark" ? "dark-theme" : "light-theme"
              }`}
            >
              <img
                src={embLogo}
                alt="Sample Logo"
                className="collapsed-logo"
                title="EMBR3 UCDS"
              />
            </div>
          )}
          <MenuList
            navigate={navigate}
            theme={theme}
            toggleTheme={toggleTheme}
          />
          <Tooltip title="Toggle Menu" placement="left">
            <Button
              type="text"
              className="toggle"
              onClick={() => setCollapsed(!collapsed)}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              style={{ backgroundColor: "#B6BBC4" }}
            />
          </Tooltip>
        </Sider>
      )}

      <Layout>
        {auth && (
          <Header
            className={`header-container ${
              theme ===  "dark" ? "dark-theme" : "light-theme"
            }`}
            theme={theme}
            toggleTheme={toggleTheme}
          >
            <div
              className="profile_container"
              style={{
                display: "flex",
                justifyContent: "flex-end", // Aligns elements to the right
                alignItems: "center", // Vertically center elements
                padding: "10px 20px", // Add padding to the container
              }}
            >
              {!collapsed}
              <span
                className={`user-name ${
                  theme ===  "dark" ? "dark-theme" : "light-theme"
                }`}
              >
                Hi, {name}
              </span>

              {/* Notification badge with tooltip */}
              <Popover
                content={popoverContent}
                title="Notifications"
                trigger="click"
                placement="bottomRight" // Ensures it opens to the bottom-right
                overlayStyle={{ width: "600px", maxWidth: "800px" }} // Custom width for larger popover
              >
                <Badge count={notifications.length} offset={[10, 0]}>
                  <BellOutlined
                    className={`notification-icon ${
                      theme === "light" ? "light-theme-icon" : "dark-theme-icon"
                    }`}
                  />
                </Badge>
              </Popover>

              {/* User profile and logout options */}
              <Dropdown overlay={userMenu} placement="bottomRight">
                <Avatar
                  icon={<UserOutlined />}
                  style={{ marginRight: "20px", fontSize: "24px" }}
                  theme={theme}
                  toggleTheme={toggleTheme}
                />
              </Dropdown>

              <div
                className={`theme-switch ${
                  theme === "light" ? "light-theme-icon" : "dark-theme-icon"
                }`}
              >
                <Button
                  className="theme-button"
                  type="text"
                  onClick={toggleTheme}
                  icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
                />
              </div>
            </div>
          </Header>
        )}

        <DataProvider>
          {" "}
          {/* Wrapping all content within DataProvider */}
          {auth && (
            <Content style={{ padding: "24px", backgroundColor: "#F0F2F5" }}>
              {/* Spin during authentication */}
              <Spin spinning={!auth}>
                <Routes>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route
                    path="/province/:provinceName"
                    element={<Province />}
                  />
                  <Route path="survey" element={<Survey />} />
                  <Route path="mbu" element={<MBU />} />
                  <Route path="exportdata" element={<ExportData />} />
                  <Route path="admin" element={<Admin />} />
                </Routes>
              </Spin>
            </Content>
          )}
        </DataProvider>
      </Layout>
    </Layout>
  );
};

export default Universe;
