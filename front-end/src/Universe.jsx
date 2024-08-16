import React, { useState, useEffect } from "react";
import NiceAvatar from "react-nice-avatar";
import { Layout, Button, Avatar, Spin, Popover, List, message } from "antd";
import { UserOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import Dashboard from "./menu-component/Dashboard";
import Province from "./menu-province/Province";
import Survey from "./menu-survey/Survey";
import MBU from "./menu-mbu/MBU";
import Admin from "./menu-component/Admin";
import Accounts from "./menu-component/UserAccounts";
import Extract from "./menu-extract/ExtractData";
import Report from "./menu-component/Admin";
import Posting from "./menu-component/Posting";
import "./index.css";
import { DataProvider } from "./menu-province/DataContext";
import UserPopover from "./components/PopOverUser";
import NotificationsPopover from "./components/PopOverNotification";
import SideMenu from "./components/SideMenu";
import AvatarWithName from "./components/AvatarwithName";
import ActivityLog from "./components/ActivityLog/ActivityLog";
import Z_CustomSpinner from "./Z_CustomSpinner";

const { Header, Content } = Layout;

const Universe = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [userHandle, setUserHandle] = useState("");
  const [selection, setSelection] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [avatar, setAvatar] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [user, setUser] = useState(null);
  const backendUrl = "https://embr3-ucds.onrender.com";
  const [isRetrying, setIsRetrying] = useState(false);

  const getInitials = (name) => {
    const splitName = name.split(" ");
    const initials = splitName.map((part) => part[0].toUpperCase());
    return initials.join("");
  };

  axios.defaults.withCredentials = true;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("jwtToken");

        if (!token) {
          console.log("No token found, redirecting to login.");
          navigate("/login");
          return;
        }

        const response = await axios.get(`${backendUrl}/check-auth`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.data.status === "Success") {
          setUser(response.data);
          setName(response.data.name);
          setAvatar(response.data.avatar);
          setPermissions(response.data.permissions);
          setAuth(true);
        } else {
          throw new Error("Authentication failed");
        }
      } catch (error) {
        console.error("Error during authentication check:", error);
        message.error("Authentication failed. Please log in again.");
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const storedPermissions = JSON.parse(localStorage.getItem("permissions"));
    if (storedPermissions) {
      setPermissions(storedPermissions);
    }
  }, []);


  const handleRetry = async () => {
    setIsRetrying(true);
    setErrorMessage("");

    try {
      const response = await axios.get(`${backendUrl}/check-auth`, {
        withCredentials: true,
      });

      console.log("Full response object:", response);
      console.log("Authenticated successfully:", response.data);

      if (response.data?.status === "Success") {
        setUser(response.data);
        setName(response.data.name);
        setAvatar(response.data.avatar || "default-avatar-url");
        setPermissions(response.data.permissions);
        setAuth(true);
        navigate("/universe");
      } else {
        setErrorMessage("Authentication failed. Please log in again.");
      }
    } catch (error) {
      console.error("Error during authentication check:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading) {
    return <Z_CustomSpinner />;
  }

  if (!auth) {
    return <Navigate to="/login" />;
  }

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  const handleVisibleChange = (visible) => {
    if (!visible) {
      setSelection("");
    }
  };

  const handleMenuItemClick = (key) => {
    setSelection(key);
  };

  const handleLogout = async () => {
    try {
      const response = await axios.post(
        `${backendUrl}/logout`,
        {},
        { withCredentials: true }
      );
      if (response.status === 200) {
        localStorage.removeItem("jwtToken");
        navigate("/login");
      } else {
        console.error("Unexpected response status:", response.status);
        message.error("Logout failed. Please try again.");
      }
    } catch (error) {
      console.error("Error during logout:", error);
      message.error("Logout failed. Please try again.");
    }
  };

  const handleHelp = () => {
    alert("Help requested!");
  };

  const popoverContent = (
    <List
      dataSource={notifications}
      renderItem={(item) => <List.Item>{item.message}</List.Item>}
    />
  );

  return (
    <Layout className="layout-container">
      <SideMenu
        theme={theme}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        permissions={permissions}
      />

      <Layout>
        {auth && (
          <Header
            className={`header-container ${
              theme === "dark" ? "dark-theme" : "light-theme"
            }`}
          >
            <div className="header-content">
              <div className="profile_container">
                <span
                  className={`user-name ${
                    theme === "dark" ? "dark-theme" : "light-theme"
                  }`}
                >
                  {name}
                </span>
                <NotificationsPopover
                  popoverContent={popoverContent}
                  theme={theme}
                  notifications={notifications}
                />
                <Popover
                  content={
                    <UserPopover
                      name={name}
                      userHandle={userHandle}
                      handleMenuItemClick={handleMenuItemClick}
                      navigate={navigate}
                      handleLogout={handleLogout}
                      getInitials={getInitials}
                      toggleTheme={toggleTheme}
                      selection={selection}
                      handleVisibleChange={handleVisibleChange}
                    />
                  }
                  trigger="click"
                  placement="bottomRight"
                  theme={theme === "dark" ? "dark-theme" : "light-theme"}
                  onVisibleChange={handleVisibleChange}
                >
                  <div className="avatar-header">
                  <AvatarWithName name={name} avatar={avatar} />
                  </div>
                </Popover>

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
            </div>
          </Header>
        )}

        <DataProvider>
          {auth && (
            <Content className="content-container">
              <Spin spinning={!auth}>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="dashboard" replace />}
                  />
                  <Route
                    path="dashboard"
                    element={<Dashboard avatar={avatar} name={name} />}
                  />
                  <Route
                    path="/province/:provinceName"
                    element={<Province />}
                  />
                  <Route path="survey" element={<Survey />} />
                  <Route path="mbu" element={<MBU />} />
                  {permissions.includes("admin") && (
                    <Route path="admin" element={<Admin />} />
                  )}
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="extract/*" element={<Extract />} />
                  <Route path="admin-report" element={<Report />} />
                  <Route path="posting" element={<Posting />} />
                  <Route path="activitylog" element={<ActivityLog />} />
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
