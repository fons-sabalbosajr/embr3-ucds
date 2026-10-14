import React, { useState, useEffect, useContext, useRef } from "react";
import { Layout, Menu, Button, Avatar, Tooltip, Badge, Tag } from "antd";
import {
  MessageOutlined,
  DashboardFilled,
  DatabaseFilled,
  LockOutlined,
  SettingFilled,
  MedicineBoxFilled,
  ReconciliationFilled,
  CaretLeftOutlined,
  CaretRightOutlined,
  FolderOpenOutlined,
  FileProtectOutlined,
  AuditOutlined,
  CloudUploadOutlined,
  ExperimentOutlined,
  ToolOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  MailOutlined,
  InboxOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useLocation } from "react-router-dom";
// Known boundary debt: the shared layout drives province selection, but the
// province state lives in a UCDS-owned context that also fetches the register.
// The fix is to lift "currently selected province" into shared navigation state
// and leave the data fetching in UCDS. Tracked in docs/UNIFICATION-PLAN.md.
// eslint-disable-next-line no-restricted-imports
import { DataContext } from "../modules/ucds/province/DataContext";
import {
  initializeSocket,
  emitJoinProvince,
  emitLeaveProvince,
  onProvinceViewersUpdate, // Corrected typo here
  onMbuViewersUpdate, // Corrected typo here
  onSocketConnect,
  // onSocketDisconnect, // If needed
} from "../api/socketService"; // Import socket service
import Logo from "./Logo";
import MenuItemModal from "./MenuItemModal";
import { useYear } from "../context/YearContext";
import { API_BASE_URL } from "../config/api";
import visibleInterval from "../shared/visibleInterval";
import { useErmsAvailability } from "../shared/ermsAvailability";
import "./sidemenu.css";

const { Sider } = Layout;

const rootSubmenuKeys = [
  "ucds-db",
  "erms",
  "settings",
  "admin",
];

// `key` matches the per-province grant on the user account; `value` is the
// province as written in the register and in the route. These were previously
// two parallel lists kept in sync by array position, so that the sidebar could
// read permissions[i + 5] to decide whether to show province i.
const PROVINCE_MENU = [
  { key: "aurora", value: "Aurora" },
  { key: "bataan", value: "Bataan" },
  { key: "bulacan", value: "Bulacan" },
  { key: "nuevaEcija", value: "Nueva_Ecija" },
  { key: "pampanga", value: "Pampanga" },
  { key: "tarlac", value: "Tarlac" },
  { key: "zambales", value: "Zambales" },
];

/**
 * @param collapsed / setCollapsed  owned by the shell (Universe), which starts
 *                    it collapsed on a tablet and closed on a phone
 * @param mobile      a phone: the navigation is a drawer over the page — no
 *                    width of its own, a backdrop behind it, opened from the
 *                    header's menu button and closed by choosing somewhere
 */
const SideMenu = ({ theme, currentUser, collapsed, setCollapsed, mobile = false }) => {
  const [siderWidth, setSiderWidth] = useState(230);
  const [openKeys, setOpenKeys] = useState([]);
  const [provinceViewers, setProvinceViewers] = useState({});
  const [mbuViewers, setMbuViewers] = useState([]);
  const [currentProvince, setCurrentProvinceState] = useState(null);
  // Year containers and what each year's folder holds, for the Universe
  // Central DB tree. The registry is names only and is fetched once.
  const { years: yearContainers, activeYear, selectYear } = useYear();
  const [datasetRegistry, setDatasetRegistry] = useState({});
  // Items people added to a year's branch: folders and their own tables,
  // under the year or under the Monitoring Plan folder. Flat per year; the
  // tree is built while rendering.
  const [customItems, setCustomItems] = useState({});
  const [canManageMenu, setCanManageMenu] = useState(false);
  const [menuItemsVersion, setMenuItemsVersion] = useState(0);
  // The add/rename dialog: { year, item?, parent? }.
  const [itemDialog, setItemDialog] = useState(null);

  const location = useLocation();
  // The sections open as popups while the menu is collapsed; none at first.
  const [popupKeys, setPopupKeys] = useState([]);
  useEffect(() => setPopupKeys([]), [collapsed, location.pathname]);
  // On a phone the drawer closes once somewhere is chosen.
  useEffect(() => {
    if (mobile) setCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, mobile]);
  const navigate = useNavigate();
  const { setCurrentProvince, clearCache } = useContext(DataContext);
  const prevLocationPathnameRef = useRef(location.pathname); // To track previous path
  // Named entitlement from GET /api/auth/me. Hiding a menu item is a courtesy,
  // not a control: every route behind these links is checked again server-side.
  const capabilities = currentUser?.capabilities || {};
  const grantedProvinces = currentUser?.provinces || [];
  const canViewAdminPanel = capabilities.canViewAdminPanel === true;
  const canViewDataHistory = capabilities.canViewDataHistory === true;

  // Domain entitlement decides which business modules appear at all, so a
  // Records user is not shown the planning register and vice versa. The API
  // enforces the same boundary with requireDomain(); this only keeps the
  // sidebar honest about what the account can actually reach.
  const domains = currentUser?.domains || [];
  // Storage containers the Developer shared with this account. Present for a
  // Developer (all of them) and for a Planning or Records admin with a
  // designation; an Encoder never has any, so the entry never appears.
  const storageContainers = currentUser?.storageContainers || [];
  const hasUcds = domains.includes("ucds");
  const hasAdmin = domains.includes("admin");
  // The records share configuration is developer-only. It is a role question,
  // not a domain one — the share is infrastructure, not a business module.
  const role = currentUser?.permission ?? currentUser?.role;
  const isDeveloper = role === "developer";
  const hasErms = domains.includes("erms");
  // The ERMS units this person may see (see /api/auth/me). Absent on an
  // older session: a Developer sees all three, an ERMS User the Records unit.
  const ermsUnits = Array.isArray(currentUser?.ermsUnits) && currentUser.ermsUnits.length
    ? currentUser.ermsUnits
    : isDeveloper ? ["records", "legal", "laboratory"] : role === "records" ? ["records"] : [];
  const visibleProvinces = PROVINCE_MENU.filter((p) =>
    grantedProvinces.includes(p.key)
  ).map((p) => p.value);

  // The main Dashboard: the planning dashboard for anyone with the Universe
  // Central DB, otherwise the person's ERMS unit dashboard — a Records clerk
  // has no planning dashboard to see, so theirs is the first item rather
  // than an entry inside the ERMS section.
  const ermsHome = ermsUnits.includes("records") || !ermsUnits.length
    ? "/universe/erms/dashboard"
    : `/universe/erms/${ermsUnits[0]}/dashboard`;
  const mainDashboard = hasUcds ? "/universe/dashboard" : hasErms ? ermsHome : null;
  // Whether a unit's own Dashboard entry is already the main one above.
  const unitDashboardIsMain = (path) => mainDashboard === path;
  // The unit whose upload is a main entry of its own: the person's unit, or
  // Records when they see it. Another unit's upload sits in its section.
  // Units taken down for maintenance (Admin Settings › System › ERMS Units):
  // greyed out for everyone but the Developer, who keeps their links.
  const availability = useErmsAvailability({ enabled: hasErms });
  const unitClosed = (u) => availability.isDown(u) && !isDeveloper;
  const maintenanceTag = <Tag color="warning" style={{ marginInlineStart: 6, fontSize: 10, lineHeight: "16px", paddingInline: 4 }}>maintenance</Tag>;
  // The Developer's open section of a down unit: a small wrench, which leaves the section's arrow room.
  const maintenanceMark = (
    <Tooltip title="Down for maintenance — only you can open it">
      <ToolOutlined style={{ color: "#faad14", marginInlineStart: 6, fontSize: 12 }} aria-label="down for maintenance" />
    </Tooltip>
  );
  const closedSection = (key, icon, name) => ({
    key,
    icon,
    disabled: true,
    label: (
      <Tooltip title={availability.units[key.replace(/^erms-?/, "") || "records"]?.reason || "Temporarily unavailable"} placement="right">
        <div className="menu-label-wrapper main">ERMS · {name}{maintenanceTag}</div>
      </Tooltip>
    ),
  });
  const uploadUnit = (() => {
    const open = ermsUnits.filter((u) => !unitClosed(u));
    return hasErms && open.length ? (open.includes("records") ? "records" : open[0]) : null;
  })();
  const uploadPath = (u) => (u === "records" ? "/universe/erms/records?new=1" : `/universe/erms/${u}/documents?upload=1`);

  // A unit's settings page has one menu entry and a tab per section in the
  // path (…/settings/privacy); the entry stays lit on every tab.
  const selectedKey = location.pathname.replace(/^(\/universe\/erms(?:\/[a-z]+)?\/settings)\/[^/]+$/, "$1");

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/universe/dashboard") || (mainDashboard && path === mainDashboard)) {
      setOpenKeys([]);
    } else if (path.startsWith("/universe/province/") || path.startsWith("/universe/datasets/")) {
      setOpenKeys(["ucds-db", `year-${activeYear}`]);
      // } else if (path.startsWith("/universe/mbu")) {
      //   setOpenKeys([]);
    } else if (path.startsWith("/universe/erms/messages")) {
      setOpenKeys([]);
    } else if (path.startsWith("/universe/erms/legal") || path.startsWith("/universe/erms/upload-tally/legal")) {
      setOpenKeys(["erms-legal"]);
    } else if (path.startsWith("/universe/erms/laboratory") || path.startsWith("/universe/erms/upload-tally/laboratory")) {
      setOpenKeys(["erms-laboratory"]);
    } else if (path.startsWith("/universe/erms/")) {
      setOpenKeys(["erms"]);
    } else if (path.startsWith("/universe/settings/")) {
      setOpenKeys(["settings"]);
    } else if (
      path.startsWith("/universe/admin/") ||
      path.startsWith("/universe/register/")
    ) {
      setOpenKeys(["admin"]);
    } else {
      setOpenKeys([]); // Default: close all submenus if no specific match
    }
  }, [location.pathname, activeYear, mainDashboard]);

  // Unread messages in the Action Center, for the badge. Every two minutes,
  // and only while the tab is in view (see shared/visibleInterval); opening
  // the Messages page refreshes it at once.
  const [unreadMessages, setUnreadMessages] = useState(0);
  useEffect(() => {
    if (!hasErms) return undefined;
    let cancelled = false;
    const load = () =>
      fetch(`${API_BASE_URL}/api/erms/messages/unread`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((body) => {
          if (!cancelled) setUnreadMessages(Number(body.unread) || 0);
        })
        .catch(() => {});
    load();
    const stop = visibleInterval(load, 120000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [hasErms, location.pathname === "/universe/erms/messages"]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasUcds) return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/ucds/datasets/registry`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { years: [] }))
      .then((body) => {
        if (cancelled) return;
        const map = {};
        for (const y of body.years || []) map[y.year] = y.datasets || [];
        setDatasetRegistry(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasUcds]);

  useEffect(() => {
    if (!hasUcds) return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/ucds/menu-items`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { years: [] }))
      .then((body) => {
        if (cancelled) return;
        const map = {};
        for (const y of body.years || []) map[y.year] = y.items || [];
        setCustomItems(map);
        setCanManageMenu(body.canManage === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasUcds, menuItemsVersion]);

  const refreshMenuItems = () => setMenuItemsVersion((v) => v + 1);

  // Open the dialog for a year: the server only changes the active year's
  // items, so another year is selected first (the content remounts under it).
  const addItem = async (year, parent) => {
    if (year !== activeYear) {
      try {
        await selectYear(year);
        clearCache?.();
      } catch {
        navigate("/select-year");
        return;
      }
    }
    setItemDialog({ year, parent });
  };

  const removeItem = async (year, item) => {
    if (year !== activeYear) await selectYear(year).catch(() => null);
    const res = await fetch(`${API_BASE_URL}/api/ucds/menu-items/${item.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) refreshMenuItems();
  };

  // A user-added item as a menu entry: a folder holds its children (and can
  // take more), a table opens its page. Hover shows the actions to whoever
  // may manage the menu; a click on them must not toggle the folder.
  const itemActions = (year, item) => {
    if (!canManageMenu) return null;
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    return (
      <span className="menu-item-actions" onClick={stop}>
        {item.kind === "folder" && (
          <Tooltip title="Add inside">
            <button type="button" className="menu-item-action" aria-label="Add inside" onClick={() => addItem(year, item.id)}>+</button>
          </Tooltip>
        )}
        <Tooltip title="Rename or move">
          <button type="button" className="menu-item-action" aria-label="Rename" onClick={async () => { if (year !== activeYear) await selectYear(year).catch(() => null); setItemDialog({ year, item }); }}>✎</button>
        </Tooltip>
        <Tooltip title={item.kind === "folder" ? "Remove folder and its contents" : "Remove"}>
          <button type="button" className="menu-item-action is-danger" aria-label="Remove" onClick={() => removeItem(year, item)}>×</button>
        </Tooltip>
      </span>
    );
  };

  const customEntries = (year, parent, isActive) =>
    (customItems[year] || [])
      .filter((i) => i.parent === parent)
      .map((item) =>
        item.kind === "folder"
          ? {
              key: `custom-${item.id}`,
              className: "custom-folder",
              label: (
                <div className="menu-label-wrapper submenu-item-label custom-item">
                  <span className="custom-item-name">{item.label}</span>
                  {itemActions(year, item)}
                </div>
              ),
              children: customEntries(year, item.id, isActive),
            }
          : {
              key: isActive ? `/universe/custom/${item.id}` : `y${year}/custom/${item.id}`,
              className: "custom-table",
              onClick: () => openInYear(year, `/universe/custom/${item.id}`),
              label: (
                <div className="menu-label-wrapper submenu-item-label custom-item">
                  <span className="custom-item-name">{item.label}</span>
                  {itemActions(year, item)}
                </div>
              ),
            }
      );

  // Every dataset lives in one year container, and the server reads the year
  // from the session. Picking something under another year selects that
  // container first, then navigates in place: the content area is keyed on
  // the active year, so the screens remount and refetch under the new year
  // while the sidebar and header stay put. No page reload.
  const openInYear = async (year, path) => {
    if (year === activeYear) {
      navigate(path);
      return;
    }
    try {
      await selectYear(year);
      clearCache?.();
      navigate(path);
    } catch {
      navigate("/select-year");
    }
  };

  // Effect for handling responsive sidebar width
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth <= 1080 ? 180 : 220; // Set to 160px for tablet
      setSiderWidth(newWidth);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Set initial width

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Effect for initializing socket and setting up listeners
  useEffect(() => {
    initializeSocket();

    const cleanups = [
      onProvinceViewersUpdate(setProvinceViewers),
      onMbuViewersUpdate(setMbuViewers),
    ];

    const handleSocketReconnect = () => {
      //console.log("[SideMenu] Socket reconnected. Re-joining rooms...");
      if (!currentUser?.username) return;

      const userPayload = {
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      };

      if (currentProvince) {
        // currentProvince is from component's state
        emitJoinProvince(currentProvince, userPayload);
      }
      // if (location.pathname === "/universe/mbu") {
      //   emitJoinMbu(userPayload);
      // }
      if (location.pathname === "/universe/admin") {
        // Add admin room join/leave if needed
      }
    };

    const connectCleanup = onSocketConnect(handleSocketReconnect);
    cleanups.push(connectCleanup);
    return () => {
      // If SideMenu unmounts, you might want to disconnect the socket
      // if no other component is using it. For now, we leave it connected.
      // disconnectSocket();
    };
  }, [currentUser, currentProvince, location.pathname]); // Add dependencies that handleSocketReconnect uses

  // Centralized effect for province join/leave based on URL changes
  useEffect(() => {
    const extractProvinceFromPath = (path) => {
      const match = path.match(/\/universe\/province\/([^/]+)/);
      return match ? match[1] : null;
    };
    if (!currentUser?.username) {
      const currentUrlProvince = extractProvinceFromPath(location.pathname);
      if (!currentUrlProvince) {
        setCurrentProvinceState(null);
        setCurrentProvince(null); // Update context as well
      }
      prevLocationPathnameRef.current = location.pathname; // Still update ref
      return;
    }

    const currentPath = location.pathname;
    const prevPath = prevLocationPathnameRef.current;

    const newUrlProvince = extractProvinceFromPath(currentPath);
    const oldUrlProvince = extractProvinceFromPath(prevPath);

    // Update local state (used for socket reconnect logic) and DataContext
    setCurrentProvinceState(newUrlProvince);
    setCurrentProvince(newUrlProvince);

    if (oldUrlProvince && oldUrlProvince !== newUrlProvince) {
      emitLeaveProvince();
    }

    // Handle joining the new province
    if (newUrlProvince && newUrlProvince !== oldUrlProvince) {
      emitJoinProvince(newUrlProvince, {
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
    }

    // Update the ref for the next render cycle
    prevLocationPathnameRef.current = currentPath;
  }, [location.pathname, currentUser, setCurrentProvince]); // Removed canViewDataHistory from deps

  // MBU join/leave logic
  // useEffect(() => {
  //   if (!currentUser?.username) {
  //     // Removed canViewDataHistory check
  //     return;
  //   }

  //   let didJoinMbuThisEffect = false;

  //   if (location.pathname === "/universe/mbu") {
  //     //console.log("[SideMenu] Path is /universe/mbu, attempting to joinMbu.");
  //     emitJoinMbu({
  //       // Corrected payload, removed path
  //       username: currentUser.username,
  //       avatar: currentUser.avatar || currentUser.avatarUrl,
  //       name: currentUser.name,
  //     });
  //     didJoinMbuThisEffect = true;
  //   }

  //   return () => {
  //     if (didJoinMbuThisEffect && currentUser?.username) {
  //       emitLeaveMbu();
  //     }
  //   };
  // }, [currentUser, location.pathname]);

  const handleProvinceSelect = (province) => {
    setCurrentProvinceState(province);
    setCurrentProvince(province);
    navigate(`/universe/province/${province}`);
  };

  const renderAvatars = (viewers) =>
    canViewDataHistory && viewers.length > 0 ? (
      <Avatar.Group
        max={{
          count: 1,
          style: {
            color: "#f56a00",
            backgroundColor: "#fde3cf",
            fontSize: 11,
          },
        }}
        size={18}
        style={{
          marginLeft: 8,
          alignSelf: "center",
          display: "flex",
          alignItems: "center",
        }}
      >
        {viewers.map((user) => (
          <Tooltip
            key={user.username}
            title={
              <span
                style={{ fontSize: "9px" }}
              >{`${user.username} is here`}</span>
            }
          >
            <Avatar
              src={user.avatar}
              style={{
                verticalAlign: "middle",
                backgroundColor: "#1890ff",
                fontSize: 10,
              }}
            >
              {!user.avatar && user.username
                ? user.username[0].toUpperCase()
                : ""}
            </Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
    ) : null;

  const LabelWithAvatars = ({ to, label, viewers }) => (
    <div className="menu-label-wrapper submenu-item-label">
      <Link to={to}>{label}</Link>
      {renderAvatars(viewers)}
    </div>
  );

  // ERMS, one section per unit the person may see. The Developer, who sees
  // all three, keeps them grouped — ERMS · Records, · Legal, · Laboratory.
  // An ERMS User works in one unit only: its pages are main entries of their
  // own, with no "ERMS · Laboratory" group around them to open first.
  // The route keys and API namespace stay "erms", which nobody sees.
  const UNIT_ICON = { records: <FileProtectOutlined />, legal: <AuditOutlined />, laboratory: <ExperimentOutlined /> };
  const UNIT_NAME = { records: "Records", legal: "Legal", laboratory: "Laboratory" };
  const PAGE_ICON = {
    Dashboard: <DashboardOutlined />,
    "Upload document": <CloudUploadOutlined />,
    "Document Library": <FileSearchOutlined />,
    "Portal Requests": <MailOutlined />,
    "Archive Boxes": <InboxOutlined />,
    "Upload Tally": <BarChartOutlined />,
    Settings: <SettingOutlined />,
  };
  const unitPages = (u) =>
    (u === "records"
      ? [
          // The unit's dashboard, unless it is already the main Dashboard above.
          // (Upload record is a main entry of its own, above.)
          !unitDashboardIsMain("/universe/erms/dashboard") && ["/universe/erms/dashboard", "Dashboard"],
          // The library is the register: every document, by its FSN.
          ["/universe/erms/records", "Document Library"],
          // Requests from the public Document Portal (/e-universe/document-portal).
          ["/universe/erms/portal-requests", "Portal Requests"],
          ["/universe/erms/archive", "Archive Boxes"],
          // Uploads per person per day, and the supervisor's check.
          ["/universe/erms/upload-tally/records", "Upload Tally"],
          // The Records Unit's own settings (Legal and Laboratory have theirs).
          ["/universe/erms/settings", "Settings"],
        ]
      : [
          !unitDashboardIsMain(`/universe/erms/${u}/dashboard`) && [`/universe/erms/${u}/dashboard`, "Dashboard"],
          // Unless it is the main Upload entry above, as Records' is.
          uploadUnit !== u && [`/universe/erms/${u}/documents?upload=1`, "Upload document"],
          // Named as Records names its own: every document, by its serial.
          [`/universe/erms/${u}/documents`, "Document Library"],
          // Portal requests for this unit's documents (the desk shows each unit its own).
          ["/universe/erms/portal-requests", "Portal Requests"],
          // Shared with the Records Unit's, so its path is not under the unit.
          ["/universe/erms/upload-tally/" + u, "Upload Tally"],
          // This unit's own settings, separate from the other units'.
          [`/universe/erms/${u}/settings`, "Settings"],
        ]
    ).filter(Boolean);
  const ermsUnitsShown = hasErms ? ["records", "legal", "laboratory"].filter((u) => ermsUnits.includes(u)) : [];
  const flatErms = ermsUnitsShown.length === 1 && !isDeveloper;
  const ermsSections = ermsUnitsShown.flatMap((u) => {
    const key = u === "records" ? "erms" : `erms-${u}`;
    if (unitClosed(u)) return [closedSection(key, UNIT_ICON[u], UNIT_NAME[u])];
    if (flatErms) {
      return unitPages(u).map(([to, label]) => ({
        key: to,
        icon: PAGE_ICON[label],
        label: (
          <div className="menu-label-wrapper main">
            <Link to={to}>{label}</Link>
          </div>
        ),
      }));
    }
    return [
      {
        key,
        icon: UNIT_ICON[u],
        label: <div className="menu-label-wrapper main">ERMS · {UNIT_NAME[u]}{availability.isDown(u) && maintenanceMark}</div>,
        children: unitPages(u).map(([to, label]) => ({
          key: to,
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to={to}>{label}</Link>
            </div>
          ),
        })),
      },
    ];
  });

  const menuItems = [
    mainDashboard && {
      key: mainDashboard,
      icon: <DashboardFilled />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to={mainDashboard}>Dashboard</Link>
        </div>
      ),
    },
    // A unit's main job, one click from anywhere: the desktop system's
    // upload, as its own entry rather than inside the unit's section — the
    // same for Records, Legal and Laboratory.
    uploadUnit && {
      key: uploadPath(uploadUnit),
      icon: <CloudUploadOutlined />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to={uploadPath(uploadUnit)}>{uploadUnit === "records" ? "Upload record" : "Upload document"}</Link>
        </div>
      ),
    },
    // The same register, named for the work the role does with it. Planning
    // staff are planning monitoring; a Records clerk is looking through the
    // universe of firms for the documents filed against one. One screen, one
    // set of data, one province scope — only the label differs, because
    // building two of these is what the unification was undoing.
    // Universe Central DB: one branch per year container, in order. The
    // active year is marked; a year that has not opened yet is listed but
    // locked, the same rule the year picker applies. Under each year: the
    // Monitoring Plan (the register, per province) and every other spreadsheet
    // in that year's data folder, as the server found it.
    hasUcds && {
      key: "ucds-db",
      icon: <DatabaseFilled />,
      label: <div className="menu-label-wrapper main">Universe Central DB</div>,
      children: [...yearContainers]
        .sort((a, b) => a.year - b.year)
        .map((y) => {
          const open = y.open !== false;
          const isActive = y.year === activeYear;
          const datasets = datasetRegistry[y.year] || [];
          const tables = datasets.filter((d) => d.kind !== "monitoring-plan");
          const addButton = (parent, title) =>
            canManageMenu ? (
              <span className="menu-item-actions" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                <Tooltip title={title}>
                  <button type="button" className="menu-item-action" aria-label={title} onClick={() => addItem(y.year, parent)}>+</button>
                </Tooltip>
              </span>
            ) : null;
          const children = open
            ? [
                {
                  key: `year-${y.year}-monitoring`,
                  // Its own background, so the register's folder stands out
                  // from the year's other entries (see sidemenu.css).
                  className: "monitoring-folder",
                  label: (
                    <div className="menu-label-wrapper submenu-item-label custom-item">
                      <span className="custom-item-name">Monitoring Plan</span>
                      {addButton("monitoring", "Add an item under Monitoring Plan")}
                    </div>
                  ),
                  children: [
                    ...visibleProvinces.map((province) => ({
                      key: isActive ? `/universe/province/${province}` : `y${y.year}/province/${province}`,
                      onClick: () => openInYear(y.year, `/universe/province/${province}`),
                      label: isActive ? (
                        <LabelWithAvatars
                          to={`/universe/province/${province}`}
                          label={province}
                          viewers={provinceViewers[province] || []}
                        />
                      ) : (
                        <div className="menu-label-wrapper submenu-item-label">{province}</div>
                      ),
                    })),
                    ...customEntries(y.year, "monitoring", isActive),
                  ],
                },
                ...customEntries(y.year, "root", isActive),
                ...tables.map((d) => ({
                  key: isActive ? `/universe/datasets/${d.key}` : `y${y.year}/datasets/${d.key}`,
                  onClick: () => openInYear(y.year, `/universe/datasets/${d.key}`),
                  label: (
                    <div className="menu-label-wrapper submenu-item-label" title={d.imported ? `${d.rowCount} rows` : "Not imported yet"}>
                      {d.label}
                    </div>
                  ),
                })),
              ]
            : [];
          return {
            key: `year-${y.year}`,
            disabled: !open,
            icon: open ? null : <LockOutlined />,
            label: (
              <div
                className={`menu-label-wrapper submenu-item-label year-label${isActive ? " is-active" : ""}`}
                title={open ? (isActive ? `${y.year} — active container` : undefined) : `Opens in January ${y.year}`}
              >
                {/* The active container carries a pulsing indicator before the
                    year, in the accent, rather than a tag fighting the caret. */}
                {isActive && <span className="year-active-dot" aria-label="active container" />}
                <span className="custom-item-name">{y.year}</span>
                {open && addButton("root", `Add an item to ${y.year}`)}
              </div>
            ),
            children,
          };
        }),
    },
    ...ermsSections,
    // The Action Center: messages between the people who work in ERMS.
    hasErms && {
      key: "/universe/erms/messages",
      icon: <MessageOutlined />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/erms/messages">
            Messages <Badge count={unreadMessages} size="small" offset={[4, -2]} />
          </Link>
        </div>
      ),
    },
    // Anyone with the ERMS domain but no unit yet (a Planning Admin who was
    // given ERMS) still reaches the library; documents are asked for in the
    // Document Portal.
    hasErms && !ermsUnits.length && {
      key: "erms",
      icon: <FileProtectOutlined />,
      label: <div className="menu-label-wrapper main">ERMS</div>,
      children: [
        { key: "/universe/erms/records", label: <div className="menu-label-wrapper submenu-item-label"><Link to="/universe/erms/records">Document Library</Link></div> },
      ],
    },
    storageContainers.length > 0 && {
      key: "/universe/storage",
      icon: <FolderOpenOutlined />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/storage">Storage</Link>
        </div>
      ),
    },
    // One administrative section. "Settings" and "Developer Settings" were two
    // menus over the same kind of work — every entry under both needed the
    // admin domain, so the split told the user nothing except that there were
    // two places to look. Related screens are now tabs rather than separate
    // entries.
    //
    // Planning and Records staff get their own settings later; personal
    // settings already live in the avatar menu, which is why nothing here is
    // offered to them.
    // Settings everyone has, whatever their role. Appearance is per-device and
    // affects nobody else, so it needs no entitlement — and it gives Records
    // and Planning staff a Settings section of their own, which they had none
    // of once the administrative one became developer and admin only.
    {
      key: "settings",
      icon: <SettingFilled />,
      label: <div className="menu-label-wrapper main">Settings</div>,
      children: [
        {
          key: "/universe/settings/general",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/settings/general">General</Link>
            </div>
          ),
        },
        hasUcds && {
          key: "/universe/settings/ucds",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/settings/ucds">Universe Central DB</Link>
            </div>
          ),
        },
        // An ERMS unit's settings are not here: each unit has its own, under
        // its own section above (ERMS · Records › Settings, and so on), so a
        // Legal officer never wades through the Records Unit's rules.
      ].filter(Boolean),
    },
    hasAdmin && canViewAdminPanel && {
      key: "admin",
      icon: <ToolOutlined />,
      label: <div className="menu-label-wrapper main">Admin Settings</div>,
      children: [
        {
          key: "/universe/admin/users",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/users">User Accounts</Link>
            </div>
          ),
        },
        // Who signed in and out, when and from where.
        {
          key: "/universe/admin/sign-in-history",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/sign-in-history">Sign-in History</Link>
            </div>
          ),
        },
        {
          key: "/universe/admin/org-units",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/org-units">Organizational Units</Link>
            </div>
          ),
        },
        // Monitoring Config, Register Activity and Duplicate Data were three
        // entries about one thing: the register behind Monitoring Plan.
        hasUcds && {
          key: "/universe/admin/register",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/register">Register</Link>
            </div>
          ),
        },
        {
          key: "/universe/admin/posting",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/posting">Post to Bulletin</Link>
            </div>
          ),
        },
        // Database status and audit configuration are both "how the system
        // behaves", so they are tabs of one System screen.
        {
          key: "/universe/admin/system",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/system">System</Link>
            </div>
          ),
        },
        // Everything ERMS is configured with: the units, their document
        // types and forms, the filing layout on the shares, the menus.
        {
          key: "/universe/admin/erms-config",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/erms-config">ERMS Config</Link>
            </div>
          ),
        },
        // VERA, the assistant: on/off, the model, limits, the sign-in page
        // surface, and its activity log.
        {
          key: "/universe/admin/vera",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/vera">VERA Assistant</Link>
            </div>
          ),
        },
        // The records share. Developer-only on top of the admin domain,
        // because an Admin is not a developer.
        isDeveloper && {
          key: "/universe/admin/developer/storage-config",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/developer/storage-config">
                Storage Configuration
              </Link>
            </div>
          ),
        },
      ].filter(Boolean),
    },
    // canViewAdminPanel && {
    //   key: "/universe/mbu",
    //   icon: <EnvironmentFilled />,
    //   label: (
    //     <div className="menu-label-wrapper main">
    //       <Link to="/universe/mbu">Manila Bay Pipeline</Link>
    //       {renderAvatars(mbuViewers)}
    //     </div>
    //   ),
    // },
  ].filter(Boolean);

  return (
    <>
    {/* Behind the open drawer on a phone: a tap outside closes it. */}
    {mobile && !collapsed && <div className="side-menu-backdrop" onClick={() => setCollapsed(true)} aria-hidden="true" />}
    <Sider
      collapsed={collapsed}
      onCollapse={setCollapsed}
      className={mobile ? "side-menu-drawer" : undefined}
      // Always dark. The sider is a fixed, accent-derived surface rather than
      // something that inverts with the reading theme — see ThemeProvider.
      theme="dark"
      width={mobile ? 264 : 220} // expanded
      collapsedWidth={mobile ? 0 : 68} // collapsed; on a phone, out of sight
      trigger={null}
    >
      <Logo theme={theme} collapsed={collapsed} />

      {!mobile && (
        // Styled like the theme toggle in the header: the header surface with
        // navigation-coloured type. It used to be a primary button filled with
        // the accent, which sat on an accent-derived sider and was almost
        // invisible — the control blended into the surface it sits on.
        <Button
          type="text"
          onClick={() => setCollapsed(!collapsed)}
          icon={collapsed ? <CaretRightOutlined /> : <CaretLeftOutlined />}
          size="small"
          style={{
            position: "absolute",
            top: 18,
            right: collapsed ? -10 : -14,
            zIndex: 101,
            borderRadius: "50%",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
            background: "var(--eu-header-bg, #1f242c)",
            color: "var(--eu-nav-text, #e8ecf2)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            width: 22,
            height: 22,
            minWidth: 22,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "right 0.2s cubic-bezier(.4,0,.2,1)",
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        />
      )}

      {/* No ConfigProvider of its own: the menu's dark-surface tokens are set
          once in ThemeProvider, and re-applying the algorithm here only
          re-derived the same palette a second time on every render. */}
      <Menu
        className={isDeveloper ? "side-menu-list side-menu-compact" : "side-menu-list"}
        theme="dark"
        mode="inline"
        inlineIndent={14}
        selectedKeys={[selectedKey]}
        // Collapsed, a section opens as a popup on hover — never the open
        // sections of the expanded menu, which would float over the page.
        openKeys={collapsed ? popupKeys : openKeys}
        onOpenChange={(keys) => {
          if (collapsed) {
            setPopupKeys(keys);
            return;
          }
          const latestOpenKey = keys.find((key) => !openKeys.includes(key));
          setOpenKeys(
            rootSubmenuKeys.includes(latestOpenKey) ? [latestOpenKey] : keys
          );
        }}
        inlineCollapsed={collapsed}
        items={menuItems}
        onClick={({ key }) => {
          if (key.startsWith("/universe/province/")) {
            const province = key.split("/").pop();
            handleProvinceSelect(province);
          }
        }}
      />
      <MenuItemModal
        open={Boolean(itemDialog)}
        year={itemDialog?.year}
        item={itemDialog?.item}
        parent={itemDialog?.parent}
        folders={(customItems[itemDialog?.year] || []).filter((i) => i.kind === "folder")}
        onClose={(saved) => {
          setItemDialog(null);
          if (saved) {
            refreshMenuItems();
            setOpenKeys((keys) => [...new Set([...keys, "ucds-db", `year-${saved.year}`, ...(saved.parent === "monitoring" ? [`year-${saved.year}-monitoring`] : [])])]);
          }
        }}
      />
    </Sider>
    </>
  );
};

export default SideMenu;
