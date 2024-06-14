import { Modal, Avatar, Input, Select, Button, Tabs, Table } from "antd";
import "./useraccountmodal.css";
import { UserOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";

const { TabPane } = Tabs;

const UserProfileModal = ({ user, visible, onCancel, fetchUserData }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState({ ...user });
  const [originalUser, setOriginalUser] = useState({ ...user });

  useEffect(() => {
    setEditableUser({ ...user });
    setOriginalUser({ ...user });
  }, [user]);

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    try {
      const response = await axios.put(
        `http://localhost:8081/api/users/${editableUser._id}`,
        editableUser,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // Check if the update was successful by examining the response
      if (response.status === 200 && response.data) {
        // Update the original user state with the latest changes
        setOriginalUser({ ...editableUser });

        // Turn off editing mode
        setIsEditing(false);

        // Display success message using SweetAlert2
        Swal.fire({
          title: "Success!",
          text: "User information updated successfully!",
          icon: "success",
          confirmButtonText: "OK",
        });
      } else {
        // If the update was not successful, display an error message
        Swal.fire({
          title: "Error!",
          text: "Failed to update user information. Please try again.",
          icon: "error",
          confirmButtonText: "OK",
        });

        await fetchUserData();
      }
    } catch (error) {
      // Log the error details
      console.error(
        "Error updating user:",
        error.response ? error.response.data : error
      );

      // Handle error and display message using SweetAlert2
      Swal.fire({
        title: "Error!",
        text: error.response
          ? error.response.data.error
          : "Failed to update user information. Please try again.",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const handleCancel = () => {
    if (isEditing) {
      Swal.fire({
        title: "Cancel Editing",
        text: "Are you sure you want to cancel editing? Your changes will be discarded.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes",
        cancelButtonText: "No",
      }).then((result) => {
        if (result.isConfirmed) {
          setIsEditing(false);
          setEditableUser({ ...originalUser });
        }
      });
    } else {
      onCancel();
    }
  };

  const handleChange = (field, value) => {
    setEditableUser({
      ...editableUser,
      [field]: value,
    });
  };

  const recentChangesColumns = [
    {
      title: "Date",
      dataIndex: "date",
    },
    {
      title: "Change",
      dataIndex: "change",
    },
  ];

  const encodedDataColumns = [
    {
      title: "Key",
      dataIndex: "key",
    },
    {
      title: "Value",
      dataIndex: "value",
    },
  ];

  const statusDotClass =
    user && user.status === "online"
      ? "user-status-dot online"
      : "user-status-dot offline";

  return (
    <Modal
      title={
        <div className="modal-title-container">
          <span>User Profile</span>
          <div className="modal-title-line"></div>
        </div>
      }
      visible={visible}
      onCancel={handleCancel}
      footer={null} // No footer buttons by default
      width={1000} // Set the width of the modal
      className="user-profile-modal"
      zIndex={1001}
      closable={false}
    >
      <div className="user-details-container">
        {editableUser && (
          <div className="avatar-container">
            {editableUser.avatar ? (
              <Avatar size={150} src={user.avatar} icon={<UserOutlined />} />
            ) : (
              <Avatar
                size={150}
                className="user-status-item-avatar"
                style={{
                  fontSize: "50px",
                  backgroundColor: "#f56a00",
                  verticalAlign: "middle",
                }}
              >
                {editableUser.name ? editableUser.name[0] : ""}
              </Avatar>
            )}
            <div className={`user-status-dot ${editableUser.status}`} />
          </div>
        )}

        <div className="user-info">
          <div className="user-info-column">
            <p>Name:</p>
            <Input
              placeholder="Enter Name"
              value={editableUser ? editableUser.name : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <p>Division/Section:</p>
            <Input
              placeholder="Enter Designation"
              value={editableUser ? editableUser.designation : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("division", e.target.value)}
            />
          </div>

          <div className="user-info-column">
            <p>Email Address:</p>
            <Input
              placeholder="Enter Email Address"
              value={editableUser ? editableUser.email : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("email", e.target.value)}
            />
            <p>Permission:</p>
            <Select
              value={editableUser ? editableUser.permission : "user"}
              style={{ width: 120 }}
              disabled={!isEditing}
              onChange={(value) => handleChange("permission", value)}
            >
              <Select.Option value="viewer">Viewer</Select.Option>
              <Select.Option value="contributor">Contributor</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
              <Select.Option value="developer">Developer</Select.Option>
            </Select>
          </div>
        </div>
      </div>

      <div className="tab-container">
        <Tabs defaultActiveKey="1" tabBarStyle={{ marginBottom: 0 }}>
          <TabPane tab="Recent Changes" key="1">
            <Table
              columns={recentChangesColumns}
              dataSource={[]} // Add your data source here
            />
          </TabPane>
          <TabPane tab="Encoded Data" key="2">
            <Table
              columns={encodedDataColumns}
              dataSource={[]} // Add your data source here
            />
          </TabPane>
        </Tabs>

        <div className="modal-footer-container">
          <Button
            type={isEditing ? "primary" : "default"}
            onClick={isEditing ? handleSave : handleEdit}
          >
            {isEditing ? "Save" : "Edit"}
          </Button>
          <Button onClick={handleCancel}>
            {isEditing ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserProfileModal;
