import React, { useState, useEffect } from "react";
import { Table, Switch, Row, Col, Button, Tabs, Avatar, Tag } from "antd";
import { message } from "../../../shared/feedback";
import {
  EyeOutlined,
  DatabaseOutlined,
  InfoCircleFilled,
  HistoryOutlined,
  ExportOutlined,
  SearchOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import axios from "axios";
import Swal from "sweetalert2";
import AvatarWithName from "../../../components/AvatarwithName";
import AccountTypePanel from "./AccountTypePanel";
import { accountType } from "../../../shared/accountTypes";
import "./accountpermission.css";
import { API_BASE_URL } from "../../../config/api";

const { TabPane } = Tabs;

const AccountPermission = ({
  visible,
  onClose,
  onPermissionsUpdate,
  userData,
}) => {
  const { name, email, permission, avatar } = userData;
  const [avatarData, setAvatarData] = useState(null);
  const getPermissionStyle = (permission) => {
    let bgColor = "#d9d9d9"; // default gray
    let textColor = "#fff";

    switch (permission.toLowerCase()) {
      case "viewer":
        bgColor = "#379777"; // Dark Gray
        break;
      case "contributor":
        bgColor = "#F4CE14"; // Dark Blue
        break;
      case "admin":
        bgColor = "#102E50"; // Dark Charcoal
        break;
      case "developer":
        bgColor = "#3A3960"; // Dark Purple
        break;
      default:
        bgColor = "#f0f0f0";
    }

    return {
      backgroundColor: bgColor,
      color: textColor,
      padding: "2px 8px",
      borderRadius: "4px",
      fontWeight: 500,
      fontSize: "12px",
      textTransform: "capitalize",
      display: "inline-block",
      minWidth: "80px",
      textAlign: "center",
    };
  };
  const [accessList, setAccessList] = useState([
    {
      key: "canViewAdminPanel",
      accessName: "Admin Panel",
      description: "Grants access to the administrative features.",
      icon: <EyeOutlined />,
      isGranted: false,
    },
    {
      key: "canViewDataHistory",
      accessName: "Data History Actions",
      description: "Allows user to edit data history.",
      icon: <HistoryOutlined />,
      isGranted: false,
    },
    {
      key: "canManageData",
      accessName: "Manage Data",
      description: "Allows user to manage and edit data.",
      icon: <DatabaseOutlined />,
      isGranted: false,
    },
    {
      key: "canGenerateData",
      accessName: "Generate Data",
      description: "Allows user to generate and edit data.",
      icon: <ExportOutlined />,
      isGranted: false,
    },
    {
      key: "canAccessRangePicker",
      accessName: "Access RangePicker",
      description: "Grants access to the date range selection feature.",
      icon: <SearchOutlined />,
      isGranted: false,
    },
  ]);
  const [initialAccessList, setInitialAccessList] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [provinceAccessList, setProvinceAccessList] = useState([
    { key: "aurora", name: "Aurora", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "bataan", name: "Bataan", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "bulacan", name: "Bulacan", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "nuevaEcija", name: "Nueva Ecija", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "pampanga", name: "Pampanga", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "tarlac", name: "Tarlac", canView: false, canReadWrite: false, isAllowAll: false },
    { key: "zambales", name: "Zambales", canView: false, canReadWrite: false, isAllowAll: false },
  ]);
  const [initialProvinceAccessList, setInitialProvinceAccessList] = useState(
    []
  );

  useEffect(() => {
    if (!userData || !userData.username) {
      console.error("Username not provided in userData:", userData);
      return;
    }
  
    const fetchUserAvatarAndAccess = async () => {
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/users?username=${userData.username}`
        );
  
        const users = response.data;
        const currentUser = users[0];
  
        if (!currentUser) {
          message.error("User not found");
          return;
        }
  
        // Set avatar
        setAvatarData(currentUser.avatar || null);
  
        // Update Main Access List
        const updatedAccess = accessList.map((item) => ({
          ...item,
          isGranted: !!currentUser[item.key],
        }));
        setAccessList(updatedAccess);
        setInitialAccessList([...updatedAccess]);
  
        // Update Province Access List
        const updatedProvinceAccess = provinceAccessList.map((provinceItem) => {
          const permissionString = currentUser[provinceItem.key]; // e.g., "view", "readWrite", "none"
          let canView = false;
          let canReadWrite = false;
          // isAllowAll is generally a UI concept for setting both, so initialize to false
          // unless your backend specifically sends an "allowAll" state.
          // For now, we'll derive it based on readWrite.

          if (permissionString === "readWrite") {
            canView = true;
            canReadWrite = true;
          } else if (permissionString === "view") {
            canView = true;
            canReadWrite = false;
          }
          // If "none" or undefined, both remain false

          return {
            ...provinceItem,
            canView: canView,
            canReadWrite: canReadWrite,
            isAllowAll: false, // isAllowAll is primarily a UI control, initialize to false
          };
        });
        setProvinceAccessList(updatedProvinceAccess);
        setInitialProvinceAccessList(JSON.parse(JSON.stringify(updatedProvinceAccess))); // Deep copy
      } catch (error) {
        console.error("Error fetching user data:", error);
        message.error("Error fetching user data");
      }
    };
  
    fetchUserAvatarAndAccess();
    // dependency: only rerun if username changes
  }, [userData?.username]);
  

  const toggleAccess = (key) => {
    setAccessList((prevList) => {
      const updatedList = prevList.map((item) =>
        item.key === key ? { ...item, isGranted: !item.isGranted } : item
      );
      checkForChanges(updatedList);
      return updatedList;
    });
  };
  
  const toggleProvinceAccess = (key, type, value) => {
    setProvinceAccessList((prevList) => {
      const newList = prevList.map((item) => {
        if (item.key === key) {
          const newItem = { ...item };
          if (type === 'allowAll') {
            newItem.isAllowAll = value;
            if (value) { // AllowAll turned ON
              newItem.canView = true;
              newItem.canReadWrite = true;
            }
            // If AllowAll is turned OFF, canView and canReadWrite retain their state,
            // and their switches become enabled for individual toggling.
          } else if (type === 'readWrite') {
            newItem.canReadWrite = value;
            if (value) { // ReadWrite turned ON
              newItem.canView = true; // Force view ON
            }
          } else if (type === 'view') {
            newItem.canView = value;
            if (!value) { // View turned OFF
              newItem.canReadWrite = false; // Force readWrite OFF if view is off
            }
          }
          return newItem;
        }
        return item;
      });
      checkForProvinceChanges(newList);
      return newList;
    });
  };
  

  const checkForChanges = (updatedList) => {
    const isChanged = updatedList.some((item, index) => {
      const initialItem = initialAccessList[index];
      return initialItem && item.isGranted !== initialItem.isGranted; // Compare with initial state
    });
    //console.log("Has Changes:", isChanged); // Log if there are changes
    setHasChanges(isChanged); // Update hasChanges based on comparison
  };

  const checkForProvinceChanges = (updatedList) => {
    const isChanged = updatedList.some((item, index) => {
      const initialItem = initialProvinceAccessList[index];
      return initialItem && (
        item.canView !== initialItem.canView ||
        item.canReadWrite !== initialItem.canReadWrite ||
        item.isAllowAll !== initialItem.isAllowAll
      );
    });
    setHasChanges(isChanged);
  };

  const applyChanges = async () => {
    const updatedPermissions = accessList.reduce((acc, item) => {
      acc[item.key] = item.isGranted;
      return acc;
    }, {});

    const provincePermissionsPayload = provinceAccessList.reduce(
      (acc, item) => {
        let permissionValue = 'none';
        if (item.isAllowAll || item.canReadWrite) {
          permissionValue = 'readWrite';
        } else if (item.canView) {
          permissionValue = 'view';
        }
        acc[item.key] = permissionValue;
        return acc;
      }, {}
    );

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You are about to apply these changes!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, apply changes!",
    });

    if (result.isConfirmed) {
      try {
        // Send permissions to the main permissions endpoint
        await axios.patch(
          `${API_BASE_URL}/api/users/${userData.email}/permissions`,
          updatedPermissions
        );

        // Send province permissions to the province permissions endpoint
        await axios.patch(
          `${API_BASE_URL}/api/users/${userData.email}/province-permissions`,
          provincePermissionsPayload
        );

        await Swal.fire({
          icon: "success",
          title: "Success!",
          text: "User  permissions updated successfully.",
          confirmButtonText: "OK",
        });

        setHasChanges(false);
        if (onPermissionsUpdate) {
          onPermissionsUpdate();
        }
        // Update initial states to reflect saved changes for both access lists
        setInitialAccessList(JSON.parse(JSON.stringify(accessList)));
        setInitialProvinceAccessList(JSON.parse(JSON.stringify(provinceAccessList)));
      } catch (error) {
        await Swal.fire({
          icon: "error",
          title: "Error!",
          text: "Error updating user permissions.",
          confirmButtonText: "Try Again",
        });
        console.error("Error updating permissions:", error);
      }
    }
  };

  const isInitialState = () => {
    const accessChanged = accessList.some((item, index) => {
      const initialItem = initialAccessList[index];
      return initialItem && item.isGranted !== initialItem.isGranted;
    });

    const provinceChanged = provinceAccessList.some((item, index) => {
      const initialItem = initialProvinceAccessList[index];
      if (!initialItem) return true; 
      return item.canView !== initialItem.canView ||
             item.canReadWrite !== initialItem.canReadWrite ||
             item.isAllowAll !== initialItem.isAllowAll;
    });

    return !accessChanged && !provinceChanged; // Return true if neither has changed
  };

  const accessColumns = [
    {
      title: "Access",
      dataIndex: "accessName",
      key: "access",
      width: 300,
      align: "center",
      render: (text, record) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="icon-container">{record.icon}</div>
          <div className="access-details">
            <strong>{record.accessName}</strong>
            <p style={{ margin: 0, color: "#888" }}>{record.description}</p>
          </div>
        </div>
      ),
    },
    {
      title: "Granted",
      dataIndex: "isGranted",
      key: "isGranted",
      align: "center",
      render: (isGranted, record) => (
        <Switch
          checked={isGranted}
          onChange={() => toggleAccess(record.key)}
          size="small"
        />
      ),
    },
  ];

  const provinceColumns = [
    {
      title: "Province",
      dataIndex: "name",
      key: "name",
      align: "left",
    },
    {
      title: "Viewing",
      key: "view",
      align: "center",
      render: (text, record) => (
        <Switch
          checked={record.canView}
          disabled={record.isAllowAll} // Only disable if AllowAll is on. Read/Write will force View ON via logic.
          onChange={(checked) => toggleProvinceAccess(record.key, 'view', checked)}
          size="small"
        />
      ),
    },
    {
      title: "Read and Write",
      key: "readWrite",
      align: "center",
      render: (text, record) => (
        <Switch
          checked={record.canReadWrite}
          disabled={record.isAllowAll} // Disabled if AllowAll is on
          onChange={(checked) => toggleProvinceAccess(record.key, 'readWrite', checked)}
          size="small"
        />
      ),
    },
  ];

  return (
    <div className="account-permission-container">
      <div className="user-info">
        <div className="avatar-section">
          <AvatarWithName userHandle={userData.username} size="100px" />
          <span
            className={`status-dot ${
              userData.status === "online" ? "online" : "offline"
            }`}
          ></span>
        </div>
        <div className="user-details">
          <p className="user-name-details">
            <strong>{userData.name}</strong>
          </p>
          <p className="user-email-details">{userData.email}</p>
          <p className="user-permission-details">
            <Tag color={accountType(userData.permission).color}>{accountType(userData.permission).label}</Tag>
          </p>
        </div>
      </div>

      <div className="note-section">
        <InfoCircleFilled style={{ fontSize: "24px", color: "#1890ff" }} />
        <p className="note-label">
          This form allows you to manage the permissions for the user. Toggle
          the switches to grant or revoke access to various features within the
          application.
        </p>
      </div>

      <Tabs defaultActiveKey="type">
        <TabPane tab="Type & Storage" key="type">
          <AccountTypePanel
            userId={userData._id}
            permission={userData.permission}
            nasContainers={userData.nasContainers}
            onChanged={() => onPermissionsUpdate?.()}
          />
        </TabPane>
        <TabPane tab="Access Settings" key="1">
          <Table
            dataSource={accessList}
            columns={accessColumns}
            pagination={false}
          />
        </TabPane>
        <TabPane tab="Monitoring Plan Access" key="2">
          <Table
            dataSource={provinceAccessList}
            columns={provinceColumns}
            pagination={false}
          />
        </TabPane>
      </Tabs>

      <div className="footer-actions">
        <Button
          type="primary"
          onClick={applyChanges}
          disabled={isInitialState()}
          style={{ marginRight: "8px" }}
        >
          Save Changes
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
};

export default AccountPermission;
