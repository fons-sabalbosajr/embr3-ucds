import React, { useState, useEffect } from "react";
import { Layout, Button, Avatar, Spin, Popover, List } from "antd";
import { UserOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import Dashboard from "./menu-component/Dashboard";
import Province from "./menu-province/Province";
import Survey from "./menu-survey/Survey";
import MBU from "./menu-component/MBU";
import Admin from "./menu-component/Admin";
import Accounts from "./menu-component/UserAccounts";
import Extract from "./menu-extract/ExtractData";
import Report from "./menu-component/AdminReport";
import Posting from "./menu-component/Posting";
import "./index.css";
import { DataProvider } from "./menu-province/DataContext";
import UserPopover from "./components/PopOverUser";
import NotificationsPopover from "./components/PopOverNotification";
import SideMenu from "./components/SideMenu";
import AvatarWithName from "./components/AvatarwithName";
import ActivityLog from "./menu-component/ActivityLog";

const { Header, Content } = Layout;

const Universe = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [auth, setAuth] = useState(false);
  const [name, setName] = useState("");
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [userHandle, setUserHandle] = useState("");
  const [selection, setSelection] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [avatar, setAvatar] = useState(null);

  axios.defaults.withCredentials = true;

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  const handleVisibleChange = (visible) => {
    if (!visible) {
      setSelection("");
    }
  };

  const handleMenuItemClick = (key) => {
    setSelection(key);
  };

  const handleLogout = () => {
    axios
      .get(" https://embr3-ucds.onrender.com/logout", { withCredentials: true })
      .then((res) => {
        if (res.data.status === "Logout Success") {
          localStorage.removeItem("authToken");
          localStorage.removeItem("permissions");
          localStorage.removeItem("permission");

          setAuth(false);
          navigate("/login", { replace: true });
        } else {
          console.error("Unexpected response during logout:", res.data);
        }
      })
      .catch((err) => {
        console.error("Error during logout:", err.message);
      });
  };

  const getInitials = (name) => {
    const splitName = name.split(" ");
    const initials = splitName.map((part) => part[0].toUpperCase());
    return initials.join("");
  };

  useEffect(() => {
    axios
      .get("https://embr3-ucds.onrender.com", { withCredentials: true })
      .then((res) => {
        if (res.data.status === "Success") {
          setAuth(true);
          const divisionParts = res.data.division.split("/");
          const formattedName = `${divisionParts[0]} | ${res.data.name}`;
          setName(formattedName);
          setUserHandle(res.data.username);
          setNotifications(res.data.notifications || []);
          setPermissions(res.data.permissions || []);
          localStorage.setItem(
            "permissions",
            JSON.stringify(res.data.permissions || [])
          );

          // Fetch user avatar
          axios
            .get("https://embr3-ucds.onrender.com/api/user/avatar", {
              params: { name: res.data.name },
            })
            .then((response) => {
              setAvatar(response.data.avatar);
            })
            .catch((error) => {
              console.error("Error fetching user avatar:", error);
            });
        } else {
          setAuth(false);
          navigate("/login", { replace: true });
        }
      })
      .catch((err) => {
        console.error("Error fetching auth status:", err.message);
        setAuth(false);
        navigate("/login", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    // Fetch and set permissions from localStorage or API response
    const storedPermissions = JSON.parse(localStorage.getItem("permissions"));
    if (storedPermissions) {
      setPermissions(storedPermissions);
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      // Optional: Save necessary state or show a confirmation dialog here
      // event.preventDefault();
      // event.returnValue = '';
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const popoverContent = (
    <List
      dataSource={notifications}
      renderItem={(item) => <List.Item>{item.message}</List.Item>}
    />
  );

  if (loading) {
    return <Spin spinning />;
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SideMenu
        theme={theme}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        permissions={permissions} // Pass permissions to SideMenu
      />

      <Layout>
        {auth && (
          <Header
            className={`header-container ${
              theme === "dark" ? "dark-theme" : "light-theme"
            }`}
          >
            <div className="header-content">
              <div className="profile_container">
                <span
                  className={`user-name ${
                    theme === "dark" ? "dark-theme" : "light-theme"
                  }`}
                >
                  {name}
                </span>
                <NotificationsPopover
                  popoverContent={popoverContent}
                  theme={theme}
                  notifications={notifications}
                />
                <Popover
                  content={
                    <UserPopover
                      name={name}
                      userHandle={userHandle}
                      theme={theme}
                      handleMenuItemClick={handleMenuItemClick}
                      navigate={navigate}
                      handleLogout={handleLogout}
                      getInitials={getInitials}
                      toggleTheme={toggleTheme}
                      selection={selection}
                      handleVisibleChange={handleVisibleChange}
                    />
                  }
                  trigger="click"
                  placement="bottomRight"
                  theme={theme === "light" ? "light" : "dark"}
                  onVisibleChange={handleVisibleChange}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <AvatarWithName avatar={avatar} />
                  </div>
                </Popover>

                <div
                  className={`theme-switch ${
                    theme === "light" ? "light-theme-icon" : "dark-theme-icon"
                  }`}
                >
                  <Button
                    className="theme-button"
                    type="text"
                    onClick={toggleTheme}
                    icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
                  />
                </div>
              </div>
            </div>
          </Header>
        )}

        <DataProvider>
          {auth && (
            <Content style={{ padding: "24px", backgroundColor: "#F0F2F5" }}>
              <Spin spinning={!auth}>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="dashboard" replace />}
                  />
                  <Route
                    path="dashboard"
                    element={<Dashboard avatar={avatar} name={name} />}
                  />
                  <Route
                    path="/province/:provinceName"
                    element={<Province />}
                  />
                  <Route path="survey" element={<Survey />} />
                  <Route path="mbu" element={<MBU />} />
                  {permissions.includes("admin") && (
                    <Route path="admin" element={<Admin />} />
                  )}
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="extract/*" element={<Extract />} />
                  <Route path="report" element={<Report />} />
                  <Route path="posting" element={<Posting />} />
                  <Route path="activitylog" element={<ActivityLog />} />
                  <Route path="*" element={<Navigate to="dashboard" />} />
                </Routes>
              </Spin>
            </Content>
          )}
        </DataProvider>
      </Layout>
    </Layout>
  );
};

export default Universe;
