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
  PushpinFilled,
  SettingFilled,
  MedicineBoxFilled,
  ReconciliationFilled,
  DatabaseFilled,
  ContainerFilled,
  CaretLeftOutlined,
  CaretRightOutlined,
  FileProtectOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { BsClipboardDataFill } from "react-icons/bs"; // Example icon, choose one you like
import { Link, useNavigate, useLocation } from "react-router-dom";
import { DataContext } from "./../menu-province/DataContext";
import {
  initializeSocket,
  emitJoinProvince,
  emitLeaveProvince,
  emitJoinSurvey,
  emitLeaveSurvey, // Corrected typo here
  emitJoinEswm,
  emitJoinPlanningUnitMonitoring,
  emitLeavePlanningUnitMonitoring,
  emitJoinPlanningUnitSurveyActivities,
  emitLeavePlanningUnitSurveyActivities,
  emitJoinPlanningUnitValidations,
  emitLeavePlanningUnitValidations,
  emitJoinPlanningUnitGeneratedReports,
  emitLeavePlanningUnitGeneratedReports,
  emitLeaveEswm,
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
  onPlanningUnitMonitoringViewersUpdate, // Corrected typo here
  onPlanningUnitSurveyActivitiesViewersUpdate, // Corrected typo here
  onPlanningUnitValidationsViewersUpdate, // Corrected typo here
  onPlanningUnitGeneratedReportsViewersUpdate, // Corrected typo here
  onEswmViewersUpdate, // Corrected typo here
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
  "planning-unit",
  "reports",
  "admin",
  "developer-settings",
  "legal",
  "electronic-records-management", // Added for the new ERMS submenu
  "eswm-database", // Added for the new submenu
];

const visibleProvincesList = [
  "Aurora",
  "Bataan",
  "Bulacan",
  "Nueva_Ecija",
  "Pampanga",
  "Tarlac",
  "Zambales",
];

const SideMenu = ({ theme, currentUser }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [siderWidth, setSiderWidth] = useState(220);
  const [openKeys, setOpenKeys] = useState([]);
  const [provinceViewers, setProvinceViewers] = useState({});
  const [surveyViewers, setSurveyViewers] = useState([]);
  const [mbuViewers, setMbuViewers] = useState([]);
  const [eswmViewers, setEswmViewers] = useState([]);
  const [monitoringViewers, setMonitoringViewers] = useState([]);
  const [surveyActivitiesViewers, setSurveyActivitiesViewers] = useState([]);
  const [validationsViewers, setValidationsViewers] = useState([]);
  const [generatedReportsViewers, setGeneratedReportsViewers] = useState([]);
  const [healthcareViewers, setHealthcareViewers] = useState([]);
  const [chemicalsViewers, setChemicalsViewers] = useState([]);
  const [tsdViewers, setTsdViewers] = useState([]);
  const [trcViewers, setTrcViewers] = useState([]);
  const [currentProvince, setCurrentProvinceState] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentProvince } = useContext(DataContext);
  const prevLocationPathnameRef = useRef(location.pathname); // To track previous path
  const permissions = currentUser?.permissions || [];
  const canViewDataHistory = permissions[3];
  const visibleProvinces = visibleProvincesList.filter(
    (_, i) => permissions[i + 5]
  );

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
    } else if (path.startsWith("/universe/eswm-database")) {
      setOpenKeys(["eswm-database"]); // Keep the 'eswm-database' submenu open
    } else if (path.startsWith("/universe/planning-unit/")) {
      setOpenKeys(["planning-unit"]);
    } else if (
      path.startsWith("/universe/extract") ||
      path.startsWith("/universe/deleted_firms")
    ) {
      setOpenKeys(["reports"]);
    } else if (
      path.startsWith("/universe/accounts") ||
      path.startsWith("/universe/posting") ||
      path.startsWith("/universe/activitylog") ||
      path.startsWith("/universe/records/config") || // Added this line
      path.startsWith("/universe/records/activity") // Added this line
    ) {
      setOpenKeys(["admin"]);
    } else if (path.startsWith("/universe/developer/")) {
      setOpenKeys(["developer-settings"]);
    } else if (path.startsWith("/universe/erms/")) {
      setOpenKeys(["electronic-records-management"]); // Keep the ERMS submenu open
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
      onEswmViewersUpdate(setEswmViewers),
      onPlanningUnitMonitoringViewersUpdate(setMonitoringViewers), // New listener
      onPlanningUnitSurveyActivitiesViewersUpdate(setSurveyActivitiesViewers), // New listener
      onPlanningUnitValidationsViewersUpdate(setValidationsViewers), // New listener
      onPlanningUnitGeneratedReportsViewersUpdate(setGeneratedReportsViewers), // New listener
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
      if (location.pathname === "/universe/planning-unit/monitoring") {
        emitJoinPlanningUnitMonitoring(userPayload);
      }
      if (location.pathname === "/universe/planning-unit/survey-activities") {
        emitJoinPlanningUnitSurveyActivities(userPayload);
      }
      if (location.pathname === "/universe/planning-unit/validations") {
        emitJoinPlanningUnitValidations(userPayload);
      }
      if (location.pathname === "/universe/planning-unit/generated-reports") {
        emitJoinPlanningUnitGeneratedReports(userPayload);
      }
      if (location.pathname.startsWith("/universe/eswm-database")) {
        emitJoinEswm(userPayload);
      }

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

  // ESWM join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    let didJoinEswmThisEffect = false;
    const eswmPath = location.pathname;

    if (eswmPath.startsWith("/universe/eswm-database")) {
      // Updated to cover sub-routes
      // Updated to cover sub-routes
      emitJoinEswm(
        {
          // Corrected payload
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
        eswmPath
      );
      didJoinEswmThisEffect = true;
    }
    return () => {
      if (didJoinEswmThisEffect && currentUser?.username) {
        emitLeaveEswm(eswmPath);
      }
    };
  }, [currentUser, location.pathname]);

  // Planning Unit join/leave logic
  useEffect(() => {
    if (!currentUser?.username) {
      return;
    }

    const path = location.pathname;
    const userPayload = {
      // Define userPayload once
      username: currentUser.username,
      avatar: currentUser.avatar || currentUser.avatarUrl,
      name: currentUser.name,
    };
    let didJoinMonitoring = false;
    let didJoinSurveyActivities = false;
    let didJoinValidations = false;
    let didJoinGeneratedReports = false;
    // No specific route for Generated Reports yet, assuming it might be static or covered by another room

    if (path === "/universe/planning-unit/monitoring") {
      emitJoinPlanningUnitMonitoring(userPayload);
      didJoinMonitoring = true;
    } else if (path === "/universe/planning-unit/survey-activities") {
      emitJoinPlanningUnitSurveyActivities(userPayload);
      didJoinSurveyActivities = true;
    } else if (path === "/universe/planning-unit/validations") {
      emitJoinPlanningUnitValidations(userPayload);
      didJoinValidations = true;
    } else if (path === "/universe/planning-unit/generated-reports") {
      emitJoinPlanningUnitGeneratedReports(userPayload);
      didJoinGeneratedReports = true;
    }

    return () => {
      if (didJoinMonitoring && currentUser?.username)
        emitLeavePlanningUnitMonitoring();
      if (didJoinSurveyActivities && currentUser?.username)
        emitLeavePlanningUnitSurveyActivities();
      if (didJoinValidations && currentUser?.username)
        emitLeavePlanningUnitValidations();
      if (didJoinGeneratedReports && currentUser?.username)
        emitLeavePlanningUnitGeneratedReports();
    };
  }, [currentUser, location.pathname]);

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
    {
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
    {
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
    {
      key: "/universe/survey",
      icon: <ReconciliationFilled />,
      label: (
        <div className="menu-label-wrapper main">
          <Link to="/universe/survey">Survey</Link>
          {renderAvatars(surveyViewers)}
        </div>
      ),
    },
    permissions[2] && {
      key: "eswm-database",
      icon: <DatabaseFilled />,
      label: <div className="menu-label-wrapper main">ESWM Database</div>,
      children: [
        {
          key: "/universe/eswm-database/swm-plan",
          label: (
            <LabelWithAvatars
              to="/universe/eswm-database/swm-plan"
              label="10 Year SWM Plan"
              viewers={
                location.pathname === "/universe/eswm-database/swm-plan"
                  ? eswmViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/eswm-database/mrf",
          label: (
            <LabelWithAvatars
              to="/universe/eswm-database/mrf"
              label="Material Recovery Facility (MRF)"
              viewers={
                location.pathname === "/universe/eswm-database/mrf"
                  ? eswmViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/eswm-database/slf",
          label: (
            <LabelWithAvatars
              to="/universe/eswm-database/slf"
              label="Sanitary Landfill (SLF)"
              viewers={
                location.pathname === "/universe/eswm-database/slf"
                  ? eswmViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/eswm-database/ods",
          label: (
            <LabelWithAvatars
              to="/universe/eswm-database/ods"
              label="Open Dump Sites (ODS)"
              viewers={
                location.pathname === "/universe/eswm-database/ods"
                  ? eswmViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/eswm-database/equipments",
          label: (
            <LabelWithAvatars
              to="/universe/eswm-database/equipments"
              label="Equipments"
              viewers={
                location.pathname === "/universe/eswm-database/equipments"
                  ? eswmViewers
                  : []
              }
            />
          ),
        },
      ],
    },
    permissions[2] && {
      key: "legal",
      icon: <FileProtectOutlined />,
      label: <div className="menu-label-wrapper main">Legal Services Unit</div>,
      children: [
        {
          key: "/universe/legal/dashboard",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/legal/dashboard">Legal Dashboard</Link>
            </div>
          ),
        },
        {
          key: "/universe/legal/docket",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/legal/docket">Legal Docket</Link>
            </div>
          ),
        },
        {
          key: "/universe/legal/envi-laws",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/legal/envi-laws">Environmental Laws</Link>
            </div>
          ),
        },
      ],
    },
    permissions[2] && {
      key: "planning-unit",
      icon: <BsClipboardDataFill />,
      label: <div className="menu-label-wrapper main">Planning Unit</div>,
      children: [
        {
          key: "/universe/planning-unit/monitoring",
          label: (
            <LabelWithAvatars
              to="/universe/planning-unit/monitoring"
              label="Monitoring"
              viewers={
                location.pathname === "/universe/planning-unit/monitoring"
                  ? monitoringViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/planning-unit/survey-activities",
          label: (
            <LabelWithAvatars
              to="/universe/planning-unit/survey-activities"
              label="Survey Activities"
              viewers={
                location.pathname ===
                "/universe/planning-unit/survey-activities"
                  ? surveyActivitiesViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/planning-unit/validations",
          label: (
            <LabelWithAvatars
              to="/universe/planning-unit/validations"
              label="Validations"
              viewers={
                location.pathname === "/universe/planning-unit/validations"
                  ? validationsViewers
                  : []
              }
            />
          ),
        },
        {
          key: "/universe/planning-unit/generated-reports",
          label: (
            <LabelWithAvatars
              to="/universe/planning-unit/generated-reports"
              label="Generated Reports"
              viewers={
                location.pathname ===
                "/universe/planning-unit/generated-reports"
                  ? generatedReportsViewers
                  : []
              }
            />
          ),
        },
      ],
    },
    {
      key: "reports",
      icon: <PushpinFilled />,
      label: <div className="menu-label-wrapper main">Reports</div>,
      children: [
        {
          key: "/universe/extract",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/extract">Extract Data</Link>
            </div>
          ),
        },
        {
          key: "/universe/deleted_firms",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/deleted_firms">Deleted Industries</Link>
            </div>
          ),
        },
      ],
    },
    permissions[2] && {
      key: "admin",
      icon: <SettingFilled />,
      label: <div className="menu-label-wrapper main">Admin</div>,
      children: [
        {
          key: "/universe/accounts",
          label: (
            <LabelWithAvatars
              to="/universe/accounts"
              label="User Accounts"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/posting",
          label: (
            <LabelWithAvatars
              to="/universe/posting"
              label="Post to Bulletin"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/records/config",
          label: (
            <LabelWithAvatars
              to="/universe/records/config"
              label="Monitoring Config"
              viewers={chemicalsViewers}
            />
          ),
        },
        {
          key: "/universe/records/activity",
          label: (
            <LabelWithAvatars
              to="/universe/records/activity"
              label="Records Activity"
              viewers={chemicalsViewers}
            />
          ),
        },
      ],
    },
    permissions[2] && {
      key: "developer-settings",
      icon: <ToolOutlined />,
      label: <div className="menu-label-wrapper main">Developer Settings</div>,
      children: [
        {
          key: "/universe/developer/field-management",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/developer/field-management">Field Management</Link>
            </div>
          ),
        },
        {
          key: "/universe/developer/database-settings",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/developer/database-settings">Database Settings</Link>
            </div>
          ),
        },
        {
          key: "/universe/developer/pdf-forms",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/developer/pdf-forms">PDF Forms</Link>
            </div>
          ),
        },
        {
          key: "/universe/developer/activity-history",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/developer/activity-history">Activity History Configuration</Link>
            </div>
          ),
        },
      ],
    },
    permissions[2] && {
      key: "electronic-records-management",
      icon: <ContainerFilled />,
      label: (
        <div className="menu-label-wrapper main erms">
          Electronic Records <br /> Management System
        </div>
      ),
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
          key: "/universe/erms/universe",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/universe">Universe</Link>
            </div>
          ),
        },
        {
          key: "/universe/erms/storage-config",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/storage-config">
                Storage Configuration
              </Link>
            </div>
          ),
        },
        {
          key: "/universe/erms/settings",
          label: (
            <div className="menu-label-wrapper submenu-item-label">
              <Link to="/universe/erms/settings">Settings</Link>
            </div>
          ),
        },
      ],
    },

    // permissions[2] && {
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
