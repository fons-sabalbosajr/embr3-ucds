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
import MBU from "./modules/ucds/mbu/MBU";
import Admin from "./modules/admin/Admin";
import Accounts from "./modules/admin/users/UserAccounts";
import Report from "./modules/admin/Admin";
import Posting from "./modules/admin/posting/Posting";
import ActivityLog from "./components/ActivityLog/ActivityLog";
import RegisterSettings from "./modules/admin/RegisterSettings";
import SystemSettings from "./modules/admin/SystemSettings";
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import UserPopover from "./components/PopOverUser/PopOverUser";
import Z_CustomSpinner from "./Z_CustomSpinner";
import YearSwitcher from "./components/YearSwitcher";
import { DataProvider } from "./modules/ucds/province/DataContext";
import EnvStatus from "./components/EnvStatus";
import moment from "moment";

import StorageConfig from "./modules/admin/developer/StorageConfig";

import { ROUTES } from "./config/routes";
import DomainGuard from "./auth/DomainGuard";
import RoleGuard from "./auth/RoleGuard";
import Forbidden from "./shared/components/Forbidden";
import OrgUnits from "./modules/admin/OrgUnits";

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
                  <Route path="mbu" element={<MBU theme={theme} />} />
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
                  {/* The register behind Monitoring Plan: configuration, its
                      activity trail, and duplicate reconciliation. Three
                      screens about one subject, so one screen with tabs. */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
                    <Route
                      path="admin/register"
                      element={<RegisterSettings theme={theme} />}
                    />
                  </Route>

                  {/* How the platform behaves: its database, and what it
                      records. */}
                  <Route
                    path="admin/system"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <SystemSettings theme={theme} />
                      </DomainGuard>
                    }
                  />

                  {/* Old locations. Each points at the tab that replaced it, so
                      a bookmark lands where the screen actually is rather than
                      at the top of a merged page. */}
                  {[
                    ["register/config", "/universe/admin/register?tab=config"],
                    ["records/config", "/universe/admin/register?tab=config"],
                    ["register/activity", "/universe/admin/register?tab=activity"],
                    ["records/activity", "/universe/admin/register?tab=activity"],
                    ["admin/duplicates", "/universe/admin/register?tab=duplicates"],
                    ["duplicates", "/universe/admin/register?tab=duplicates"],
                    ["admin/developer/database-settings", "/universe/admin/system?tab=database"],
                    ["developer/database-settings", "/universe/admin/system?tab=database"],
                    ["admin/developer/activity-history", "/universe/admin/system?tab=audit"],
                    ["developer/activity-history", "/universe/admin/system?tab=audit"],
                    // Field Management and PDF Forms were removed. Their URLs
                    // point at the screen that absorbed the rest of that
                    // section rather than 404ing on a bookmark.
                    ["admin/developer/field-management", "/universe/admin/system"],
                    ["developer/field-management", "/universe/admin/system"],
                    ["admin/developer/pdf-forms", "/universe/admin/system"],
                    ["developer/pdf-forms", "/universe/admin/system"],
                  ].map(([from, to]) => (
                    <Route key={from} path={from} element={<Navigate to={to} replace />} />
                  ))}


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

                  {/* Duplicate data is now a tab of Admin Settings > Register,
                      alongside the configuration and activity trail for the
                      same register. The old path redirects there. */}

                  {/* The NAS File Explorer lives on the Storage Configuration
                      screen, behind the same emailed code. It is not a separate
                      route: browsing the share and configuring it are one
                      administrative task, and splitting them would mean two
                      places to get the guard right. */}


                  {/* The records share, now a Developer Settings screen.
                      It had four routes — a dashboard, a browser, a storage
                      config and a settings page — that between them showed one
                      configuration. One setting, one route.

                      Developer-only. These sat outside every guard until Phase
                      7, so any signed-in user reached the share configuration;
                      the server refuses them too, and this stops rendering a
                      page that would only fail. */}
                  <Route element={<RoleGuard roles={["developer"]} user={currentUser} />}>
                    <Route
                      path="admin/developer/storage-config"
                      element={<StorageConfig theme={theme} />}
                    />
                  </Route>

                  {/* Old locations. Kept as redirects rather than deleted: the
                      standalone NAS section was reachable for several releases,
                      so these are in browser history and bookmarks. They point
                      at the canonical Developer Settings route, so there is one
                      page, not several URLs serving the same thing. */}
                  {[
                    "nas",
                    "nas/dashboard",
                    "nas/browser",
                    "nas/storage-config",
                    "nas/settings",
                    "erms/storage-config",
                    "erms/settings",
                    "erms/universe",
                  ].map((from) => (
                    <Route
                      key={from}
                      path={from}
                      element={
                        <Navigate to="/universe/admin/developer/storage-config" replace />
                      }
                    />
                  ))}

                  {/* The remaining UCDS screens. */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
                  <Route path="report" element={<Report theme={theme} />} />
                  <Route
                    path="posting"
                    element={<Navigate to="/universe/admin/posting" replace />}
                  />
                  {/* Old location, kept as a redirect so one page has one URL. */}
                  <Route
                    path="duplicates"
                    element={<Navigate to="/universe/admin/duplicates" replace />}
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
