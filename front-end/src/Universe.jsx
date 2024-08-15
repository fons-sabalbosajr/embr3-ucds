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
  const [avatar, setAvatar] = useState("default-avatar-url");
  const [errorMessage, setErrorMessage] = useState("");

  axios.defaults.withCredentials = true;

  const getInitials = (name) => {
    const splitName = name.split(" ");
    const initials = splitName.map((part) => part[0].toUpperCase());
    return initials.join("");
  };

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
        "https://embr3-ucds.onrender.com/logout",
        {},
        { withCredentials: true }
      );
      if (response.status === 200) {
        localStorage.removeItem("permission");
        navigate("/login"); // Redirect to login page after logout
      } else {
        console.error("Unexpected response status:", response.status);
        message.error("Logout failed. Please try again.");
      }
    } catch (error) {
      console.error(
        "Error during logout:",
        error.response ? error.response.data : error.message
      );
      message.error("Logout failed. Please try again.");
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setErrorMessage("");
    fetchAuthStatus();
  };

  const handleHelp = () => {
    alert("Help requested!");
  };

  const fetchAuthStatus = async () => {
    try {
      const res = await axios.get("https://embr3-ucds.onrender.com/check-auth", {
        withCredentials: true,
      });
  
      if (res.status === 200 && res.data.status === "Success") {
        setAuth(true);
  
        // Ensure `division` is defined before splitting
        const divisionParts = (res.data.division || "").split("/");
        const formattedName = `${divisionParts[0]} | ${res.data.name}`;
  
        setName(formattedName);
        setUserHandle(res.data.username || "Unknown User");
        setNotifications(res.data.notifications || []);
        setPermissions(res.data.permissions || []);
        localStorage.setItem(
          "permissions",
          JSON.stringify(res.data.permissions || [])
        );
  
        // Fetch user avatar
        try {
          const avatarRes = await axios.get(
            "https://embr3-ucds.onrender.com/api/user/avatar",
            {
              params: { name: res.data.username }, // Ensure you are sending the correct name
            }
          );
  
          if (avatarRes.data.avatar) {
            setAvatar(avatarRes.data.avatar);
          } else {
            console.warn("Avatar not found, setting default avatar.");
            setAvatar(null); // Set to null to trigger default avatar
          }
        } catch (avatarError) {
          console.error("Error fetching avatar:", avatarError.message);
          setAvatar(null); // Set to null to trigger default avatar
        }
      } else {
        // Handle 401 error and other errors
        if (res.status === 401) {
          console.log("User is not authenticated");
          setAuth(false);
          navigate("/login", { replace: true });
        } else {
          console.error("Error fetching auth status:", res.statusText);
          setErrorMessage(
            "Error fetching authentication status. Please try again."
          );
          setAuth(false);
        }
      }
    } catch (err) {
      console.error("Error fetching auth status:", err.message);
      setErrorMessage(
        "Error fetching authentication status. Please try again."
      );
      setAuth(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthStatus();
  }, [navigate]);

  useEffect(() => {
    const storedPermissions = JSON.parse(localStorage.getItem("permissions"));
    if (storedPermissions) {
      setPermissions(storedPermissions);
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {};

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const popoverContent = (
    <List
      dataSource={notifications}
      renderItem={(item) => <List.Item>{item.message}</List.Item>}
    />
  );

  if (loading || errorMessage) {
    return (
      <Z_CustomSpinner
        errorMessage={errorMessage}
        onRetry={handleRetry}
        onHelp={handleHelp}
      />
    );
  }

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
                   <AvatarWithName avatar={avatar} />
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
