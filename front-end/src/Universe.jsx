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
import {
  checkUserAuth,
  fetchDataValidationIssues,
  fetchDuplicateDataIssues,
  logoutUserService,
} from "./api/universeService"; // Import services
import { API_BASE_URL as backendUrl } from "./config/api";
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
import SWMPlan from "./menu-eswm/SWMPlan/SWMPlan"; // Added
import MRF from "./menu-eswm/MRF/MRF"; // Added
import SLF from "./menu-eswm/SLF/SLF"; // Added
import ODS from "./menu-eswm/ODS/ODS"; // Added
import Equipments from "./menu-eswm/Equipments/Equipments"; // Added
import ActivityLog from "./components/ActivityLog/ActivityLog";
import Duplicates from "./menu-duplicates/DuplicatesData";
import Monitoring from "./menu-planning/monitoring/Monitoring";
import MonitoringSurvey from "./menu-planning/survey/monitoring_survey";
import Validations from "./menu-planning/validations/Validations";
import RegisterConfig from "./menu-register-config/RegisterConfig";
import RegisterActivity from "./menu-register-config/RegisterActivity";
import FieldManagement from "./menu-developer/FieldManagement";
import DatabaseSettings from "./menu-developer/DatabaseSettings";
import PdfForms from "./menu-developer/PdfForms";
import ActivityHistoryConfig from "./menu-developer/ActivityHistoryConfig";
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import UserPopover from "./components/PopOverUser/PopOverUser";
import Z_CustomSpinner from "./Z_CustomSpinner";
import YearSwitcher from "./components/YearSwitcher";
import { DataProvider } from "./menu-province/DataContext";
import EnvStatus from "./components/EnvStatus";
import moment from "moment";

// ERMS Components
import NasDashboard from "./menu-nas/dashboard/NasDashboard";
import NasBrowser from "./menu-nas/browser/NasBrowser";
import NasStorageConfig from "./menu-nas/storage/NasStorageConfig";
import NasSettings from "./menu-nas/settings/NasSettings";

// Legal Services Unit Components
import LegalDashboard from "./menu-legal/legal-dashboard/LegalDashboard"; // Assuming these are the correct paths
import LegalDocket from "./menu-legal/docket/LegalDocket";
import EnviLaws from "./menu-legal/envi-laws/EnviLaws";
import { ROUTES } from "./config/routes";

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
  const [userProvinceStringPermissions, setUserProvinceStringPermissions] =
    useState({});
  const [userRole, setUserRole] = useState(""); // New state for the user's role string
  const [now, setNow] = useState(moment());

  // backendUrl is now imported from universeService
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
      const data = await checkUserAuth(); // Use service
      // The service now ensures data.status is "Success" or throws
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
      const provinceKeys = [
        "aurora",
        "bataan",
        "bulacan",
        "nuevaEcija",
        "pampanga",
        "tarlac",
        "zambales",
      ];
      const provincePermissionsAsBooleans = provinceKeys.map((key) => {
        const permissionString = data[key];
        return permissionString === "view" || permissionString === "readWrite";
      });

      const newProvinceStringPermissions = {};
      provinceKeys.forEach((key) => {
        newProvinceStringPermissions[key] = data[key] || "none"; // Store "view", "readWrite", or "none"
      });
      setUserProvinceStringPermissions(newProvinceStringPermissions);

      setUserRole(data.permission || "viewer"); // Store the user's role, default to 'viewer'
      setPermissions([...basePermissions, ...provincePermissionsAsBooleans]);

      setUserHandle(data.username);
      setDivision(data.division || "");

      // Set provinceAccess state for components like Dashboard
      const newProvinceAccessState = {};
      provinceKeys.forEach((key) => {
        const permissionString = data[key];
        newProvinceAccessState[key] =
          permissionString === "view" || permissionString === "readWrite";
      });
      setProvinceAccess(newProvinceAccessState);

      setAuth(true);
      setErrorMessage("");
    } catch (err) {
      // Catch errors thrown by the service
      setAuth(false);
      const message =
        err && err.message
          ? err.message
          : "Authentication failed. Please check your credentials and try again.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Live clock updater for header timestamp
  useEffect(() => {
    const timer = setInterval(() => setNow(moment()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Define fetchDataIssues outside of useEffect, memoized with useCallback
  const fetchDataIssues = useCallback(async () => {
    if (!auth) return; // Ensure auth is true before fetching
    setIsLoading(true); // Set loading for notifications
    try {
      const dataIssuesPayload = await fetchDataValidationIssues(); // Assuming this returns the actual data object like { issues: ... }
      const duplicateIssuesPayload = await fetchDuplicateDataIssues(); // Assuming this returns { duplicates: ... }

      let dataIssues;
      // Check if dataIssuesPayload itself is not null/undefined and has an 'issues' property
      if (dataIssuesPayload && dataIssuesPayload.issues !== undefined) {
        const issuesSource = dataIssuesPayload.issues;
        if (Array.isArray(issuesSource)) {
          // If issuesSource is an empty array, set to ["No issues detected"]
          dataIssues =
            issuesSource.length > 0 ? issuesSource : ["No issues detected"];
        } else if (
          issuesSource !== null &&
          String(issuesSource).trim() !== ""
        ) {
          // If issuesSource is a single string (or other non-array, non-null, non-empty value)
          dataIssues = [issuesSource];
        } else {
          // If issuesSource is null, undefined, or an empty string
          dataIssues = ["No issues detected"];
        }
      } else {
        // If dataIssuesPayload is null/undefined or doesn't have 'issues'
        console.warn(
          "Warning: Data validation issues payload is missing or malformed. Response:",
          dataIssuesPayload
        );
        dataIssues = ["No issues detected"]; // Default or error state for UI
      }

      let duplicateIssues = [];
      // Check if duplicateIssuesPayload is not null/undefined and has a 'duplicates' array
      if (
        duplicateIssuesPayload &&
        Array.isArray(duplicateIssuesPayload.duplicates)
      ) {
        duplicateIssues = duplicateIssuesPayload.duplicates
          .filter((d) => d && typeof d === "object") // Ensure 'd' is an object before mapping
          .map((d) => ({
            idNos: Array.isArray(d.idNos) ? d.idNos : [],
            ecc_cnc: d.ecc_cnc || "N/A", // Default if ecc_cnc is missing
            count: typeof d.count === "number" ? d.count : 0, // Default if count is missing or not a number
          }));
      } else {
        console.warn(
          "Warning: Duplicate issues payload is missing, malformed, or 'duplicates' is not an array. Response:",
          duplicateIssuesPayload
        );
        // duplicateIssues is already defaulted to []
      }

      const combined = [...dataIssues, ...duplicateIssues];
      setNotifications(combined);
    } catch (err) {
      console.error("Fetch error in fetchDataIssues:", err); // More specific log
      const errorMsg = ["Error fetching data issues."];
      setNotifications(errorMsg);
    } finally {
      setIsLoading(false); // Clear loading for notifications
    }
  }, [auth, setIsLoading, setNotifications]); // backendUrl removed as it's not directly used here

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
      await logoutUserService(); // Use service
    } catch (err) {
      // Even if the backend fails, the user is logged out on the client
      console.error("Logout API call failed:", err);
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
        <Navigate to={ROUTES.login} />
      </div>
    );
  }

  const isDark = theme === "dark";
  const themeConfig = {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#2f7ecb",
      borderRadius: 8,
      fontSize: 13,
      controlHeight: 36,
      colorBgBase: isDark ? "#0f1113" : "#ffffff",
      colorBgContainer: isDark ? "#14181c" : "#f7f8fa",
      colorBgElevated: isDark ? "#1b2026" : "#ffffff",
      colorText: isDark ? "#e6eaf0" : "#1f2937",
      colorTextSecondary: isDark ? "#b5bfcc" : "#4b5563",
      colorBorder: isDark ? "#2a323b" : "#e5e7eb",
      colorLink: "#2f7ecb",
      colorLinkHover: "#3b82f6",
      colorSuccess: isDark ? "#3fb950" : "#16a34a",
      colorWarning: isDark ? "#d29922" : "#d97706",
      colorError: isDark ? "#f85149" : "#dc2626",
    },
    components: {
      Layout: {
        headerBg: isDark ? "#14181c" : "#ffffff",
        bodyBg: isDark ? "#0f1113" : "#f5f6f8",
        siderBg: isDark ? "#12161a" : "#ffffff",
      },
      Menu: {
        darkItemBg: "transparent",
        itemBorderRadius: 6,
      },
      Button: {
        borderRadius: 6,
        paddingInline: 14,
        fontWeight: 500,
      },
      Input: {
        colorBgContainer: isDark ? "#0f1113" : "#ffffff",
        colorBorder: isDark ? "#2a323b" : "#e5e7eb",
        activeBorderColor: "#2f7ecb",
        hoverBorderColor: "#2f7ecb",
        borderRadius: 6,
      },
      Table: {
        headerBg: isDark ? "#111418" : "#f3f4f6",
        headerColor: isDark ? "#d1d5db" : "#374151",
        rowHoverBg: isDark ? "#111418" : "#f9fafb",
        borderColor: isDark ? "#262c35" : "#e5e7eb",
      },
      Card: {
        colorBgContainer: isDark ? "#14181c" : "#ffffff",
        borderRadiusLG: 12,
      },
      Modal: {
        colorBgElevated: isDark ? "#14181c" : "#ffffff",
        borderRadiusLG: 12,
      },
      Popover: {
        colorBgElevated: isDark ? "#14181c" : "#ffffff",
      },
    },
  };

  const provinceKeysForCurrentUser = [
    "aurora",
    "bataan",
    "bulacan",
    "nuevaEcija",
    "pampanga",
    "tarlac",
    "zambales",
  ];

  const provinceStringPermissions = {};
  provinceKeysForCurrentUser.forEach((key) => {
    provinceStringPermissions[key] = permissions;
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
    <>
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
                  <div
                    className="profile_container"
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span className="user-name" style={{ whiteSpace: "nowrap" }}>
                      {now.format("MMMM DD, YYYY hh:mm A")} | {name} | {division}
                    </span>

                    {/* Which year container this session is operating in. */}
                    <YearSwitcher theme={theme} />

                    <NotificationsPopover
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
                  <Route
                    path="/"
                    element={<Navigate to="dashboard" replace />}
                  />
                  <Route
                    path="dashboard"
                    element={
                      <Dashboard
                        avatar={avatar}
                        name={name}
                        theme={theme}
                        provinceAccess={provinceAccess}
                      />
                    }
                  />
                  <Route
                    path="/province/:provinceName"
                    element={
                      <Province currentUser={currentUser} theme={theme} />
                    }
                  />
                  <Route
                    path="survey"
                    element={<Survey currentUser={currentUser} theme={theme} />}
                  />
                  <Route
                    path="healthcare"
                    element={<Healthcare theme={theme} />}
                  />
                  <Route
                    path="chemicals"
                    element={<Chemicals theme={theme} />}
                  />
                  <Route path="tsd" element={<TSD theme={theme} />} />
                  <Route path="trc" element={<TRC theme={theme} />} />
                  <Route path="mbu" element={<MBU theme={theme} />} />
                  {/* ESWM Database Parent Route - can render a default page or redirect */}
                  <Route
                    path="eswm-database"
                    element={<Navigate to="swm-plan" replace />}
                  />
                  <Route
                    path="eswm-database/swm-plan"
                    element={<SWMPlan theme={theme} />}
                  />
                  <Route
                    path="eswm-database/mrf"
                    element={<MRF theme={theme} />}
                  />
                  <Route
                    path="eswm-database/slf"
                    element={<SLF theme={theme} />}
                  />
                  <Route
                    path="eswm-database/ods"
                    element={<ODS theme={theme} />}
                  />
                  <Route
                    path="eswm-database/equipments"
                    element={<Equipments theme={theme} />}
                  />
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
                    path="register/config"
                    element={<RegisterConfig theme={theme} />}
                  />
                  <Route
                    path="register/activity"
                    element={<RegisterActivity theme={theme} />}
                  />
                  {/* Legacy paths — kept so existing bookmarks keep working */}
                  <Route
                    path="records/config"
                    element={<Navigate to="/universe/register/config" replace />}
                  />
                  <Route
                    path="records/activity"
                    element={<Navigate to="/universe/register/activity" replace />}
                  />
                  {/* Developer Settings */}
                  <Route
                    path="developer/field-management"
                    element={<FieldManagement />}
                  />
                  <Route
                    path="developer/database-settings"
                    element={<DatabaseSettings />}
                  />
                  <Route path="developer/pdf-forms" element={<PdfForms />} />
                  <Route
                    path="developer/activity-history"
                    element={<ActivityHistoryConfig />}
                  />
                  <Route path="admin" element={<Admin theme={theme} />} />

                  {/* NAS storage routes (shared infrastructure).
                      Renamed from erms/* so the ERMS records module can own
                      that namespace — see docs/UNIFICATION-PLAN.md, Phase 1. */}
                  <Route
                    path="nas/dashboard"
                    element={<NasDashboard theme={theme} />}
                  />
                  <Route
                    path="nas/browser"
                    element={<NasBrowser theme={theme} />}
                  />
                  <Route
                    path="nas/storage-config"
                    element={<NasStorageConfig theme={theme} />}
                  />
                  <Route
                    path="nas/settings"
                    element={<NasSettings theme={theme} />}
                  />
                  {/* Legacy paths — kept so existing bookmarks keep working */}
                  <Route
                    path="erms/dashboard"
                    element={<Navigate to="/universe/nas/dashboard" replace />}
                  />
                  <Route
                    path="erms/universe"
                    element={<Navigate to="/universe/nas/browser" replace />}
                  />
                  <Route
                    path="erms/storage-config"
                    element={<Navigate to="/universe/nas/storage-config" replace />}
                  />
                  <Route
                    path="erms/settings"
                    element={<Navigate to="/universe/nas/settings" replace />}
                  />

                  {/* Legal Services Unit Routes */}
                  <Route
                    path="legal/dashboard"
                    element={<LegalDashboard theme={theme} />}
                  />
                  <Route
                    path="legal/docket"
                    element={<LegalDocket theme={theme} />}
                  />
                  <Route
                    path="legal/envi-laws"
                    element={<EnviLaws theme={theme} />}
                  />
                  {/* Add a default route for /legal if needed, e.g., redirect to dashboard */}
                  <Route
                    path="legal"
                    element={<Navigate to="legal/dashboard" replace />}
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
      <EnvStatus />
    </>
  );
};

export default Universe;
