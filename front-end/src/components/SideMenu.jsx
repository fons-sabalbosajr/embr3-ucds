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
import { io } from "socket.io-client";
import Logo from "./Logo";
import "./sidemenu.css";

const { Sider } = Layout;

const rootSubmenuKeys = [
  "r3-monitoring",
  "healthcare",
  "planning-unit",
  "reports",
  "admin",
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
  const [healthcareViewers, setHealthcareViewers] = useState([]);
  const [chemicalsViewers, setChemicalsViewers] = useState([]);
  const [tsdViewers, setTsdViewers] = useState([]);
  const [trcViewers, setTrcViewers] = useState([]);
  const [currentProvince, setCurrentProvinceState] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentProvince } = useContext(DataContext);
  const prevLocationPathnameRef = useRef(location.pathname); // To track previous path
  const socketRef = useRef(null);

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
      setOpenKeys([]);
    } else if (path.startsWith("/universe/eswm-database")) {
      setOpenKeys([]);
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

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io("http://localhost:8081", {
        withCredentials: true,
      });
    }
    // This effect is primarily for establishing the socket connection
    // and cleaning it up if the component were to unmount or socket needs to be reset.
    // Actual event listeners will be managed by other effects.
    const socket = socketRef.current; // Keep a reference for cleanup
    return () => {
      if (socket && socket.connected) {
        // socket.disconnect(); // Optional: disconnect if SideMenu itself unmounts
        // socketRef.current = null;
      }
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Effect for general data listeners (provinceViewers, surveyViewers, etc.)
  useEffect(() => {
    if (!socketRef.current || !socketRef.current.connected) {
      return;
    }
    const socket = socketRef.current;

    const provinceViewersHandler = (viewers) => setProvinceViewers(viewers);
    const surveyViewersHandler = (updatedViewers) => {
      console.log(
        "[SideMenu] Received surveyViewers update:",
        updatedViewers.map((u) => u.username).join(", ")
      );
      // console.log("[SideMenu] Received surveyViewers update:", updatedViewers.map(u => u.username).join(', '));
      setSurveyViewers(updatedViewers);
    };
    const mbuViewersHandler = (viewers) => setMbuViewers(viewers);
    const eswmViewersHandler = (viewers) => setEswmViewers(viewers);
    const healthcareViewersHandler = (viewers) => setHealthcareViewers(viewers); // Added handler
    const chemicalsViewersHandler = (viewers) => setChemicalsViewers(viewers); // Added handler
    const tsdViewersHandler = (viewers) => setTsdViewers(viewers); // Added handler
    const trcViewersHandler = (viewers) => setTrcViewers(viewers); // Added handler

    // Province viewers
    socket.on("provinceViewers", provinceViewersHandler);

    // Survey viewers
    socket.on("surveyViewers", surveyViewersHandler);

    // MBU viewers
    socket.on("mbuViewers", mbuViewersHandler);

    // ESWM viewers
    socket.on("eswmViewers", eswmViewersHandler);
    socket.on("healthcareViewers", healthcareViewersHandler);
    socket.on("chemicalsViewers", chemicalsViewersHandler);
    socket.on("tsdViewers", tsdViewersHandler);
    socket.on("trcViewers", trcViewersHandler);

    return () => {
      // Cleanup these general listeners when canViewDataHistory changes or component unmounts
      socket.off("provinceViewers", provinceViewersHandler);
      socket.off("surveyViewers", surveyViewersHandler);
      socket.off("mbuViewers", mbuViewersHandler);
      socket.off("eswmViewers", eswmViewersHandler);
      socket.off("healthcareViewers", healthcareViewersHandler); // Ensure cleanup
      socket.off("chemicalsViewers", chemicalsViewersHandler); // Ensure cleanup
      socket.off("tsdViewers", tsdViewersHandler); // Ensure cleanup
      socket.off("trcViewers", trcViewersHandler); // Ensure cleanup
    };
  }, []); // Run once when component mounts and socketRef is available. Listeners persist across reconnections.

  // Effect for 'connect' handler (re-joining rooms on socket reconnection)
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username)
      // Removed canViewDataHistory check
      return;

    const socket = socketRef.current;

    // Re-emit join events on reconnect
    socket.on("connect", () => {
      if (currentProvince && currentUser?.username) {
        socket.emit("joinProvince", {
          province: currentProvince,
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      // Survey re-join on connect is handled by Survey.jsx itself
      if (currentUser?.username && location.pathname === "/universe/mbu") {
        socket.emit("joinMbu", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      if (
        currentUser?.username &&
        location.pathname === "/universe/eswm-database"
      ) {
        socket.emit("joinEswm", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      if (
        currentUser?.username &&
        location.pathname === "/universe/healthcare"
      ) {
        socket.emit("joinHealthcare", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      if (
        currentUser?.username &&
        location.pathname === "/universe/chemicals"
      ) {
        socket.emit("joinChemicals", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      if (currentUser?.username && location.pathname === "/universe/tsd") {
        socket.emit("joinTsd", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
      if (currentUser?.username && location.pathname === "/universe/trc") {
        socket.emit("joinTrc", {
          user: {
            username: currentUser.username,
            avatar: currentUser.avatar || currentUser.avatarUrl,
            name: currentUser.name,
          },
        });
      }
    });

    return () => {
      socket.off("connect");
    };
  }, [currentProvince, currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // Centralized effect for province join/leave based on URL changes
  useEffect(() => {
    const extractProvinceFromPath = (path) => {
      const match = path.match(/\/universe\/province\/([^/]+)/);
      return match ? match[1] : null;
    };
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      // If socket isn't ready, or no permission, or no user, ensure province state is cleared if not on a province page.
      const currentUrlProvince = extractProvinceFromPath(location.pathname);
      if (!currentUrlProvince) {
        setCurrentProvinceState(null);
        setCurrentProvince(null); // Update context as well
      }
      prevLocationPathnameRef.current = location.pathname; // Still update ref
      return;
    }

    const socket = socketRef.current;
    const currentPath = location.pathname;
    const prevPath = prevLocationPathnameRef.current;

    const newUrlProvince = extractProvinceFromPath(currentPath);
    const oldUrlProvince = extractProvinceFromPath(prevPath);

    // Update local state (used for socket reconnect logic) and DataContext
    setCurrentProvinceState(newUrlProvince);
    setCurrentProvince(newUrlProvince);

    // Handle leaving the old province
    // The server's leaveProvince uses `socket.province` which was set when the user joined `oldUrlProvince`.
    if (oldUrlProvince && oldUrlProvince !== newUrlProvince) {
      // console.log(
      //   `[SideMenu] Navigating away from province ${oldUrlProvince}. Emitting leaveProvince.`
      // );
      socket.emit("leaveProvince");
    }

    // Handle joining the new province
    if (newUrlProvince && newUrlProvince !== oldUrlProvince) {
      // console.log(
      //   `[SideMenu] Navigating to province ${newUrlProvince}. Emitting joinProvince.`
      // );
      socket.emit("joinProvince", {
        province: newUrlProvince,
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
    }

    // Update the ref for the next render cycle
    prevLocationPathnameRef.current = currentPath;
  }, [location.pathname, currentUser, setCurrentProvince]); // Removed canViewDataHistory from deps

  // MBU join/leave logic
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinMbuThisEffect = false;

    if (location.pathname === "/universe/mbu") {
      console.log("[SideMenu] Path is /universe/mbu, attempting to joinMbu.");
      socket.emit("joinMbu", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinMbuThisEffect = true;
    }

    return () => {
      if (socketRef.current && didJoinMbuThisEffect && currentUser?.username) {
        console.log(
          "[SideMenu] Cleanup for MBU effect: Emitting leaveMbu because this effect instance had joined."
        );
        socketRef.current.emit("leaveMbu");
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // ESWM join/leave logic
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinEswmThisEffect = false;

    if (location.pathname === "/universe/eswm-database") {
      console.log(
        "[SideMenu] Path is /universe/eswm-database, attempting to joinEswm."
      );
      socket.emit("joinEswm", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinEswmThisEffect = true;
    }
    return () => {
      if (socketRef.current && didJoinEswmThisEffect && currentUser?.username) {
        console.log(
          "[SideMenu] Cleanup for ESWM effect: Emitting leaveEswm because this effect instance had joined."
        );
        socketRef.current.emit("leaveEswm");
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinHealthcareThisEffect = false;

    if (location.pathname === "/universe/healthcare") {
      // console.log("[SideMenu] Path is /universe/healthcare, attempting to joinHealthcare.");
      socket.emit("joinHealthcare", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinHealthcareThisEffect = true;
    }

    return () => {
      if (
        socketRef.current &&
        didJoinHealthcareThisEffect &&
        currentUser?.username
      ) {
        // console.log("[SideMenu] Cleanup for Healthcare effect: Emitting leaveHealthcare because this effect instance had joined.");
        socketRef.current.emit("leaveHealthcare");
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // Chemicals join/leave logic
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinChemicalsThisEffect = false;

    if (location.pathname === "/universe/chemicals") {
      // console.log("[SideMenu] Path is /universe/chemicals, attempting to joinChemicals.");
      socket.emit("joinChemicals", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinChemicalsThisEffect = true;
    }

    return () => {
      if (
        socketRef.current &&
        didJoinChemicalsThisEffect &&
        currentUser?.username
      ) {
        // console.log("[SideMenu] Cleanup for Chemicals effect: Emitting leaveChemicals because this effect instance had joined.");
        socketRef.current.emit("leaveChemicals");
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // TSD join/leave logic
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinTsdThisEffect = false;

    if (location.pathname === "/universe/tsd") {
      // console.log("[SideMenu] Path is /universe/tsd, attempting to joinTsd.");
      socket.emit("joinTsd", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinTsdThisEffect = true;
    }

    return () => {
      if (socketRef.current && didJoinTsdThisEffect && currentUser?.username) {
        // console.log("[SideMenu] Cleanup for TSD effect: Emitting leaveTsd because this effect instance had joined.");
        socketRef.current.emit("leaveTsd");
      }
    };
  }, [currentUser, location.pathname]); // Removed canViewDataHistory from deps

  // TRC join/leave logic
  useEffect(() => {
    if (!socketRef.current || !currentUser?.username) {
      // Removed canViewDataHistory check
      return;
    }

    const socket = socketRef.current;
    let didJoinTrcThisEffect = false;

    if (location.pathname === "/universe/trc") {
      // console.log("[SideMenu] Path is /universe/trc, attempting to joinTrc.");
      socket.emit("joinTrc", {
        user: {
          username: currentUser.username,
          avatar: currentUser.avatar || currentUser.avatarUrl,
          name: currentUser.name,
        },
      });
      didJoinTrcThisEffect = true;
    }
    return () => {
      if (socketRef.current && didJoinTrcThisEffect && currentUser?.username) {
        // console.log("[SideMenu] Cleanup for TRC effect: Emitting leaveTrc because this effect instance had joined.");
        socketRef.current.emit("leaveTrc");
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
              <span>{province}</span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
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
              <span>
                <Link to="/universe/healthcare">Healthcare Industries</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
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
              <span>
                <Link to="/universe/chemicals">Chemical Industries</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
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
              <span>
                <Link to="/universe/tsd">TSD Facilities</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
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
              <span>
                <Link to="/universe/trc">TRC Permits</Link>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
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
          <span>
            <Link to="/universe/survey">Survey</Link>
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            {renderAvatars(surveyViewers)}
          </span>
        </span>
      ),
    },
    {
      key: "/universe/mbu",
      icon: <EnvironmentFilled />,
      label: (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <span>
            <Link to="/universe/mbu">Manila Bay Pipeline</Link>
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            {renderAvatars(mbuViewers)}
          </span>
        </span>
      ),
    },
    {
      key: "/universe/eswm-database",
      icon: <DatabaseFilled />,
      label: (
        <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <span>
            <Link to="/universe/eswm-database">ESWM Database</Link>
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            {renderAvatars(eswmViewers)}
          </span>
        </span>
      ),
    },
    {
      key: "planning-unit", // New menu key
      icon: <BsClipboardDataFill />, // Example Icon
      label: "Planning Unit",
      children: [
        {
          key: "/universe/planning-unit/monitoring",
          label: (
            <Link to="/universe/planning-unit/monitoring">Monitoring</Link>
          ),
        },
        {
          key: "/universe/planning-unit/survey-activities", // Made path more specific
          label: (
            <Link to="/universe/planning-unit/survey-activities">
              Survey Activities
            </Link>
          ),
        },
        {
          key: "/universe/planning-unit/validations",
          label: (
            <Link to="/universe/planning-unit/validations">Validations</Link>
          ),
        },
        {
          key: "/universe/planning-unit/generated-reports", // Made path more specific
          label: (
            <Link to="/universe/planning-unit/generated-reports">
              Generated Reports
            </Link>
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
          label: <Link to="/universe/extract">Extract Data</Link>,
        },
        {
          key: "/universe/deleted_firms",
          label: <Link to="/universe/deleted_firms">Deleted Industries</Link>,
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
          label: <Link to="/universe/accounts">User Accounts</Link>,
        },
        {
          key: "/universe/posting",
          label: <Link to="/universe/posting">Post to Bulletin</Link>,
        },

        {
          key: "/universe/records/config",
          label: <Link to="/universe/records/config">Records Config</Link>,
        },
        {
          key: "/universe/records/activity",
          label: <Link to="/universe/records/activity">Records Activity</Link>,
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
