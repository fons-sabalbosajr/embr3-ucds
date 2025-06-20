import React, { useState, useEffect, useContext, useRef } from "react";
import { ConfigProvider, Layout, Menu, Button, Avatar, Tooltip } from "antd";
import {
  DashboardFilled,
  CheckCircleFilled,
  PushpinFilled,
  SettingFilled,
  MedicineBoxFilled,
  ReconciliationFilled,
  EnvironmentFilled,
  DatabaseFilled,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
} from "@ant-design/icons";
import { BsClipboardDataFill } from "react-icons/bs"; // Example icon, choose one you like
import { Link, useNavigate, useLocation } from "react-router-dom";
import { DataContext } from "./../menu-province/DataContext";
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  emitJoinProvince,
  emitLeaveProvince,
  emitJoinSurvey,
  emitLeaveSurvey,
  emitJoinMbu,
  emitLeaveMbu,
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
  onProvinceViewersUpdate,
  onSurveyViewersUpdate,
  onMbuViewersUpdate,
  onPlanningUnitMonitoringViewersUpdate,
  onPlanningUnitSurveyActivitiesViewersUpdate,
  onPlanningUnitValidationsViewersUpdate,
  onPlanningUnitGeneratedReportsViewersUpdate,
  onEswmViewersUpdate,
  onHealthcareViewersUpdate,
  onChemicalsViewersUpdate,
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
  const [openKeys, setOpenKeys] = useState([]);
  const [provinceViewers, setProvinceViewers] = useState({});
  const [surveyViewers, setSurveyViewers] = useState([]);
  const [mbuViewers, setMbuViewers] = useState([]);
  const [eswmViewers, setEswmViewers] = useState([]);
  const [monitoringViewers, setMonitoringViewers] = useState([]); // New state for Planning Unit Monitoring
  const [surveyActivitiesViewers, setSurveyActivitiesViewers] = useState([]); // New state for Planning Unit Survey Activities
  const [validationsViewers, setValidationsViewers] = useState([]); // New state for Planning Unit Validations
  const [generatedReportsViewers, setGeneratedReportsViewers] = useState([]); // New state for Planning Unit Generated Reports
  const [healthcareViewers, setHealthcareViewers] = useState([]);
  const [chemicalsViewers, setChemicalsViewers] = useState([]);
  const [tsdViewers, setTsdViewers] = useState([]);
  const [trcViewers, setTrcViewers] = useState([]);
  const [currentProvince, setCurrentProvinceState] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentProvince } = useContext(DataContext);
  const prevLocationPathnameRef = useRef(location.pathname); // To track previous path

  // Style for the text part of menu items, allowing wrapping
  const textWithAvatarsStyle = {
    whiteSpace: "normal",
    wordBreak: "break-word",
    textAlign: "left",
    lineHeight: "1.4",
    marginRight: "8px", // Creates a gap before the avatars
  };

  const textOnlyMenuItemStyle = {
    whiteSpace: "normal",
    wordBreak: "break-word",
    textAlign: "left",
    lineHeight: "1.4",
    width: "100%", // Ensure it uses available space for wrapping
  };
  const permissions = currentUser?.permissions || [];
  const canViewDataHistory = permissions[3];
  const visibleProvinces = visibleProvincesList.filter(
    (_, i) => permissions[i + 5]
  );

  // Handle menu open state based on path
  useEffect(() => {
    const path = location.pathname;
    // Using startsWith for more precise path matching.
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
    } else if (path.startsWith("/universe/mbu")) {
      // Corrected from path.startsWith("/universe/eswm-database") for mbu
      setOpenKeys([]);
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
    } else {
      setOpenKeys([]); // Default: close all submenus if no specific match
    }
  }, [location.pathname]);

  // useEffect(() => {
  //   if (currentUser?.username === "asabalbosa") {
  //     setOpenKeys(rootSubmenuKeys);
  //   }
  // }, [currentUser]);

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
      if (location.pathname === "/universe/mbu") {
        emitJoinMbu(userPayload);
      }
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
  useEffect(() => {
    if (!currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    let didJoinMbuThisEffect = false;

    if (location.pathname === "/universe/mbu") {
      //console.log("[SideMenu] Path is /universe/mbu, attempting to joinMbu.");
      emitJoinMbu({
        // Corrected payload, removed path
        username: currentUser.username,
        avatar: currentUser.avatar || currentUser.avatarUrl,
        name: currentUser.name,
      });
      didJoinMbuThisEffect = true;
    }

    return () => {
      if (didJoinMbuThisEffect && currentUser?.username) {
        emitLeaveMbu();
      }
    };
  }, [currentUser, location.pathname]);

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

  // Avatar group rendering utility
  const renderAvatars = (viewers) =>
    canViewDataHistory && viewers.length > 0 ? ( // Re-added canViewDataHistory check
      <Avatar.Group
        max={{ count: 1 }}
        maxStyle={{
          color: "#f56a00",
          backgroundColor: "#fde3cf",
          fontSize: 11,
        }}
        size={18}
        style={{ marginLeft: 4 }}
      >
        {viewers.map((user) => (
          <Tooltip
            key={user.username}
            title={
              <span style={{ fontSize: "9px" }}>
                {`${user.username} is here`}
              </span>
            }
          >
            <Avatar src={user.avatar} style={{ verticalAlign: "middle" }}>
              {!user.avatar && user.username
                ? user.username[0].toUpperCase()
                : ""}
            </Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
    ) : null;

  const menuItems = [
    {
      key: "/universe/dashboard",
      icon: <DashboardFilled />,
      label: <Link to="/universe/dashboard">Dashboard</Link>,
    },
    {
      key: "r3-monitoring",
      icon: <CheckCircleFilled />,
      label: "Monitoring Plan",
      children: visibleProvinces.map((province) => {
        const viewers = provinceViewers[province] || [];
        return {
          key: `/universe/province/${province}`,
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>{province}</span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0, // Prevent avatars from shrinking
                }}
              >
                {renderAvatars(viewers)}
              </span>
            </span>
          ),
        };
      }),
    },
    {
      key: "healthcare",
      icon: <MedicineBoxFilled />,
      label: "Healthcare",
      children: [
        {
          key: "/universe/healthcare",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/healthcare">Healthcare Industries</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {renderAvatars(healthcareViewers)} {/* Added avatars */}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/chemicals",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/chemicals">Chemical Industries</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {renderAvatars(chemicalsViewers)} {/* Added avatars */}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/tsd",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/tsd">TSD Facilities</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {renderAvatars(tsdViewers)} {/* Added avatars */}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/trc",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/trc">TRC Permits</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {renderAvatars(trcViewers)} {/* Added avatars */}
              </span>
            </span>
          ),
        },
      ],
    },
    {
      key: "/universe/survey",
      icon: <ReconciliationFilled />,
      label: (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <span style={textWithAvatarsStyle}>
            <Link to="/universe/survey">Survey</Link>
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {renderAvatars(surveyViewers)}
          </span>
        </span>
      ),
    },
    permissions[2] &&{
      key: "/universe/mbu",
      icon: <EnvironmentFilled />,
      label: (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <span style={textWithAvatarsStyle}>
            <Link to="/universe/mbu">Manila Bay Pipeline</Link>
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {renderAvatars(mbuViewers)}
          </span>
        </span>
      ),
    },
    permissions[2] &&{
      key: "eswm-database", // Changed to be a submenu key
      icon: <DatabaseFilled />,
      label: (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          ESWM Database
        </span>
      ),
      children: [
        {
          key: "/universe/eswm-database/swm-plan",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/eswm-database/swm-plan">
                  10 Year SWM Plan
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {" "}
                {/* Only render avatars if this is the currently active ESWM sub-route */}
                {location.pathname === "/universe/eswm-database/swm-plan" &&
                  renderAvatars(eswmViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/eswm-database/mrf",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/eswm-database/mrf">
                  Material Recovery Facility (MRF)
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {" "}
                {/* Only render avatars if this is the currently active ESWM sub-route */}
                {location.pathname === "/universe/eswm-database/mrf" &&
                  renderAvatars(eswmViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/eswm-database/slf",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/eswm-database/slf">
                  Sanitary Landfill (SLF)
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {" "}
                {/* Only render avatars if this is the currently active ESWM sub-route */}
                {location.pathname === "/universe/eswm-database/slf" &&
                  renderAvatars(eswmViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/eswm-database/ods",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/eswm-database/ods">
                  Open Dump Sites (ODS)
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {" "}
                {/* Only render avatars if this is the currently active ESWM sub-route */}
                {location.pathname === "/universe/eswm-database/ods" &&
                  renderAvatars(eswmViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/eswm-database/equipments",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/eswm-database/equipments">Equipments</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {location.pathname === "/universe/eswm-database/equipments" &&
                  renderAvatars(eswmViewers)}
              </span>
            </span>
          ),
        },
      ],
    },
    permissions[2] && {
      key: "planning-unit", // New menu key
      icon: <BsClipboardDataFill />, // Example Icon
      label: "Planning Unit",
      children: [
        {
          key: "/universe/planning-unit/monitoring",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/planning-unit/monitoring">Monitoring</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {location.pathname === "/universe/planning-unit/monitoring" &&
                  renderAvatars(monitoringViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/planning-unit/survey-activities", // Made path more specific
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/planning-unit/survey-activities">
                  Survey Activities
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {location.pathname ===
                  "/universe/planning-unit/survey-activities" &&
                  renderAvatars(surveyActivitiesViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/planning-unit/validations",
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/planning-unit/validations">
                  Validations
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {location.pathname === "/universe/planning-unit/validations" &&
                  renderAvatars(validationsViewers)}
              </span>
            </span>
          ),
        },
        {
          key: "/universe/planning-unit/generated-reports", // Made path more specific
          label: (
            <span
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span style={textWithAvatarsStyle}>
                <Link to="/universe/planning-unit/generated-reports">
                  Generated Reports
                </Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {location.pathname ===
                  "/universe/planning-unit/generated-reports" &&
                  renderAvatars(generatedReportsViewers)}
              </span>
            </span>
          ),
        },
      ],
    },
    {
      key: "reports",
      icon: <PushpinFilled />,
      label: "Reports",
      children: [
        {
          key: "/universe/extract",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/extract">Extract Data</Link>
            </span>
          ),
        },
        {
          key: "/universe/deleted_firms",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/deleted_firms">Deleted Industries</Link>
            </span>
          ),
        },
      ],
    },
    permissions[2] && {
      key: "admin",
      icon: <SettingFilled />,
      label: "Admin",
      children: [
        {
          key: "/universe/accounts",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/accounts">User Accounts</Link>
            </span>
          ),
        },
        {
          key: "/universe/posting",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/posting">Post to Bulletin</Link>
            </span>
          ),
        },

        {
          key: "/universe/records/config",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/records/config">Monitoring Config</Link>
            </span>
          ),
        },
        {
          key: "/universe/records/activity",
          label: (
            <span style={textOnlyMenuItemStyle}>
              <Link to="/universe/records/activity">Records Activity</Link>
            </span>
          ),
        },
      ],
    },
  ].filter(Boolean);

  return (
    <Sider
      collapsed={collapsed}
      onCollapse={setCollapsed}
      theme={theme}
      width={collapsed ? 80 : 220}
      trigger={null}
    >
      <div className="sider-header">
        <Logo theme={theme} collapsed={collapsed} />
      </div>
      <Button
        type="primary"
        onClick={() => setCollapsed(!collapsed)}
        className="collapse-toggle-button"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        size="small"
      />
      <ConfigProvider>
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
          className="menu-container"
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
