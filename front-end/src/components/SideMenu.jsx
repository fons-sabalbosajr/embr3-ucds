import React, { useState, useEffect, useContext } from "react";
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
import { Link, useNavigate, useLocation } from "react-router-dom";
import { DataContext } from "./../menu-province/DataContext";
import { io } from "socket.io-client";
import Logo from "./Logo";
import "./sidemenu.css";

const { Sider } = Layout;

const SideMenu = ({ theme, currentUser }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentProvince } = useContext(DataContext);
  const [provinceViewers, setProvinceViewers] = useState({});
  const socketRef = React.useRef(null);

  const permissions = currentUser?.permissions || [];
  const canViewDataHistory = permissions[3];

  const visibleProvinces = [
    "Aurora",
    "Bataan",
    "Bulacan",
    "Nueva_Ecija",
    "Pampanga",
    "Tarlac",
    "Zambales",
  ].filter((_, i) => permissions[i + 5]);

  const rootSubmenuKeys = ["r3-monitoring", "healthcare", "reports", "admin"];

  useEffect(() => {
    const path = location.pathname;
    if (path.includes("/universe/province/")) setOpenKeys(["r3-monitoring"]);
    else if (
      ["healthcare", "chemicals", "tsd", "trc"].some((p) => path.includes(p))
    )
      setOpenKeys(["healthcare"]);
    else if (["extract", "deleted_firms"].some((p) => path.includes(p)))
      setOpenKeys(["reports"]);
    else if (
      ["accounts", "posting", "activitylog"].some((p) => path.includes(p))
    )
      setOpenKeys(["admin"]);
    else setOpenKeys([]);
  }, [location.pathname]);

  useEffect(() => {
    if (!canViewDataHistory) return; // Only connect if allowed to view
    if (!socketRef.current) {
      socketRef.current = io("http://localhost:8081", {
        withCredentials: true,
      });
    }
    const socket = socketRef.current;

    socket.emit("joinSideMenuViewers", {
      user: {
        userId:
          currentUser?._id?.$oid || currentUser?._id || currentUser?.userId,
        username: currentUser?.username,
        avatar: currentUser?.avatar || currentUser?.avatarUrl,
        name: currentUser?.name,
      },
    });

    socket.on("provinceViewers", (viewers) => {
      setProvinceViewers(viewers);
    });

    return () => {
      socket.emit("leaveSideMenuViewers");
      socket.off("provinceViewers");
    };
  }, [currentUser, canViewDataHistory]);

  const handleProvinceSelect = (province) => {
    setCurrentProvince(province); // Set the selected province
    navigate(`/universe/province/${province}`); // Navigate to the province page
  };

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
        // Filter out dev user by username for this province
        const filteredViewers =
          provinceViewers[province]?.filter(
            (user) => user.username !== "asabalbosa"
          ) || [];

        const avatars =
          canViewDataHistory && filteredViewers.length > 0 ? (
            <Avatar.Group
              max={{ count: 2 }}
              maxStyle={{
                color: "#f56a00",
                backgroundColor: "#fde3cf",
                fontSize: 10,
                border: "1px solid #52c41a",
              }}
              size={18}
              style={{ marginLeft: 6 }}
            >
              {filteredViewers.map((user) => (
                <Tooltip
                  key={user.userId}
                  title={
                    <span style={{ fontSize: "10px" }}>
                      {`${user.username} is here`}
                    </span>
                  }
                >
                  <Avatar
                    src={user.avatar}
                    style={{
                      marginLeft: 50,
                      verticalAlign: "middle",
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

        return {
          key: `/universe/province/${province}`,
          label: (
            <span style={{ display: "flex", alignItems: "center" }}>
              <span>{province}</span>
              {avatars}
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
          label: <Link to="/universe/healthcare">Healthcare Industries</Link>,
        },
        {
          key: "/universe/chemicals",
          label: <Link to="/universe/chemicals">Chemical Industries</Link>,
        },
        {
          key: "/universe/tsd",
          label: <Link to="/universe/tsd">TSD Facilities</Link>,
        },
        {
          key: "/universe/trc",
          label: <Link to="/universe/trc">TRC Permits</Link>,
        },
      ],
    },
    {
      key: "/universe/survey",
      icon: <ReconciliationFilled />,
      label: <Link to="/universe/survey">Survey</Link>,
    },
    {
      key: "/universe/mbu",
      icon: <EnvironmentFilled />,
      label: <Link to="/universe/mbu">Manila Bay Pipeline</Link>,
    },
    {
      key: "/universe/eswm-database",
      icon: <DatabaseFilled />,
      label: <Link to="/universe/eswm-database">ESWM Database</Link>,
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
          key: "/universe/activitylog",
          label: <Link to="/universe/activitylog">Activity Logs</Link>,
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
