import React, { lazy, Suspense,  useState, useEffect, useCallback } from "react";
import { Layout, Button, Spin, Popover, List, Tag } from "antd";
import { message } from "./shared/feedback";
import { useTheme } from "./theme/ThemeProvider";
import {
  clearSessionStorageKeepingPreferences,
  getPreference,
  setPreference,
} from "./shared/preferences";
import { UserOutlined, SunOutlined, MoonOutlined, MenuOutlined } from "@ant-design/icons";
import useScreen from "./shared/useScreen";
import { fetchErmsAvailability } from "./shared/ermsAvailability";
import { UnitGate } from "./shared/components/UnitGate";
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import {
  fetchCurrentUser,
  fetchDataValidationIssues,
  fetchDuplicateDataIssues,
  logoutUserService,
} from "./api/universeService"; // Import services
import { API_BASE_URL as backendUrl } from "./config/api";
import "./index.css";
import CryptoJS from "crypto-js";
// Its own chunk (the charts): an ERMS account never opens it.
const Dashboard = lazy(() => import("./modules/ucds/dashboard/Dashboard"));
const Province = lazy(() => import("./modules/ucds/province/Province"));
const MBU = lazy(() => import("./modules/ucds/mbu/MBU"));
const Accounts = lazy(() => import("./modules/admin/users/UserAccounts"));
const StorageBrowser = lazy(() => import("./modules/storage/StorageBrowser"));
const DatasetPage = lazy(() => import("./modules/ucds/datasets/DatasetPage"));
const ErmsDashboard = lazy(() => import("./modules/erms/pages/ErmsDashboard"));
const RecordsList = lazy(() => import("./modules/erms/pages/RecordsList"));
const RecordDetail = lazy(() => import("./modules/erms/pages/RecordDetail"));
const ArchiveBoxes = lazy(() => import("./modules/erms/pages/ArchiveBoxes"));
const UnitDashboard = lazy(() => import("./modules/erms/units/UnitDashboard"));
const UnitDocuments = lazy(() => import("./modules/erms/units/UnitDocuments"));
const UnitDocumentDetail = lazy(() => import("./modules/erms/units/UnitDocumentDetail"));
const ErmsConfig = lazy(() => import("./modules/admin/erms/ErmsConfig"));
const VeraSettings = lazy(() => import("./modules/vera/VeraSettings"));
const ProgressTracker = lazy(() => import("./modules/admin/progress/ProgressTracker"));
const ErmsSettings = lazy(() => import("./modules/erms/pages/ErmsSettings"));
const UploadTally = lazy(() => import("./modules/erms/pages/UploadTally"));
const ErmsReports = lazy(() => import("./modules/erms/pages/ErmsReports"));
const Messages = lazy(() => import("./modules/erms/pages/Messages"));
const PortalDesk = lazy(() => import("./modules/portal/PortalDesk"));
const SignInHistory = lazy(() => import("./modules/admin/users/SignInHistory"));
const CustomItemPage = lazy(() => import("./modules/ucds/custom/CustomItemPage"));
// Universe Central DB › Reports (it used to open the user list).
const Report = lazy(() => import("./modules/ucds/reports/UcdsReports"));
const UcdsVeraCheck = lazy(() => import("./modules/ucds/vera/UcdsVeraCheck"));
const Posting = lazy(() => import("./modules/admin/posting/Posting"));
// Admin Settings › Audit Logs: one tab per sub-application.
const AuditLogs = lazy(() => import("./modules/admin/audit/AuditLogs"));
const SystemSettings = lazy(() => import("./modules/admin/SystemSettings"));
import AvatarWithName from "./components/AvatarwithName";
import SideMenu from "./components/SideMenu";
import NotificationsPopover from "./components/AiNotification/PopOverNotification";
import HeaderMessages from "./components/HeaderMessages";
import useRealtimeNotices from "./shared/notifications/useRealtimeNotices";
import { pausePushForSignOut } from "./shared/notifications/devicePush";
import UserPopover from "./components/PopOverUser/PopOverUser";
import PageLoading from "./shared/components/PageLoading";
import { DataProvider } from "./modules/ucds/province/DataContext";
import EnvStatus from "./components/EnvStatus";
import NasStatusBanner from "./components/NasStatusBanner";
import ViewAsBanner from "./components/ViewAsBanner";
import AppFooter from "./components/AppFooter";
import VeraChat from "./modules/vera/VeraChat";
import moment from "moment";

const StorageConfig = lazy(() => import("./modules/admin/developer/StorageConfig"));
const ViewAs = lazy(() => import("./modules/admin/developer/ViewAs"));

import { ROUTES } from "./config/routes";
import DomainGuard from "./auth/DomainGuard";
import NotFound from "./shared/components/NotFound";
import ContentLoading from "./shared/components/ContentLoading";
import { useYear } from "./context/YearContext";
import { subsystemOf } from "./shared/subsystems";
import { clearSessionToken } from "./shared/sessionToken";
import RoleGuard from "./auth/RoleGuard";
import Forbidden from "./shared/components/Forbidden";
const OrgUnits = lazy(() => import("./modules/admin/OrgUnits"));
import GeneralSettings from "./modules/settings/GeneralSettings";
const UcdsSettings = lazy(() => import("./modules/settings/UcdsSettings"));
import { settingsPath } from "./modules/erms/settingsPath";
import { fetchRecords, fetchUnitDashboard, fetchUnitDocuments, fetchUnreadMessages } from "./modules/erms/api/ermsService";
import visibleInterval from "./shared/visibleInterval";
import { getVeraFixesPending, getVeraRepairs } from "./modules/vera/veraService";
import { getSocket, initializeSocket } from "./api/socketService";
import { fetchChatSummary, fetchDesk as fetchPortalDesk } from "./modules/portal/portalService";

const { Header, Content } = Layout;

/** /settings/erms/:section? — the old shared page — to the home unit's own settings. */
function LegacyErmsSettings({ home }) {
  const { section } = useParams();
  return <Navigate to={settingsPath(home || "records", section)} replace />;
}

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
  // The navigation: open on a desktop, icons only on a tablet, a closed
  // drawer on a phone — and again whenever the screen changes kind (a tablet
  // turned, a window narrowed).
  const screen = useScreen();
  const [collapsed, setCollapsed] = useState(() => !screen.desktop);
  useEffect(() => {
    setCollapsed(!screen.desktop);
  }, [screen.phone, screen.tablet, screen.desktop]);
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
  // A Developer viewing as an officer (server/services/viewAs.js), or null.
  const [viewAs, setViewAs] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [ermsNotifications, setErmsNotifications] = useState([]);
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
  const location = useLocation();
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
      setViewAs(data.viewAs || null);
      setUserRole(data.role || "viewer");
      setUserHandle(data.user?.username);
      setDivision(data.user?.division || "");
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

  // The register's completeness check and its duplicate permits, for the
  // bell. Asked once per sign-in and when the bell's refresh is pressed —
  // not on every render: it depended on `domains`, a new array each render,
  // so every navigation asked again, and each answer was 17.7 MB.
  const hasUcds = domains.includes("ucds");
  const hasErms = domains.includes("erms");
  const fetchDataIssues = useCallback(async () => {
    if (!auth) return; // Ensure auth is true before fetching
    if (!hasUcds) {
      setNotifications([]);
      return;
    }
    setIsLoading(true); // Set loading for notifications
    try {
      const [dataIssuesPayload, duplicateIssuesPayload] = await Promise.all([
        hasUcds ? fetchDataValidationIssues() : Promise.resolve(null),
        hasUcds ? fetchDuplicateDataIssues() : Promise.resolve(null),
      ]);

      let dataIssues = [];
      // The check now arrives grouped: the field labels once, and per
      // establishment the numbers of the fields it lacks. The bell turns
      // numbers into labels only for the page it shows.
      if (!hasUcds) {
        dataIssues = [];
      } else if (dataIssuesPayload && Array.isArray(dataIssuesPayload.records)) {
        const { fields = [] } = dataIssuesPayload;
        dataIssues = dataIssuesPayload.records.length
          ? dataIssuesPayload.records.map(([id_no, missing]) => ({ id_no, missing, fields }))
          : ["No issues detected"];
      } else if (dataIssuesPayload && dataIssuesPayload.issues !== undefined) {
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
      if (!hasUcds) {
        duplicateIssues = [];
      } else if (
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
  }, [auth, hasUcds, setIsLoading, setNotifications]);

  useEffect(() => {
    if (!auth) return; // Only fetch if authenticated
    fetchDataIssues();
    // If you need polling, you can set it up here, calling the memoized fetchDataIssues
  }, [auth, fetchDataIssues]); // fetchDataIssues is now a dependency

  // ---------------------------------------------------------------------------
  // The bell's action items: what this account can act on, and nothing it
  // cannot. Each is a count the server already scopes to the account, so a
  // Legal officer is told about Legal, the Records Unit about records, an
  // administrator about accounts — and the Developer, who holds every
  // domain and unit, about all of it. Small reads, so they are checked again
  // every two minutes while the tab is in view (the register check above is
  // large and stays on demand).
  // ---------------------------------------------------------------------------
  const ermsUnitsKey = (erms.units || []).join(",");
  const isDeveloperAccount = String(userRole || "").toLowerCase() === "developer";
  const fetchActionItems = useCallback(async () => {
    if (!auth) return;
    // A unit taken down for maintenance is not asked for anything.
    const down = hasErms ? Object.entries((await fetchErmsAvailability().catch(() => null)) || {}).filter(([, s]) => s?.down).map(([u]) => u) : [];
    const units = (ermsUnitsKey ? ermsUnitsKey.split(",") : []).filter((u) => !down.includes(u));
    const seesRecords = hasErms && !down.includes("records") && (units.includes("records") || !ermsUnitsKey);
    const count = (promise, pick) => promise.then(pick).catch(() => 0);
    // The Document Portal desk shows each unit its own requests (the Developer every unit's).
    const decidesPortal = hasErms && (units.length > 0 || isDeveloperAccount);
    // VERA's repairs of the register: for those who may apply them (the Developer, administrators).
    const maintainsRegister = hasUcds && ["developer", "admin"].includes(String(userRole || "").toLowerCase());
    const [unread, flagged, legalNoScan, labNoScan, signUps, fixes, portalDesk, portalChats, repairs] = await Promise.all([
      hasErms ? count(fetchUnreadMessages(), (n) => Number(n) || 0) : 0,
      seesRecords ? count(fetchRecords({ flagged: true, page: 1, pageSize: 1 }), (r) => r?.total || 0) : 0,
      hasErms && units.includes("legal") ? count(fetchUnitDocuments("legal", { missingFile: true, pageSize: 1 }), (r) => r?.total || 0) : 0,
      hasErms && units.includes("laboratory") ? count(fetchUnitDocuments("laboratory", { missingFile: true, pageSize: 1 }), (r) => r?.total || 0) : 0,
      // Account requests waiting for approval: the Developer's to decide.
      isDeveloperAccount
        ? count(fetch(`${backendUrl}/api/sign-up?status=pending`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])), (rows) => (Array.isArray(rows) ? rows.length : 0))
        : 0,
      // What each of VERA's Document Library checks holds waiting — data
      // corrections, register links, project types, Ref. Nos., serials: the Developer's.
      isDeveloperAccount ? getVeraFixesPending().catch(() => null) : null,
      // The Document Portal: requests waiting for this account's unit (refused to anyone who decides none).
      decidesPortal ? fetchPortalDesk().catch(() => null) : null,
      // Messages from people in the room, not read yet.
      decidesPortal ? count(fetchChatSummary(), (chats) => (chats || []).reduce((n, c) => n + (c.unread || 0), 0)) : 0,
      maintainsRegister ? getVeraRepairs().catch(() => null) : null,
    ]);
    const items = [];
    const portalPending = portalDesk?.pending?.length || 0;
    if (portalPending > 0) {
      items.push({
        type: "portal-decide", group: "Document Portal", tone: "warning", count: portalPending, href: "/e-universe/erms/portal-requests",
        title: `${portalPending} Document Portal ${portalPending === 1 ? "request" : "requests"} to decide`,
        description: "People in the room are waiting for a decision.",
      });
    }
    if (portalChats > 0) {
      items.push({
        type: "portal-chat", group: "Document Portal", tone: "info", count: portalChats, href: "/e-universe/erms/portal-requests",
        title: `${portalChats} unread ${portalChats === 1 ? "message" : "messages"} from the Document Portal`,
        description: "A requester wrote about their request.",
      });
    }
    if (unread > 0) {
      items.push({ type: "erms-message", group: "ERMS", tone: "info", count: unread, href: "/e-universe/erms/messages", title: `${unread} unread ${unread === 1 ? "message" : "messages"}`, description: "In the ERMS Action Center." });
    }
    if (flagged > 0) {
      items.push({ type: "erms-review", group: "ERMS", tone: "danger", count: flagged, href: "/e-universe/erms/records?flagged=1", title: `${flagged} ${flagged === 1 ? "record needs" : "records need"} review`, description: "Values that could not be read during migration — usually a date." });
    }
    if (legalNoScan > 0) {
      items.push({ type: "erms-legal-scan", group: "ERMS", tone: "warning", count: legalNoScan, href: "/e-universe/erms/legal/settings/data", title: `${legalNoScan} Legal ${legalNoScan === 1 ? "document has" : "documents have"} no scan`, description: "Kept without a scanned file. File the scan from the document." });
    }
    if (labNoScan > 0) {
      items.push({ type: "erms-lab-scan", group: "ERMS", tone: "warning", count: labNoScan, href: "/e-universe/erms/laboratory/settings/data", title: `${labNoScan} Laboratory ${labNoScan === 1 ? "document has" : "documents have"} no scan`, description: "Kept without a scanned file. File the scan from the document." });
    }
    // Calibration certificates past or near their due date (the Laboratory dashboard's figures, cached there).
    if (hasErms && units.includes("laboratory")) {
      const due = await fetchUnitDashboard("laboratory").then((d) => d?.calibrationDue).catch(() => null);
      if (due && due.overdue + due.soon > 0) {
        items.push({ type: "erms-lab-calibration", group: "ERMS", tone: due.overdue ? "danger" : "warning", count: due.overdue + due.soon, href: "/e-universe/erms/laboratory/dashboard", title: `${due.overdue ? `${due.overdue} calibration certificate${due.overdue === 1 ? "" : "s"} overdue` : ""}${due.overdue && due.soon ? ", " : ""}${due.soon ? `${due.soon} due within ${due.windowDays} days` : ""}`, description: "Laboratory calibration certificates, by their date due." });
      }
    }
    if (signUps > 0) {
      items.push({ type: "admin-signup", group: "Admin", tone: "info", count: signUps, href: "/e-universe/admin/users", title: `${signUps} account ${signUps === 1 ? "request" : "requests"} to review`, description: "People asking for an E-Universe account." });
    }
    // VERA's Document Library checks, each to its own tab of VERA Assistant.
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const VERA_FIXES = [
      ["corrections", "vera-corrections", "info", (n) => `VERA found ${plural(n, "data correction", "data corrections")}`, "Project types, titles, proponents and places written several ways in the Document Library."],
      ["links", "vera-links", "info", (n) => `VERA can link ${plural(n, "record", "records")} to the central register`, "Records whose reference number did not find their establishment."],
      ["projectTypes", "vera-project-types", "info", (n) => `${plural(n, "project type", "project types")} to correct from the document`, "VERA read the scan and found another project type than the one on file."],
      ["refNumbers", "vera-ref-numbers", "warning", (n) => `${plural(n, "Ref. No. differs", "Ref. Nos. differ")} from the scan`, "The number printed on the scan is not the one encoded, or none was encoded."],
      ["serials", "vera-serials", "danger", (n) => `${plural(n, "serial number problem", "serial number problems")}`, "Duplicated serials, or a counter behind the highest serial on file."],
    ];
    const VERA_TAB = { corrections: "corrections", links: "links", projectTypes: "project-types", refNumbers: "ref-numbers", serials: "serials" };
    for (const [key, type, tone, title, description] of VERA_FIXES) {
      const n = Number(fixes?.[key]) || 0;
      if (n > 0) items.push({ type, group: "VERA", tone, count: n, href: `/e-universe/admin/vera?tab=${VERA_TAB[key]}`, title: title(n), description: `${description} Review them in VERA Assistant.` });
    }
    // The bell's VERA tab: what she repaired in the register this week, what
    // waits for a person, and her permit findings from the latest check.
    if (repairs?.checkedAt) {
      const r = repairs.repaired;
      if (r?.records > 0) {
        items.push({
          type: "vera-repaired", group: "VERA", tone: "success", count: r.records, href: "/e-universe/vera-check",
          title: `VERA repaired ${r.records} ${r.records === 1 ? "record" : "records"} this week`,
          description: r.byField.slice(0, 4).map((f) => `${f.label} ${f.records}`).join(" · ") + ". Each can be undone in VERA's check.",
        });
      }
      if (repairs.waiting > 0) {
        items.push({ type: "vera-waiting", group: "VERA", tone: "info", count: repairs.waiting, href: "/e-universe/vera-check", title: `${repairs.waiting} register ${repairs.waiting === 1 ? "fix waits" : "fixes wait"} for you`, description: "Spellings and permits VERA proposes. Apply them, or let VERA fix the certain ones." });
      }
      const PERMIT_REVIEW = { "permit-missing": "vera-permit-missing", expired: "vera-permit-expired", "permit-expiring": "vera-permit-expiring", "permit-noncompliant": "vera-permit-nov" };
      for (const g of repairs.review.filter((x) => PERMIT_REVIEW[x.key])) {
        items.push({ type: PERMIT_REVIEW[g.key], group: "VERA", tone: g.key === "permit-expiring" ? "warning" : "danger", count: g.count, href: "/e-universe/vera-check", title: g.label, description: `From VERA's permit check of the ${repairs.register.replace(/^ucds-data-?/, "") || "register"}, checked ${moment(repairs.checkedAt).fromNow()}.` });
      }
    }
    setErmsNotifications(items);
  }, [auth, hasErms, hasUcds, userRole, ermsUnitsKey, isDeveloperAccount]);

  useEffect(() => {
    if (!auth) return undefined;
    fetchActionItems();
    return visibleInterval(fetchActionItems, 120000);
  }, [auth, fetchActionItems]);
  const refreshAll = useCallback(() => {
    fetchDataIssues();
    fetchActionItems();
  }, [fetchDataIssues, fetchActionItems]);
  // A request, message or decision for this account: shown at once, and the
  // bell's counts refreshed rather than waiting for the next poll.
  useRealtimeNotices({ enabled: Boolean(auth), username: userHandle, onNotice: fetchActionItems });
  // VERA repaired the register (fixes applied, undone, or "Let VERA fix it"):
  // the bell counts again — repaired records leave "IDs for repair" and
  // "Duplicates" at once. Settled for a few seconds, as fixes come in batches.
  useEffect(() => {
    if (!auth) return undefined;
    const socket = getSocket() || initializeSocket();
    let t = null;
    const onRepaired = () => {
      clearTimeout(t);
      t = setTimeout(refreshAll, 3000);
    };
    // One of VERA's Document Library checks changed (a check, an apply, an
    // undo): only the action items count again — the register's completeness
    // check is not touched by these.
    let f = null;
    const onFixes = () => {
      clearTimeout(f);
      f = setTimeout(fetchActionItems, 1500);
    };
    socket?.on("vera:repaired", onRepaired);
    socket?.on("vera:fixes", onFixes);
    return () => {
      clearTimeout(t);
      clearTimeout(f);
      socket?.off("vera:repaired", onRepaired);
      socket?.off("vera:fixes", onFixes);
    };
  }, [auth, refreshAll, fetchActionItems]);
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
    // No device notices for this account here once it has signed out (it
    // resumes on signing back in). Asked first, while the session is alive.
    await pausePushForSignOut();
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
    window.location.replace(ROUTES.login);
  };

  const handleDismissHint = () => {
    setShowThemeHint(false);
  };

  const handleDontShowAgainHint = () => {
    setPreference("hideThemeHint", "true");
    setShowThemeHint(false);
  };

  if (loading) return <PageLoading />;

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
    viewAs,
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
              mobile={screen.phone}
              currentUser={currentUser}
              provinceAccess={provinceAccess}
            />
            <Layout>
              <Header className={`header-container ${theme}-theme`}>
                <div className="header-content">
                  {/* On a phone the navigation is a drawer: this opens it. */}
                  {screen.phone && (
                    <Button
                      className="theme-button header-menu-button"
                      type="text"
                      onClick={() => setCollapsed(false)}
                      aria-label="Open the menu"
                      icon={<MenuOutlined style={{ fontSize: 15 }} />}
                    />
                  )}
                  <div
                    className="profile_container"
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span className="user-name" style={{ whiteSpace: "nowrap" }}>
                      {now.format("MMMM DD, YYYY hh:mm A")} | {name} | {division}
                      {/* Where you are: the subsystem this address belongs to —
                          ERMS · Records / Legal Services / Laboratory, Storage,
                          Universe Central DB — not the account's fixed type.
                          The account type still shows in the account panel. */}
                      <Tag color={subsystemOf(location.pathname).color} className="header-role" title="Subsystem">
                        {subsystemOf(location.pathname).name}
                      </Tag>
                    </span>

                    {/* The year switcher ("2026 DATA") was removed from the
                        header: the year is chosen at sign-in, and Settings ›
                        Universe Central DB still manages the year containers. */}

                    {/* Messages (ERMS accounts), beside the bell. */}
                    <HeaderMessages domains={domains} />

                    <NotificationsPopover
                      theme={theme}
                      notifications={notifications}
                      ermsNotifications={ermsNotifications}
                      isLoading={isLoading} // Pass the loading state for notifications
                      className="notification-icon"
                      currentUser={currentUser}
                      refreshNotifications={refreshAll}
                      domains={domains}
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
              <ViewAsBanner viewAs={viewAs} />
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
                  {/* "home" too: /e-universe/home is the app's own home now that
                      bare /e-universe is the public landing page. */}
                  {["/", "home"].map((p) => (
                  <Route
                    key={p}
                    path={p}
                    element={
                      <Navigate
                        // Absolute: relative to "home" these resolved to
                        // /e-universe/home/dashboard, which is no page.
                        to={`${ROUTES.app}/${
                          // An ERMS User lands in their own unit; anyone else
                          // with UCDS lands on the planning dashboard.
                          erms.skipYearSelect && erms.unit
                            ? erms.unit === "records" ? "erms/dashboard" : `erms/${erms.unit}/dashboard`
                            : domains.includes("ucds")
                              ? "dashboard"
                              : domains.includes("erms")
                                ? erms.unit && erms.unit !== "records" ? `erms/${erms.unit}/dashboard` : "erms/dashboard"
                                : "dashboard"
                        }`}
                        replace
                      />
                    }
                  />
                  ))}

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
                        <AuditLogs />
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
                    path="admin/sign-in-history"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <SignInHistory />
                      </DomainGuard>
                    }
                  />
                  <Route
                    path="accounts"
                    element={<Navigate to="/e-universe/admin/users" replace />}
                  />
                  <Route
                    path="activity-log"
                    element={<Navigate to="/e-universe/admin/audit" replace />}
                  />
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
                    // The Register page (Monitoring Config, Register Activity,
                    // Duplicate Data) was removed on 28 Oct 2026; its old
                    // addresses go to the home page rather than 404.
                    ["admin/register", "/e-universe/home"],
                    ["register/config", "/e-universe/home"],
                    ["records/config", "/e-universe/home"],
                    ["register/activity", "/e-universe/home"],
                    ["records/activity", "/e-universe/home"],
                    ["admin/duplicates", "/e-universe/home"],
                    ["duplicates", "/e-universe/home"],
                    ["admin/developer/database-settings", "/e-universe/admin/system?tab=database"],
                    ["developer/database-settings", "/e-universe/admin/system?tab=database"],
                    ["admin/developer/activity-history", "/e-universe/admin/system?tab=audit"],
                    ["developer/activity-history", "/e-universe/admin/system?tab=audit"],
                    // Field Management and PDF Forms were removed. Their URLs
                    // point at the screen that absorbed the rest of that
                    // section rather than 404ing on a bookmark.
                    ["admin/developer/field-management", "/e-universe/admin/system"],
                    ["developer/field-management", "/e-universe/admin/system"],
                    ["admin/developer/pdf-forms", "/e-universe/admin/system"],
                    ["developer/pdf-forms", "/e-universe/admin/system"],
                  ].map(([from, to]) => (
                    <Route key={from} path={from} element={<Navigate to={to} replace />} />
                  ))}


                  {/* The Admin area has no page of its own. This used to be
                      the online-users widget stretched across the screen; it
                      now lives on Sign-in History, and /admin sends each
                      person to their own home: the Developer and an
                      Administrator to the main dashboard, a Planning Admin or
                      Encoder to UCDS, an ERMS User to their unit (see "home"
                      above). */}
                  <Route path="admin" element={<Navigate to={ROUTES.appHome} replace />} />

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
                    {/* A unit taken down for maintenance shows its notice
                        instead (shared/ermsAvailability); the Developer still
                        reaches it. */}
                    <Route element={<UnitGate unit="records" bypass={isDeveloperAccount} />}>
                      <Route path="erms/dashboard" element={<ErmsDashboard />} />
                      <Route path="erms/records" element={<RecordsList />} />
                      <Route path="erms/records/:serialNo" element={<RecordDetail />} />
                      <Route path="erms/archive" element={<ArchiveBoxes />} />
                      <Route path="erms/settings/:section?" element={<ErmsSettings unit="records" />} />
                    </Route>
                    {/* Reports were removed from the menu; a bookmark lands on the dashboard. */}
                    <Route path="erms/reports" element={<ErmsReports />} />
                    {/* The Document Portal's requests, decided by the Records Unit; the portal itself is public (/e-universe/document-portal). */}
                    <Route path="erms/portal-requests" element={<PortalDesk />} />
                    <Route path="erms/access-requests" element={<Navigate to="/e-universe/erms/portal-requests" replace />} />
                    {/* Uploads per person per day and their check — every unit,
                        so not under a unit's own path (erms/records/:serialNo
                        would take "records/upload-tally" for a serial). */}
                    <Route element={<UnitGate bypass={isDeveloperAccount} />}>
                      <Route path="erms/upload-tally/:unit" element={<UploadTally />} />
                    </Route>
                    <Route path="erms/messages" element={<Messages />} />
                    {/* The Legal Services and Laboratory units. Which units
                        the person may see is decided by the server; the
                        screens explain when one is not theirs. */}
                    <Route element={<UnitGate bypass={isDeveloperAccount} />}>
                      <Route path="erms/:unit/dashboard" element={<UnitDashboard />} />
                      <Route path="erms/:unit/documents" element={<UnitDocuments />} />
                      <Route path="erms/:unit/archive" element={<ArchiveBoxes />} />
                      <Route path="erms/:unit/documents/:serialNo" element={<UnitDocumentDetail />} />
                      {/* Each unit's own settings, read by its members and set
                          by its staff (Records' are with its screens above). */}
                      <Route path="erms/:unit/settings/:section?" element={<ErmsSettings />} />
                    </Route>
                    <Route
                      path="erms"
                      element={
                        <Navigate
                          to={erms.unit && erms.unit !== "records" ? `/e-universe/erms/${erms.unit}/dashboard` : "/e-universe/erms/dashboard"}
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

                  {/* VERA, the assistant. Admin domain; the API refuses
                      everyone else. */}
                  <Route
                    path="admin/vera"
                    element={
                      <DomainGuard domain="admin" user={currentUser}>
                        <VeraSettings />
                      </DomainGuard>
                    }
                  />

                  {/* The Progress Tracker: the Planning Unit's SharePoint
                      working files, live during an activity season.
                      Developer-only; the API refuses everyone else. */}
                  <Route element={<RoleGuard roles={["developer"]} user={currentUser} />}>
                    <Route path="admin/progress-tracker" element={<ProgressTracker />} />
                  </Route>

                  {/* Universe Central DB settings: read by every UCDS account,
                      changed by a Developer or Administrator (enforced by the API). */}
                  <Route element={<DomainGuard domain="ucds" user={currentUser} />}>
                    <Route path="settings/ucds" element={<UcdsSettings />} />
                  </Route>
                  {/* The single ERMS settings page became one per unit, under
                      each unit's own section. An old bookmark lands on the
                      person's home unit, on the same tab. */}
                  <Route element={<DomainGuard domain="erms" user={currentUser} />}>
                    <Route path="settings/erms/:section?" element={<LegacyErmsSettings home={erms.unit} />} />
                  </Route>
                  <Route
                    path="settings/general"
                    element={<GeneralSettings theme={theme} />}
                  />
                  <Route
                    path="settings"
                    element={<Navigate to="/e-universe/settings/general" replace />}
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
                    {/* See the application as a Planning or ERMS officer, view only. */}
                    <Route path="admin/developer/view-as" element={<ViewAs />} />
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
                        <Navigate to="/e-universe/admin/developer/storage-config" replace />
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
                  {/* VERA's check of the register: the Developer and administrators. */}
                  <Route element={<RoleGuard roles={["developer", "admin"]} user={currentUser} />}>
                    <Route path="vera-check" element={<UcdsVeraCheck />} />
                  </Route>
                  <Route
                    path="posting"
                    element={<Navigate to="/e-universe/admin/posting" replace />}
                  />
                  {/* Old location, kept as a redirect so one page has one URL. */}
                  <Route
                    path="duplicates"
                    element={<Navigate to="/e-universe/admin/duplicates" replace />}
                  />
                  </Route>

                  {/* Anything else inside the application gets a proper
                      not-found card rather than an empty content area. */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </Content>
              <AppFooter />
            </Layout>
            {/* VERA, on every screen. It decides for itself whether to show
                (Admin Settings › VERA Assistant). */}
            <VeraChat />
          </Layout>
        </DataProvider>
      </>
      <EnvStatus />
    </>
  );
};

export default Universe;
