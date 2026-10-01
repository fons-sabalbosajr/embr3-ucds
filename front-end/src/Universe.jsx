import React, { lazy, Suspense,  useState, useEffect, useCallback } from "react";
import { Layout, Button, Spin, Popover, List, Tag } from "antd";
import { message } from "./shared/feedback";
import { useTheme } from "./theme/ThemeProvider";
import {
  clearSessionStorageKeepingPreferences,
  getPreference,
  setPreference,
} from "./shared/preferences";
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
const Province = lazy(() => import("./modules/ucds/province/Province"));
const MBU = lazy(() => import("./modules/ucds/mbu/MBU"));
const Admin = lazy(() => import("./modules/admin/Admin"));
const Accounts = lazy(() => import("./modules/admin/users/UserAccounts"));
const StorageBrowser = lazy(() => import("./modules/storage/StorageBrowser"));
const DatasetPage = lazy(() => import("./modules/ucds/datasets/DatasetPage"));
const ErmsDashboard = lazy(() => import("./modules/erms/pages/ErmsDashboard"));
const RecordsList = lazy(() => import("./modules/erms/pages/RecordsList"));
const RecordDetail = lazy(() => import("./modules/erms/pages/RecordDetail"));
const ArchiveBoxes = lazy(() => import("./modules/erms/pages/ArchiveBoxes"));
const AccessRequests = lazy(() => import("./modules/erms/pages/AccessRequests"));
const UnitDashboard = lazy(() => import("./modules/erms/units/UnitDashboard"));
const UnitDocuments = lazy(() => import("./modules/erms/units/UnitDocuments"));
const UnitDocumentDetail = lazy(() => import("./modules/erms/units/UnitDocumentDetail"));
const ErmsConfig = lazy(() => import("./modules/admin/erms/ErmsConfig"));
const ErmsSettings = lazy(() => import("./modules/erms/pages/ErmsSettings"));
const CustomItemPage = lazy(() => import("./modules/ucds/custom/CustomItemPage"));
const Report = Admin;
const Posting = lazy(() => import("./modules/admin/posting/Posting"));
import ActivityLog from "./components/ActivityLog/ActivityLog";
const RegisterSettings = lazy(() => import("./modules/admin/RegisterSettings"));
const SystemSettings = lazy(() => import("./modules/admin/SystemSettings"));
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import UserPopover from "./components/PopOverUser/PopOverUser";
import Z_CustomSpinner from "./Z_CustomSpinner";
import YearSwitcher from "./components/YearSwitcher";
import { DataProvider } from "./modules/ucds/province/DataContext";
import EnvStatus from "./components/EnvStatus";
import NasStatusBanner from "./components/NasStatusBanner";
import moment from "moment";

const StorageConfig = lazy(() => import("./modules/admin/developer/StorageConfig"));

import { ROUTES } from "./config/routes";
import DomainGuard from "./auth/DomainGuard";
import NotFound from "./shared/components/NotFound";
import ContentLoading from "./shared/components/ContentLoading";
import { useYear } from "./context/YearContext";
import { accountType } from "./shared/accountTypes";
import { getSessionToken, setSessionToken, clearSessionToken } from "./shared/sessionToken";
import RoleGuard from "./auth/RoleGuard";
import Forbidden from "./shared/components/Forbidden";
const OrgUnits = lazy(() => import("./modules/admin/OrgUnits"));
import GeneralSettings from "./modules/settings/GeneralSettings";
const UcdsSettings = lazy(() => import("./modules/settings/UcdsSettings"));

const { Header, Content } = Layout;

// Where the chosen theme is remembered. It survives sign-out: a display
// preference is not session data, and losing it on every logout reads as a
// setting that does not work. See shared/preferences.js.
const THEME_KEY = "ucds-theme";

const Universe = () => {
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [userHandle, setUserHandle] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [division, setDivision] = useState("");
  // The mode, its persistence and the Ant Design tokens all live in
  // ThemeProvider, so the login and year-selection screens share them rather
  // than rendering in Ant Design's defaults.
  const { mode: theme, toggleMode: toggleTheme, bindAccount, unbindAccount } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const { activeYear } = useYear();
  // Named capability flags, replacing the positional boolean array this used to
  // build (permissions[2] meant "admin panel", permissions[i+5] meant
  // "province i"). Everything here is advisory — the API re-checks the same
  // entitlement on every request.
  const [capabilities, setCapabilities] = useState({});
  const [domains, setDomains] = useState([]);
  const [storageContainers, setStorageContainers] = useState([]);
  const [provinces, setProvinces] = useState([]);
  // The ERMS unit ("System") on the account, the units this person may see,
  // and whether the year container picker is skipped for them.
  const [erms, setErms] = useState({ unit: null, units: [], skipYearSelect: false });
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
  const [accountOpen, setAccountOpen] = useState(false);
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
      setStorageContainers(data.storageContainers || []);
      setProvinces(data.provinces || []);
      setErms({ unit: data.ermsUnit || null, units: data.ermsUnits || [], skipYearSelect: data.skipYearSelect === true });
      setUserRole(data.role || "viewer");
      setUserHandle(data.user?.username);
      setDivision(data.user?.division || "");
      // A tab opened fresh has no token of its own and arrived here on the
      // cookie — the browser's most recent sign-in. Pin it to that session
      // now, so it stays this account whatever other tabs sign in as.
      if (!getSessionToken() && data.sessionToken) setSessionToken(data.sessionToken);
      // The look stored on the account, and from here on every change goes back to it.
      bindAccount(data.theme || null);

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
    // The issues are the register's; an ERMS User has no UCDS domain and
    // would only be refused (and told "error") for asking.
    if (!domains.includes("ucds")) {
      setNotifications([]);
      return;
    }
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
  }, [auth, domains, setIsLoading, setNotifications]); // backendUrl removed as it's not directly used here

  useEffect(() => {
    if (!auth) return; // Only fetch if authenticated
    fetchDataIssues();
    // If you need polling, you can set it up here, calling the memoized fetchDataIssues
  }, [auth, fetchDataIssues]); // fetchDataIssues is now a dependency

  // Whether the one-off "Toggle Theme" hint has been dismissed for good.
  //
  // This used to store an AES-encrypted "true" and only read it back when the
  // encryption key was present — so a missing key, or any decryption failure,
  // silently meant "show it again". It is a dismissed tooltip: encrypting it
  // bought nothing and added two ways to fail. Values written by the old
  // version are still honoured so nobody has to dismiss it twice.
  useEffect(() => {
    const stored = getPreference("hideThemeHint");
    if (!stored) {
      setShowThemeHint(true);
      return;
    }
    if (stored === "true") return;

    if (encryptionKey) {
      try {
        const decrypted = CryptoJS.AES.decrypt(stored, encryptionKey).toString(
          CryptoJS.enc.Utf8
        );
        if (decrypted === "true") return;
      } catch {
        // An unreadable legacy value is treated as dismissed rather than
        // nagging: the user did click the button.
        return;
      }
    }
    setShowThemeHint(true);
  }, [encryptionKey]);

  const handleRetry = () => {
    setRetrying(true);
    checkAuth();
    setRetrying(false);
  };

  // toggleTheme, persistence and the body attribute all come from
  // ThemeProvider now, so there is one place that decides what the theme is.

  const handleLogout = async () => {
    // End this tab's session on the server first: the request carries this
    // tab's token, which is what names the session to end, so the token must
    // still be here when it goes out. Bounded, so a stalled request cannot
    // hold the tab; the client signs out either way.
    await Promise.race([
      logoutUserService().catch((err) => console.error("Logout API call failed:", err)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    clearSessionToken();
    unbindAccount();
    // Clear session material but keep this device's display preferences.
    // This used to be localStorage.clear(), which also threw away the chosen
    // theme and the dismissed "Toggle Theme" hint — so both came back on the
    // next sign-in and looked like settings that did not work.
    clearSessionStorageKeepingPreferences();
    window.location.replace("/login");
  };

  const handleDismissHint = () => {
    setShowThemeHint(false);
  };

  const handleDontShowAgainHint = () => {
    setPreference("hideThemeHint", "true");
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


  const currentUser = {
    name,
    username: userHandle,
    avatar,
    division,
    role: userRole,
    capabilities,
    domains,
    storageContainers,
    provinces,
    provinceStringPermissions: userProvinceStringPermissions,
    ermsUnit: erms.unit,
    ermsUnits: erms.units,
    skipYearSelect: erms.skipYearSelect,
  };

  return (
    <>
      <>
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
                      <Tag color={accountType(userRole).color} className="header-role" title="Account type">
                        {accountType(userRole).label}
                      </Tag>
                    </span>

                    {/* Which year container this session is operating in.
                        Not for ERMS Users: nothing they do is year-scoped,
                        so the server picked one at sign-in and there is
                        nothing to switch. */}
                    {!erms.skipYearSelect && <YearSwitcher theme={theme} />}

                    <NotificationsPopover
                      theme={theme}
                      notifications={notifications}
                      isLoading={isLoading} // Pass the loading state for notifications
                      className="notification-icon"
                      currentUser={currentUser}
                      refreshNotifications={fetchDataIssues} // Pass the refresh handler
                    />

                    {/* Theme first, then the account: the avatar closes the row,
                        as it does in most applications people already use. */}
                    <Popover
                      open={showThemeHint}
                      title="Toggle Theme"
                      content={
                        <div style={{ maxWidth: 220, fontSize: "12px", padding: "4px 0" }}>
                          <p style={{ marginBottom: 8 }}>Click to switch between light and dark mode.</p>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                            <Button size="small" onClick={handleDismissHint}>
                              Dismiss
                            </Button>
                            <Button size="small" type="primary" onClick={handleDontShowAgainHint}>
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
                        aria-label="Toggle theme"
                        icon={theme === "dark" ? <SunOutlined style={{ fontSize: 15 }} /> : <MoonOutlined style={{ fontSize: 15 }} />}
                      />
                    </Popover>

                    <Popover
                      open={accountOpen}
                      onOpenChange={setAccountOpen}
                      content={
                        <UserPopover
                          name={name}
                          handleLogout={handleLogout}
                          userHandle={userHandle}
                          userData={currentUser}
                          division={division}
                          role={userRole}
                          onNavigate={() => setAccountOpen(false)}
                        />
                      }
                      trigger="click"
                      placement="bottomRight"
                      overlayClassName="eu-account-popover"
                    >
                      <div className="avatar-header" role="button" aria-label="Account menu" tabIndex={0}>
                        <AvatarWithName userHandle={userHandle} />
                      </div>
                    </Popover>
                  </div>
                </div>
              </Header>

              {/* Under the header on every screen: the NAS is not connected,
                  and the rest of the application still is. */}
              <NasStatusBanner />

              <Content className="content-container">
                {/* Heavy screens are separate chunks, fetched on first visit:
                    the register alone is a third of the bundle, and an Encoder
                    should not download the admin and records screens to open it. */}
                <Suspense fallback={<ContentLoading />}>
                {/* Keyed on the active year: switching containers remounts the
                    screens (and the province data context inside them) so
                    they refetch, while the shell around them stays. */}
                <Routes key={activeYear}>
                  {/* Land people where they can actually work: a Records
                      clerk has no UCDS domain, so the planning dashboard
                      would only tell them they are not allowed. */}
                  <Route
                    path="/"
                    element={
                      <Navigate
                        to={
                          // An ERMS User lands in their own unit; anyone else
                          // with UCDS lands on the planning dashboard.
                          erms.skipYearSelect && erms.unit
                            ? erms.unit === "records" ? "erms/dashboard" : `erms/${erms.unit}/dashboard`
                            : domains.includes("ucds")
                              ? "dashboard"
                              : domains.includes("erms")
                                ? erms.unit && erms.unit !== "records" ? `erms/${erms.unit}/dashboard` : "erms/dashboard"
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

                  {/* Appearance, for every role. Per-device display
                      preferences affect nobody else, so this needs no
                      entitlement — and it gives Records and Planning staff a
                      Settings section of their own. */}
                  {/* Shared storage. Who may open what is decided on the
                      server per container; the screen only shows what it is
                      given. */}
                  <Route path="storage" element={<StorageBrowser />} />

                  {/* Records (ERMS): dashboard, the records register, archive
                      boxes and reports. Guarded by the ERMS domain — a
                      Developer and a Records Admin hold it; the API refuses
                      everyone else regardless. */}
                  <Route element={<DomainGuard domain="erms" user={currentUser} />}>
                    <Route path="erms/dashboard" element={<ErmsDashboard />} />
                    <Route path="erms/records" element={<RecordsList />} />
                    <Route path="erms/records/:serialNo" element={<RecordDetail />} />
                    <Route path="erms/archive" element={<ArchiveBoxes />} />
                    {/* Reports were removed from the menu; a bookmark lands on the dashboard. */}
                    <Route path="erms/reports" element={<Navigate to="/universe/erms/dashboard" replace />} />
                    <Route path="erms/access-requests" element={<AccessRequests />} />
                    {/* The Legal Services and Laboratory units. Which units
                        the person may see is decided by the server; the
                        screens explain when one is not theirs. */}
                    <Route path="erms/:unit/dashboard" element={<UnitDashboard />} />
                    <Route path="erms/:unit/documents" element={<UnitDocuments />} />
                    <Route path="erms/:unit/documents/:serialNo" element={<UnitDocumentDetail />} />
                    <Route
                      path="erms"
                      element={
                        <Navigate
                          to={erms.unit && erms.unit !== "records" ? `/universe/erms/${erms.unit}/dashboard` : "/universe/erms/dashboard"}
                          replace
                        />
                      }
                    />
                  </Route>

                  {/* ERMS configuration: the units, their document types and
                      forms, the filing layout and the menus. Admin domain. */}
                  <Route
                    path="admin/erms-config"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <ErmsConfig />
                      </DomainGuard>
                    }
                  />

                  {/* Universe Central DB settings: read by every UCDS account,
                      changed by a Developer or Administrator (enforced by the API). */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
                    <Route path="settings/ucds" element={<UcdsSettings />} />
                  </Route>
                  {/* A unit's working rules, set by its own staff. */}
                  <Route element={<DomainGuard domain="erms" user={currentUser} />}>
                    <Route path="settings/erms" element={<ErmsSettings />} />
                    <Route path="settings/erms/:section" element={<ErmsSettings />} />
                  </Route>
                  <Route
                    path="settings/general"
                    element={<GeneralSettings theme={theme} />}
                  />
                  <Route
                    path="settings"
                    element={<Navigate to="/universe/settings/general" replace />}
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
                  {/* The year folder's spreadsheets, one screen for all of them. */}
                  <Route path="datasets/:key" element={<DatasetPage />} />
                  {/* Items people added to the year's menu: folders and their own tables. */}
                  <Route path="custom/:id" element={<CustomItemPage />} />
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

                  {/* Anything else inside the application gets a proper
                      not-found card rather than an empty content area. */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </Content>
            </Layout>
          </Layout>
        </DataProvider>
      </>
      <EnvStatus />
    </>
  );
};

export default Universe;
