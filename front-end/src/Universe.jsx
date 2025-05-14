import React, { useState, useEffect } from "react";
import {
  Layout,
  Button,
  Spin,
  Popover,
  List,
  message,
  ConfigProvider,
  theme as antdTheme,
} from "antd";
import { UserOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import "./index.css";
import Dashboard from "./menu-component/Dashboard";
import Province from "./menu-province/Province";
import Survey from "./menu-survey/Survey";
import Healthcare from "./menu-healthcare/Healthcare";
import Chemicals from "./menu-chemicals/Chemicals";
import TSD from "./menu-tsd/TSDPermits";
import TRC from "./menu-trc/TRCPermits";
import MBU from "./menu-mbu/MBU";
import Admin from "./menu-component/Admin";
import Accounts from "./menu-component/UserAccounts";
import Extract from "./menu-extract/ExtractData";
import Report from "./menu-component/Admin";
import Posting from "./menu-component/Posting";
import ESWM from "./menu-eswm/ESWM";
import ActivityLog from "./components/ActivityLog/ActivityLog";
import Duplicates from "./menu-archive/ArchiveData";
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import UserPopover from "./components/PopOverUser";
import Z_CustomSpinner from "./Z_CustomSpinner";
import { DataProvider } from "./menu-province/DataContext";

const { Header, Content } = Layout;

const Universe = () => {
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [userHandle, setUserHandle] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [division, setDivision] = useState("");
  const [theme, setTheme] = useState("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [popoverContents, setPopoverContents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showThemeHint, setShowThemeHint] = useState(false);

  const backendUrl = "http://localhost:8081";
  const navigate = useNavigate();

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${backendUrl}/check-auth`, {
        withCredentials: true,
      });

      if (data.status !== "Success") throw new Error();

      setName(data.name);
      setAvatar(
        data.avatar
          ? `${backendUrl}${data.avatar}`
          : "path/to/default-avatar.png"
      );
      setPermissions(
        data.permissions?.length
          ? data.permissions
          : [
              data.canGenerateData,
              data.canManageData,
              data.canViewAdminPanel,
              data.canViewDataHistory,
              data.canAccessRangePicker,
              data.aurora,
              data.bataan,
              data.bulacan,
              data.nuevaEcija,
              data.pampanga,
              data.tarlac,
              data.zambales,
            ]
      );
      setUserHandle(data.username);
      setDivision(data.division || "");
      setAuth(true);
      setErrorMessage("");
    } catch {
      setAuth(false);
      setErrorMessage(
        "Authentication failed. Please check your credentials and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!auth) return;

    const fetchDataIssues = async () => {
      setIsLoading(true);
      try {
        const dataIssuesRes = await axios.post(`${backendUrl}/api/check-data`);
        const duplicateIssuesRes = await axios.get(
          `${backendUrl}/api/ucds/duplicates`
        );

        const dataIssues = Array.isArray(dataIssuesRes.data.issues)
          ? dataIssuesRes.data.issues
          : [dataIssuesRes.data.issues || "No issues detected"];

        const duplicateIssues = duplicateIssuesRes.data.duplicates.map((d) => ({
          idNos: d.idNos,
          ecc_cnc: d.ecc_cnc,
          count: d.count,
        }));

        const combined = [...dataIssues, ...duplicateIssues];
        setNotifications(combined);
        setPopoverContents(combined);
      } catch (err) {
        console.error("Fetch error:", err);
        const errorMsg = ["Error fetching data issues."];
        setNotifications(errorMsg);
        setPopoverContents(errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDataIssues();
  }, [auth]);

  useEffect(() => {
    const hintHidden = localStorage.getItem("hideThemeHint");
    if (!hintHidden) {
      setShowThemeHint(true);
    }
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    checkAuth();
    setRetrying(false);
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);

    // Dynamically update the theme on the body element
    document.body.setAttribute("data-theme", newTheme);
  };

  const handleLogout = async () => {
    try {
      const res = await axios.post(
        `${backendUrl}/logout`,
        {},
        { withCredentials: true }
      );
      if (res.status === 200) {
        localStorage.clear();
        navigate("/login");
      } else {
        message.error("Logout failed. Please try again.");
      }
    } catch (err) {
      console.error("Logout error:", err);
      message.error("Logout failed. Please try again.");
    }
  };

  const handleDismissHint = () => {
    setShowThemeHint(false);
  };

  const handleDontShowAgainHint = () => {
    localStorage.setItem("hideThemeHint", "true");
    setShowThemeHint(false);
  };

  if (loading) return <Z_CustomSpinner />;

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

  const themeConfig = {
    algorithm:
      theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#296ba8", // Keep the primary color if you want to maintain it
      colorBgContainer: theme === "dark" ? "#121212" : "#f4f4f4", // Change to a lighter color (you can choose any color you like)
      colorText: theme === "dark" ? "#e0e0e0" : "#333333", // Adjust text color for dark/light mode
    },
  };

  const currentUser = {
    name,
    username: userHandle,
    avatar,
    division,
    permissions,
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <DataProvider>
        <Layout className={`layout-container ${theme}-theme`}>
          <SideMenu
            theme={theme}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            permissions={permissions}
            currentUser={currentUser}
          />
          <Layout>
            <Header className={`header-container ${theme}-theme`}>
              <div className="header-content">
                <div className="profile_container">
                  <span className="user-name">
                    {name} | {division}
                  </span>

                  <NotificationsPopover
                    popoverContent={popoverContents}
                    theme={theme}
                    notifications={notifications}
                    isLoading={isLoading}
                    className="notification-icon"
                    currentUser={currentUser}
                  />

                  <Popover
                    content={
                      <UserPopover
                        name={name}
                        handleLogout={handleLogout}
                        toggleTheme={toggleTheme}
                        userHandle={userHandle}
                        userData={currentUser}
                      />
                    }
                    trigger="click"
                    placement="bottomRight"
                  >
                    <div className="avatar-header">
                      <AvatarWithName userHandle={userHandle} />
                    </div>
                  </Popover>

                  <Popover
                    open={showThemeHint}
                    title="Toggle Theme"
                    content={
                      <div
                        style={{
                          maxWidth: 220,
                          fontSize: "12px",
                          padding: "4px 0",
                        }}
                      >
                        <p style={{ marginBottom: 8 }}>
                          Click to switch between light and dark mode.
                        </p>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 6,
                          }}
                        >
                          <Button size="small" onClick={handleDismissHint}>
                            Dismiss
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            onClick={handleDontShowAgainHint}
                          >
                            Don’t Show Again
                          </Button>
                        </div>
                      </div>
                    }
                    placement="bottomRight"
                    className={theme === "dark" ? "dark-mode" : ""}
                  >
                    <Button
                      className="theme-button"
                      type="text"
                      onClick={toggleTheme}
                      icon={
                        theme === "dark" ? (
                          <SunOutlined style={{ fontSize: 15 }} />
                        ) : (
                          <MoonOutlined style={{ fontSize: 15 }} />
                        )
                      }
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  </Popover>
                </div>
              </div>
            </Header>

            <Content className="content-container">
              <Routes>
                <Route path="/" element={<Navigate to="dashboard" replace />} />
                <Route
                  path="dashboard"
                  element={
                    <Dashboard avatar={avatar} name={name} theme={theme} />
                  }
                />
                <Route
                  path="/province/:provinceName"
                  element={<Province currentUser={currentUser} theme={theme} />}
                />
                <Route
                  path="survey"
                  element={<Survey currentUser={currentUser} theme={theme} />}
                />
                <Route
                  path="healthcare"
                  element={<Healthcare theme={theme} />}
                />
                <Route path="chemicals" element={<Chemicals theme={theme} />} />
                <Route path="tsd" element={<TSD theme={theme} />} />
                <Route path="trc" element={<TRC theme={theme} />} />
                <Route path="mbu" element={<MBU theme={theme} />} />
                <Route path="eswm-database" element={<ESWM theme={theme} />} />
                <Route path="accounts" element={<Accounts theme={theme} />} />
                <Route path="extract" element={<Extract theme={theme} />} />
                <Route
                  path="activity-log"
                  element={<ActivityLog theme={theme} />}
                />
                <Route path="admin" element={<Admin theme={theme} />} />
                <Route path="report" element={<Report theme={theme} />} />
                <Route path="posting" element={<Posting theme={theme} />} />
                <Route
                  path="duplicates"
                  element={<Duplicates theme={theme} />}
                />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </DataProvider>
    </ConfigProvider>
  );
};

export default Universe;
