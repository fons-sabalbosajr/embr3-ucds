import React, { useState, useEffect, useContext, useRef } from "react";
import {
  ConfigProvider,
  Layout,
  Menu,
  Button,
  Avatar,
  Tooltip,
  theme as antdTheme,
} from "antd";
import {
  DashboardFilled,
  CheckCircleFilled,
  SettingFilled,
  MedicineBoxFilled,
  ReconciliationFilled,
  CaretLeftOutlined,
  CaretRightOutlined,
  FileProtectOutlined,
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
  emitJoinSurvey,
  emitLeaveSurvey, // Corrected typo here
  emitJoinHealthcare,
  emitLeaveHealthcare,
  emitJoinChemicals,
  emitLeaveChemicals,
  emitJoinTsd,
  emitLeaveTsd,
  emitJoinTrc,
  emitLeaveTrc,
  onProvinceViewersUpdate, // Corrected typo here
  onSurveyViewersUpdate, // Corrected typo here
  onMbuViewersUpdate, // Corrected typo here
  onHealthcareViewersUpdate, // Corrected typo here
  onChemicalsViewersUpdate, // Corrected typo here
  onTsdViewersUpdate,
  onTrcViewersUpdate,
  onSocketConnect,
  // onSocketDisconnect, // If needed
} from "../api/socketService"; // Import socket service
import Logo from "./Logo";
import "./sidemenu.css";

const { Sider } = Layout;

const rootSubmenuKeys = [
  "r3-monitoring",
  "healthcare",
  "admin",
  "developer-settings",
  "erms",
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
  const [siderWidth, setSiderWidth] = useState(220);
  const [openKeys, setOpenKeys] = useState([]);
  const [provinceViewers, setProvinceViewers] = useState({});
  const [surveyViewers, setSurveyViewers] = useState([]);
  const [mbuViewers, setMbuViewers] = useState([]);
  const [healthcareViewers, setHealthcareViewers] = useState([]);
  const [chemicalsViewers, setChemicalsViewers] = useState([]);
  const [tsdViewers, setTsdViewers] = useState([]);
  const [trcViewers, setTrcViewers] = useState([]);
  const [currentProvince, setCurrentProvinceState] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentProvince } = useContext(DataContext);
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
  const hasUcds = domains.includes("ucds");
  const hasErms = domains.includes("erms");
  const hasAdmin = domains.includes("admin");
  // The records share configuration is developer-only. It is a role question,
  // not a domain one — the share is infrastructure, not a business module.
  const isDeveloper =
    (currentUser?.permission ?? currentUser?.role) === "developer";
  const visibleProvinces = PROVINCE_MENU.filter((p) =>
    grantedProvinces.includes(p.key)
  ).map((p) => p.value);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/universe/dashboard")) {
      setOpenKeys([]);
    } else if (path.startsWith("/universe/province/")) {
      setOpenKeys(["r3-monitoring"]);
    } else if (
      path.startsWith("/universe/healthcare") ||
      path.startsWith("/universe/chemicals") ||
      path.startsWith("/universe/tsd") ||
      path.startsWith("/universe/trc")
    ) {
      setOpenKeys(["healthcare"]);
    } else if (path.startsWith("/universe/survey")) {
      setOpenKeys([]);
      // } else if (path.startsWith("/universe/mbu")) {
      //   setOpenKeys([]);
    } else if (
      path.startsWith("/universe/admin/users") ||
      path.startsWith("/universe/admin/posting") ||
      path.startsWith("/universe/admin/audit") ||
      path.startsWith("/universe/admin/org-units") ||
      path.startsWith("/universe/register/config") ||
      path.startsWith("/universe/register/activity")
    ) {
      setOpenKeys(["admin"]);
    } else if (path.startsWith("/universe/admin/developer/")) {
      setOpenKeys(["developer-settings"]);
    } else if (path.startsWith("/universe/erms/")) {
      setOpenKeys(["erms"]);
    } else {
      setOpenKeys([]); // Default: close all submenus if no specific match
    }
  }, [location.pathname]);

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
      onSurveyViewersUpdate(setSurveyViewers),
      onMbuViewersUpdate(setMbuViewers),
      onHealthcareViewersUpdate(setHealthcareViewers),
      onChemicalsViewersUpdate(setChemicalsViewers),
      onTsdViewersUpdate(setTsdViewers),
      onTrcViewersUpdate(setTrcViewers),
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
      if (location.pathname === "/universe/survey") {
        emitJoinSurvey(userPayload);
      }
      // if (location.pathname === "/universe/mbu") {
      //   emitJoinMbu(userPayload);
      // }
      if (location.pathname === "/universe/chemicals") {
        emitJoinChemicals(userPayload);
      }
      if (location.pathname === "/universe/tsd") {
        emitJoinTsd(userPayload);
      }
      if (location.pathname === "/universe/trc") {
        emitJoinTrc(userPayload);
      } // Healthcare join/leave logic - moved to its own effect below
      if (location.pathname === "/universe/healthcare") {
        emitJoinHealthcare(userPayload);
      }
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

  // Healthcare join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      return;
    }

    let didJoinHealthcareThisEffect = false;

    if (location.pathname === "/universe/healthcare") {
      // console.log("[SideMenu] Path is /universe/healthcare, attempting to joinHealthcare.");
      emitJoinHealthcare({
        // Corrected payload
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
      didJoinHealthcareThisEffect = true;
    }

    return () => {
      if (didJoinHealthcareThisEffect && currentUser?.username) {
        emitLeaveHealthcare();
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // Chemicals join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    let didJoinChemicalsThisEffect = false;

    if (location.pathname === "/universe/chemicals") {
      emitJoinChemicals({
        // Corrected payload
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
      didJoinChemicalsThisEffect = true;
    }

    return () => {
      if (didJoinChemicalsThisEffect && currentUser?.username) {
        emitLeaveChemicals();
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // TSD join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      // Corrected: Removed socketRef
      // Removed canViewDataHistory check
      return;
    }

    let didJoinTsdThisEffect = false;
    if (location.pathname === "/universe/tsd") {
      // console.log("[SideMenu] Path is /universe/tsd, attempting to joinTsd.");
      emitJoinTsd({
        // Corrected: Use emitJoinTsd and direct payload
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
      didJoinTsdThisEffect = true;
    }

    return () => {
      if (didJoinTsdThisEffect && currentUser?.username) {
        emitLeaveTsd();
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // TRC join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    let didJoinTrcThisEffect = false;

    if (location.pathname === "/universe/trc") {
      emitJoinTrc({
        // Corrected payload
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
      didJoinTrcThisEffect = true;
    }
    return () => {
      if (didJoinTrcThisEffect && currentUser?.username) {
        emitLeaveTrc();
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

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
    {
      key: "/universe/dashboard",
      icon: <DashboardFilled />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/dashboard">Dashboard</Link>
        </div>
      ),
    },
    hasUcds && {
      key: "r3-monitoring",
      icon: <CheckCircleFilled />,
      label: <div className="menu-label-wrapper main">Monitoring Plan</div>,
      children: visibleProvinces.map((province) => ({
        key: `/universe/province/${province}`,
        label: (
          <LabelWithAvatars
            to={`/universe/province/${province}`}
            label={province}
            viewers={provinceViewers[province] || []}
          />
        ),
      })),
    },
    hasUcds && {
      key: "healthcare",
      icon: <MedicineBoxFilled />,
      label: <div className="menu-label-wrapper main">Healthcare</div>,
      children: [
        {
          key: "/universe/healthcare",
          label: (
            <LabelWithAvatars
              to="/universe/healthcare"
              label="Healthcare Industries"
              viewers={healthcareViewers}
            />
          ),
        },
        {
          key: "/universe/chemicals",
          label: (
            <LabelWithAvatars
              to="/universe/chemicals"
              label="Chemical Industries"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/tsd",
          label: (
            <LabelWithAvatars
              to="/universe/tsd"
              label="TSD Facilities"
              viewers={tsdViewers}
            />
          ),
        },
        {
          key: "/universe/trc",
          label: (
            <LabelWithAvatars
              to="/universe/trc"
              label="TRC Permits"
              viewers={trcViewers}
            />
          ),
        },
      ],
    },
    hasUcds && {
      key: "/universe/survey",
      icon: <ReconciliationFilled />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/survey">Survey</Link>
          {renderAvatars(surveyViewers)}
        </div>
      ),
    },
    hasAdmin && canViewAdminPanel && {
      key: "admin",
      icon: <SettingFilled />,
      label: <div className="menu-label-wrapper main">Admin</div>,
      children: [
        {
          key: "/universe/admin/users",
          label: (
            <LabelWithAvatars
              to="/universe/admin/users"
              label="User Accounts"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/admin/posting",
          label: (
            <LabelWithAvatars
              to="/universe/admin/posting"
              label="Post to Bulletin"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/register/config",
          label: (
            <LabelWithAvatars
              to="/universe/register/config"
              label="Monitoring Config"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/register/activity",
          label: (
            <LabelWithAvatars
              to="/universe/register/activity"
              label="Register Activity"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/admin/org-units",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/org-units">Organisational Units</Link>
            </div>
          ),
        },
      ],
    },
    hasAdmin && canViewAdminPanel && {
      key: "developer-settings",
      icon: <ToolOutlined />,
      label: <div className="menu-label-wrapper main">Developer Settings</div>,
      children: [
        {
          key: "/universe/admin/developer/field-management",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/developer/field-management">Field Management</Link>
            </div>
          ),
        },
        {
          key: "/universe/admin/developer/database-settings",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/developer/database-settings">Database Settings</Link>
            </div>
          ),
        },
        {
          key: "/universe/admin/developer/pdf-forms",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/developer/pdf-forms">PDF Forms</Link>
            </div>
          ),
        },
        {
          key: "/universe/admin/developer/activity-history",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/admin/developer/activity-history">Activity History Configuration</Link>
            </div>
          ),
        },
        // The records share. It sat in its own top-level "NAS Storage" section
        // with four entries, three of which were a dashboard, a browser and a
        // settings page that all showed the same configuration. It is one
        // developer setting, so it is one entry here.
        //
        // Guarded twice on purpose: the section already requires the admin
        // domain, and this entry additionally requires the developer role,
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
    // Records module. Visible to anyone holding the ERMS domain, independent
    // of the UCDS capability flags — a Records clerk has no reason to hold
    // canViewAdminPanel.
    hasErms && {
      key: "erms",
      icon: <FileProtectOutlined />,
      // "Records", not "Records (ERMS)". ERMS is the system this replaced, not
      // a section of E-Universe — naming it in the sidebar tells a clerk they
      // are in a second application bolted onto the first. The route keys and
      // API namespace stay `erms`, which nobody outside the code sees.
      label: <div className="menu-label-wrapper main">Records</div>,
      // Only the screens that exist are listed. Documents, tracking, archiving
      // and reports arrive later; linking to them now would just lead to a
      // "not built yet" page.
      children: [
        {
          key: "/universe/erms/dashboard",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/dashboard">Dashboard</Link>
            </div>
          ),
        },
        {
          key: "/universe/erms/records",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/records">Records</Link>
            </div>
          ),
        },
        {
          key: "/universe/erms/archive",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/archive">Archive</Link>
            </div>
          ),
        },
        {
          key: "/universe/erms/reports",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/reports">Reports</Link>
            </div>
          ),
        },
      ],
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
      theme={theme}
      width={210} // expanded
      collapsedWidth={68} // collapsed
      trigger={null}
    >
      <Logo theme={theme} collapsed={collapsed} />

      {window.innerWidth >= 600 && (
        <Button
          type="primary"
          onClick={() => setCollapsed(!collapsed)}
          icon={collapsed ? <CaretRightOutlined /> : <CaretLeftOutlined />}
          size="small"
          style={{
            position: "absolute",
            top: 18,
            right: collapsed ? -10 : -14,
            zIndex: 101,
            borderRadius: "50%",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            background: "var(--highlight-color)",
            border: "none",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "right 0.2s cubic-bezier(.4,0,.2,1)",
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        />
      )}

      <ConfigProvider
        theme={{
          algorithm:
            theme === "dark"
              ? antdTheme.darkAlgorithm
              : antdTheme.defaultAlgorithm,
        }}
      >
        <Menu
          theme={theme}
          mode="inline"
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
      </ConfigProvider>
    </Sider>
  );
};

export default SideMenu;
