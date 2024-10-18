import React, { useState, useEffect } from "react";
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
import Duplicates from "./menu-archive/ArchiveData";
import ESWM from "./menu-eswm/ESWM";
import Z_CustomSpinner from "./Z_CustomSpinner";

const { Header, Content } = Layout;

const Universe = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [permissions, setPermissions] = useState([]);
  const [avatar, setAvatar] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [userHandle, setUserHandle] = useState(null);
  const [division, setDivision] = useState("");

  const backendUrl = "http://localhost:8081";
  const navigate = useNavigate();

  const checkAuth = async () => {
    try {
      const response = await axios.get(`${backendUrl}/check-auth`, {
        withCredentials: true,
      });
  
      if (response.data.status === "Success") {
        const {
          name,
          avatar,
          permissions,
          username,
          division,
          canGenerateData,
          canManageData,
          canViewAdminPanel,
          canViewDataHistory,
          canAccessRangePicker,
        } = response.data;
  
        // Log full server response
        //console.log("Full server response:", response.data);
  
        setName(name);
        setAvatar(avatar || "default-avatar-url");
  
        const finalPermissions = permissions && permissions.length > 0
          ? permissions
          : [
              canGenerateData || false,
              canManageData || false,
              canViewAdminPanel || false,
              canViewDataHistory || false,
              canAccessRangePicker || false,
            ];
        

        // // Log the permissions to the console
        // console.log("Permissions from server:", permissions);
        // console.log("Final Permissions:", finalPermissions);
        // console.log("Individual Permissions:");
        // console.log("Can Generate Data:", canGenerateData);
        // console.log("Can Manage Data:", canManageData);
        // console.log("Can View Admin Panel:", canViewAdminPanel);
        // console.log("Can View Data History:", canViewDataHistory);
        // console.log("Can Access Range Picker:", canAccessRangePicker);
  
        setPermissions(finalPermissions);
  
        setUserHandle(username);
        setDivision(division || "");
        setAuth(true);
        setErrorMessage("");
      } else {
        throw new Error("Authentication failed");
      }
    } catch (error) {
      console.error("Error during authentication check:", error);
      setErrorMessage(
        "Authentication failed. Please check your credentials and try again."
      );
      setAuth(false);
    } finally {
      setLoading(false);
    }
  };
  
  

  useEffect(() => {
    checkAuth();
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    checkAuth();
    setRetrying(false);
  };

  const currentUser = {
    name,
    username: userHandle,
    avatar,
    division,
    permissions,
  };

  if (loading) {
    return <Z_CustomSpinner />;
  }

  if (!auth) {
    return (
      <div className="error-container">
        <h2>{errorMessage}</h2>
        <Button onClick={handleRetry} loading={retrying}>
          Retry
        </Button>
        <Navigate to="/login" />
      </div>
    );
  }

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const handleLogout = async () => {
    try {
      const response = await axios.post(
        `${backendUrl}/logout`,
        {},
        { withCredentials: true }
      );

      if (response.status === 200) {
        localStorage.clear();
        navigate("/login");
      } else {
        message.error("Logout failed. Please try again.");
      }
    } catch (error) {
      console.error("Error during logout:", error);
      message.error("Logout failed. Please try again.");
    }
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
        currentUser={currentUser}
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
                  {name} | {division}
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
                      handleLogout={handleLogout}
                      toggleTheme={toggleTheme}
                      userHandle={userHandle}
                    />
                  }
                  trigger="click"
                  placement="bottomRight"
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
              <Routes>
                <Route path="/" element={<Navigate to="dashboard" replace />} />
                <Route
                  path="dashboard"
                  element={<Dashboard avatar={avatar} name={name} />}
                />
                <Route
                  path="/province/:provinceName"
                  element={<Province currentUser={currentUser} />}
                />
                <Route
                  path="survey"
                  element={<Survey currentUser={currentUser} />}
                />
                <Route path="mbu" element={<MBU />} />
                <Route path="eswm-database" element={<ESWM />} />
                {permissions.includes("admin") && (
                  <Route path="admin" element={<Admin />} />
                )}
                <Route path="accounts" element={<Accounts />} />
                <Route path="extract/*" element={<Extract />} />
                <Route path="admin-report" element={<Report />} />
                <Route path="posting" element={<Posting />} />
                <Route path="activitylog" element={<ActivityLog />} />
                <Route path="duplicate-firms" element={<Duplicates />} />
              </Routes>
            </Content>
          )}
        </DataProvider>
      </Layout>
    </Layout>
  );
};

export default Universe;
