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
  fetchCurrentUser,
  fetchDataValidationIssues,
  fetchDuplicateDataIssues,
  logoutUserService,
} from "./api/universeService"; // Import services
import { API_BASE_URL as backendUrl } from "./config/api";
import "./index.css";
import CryptoJS from "crypto-js";
import Dashboard from "./modules/ucds/dashboard/Dashboard";
import Province from "./modules/ucds/province/Province";
import Survey from "./modules/ucds/survey/Survey";
import Healthcare from "./modules/ucds/healthcare/Healthcare";
import Chemicals from "./modules/ucds/chemicals/Chemicals";
import TSD from "./modules/ucds/tsd/TSDPermits";
import TRC from "./modules/ucds/trc/TRCPermits";
import MBU from "./modules/ucds/mbu/MBU";
import Admin from "./modules/admin/Admin";
import Accounts from "./modules/admin/users/UserAccounts";
import Extract from "./modules/ucds/extract/ExtractData";
import Report from "./modules/admin/Admin";
import Posting from "./modules/admin/posting/Posting";
import ESWM from "./modules/ucds/eswm/ESWM";
import SWMPlan from "./modules/ucds/eswm/SWMPlan/SWMPlan"; // Added
import MRF from "./modules/ucds/eswm/MRF/MRF"; // Added
import SLF from "./modules/ucds/eswm/SLF/SLF"; // Added
import ODS from "./modules/ucds/eswm/ODS/ODS"; // Added
import Equipments from "./modules/ucds/eswm/Equipments/Equipments"; // Added
import ActivityLog from "./components/ActivityLog/ActivityLog";
import Duplicates from "./modules/ucds/duplicates/DuplicatesData";
import Monitoring from "./modules/ucds/planning/monitoring/Monitoring";
import MonitoringSurvey from "./modules/ucds/planning/survey/monitoring_survey";
import Validations from "./modules/ucds/planning/validations/Validations";
import RegisterConfig from "./modules/ucds/register-config/RegisterConfig";
import RegisterActivity from "./modules/ucds/register-config/RegisterActivity";
import FieldManagement from "./modules/admin/developer/FieldManagement";
import DatabaseSettings from "./modules/admin/developer/DatabaseSettings";
import PdfForms from "./modules/admin/developer/PdfForms";
import ActivityHistoryConfig from "./modules/admin/developer/ActivityHistoryConfig";
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import UserPopover from "./components/PopOverUser/PopOverUser";
import Z_CustomSpinner from "./Z_CustomSpinner";
import YearSwitcher from "./components/YearSwitcher";
import { DataProvider } from "./modules/ucds/province/DataContext";
import EnvStatus from "./components/EnvStatus";
import moment from "moment";

// ERMS Components
import NasDashboard from "./shared/nas-browser/dashboard/NasDashboard";
import NasBrowser from "./shared/nas-browser/browser/NasBrowser";
import NasStorageConfig from "./shared/nas-browser/storage/NasStorageConfig";
import NasSettings from "./shared/nas-browser/settings/NasSettings";

// Legal Services Unit Components
import LegalDashboard from "./modules/ucds/legal/legal-dashboard/LegalDashboard";
import LegalDocket from "./modules/ucds/legal/docket/LegalDocket";
import EnviLaws from "./modules/ucds/legal/envi-laws/EnviLaws";
import { ROUTES } from "./config/routes";
import DomainGuard from "./auth/DomainGuard";
import RoleGuard from "./auth/RoleGuard";
import Forbidden from "./shared/components/Forbidden";
import OrgUnits from "./modules/admin/OrgUnits";
import ErmsDashboard from "./modules/erms/pages/ErmsDashboard";
import RecordsList from "./modules/erms/pages/RecordsList";
import RecordDetail from "./modules/erms/pages/RecordDetail";
import ArchiveBoxes from "./modules/erms/pages/ArchiveBoxes";
import ErmsReports from "./modules/erms/pages/ErmsReports";

const { Header, Content } = Layout;

// Where the chosen theme is remembered. Cleared on sign-out along with
// everything else in localStorage, which is the behaviour we want.
const THEME_KEY = "ucds-theme";

const Universe = () => {
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [userHandle, setUserHandle] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [division, setDivision] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  });
  const [collapsed, setCollapsed] = useState(false);
  // Named capability flags, replacing the positional boolean array this used to
  // build (permissions[2] meant "admin panel", permissions[i+5] meant
  // "province i"). Everything here is advisory — the API re-checks the same
  // entitlement on every request.
  const [capabilities, setCapabilities] = useState({});
  const [domains, setDomains] = useState([]);
  const [provinces, setProvinces] = useState([]);
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
      // One request, one authoritative answer. The server resolves the role,
      // domains, capabilities and province scope; the client no longer derives
      // any of them from loose fields.
      const data = await fetchCurrentUser();

      setName(data.user?.name);
      setAvatar(
        data.user?.avatar
          ? `${backendUrl}${data.user.avatar}`
          : "path/to/default-avatar.png"
      );

      setCapabilities(data.capabilities || {});
      setDomains(data.domains || []);
      setProvinces(data.provinces || []);
      setUserRole(data.role || "viewer");
      setUserHandle(data.user?.username);
      setDivision(data.user?.division || "");

      // 'none' | 'view' | 'readWrite' per province, straight from the server.
      const access = data.provinceAccess || {};
      setUserProvinceStringPermissions(access);

      // Boolean view of the same thing, for components that only ask "may I
      // see this province at all?"
      const grantedKeys = data.provinces || [];
      setProvinceAccess(
        Object.keys(access).reduce((acc, key) => {
          acc[key] = grantedKeys.includes(key);
          return acc;
        }, {})
      );

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

    // Remember the choice. Without this the theme reset to dark on every page
    // load, so switching to light never survived a navigation.
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      /* private browsing, or storage disabled — the toggle still works */
    }
  };

  // Keep the body attribute in step with the restored theme, which the toggle
  // would otherwise be the only thing to set.
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

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

  const currentUser = {
    name,
    username: userHandle,
    avatar,
    division,
    role: userRole,
    capabilities,
    domains,
    provinces,
    provinceStringPermissions: userProvinceStringPermissions,
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
                  {/* Land people where they can actually work: a Records
                      clerk has no UCDS domain, so the planning dashboard
                      would only tell them they are not allowed. */}
                  <Route
                    path="/"
                    element={
                      <Navigate
                        to={
                          domains.includes("ucds")
                            ? "dashboard"
                            : domains.includes("erms")
                              ? "erms/dashboard"
                              : "dashboard"
                        }
                        replace
                      />
                    }
                  />

                  {/* UCDS planning routes. Guarded as a group rather than one
                      at a time — the API refuses these to a non-UCDS user
                      anyway, and without this they would render a shell whose
                      every request fails, which reads as breakage rather than
                      as a permission boundary. */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
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
                  <Route path="extract" element={<Extract theme={theme} />} />
                  </Route>

                  {/* Platform administration, consolidated under /admin.
                      Legacy paths below redirect, so existing bookmarks and
                      any link still pointing at the old URL keep working. */}
                  <Route
                    path="admin/users"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <Accounts theme={theme} />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="admin/audit"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <ActivityLog theme={theme} />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="admin/posting"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <Posting theme={theme} />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="accounts"
                    element={<Navigate to="/universe/admin/users" replace />}
                  />
                  <Route
                    path="activity-log"
                    element={<Navigate to="/universe/admin/audit" replace />}
                  />
                  {/* Planning unit and register configuration — UCDS. */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
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
                  </Route>

                  {/* Developer settings, also under /admin. */}
                  <Route
                    path="admin/developer/field-management"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <FieldManagement />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="admin/developer/database-settings"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <DatabaseSettings />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="admin/developer/pdf-forms"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <PdfForms />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="admin/developer/activity-history"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <ActivityHistoryConfig />
                      </DomainGuard>
                    }
                  />
                  {/* Legacy developer paths */}
                  <Route
                    path="developer/field-management"
                    element={<Navigate to="/universe/admin/developer/field-management" replace />}
                  />
                  <Route
                    path="developer/database-settings"
                    element={<Navigate to="/universe/admin/developer/database-settings" replace />}
                  />
                  <Route
                    path="developer/pdf-forms"
                    element={<Navigate to="/universe/admin/developer/pdf-forms" replace />}
                  />
                  <Route
                    path="developer/activity-history"
                    element={<Navigate to="/universe/admin/developer/activity-history" replace />}
                  />

                  <Route path="admin" element={<Admin theme={theme} />} />

                  {/* Shared master data. Administrators only — the API applies
                      requireDomain('admin') to the write endpoints. */}
                  <Route
                    path="admin/org-units"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <OrgUnits />
                      </DomainGuard>
                    }
                  />

                  {/* ERMS records module lands here in Phase 7. The guard and
                      the route tree exist now so the boundary is real from the
                      first screen rather than retrofitted. */}
                  <Route
                    path="erms/dashboard"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <ErmsDashboard />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="erms/records"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <RecordsList />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="erms/records/:serialNo"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <RecordDetail />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="erms/archive"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <ArchiveBoxes />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="erms/reports"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <ErmsReports />
                      </DomainGuard>
                    }
                  />
                  <Route path="erms" element={<Navigate to="/universe/erms/dashboard" replace />} />
                  {/* Anything else under erms/ is not built. The guard stays so
                      the domain boundary holds regardless. */}
                  <Route
                    path="erms/*"
                    element={
                      <DomainGuard domain="erms" user={currentUser}>
                        <Forbidden
                          module="Records"
                          detail="This part of the Records module is not built yet."
                        />
                      </DomainGuard>
                    }
                  />

                  {/* NAS storage routes (shared infrastructure).
                      Renamed from erms/* so the ERMS records module can own
                      that namespace — see docs/UNIFICATION-PLAN.md, Phase 1.

                      Developer-only since Phase 7. These sat outside every
                      guard, so any signed-in user — Planning, Viewer, anyone —
                      reached the share configuration screens. The server now
                      refuses them too; this stops rendering a page that would
                      only fail. */}
                  <Route element={<RoleGuard roles={["developer"]} user={currentUser} />}>
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
                  </Route>
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

                  {/* Legal Services Unit and the remaining UCDS screens. */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
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
                  <Route
                    path="posting"
                    element={<Navigate to="/universe/admin/posting" replace />}
                  />
                  <Route
                    path="duplicates"
                    element={<Duplicates theme={theme} />}
                  />
                  </Route>
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
