import React, { useState, useEffect, useCallback } from "react";
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
import CryptoJS from "crypto-js";
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
import Monitoring from "./menu-planning/monitoring/Monitoring";
import MonitoringSurvey from "./menu-planning/survey/monitoring_survey";
import Validations from "./menu-planning/validations/Validations";
import RecordsConfig from "./menu-records/recordsconfig/RecordsConfig";
import RecordsActivity from "./menu-records/recordsactivity/RecordsActivity";
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
  const [userProvinceStringPermissions, setUserProvinceStringPermissions] = useState({});
  const [userRole, setUserRole] = useState(""); // New state for the user's role string

  const backendUrl = "http://localhost:8081";
  const navigate = useNavigate();
  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;
  const [provinceAccess, setProvinceAccess] = useState({
    aurora: false,
    bataan: false,
    bulacan: false,
    nuevaEcija: false,
    pampanga: false,
    tarlac: false,
    zambales: false,
  });

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

      // Process base permissions (ensure they are boolean)
      const basePermissions = [
        !!data.canGenerateData,
        !!data.canManageData,
        !!data.canViewAdminPanel,
        !!data.canViewDataHistory,
        !!data.canAccessRangePicker,
      ];

      // Process province permissions (convert "view"/"readWrite" to true, "none" or others to false)
      const provinceKeys = ['aurora', 'bataan', 'bulacan', 'nuevaEcija', 'pampanga', 'tarlac', 'zambales'];
      const provincePermissionsAsBooleans = provinceKeys.map(key => {
        const permissionString = data[key];
        return permissionString === 'view' || permissionString === 'readWrite';
      });

      const newProvinceStringPermissions = {};
      provinceKeys.forEach(key => {
        newProvinceStringPermissions[key] = data[key] || 'none'; // Store "view", "readWrite", or "none"
      });
      setUserProvinceStringPermissions(newProvinceStringPermissions);

      setUserRole(data.permission || "viewer"); // Store the user's role, default to 'viewer'
      setPermissions([...basePermissions, ...provincePermissionsAsBooleans]);

      setUserHandle(data.username);
      setDivision(data.division || "");

      // Set provinceAccess state for components like Dashboard
      const newProvinceAccessState = {};
      provinceKeys.forEach(key => {
        const permissionString = data[key];
        newProvinceAccessState[key] = permissionString === 'view' || permissionString === 'readWrite';
      });
      setProvinceAccess(newProvinceAccessState);

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

  // Define fetchDataIssues outside of useEffect, memoized with useCallback
  const fetchDataIssues = useCallback(async () => {
    if (!auth) return; // Ensure auth is true before fetching
      setIsLoading(true); // Set loading for notifications
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
        // setPopoverContents(combined); // REMOVE THIS LINE
      } catch (err) {
        console.error("Fetch error:", err);
        const errorMsg = ["Error fetching data issues."];
        setNotifications(errorMsg);
        // setPopoverContents(errorMsg); // REMOVE THIS LINE
      } finally {
        setIsLoading(false); // Clear loading for notifications
      }
  }, [auth, backendUrl, setIsLoading, setNotifications]); // Add dependencies

  useEffect(() => {
    if (!auth) return; // Only fetch if authenticated
    fetchDataIssues();
    // If you need polling, you can set it up here, calling the memoized fetchDataIssues
  }, [auth, fetchDataIssues]); // fetchDataIssues is now a dependency

  useEffect(() => {
    const encrypted = localStorage.getItem("hideThemeHint");
    if (encrypted && encryptionKey) {
      try {
        const bytes = CryptoJS.AES.decrypt(encrypted, encryptionKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (decrypted === "true") {
          setShowThemeHint(false);
          return;
        }
      } catch (err) {
        // fallback: show the hint if decryption fails
      }
    }
    setShowThemeHint(true);
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
    // Clear localStorage and force reload immediately
    localStorage.clear();
    window.location.replace("/login");

    // Optionally, notify the backend (this runs in the background)
    try {
      await axios.post(`${backendUrl}/logout`, {}, { withCredentials: true });
    } catch (err) {
      // Even if the backend fails, the user is logged out on the client
      // Optionally log error
    }
  };

  const handleDismissHint = () => {
    setShowThemeHint(false);
  };

  const handleDontShowAgainHint = () => {
    if (encryptionKey) {
      const encrypted = CryptoJS.AES.encrypt("true", encryptionKey).toString();
      localStorage.setItem("hideThemeHint", encrypted);
    } else {
      localStorage.setItem("hideThemeHint", "true");
    }
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

  const provinceKeysForCurrentUser = ['aurora', 'bataan', 'bulacan', 'nuevaEcija', 'pampanga', 'tarlac', 'zambales'];
  const provinceStringPermissions = {};
  provinceKeysForCurrentUser.forEach(key => {
    provinceStringPermissions[key] = permissions 
  });


  const currentUser = {
    name,
    username: userHandle,
    avatar,
    division,
    permissions,
    role: userRole, // Add the user's role string
    provinceStringPermissions: userProvinceStringPermissions, // Add this line
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
            provinceAccess={provinceAccess}
          />
          <Layout>
            <Header className={`header-container ${theme}-theme`}>
              <div className="header-content">
                <div className="profile_container">
                  <span className="user-name">
                    {name} | {division}
                  </span>

                    <NotificationsPopover
                    // popoverContent={popoverContents} // REMOVE THIS PROP
                    theme={theme}
                    notifications={notifications}
                    isLoading={isLoading} // Pass the loading state for notifications
                    className="notification-icon"
                    currentUser={currentUser}
                    refreshNotifications={fetchDataIssues} // Pass the refresh handler
                  />

                  <Popover
                    content={
                      <UserPopover
                        name={name}
                        handleLogout={handleLogout}
                        toggleTheme={toggleTheme}
                        userHandle={userHandle}
                        userData={currentUser}
                        theme={theme}
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
                    <Dashboard avatar={avatar} name={name} theme={theme} provinceAccess={provinceAccess}  />
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
                <Route
                  path="planning-unit/monitoring"
                  element={<Monitoring theme={theme} />}
                />
                <Route
                  path="planning-unit/survey-activities" // Path updated to match SideMenu
                  element={<MonitoringSurvey theme={theme} />}
                /> 
                <Route
                  path="planning-unit/validations"
                  element={<Validations theme={theme} />}
                />
                <Route
                  path="records/config"
                  element={<RecordsConfig theme={theme} />}
                />
                <Route
                  path="records/activity"
                  element={<RecordsActivity theme={theme} />}
                />
                <Route
                  path="admin"
                  element={<Admin theme={theme} />}
                />

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
