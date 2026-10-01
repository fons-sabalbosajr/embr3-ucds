import React, { useState, useEffect, useContext, useRef } from "react";
import { Layout, Menu, Button, Avatar, Tooltip } from "antd";
import {
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

const SideMenu = ({ theme, currentUser }) => {
  const [collapsed, setCollapsed] = useState(false);
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

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/universe/dashboard") || (mainDashboard && path === mainDashboard)) {
      setOpenKeys([]);
    } else if (path.startsWith("/universe/province/") || path.startsWith("/universe/datasets/")) {
      setOpenKeys(["ucds-db", `year-${activeYear}`]);
      // } else if (path.startsWith("/universe/mbu")) {
      //   setOpenKeys([]);
    } else if (path.startsWith("/universe/erms/legal")) {
      setOpenKeys(["erms-legal"]);
    } else if (path.startsWith("/universe/erms/laboratory")) {
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
    // The Records Unit's main job, one click from anywhere: the desktop
    // system's upload, as its own entry rather than inside the ERMS section.
    hasErms && ermsUnits.includes("records") && {
      key: "/universe/erms/records?new=1",
      icon: <CloudUploadOutlined />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/erms/records?new=1">Upload record</Link>
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
    // ERMS, one section per unit the person may see: their own for an ERMS
    // User, all three for the Developer. The route keys and API namespace
    // stay "erms", which nobody outside the code sees.
    hasErms && ermsUnits.includes("records") && {
      key: "erms",
      icon: <FileProtectOutlined />,
      label: <div className="menu-label-wrapper main">ERMS · Records</div>,
      children: [
        // The unit's dashboard, unless it is already the main Dashboard above.
        // (Upload record is a main entry of its own, above.)
        !unitDashboardIsMain("/universe/erms/dashboard") && ["dashboard", "Dashboard"],
        // The library is the register: every document, by its FSN.
        ["records", "Document Library"],
        // The Records Unit's inbox; for everyone else, their own requests.
        ["access-requests", "Document Requests"],
        ["archive", "Archive Boxes"],
      ].filter(Boolean).map(([path, label]) => ({
        key: `/universe/erms/${path}`,
        label: (
          <div className="menu-label-wrapper submenu-item-label">
            <Link to={`/universe/erms/${path}`}>{label}</Link>
          </div>
        ),
      })),
    },
    ...["legal", "laboratory"]
      .filter((u) => hasErms && ermsUnits.includes(u))
      .map((u) => ({
        key: `erms-${u}`,
        icon: u === "legal" ? <AuditOutlined /> : <ExperimentOutlined />,
        label: <div className="menu-label-wrapper main">ERMS · {u === "legal" ? "Legal" : "Laboratory"}</div>,
        children: [
          !unitDashboardIsMain(`/universe/erms/${u}/dashboard`) && ["dashboard", "Dashboard"],
          ["documents?upload=1", "File a document"],
          ["documents", "Documents"],
        ].filter(Boolean).map(([path, label]) => ({
          key: `/universe/erms/${u}/${path}`,
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to={`/universe/erms/${u}/${path}`}>{label}</Link>
            </div>
          ),
        })),
      })),
    // Anyone with the ERMS domain but no unit yet (a Planning Admin who was
    // given ERMS) still reaches their document requests.
    hasErms && !ermsUnits.length && {
      key: "erms",
      icon: <FileProtectOutlined />,
      label: <div className="menu-label-wrapper main">ERMS</div>,
      children: [
        { key: "/universe/erms/records", label: <div className="menu-label-wrapper submenu-item-label"><Link to="/universe/erms/records">Document Library</Link></div> },
        { key: "/universe/erms/access-requests", label: <div className="menu-label-wrapper submenu-item-label"><Link to="/universe/erms/access-requests">Document Requests</Link></div> },
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
        // The unit's own rules, one entry each — data quality, duplicates,
        // privacy, PDF viewing, auditing, log history. Read by the unit, set
        // by its staff. (Legal and Laboratory get the same entries.)
        ...(hasErms && ermsUnits.length > 0
          ? [
              ["data", "Data Quality"],
              ["duplicates", "Duplicates"],
              ["privacy", "Data Privacy"],
              ["pdf", "PDF Viewing"],
              ["audit", "Tracing & Auditing"],
              ["log", "Log History"],
            ].map(([section, label]) => ({
              key: `/universe/settings/erms/${section}`,
              label: (
                <div className="menu-label-wrapper submenu-item-label">
                  <Link to={`/universe/settings/erms/${section}`}>{label}</Link>
                </div>
              ),
            }))
          : []),
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
    <Sider
      collapsed={collapsed}
      onCollapse={setCollapsed}
      // Always dark. The sider is a fixed, accent-derived surface rather than
      // something that inverts with the reading theme — see ThemeProvider.
      theme="dark"
      width={220} // expanded
      collapsedWidth={68} // collapsed
      trigger={null}
    >
      <Logo theme={theme} collapsed={collapsed} />

      {window.innerWidth >= 600 && (
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
        className="side-menu-list"
        theme="dark"
        mode="inline"
        inlineIndent={14}
        selectedKeys={[location.pathname]}
        openKeys={openKeys}
        onOpenChange={(keys) => {
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
  );
};

export default SideMenu;
