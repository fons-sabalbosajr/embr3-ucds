import React, { useState, useEffect } from "react";
import { Table, Switch, Row, Col, message, Button } from "antd";
import {
  EyeOutlined,
  DatabaseOutlined,
  InfoCircleFilled,
  HistoryOutlined,
  ExportOutlined,
  SearchOutlined
} from "@ant-design/icons";
import NiceAvatar from "react-nice-avatar";
import axios from "axios";
import Swal from "sweetalert2";
import "./accountpermission.css";

const AccountPermission = ({ userData, onClose, onPermissionsUpdate }) => {
  const [avatarData, setAvatarData] = useState(null);
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
      key: "canAccessRangePicker", // New permission for RangePicker access
      accessName: "Access RangePicker",
      description: "Grants access to the date range selection feature.",
      icon: <SearchOutlined />, // You can choose a different icon if needed
      isGranted: false,
    },
  ]);

  const [initialAccessList, setInitialAccessList] = useState([]);
  const [hasChanges, setHasChanges] = useState(false); // Track changes

  useEffect(() => {
    const fetchUserAvatar = async () => {
      try {
        const response = await axios.get("http://localhost:8081/api/users");
        const users = response.data;
        const currentUser = users.find((user) => user.email === userData.email);

        if (currentUser) {
          setAvatarData(currentUser.avatar);
          const updatedAccessList = accessList.map((item) => ({
            ...item,
            isGranted: currentUser[item.key] || false, // Set isGranted based on user data
          }));
          //console.log("Updated Access List:", updatedAccessList); // Log updated access list
          setAccessList(updatedAccessList);
          setInitialAccessList(updatedAccessList); // Set the initial access list
        } else {
          message.error("User not found");
        }
      } catch (error) {
        message.error("Error fetching user data");
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserAvatar();
  }, [userData.email]);

  const toggleAccess = (key) => {
    setAccessList((prevList) => {
      const updatedList = prevList.map((item) => {
        if (item.key === key) {
          const updatedItem = { ...item, isGranted: !item.isGranted }; // Toggle the specific access
          //console.log(`Toggled ${key}: ${updatedItem.isGranted}`); // Log the toggle action
          return updatedItem;
        }
        return item;
      });
      checkForChanges(updatedList); // Check if there are changes after updating
      return updatedList;
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

  const applyChanges = async () => {
    const updatedPermissions = accessList.reduce((acc, item) => {
      acc[item.key] = item.isGranted; // Map accessList to permissions object
      return acc;
    }, {});
  
    
    //console.log("Permissions to apply:", updatedPermissions);
  
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
        // Send the updated permissions to the API
        const response = await axios.patch(
          `http://localhost:8081/api/users/${userData.email}/permissions`,
          updatedPermissions
        );
        //console.log("Updated User Data:", response.data);
  
        // Show success message using SweetAlert2
        await Swal.fire({
          icon: "success",
          title: "Success!",
          text: "User permissions updated successfully.",
          confirmButtonText: "OK",
        });
  
        setHasChanges(true);
        if (onPermissionsUpdate) {
          onPermissionsUpdate(); // Make sure the function is available
        }
        setInitialAccessList(updatedPermissions);
      } catch (error) {
        // Show error message using SweetAlert2
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
  

  const columns = [
    {
      title: "Access",
      dataIndex: "accessName",
      key: "access",
      width: 200,
      align: "left",
      render: (text, record) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="icon-container">{record.icon}</div>
          <div>
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

  const isInitialState = () => {
    return accessList.every((item, index) => {
      const initialItem = initialAccessList[index];
      return initialItem && item.isGranted === initialItem.isGranted; // Ensure initialItem is defined
    });
  };

  useEffect(() => {
    if (isInitialState()) {
      setHasChanges(false);
      //console.log("State matches initial state. OK button enabled."); // Log state check
    } else {
      //console.log("State has changed. OK button disabled."); // Log state change
    }
  }, [accessList]);

  return (
    <div style={{ padding: "20px" }}>
      <Row style={{ marginBottom: "20px", alignItems: "center" }}>
        <Col span={3}>
          {avatarData ? (
            <NiceAvatar
              style={{ width: "70px", height: "70px" }}
              {...avatarData}
            />
          ) : (
            <NiceAvatar style={{ width: "70px", height: "70px" }} />
          )}
        </Col>
        <Col span={15}>
          <h3 style={{ margin: 0, fontWeight: 600 }}>{userData.name}</h3>
          <p style={{ margin: 0, color: "gray", fontSize: 11 }}>
            {userData.division}
          </p>
          <p style={{ margin: 0, color: "gray", fontSize: 11 }}>
            {userData.email}
          </p>
          <p
            style={{
              margin: 0,
              color: "white",
              fontSize: 10,
              padding: "2px 10px",
              borderRadius: "4px",
              display: "inline-block",
              backgroundColor: (() => {
                switch (userData.permission) {
                  case "viewer":
                    return "#FBA834";
                  case "contributor":
                    return "#387ADF";
                  case "admin":
                    return "#333A73";
                  case "developer":
                    return "#800000";
                  default:
                    return "gray";
                }
              })(),
            }}
          >
            {userData.permission}
          </p>
        </Col>
      </Row>

      <div className="note-section">
        <InfoCircleFilled style={{ fontSize: "24px", color: "#1890ff" }} />
        <p className="note-label">
          This form allows you to manage the permissions for the user. Toggle
          the switches to grant or revoke access to various features within the
          application.
        </p>
      </div>

      <Table dataSource={accessList} columns={columns} pagination={false} />

      <div
        style={{
          marginTop: "20px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button
          type="default"
          style={{ marginRight: "10px" }}
          onClick={onClose}
          disabled={isInitialState()}
        >
          OK
        </Button>
        <Button type="primary" onClick={applyChanges}>
          Apply
        </Button>
      </div>
    </div>
  );
};

export default AccountPermission;
