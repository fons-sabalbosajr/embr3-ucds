import {
  Modal,
  Avatar,
  Input,
  Select,
  Button,
  Tabs,
  Table,
  Progress,
} from "antd";
import "./useraccountmodal.css";
import { UserOutlined, CameraOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import AvatarSelectionModal from "../components/AvatarSelectionModalProfile";
import NiceAvatar from "react-nice-avatar"; // Assuming NiceAvatar is correctly imported

const { TabPane } = Tabs;

const UserProfileModal = ({ user, visible, onCancel, fetchUserData }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState(
    user ? { ...user, avatar: user.avatar || null } : null
  );
  const [originalUser, setOriginalUser] = useState({ ...user });
  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (user) {
      setEditableUser({ ...user, avatar: user.avatar || null });
    }
    setOriginalUser({ ...user });
  }, [user]);

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    try {
      let updatedUserData = { ...editableUser };

      // Check if there's a new avatar selected
      if (editableUser.avatar && typeof editableUser.avatar === "object") {
        // If avatar is an object (indicating it's from AvatarSelectionModal), extract its configuration
        updatedUserData.avatar = { ...editableUser.avatar };
      } else if (
        editableUser.avatar &&
        typeof editableUser.avatar === "string"
      ) {
        // If avatar is a string (already saved URL), keep it as it is
        updatedUserData.avatar = editableUser.avatar;
      }

      const response = await axios.put(
        `https://embr3-ucds.onrender.com/api/users/${editableUser._id}`,
        updatedUserData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200 && response.data) {
        setOriginalUser({ ...updatedUserData });
        setIsEditing(false);

        Swal.fire({
          title: "Success!",
          text: "User information updated successfully!",
          icon: "success",
          confirmButtonText: "OK",
        });
      } else {
        Swal.fire({
          title: "Error!",
          text: "Failed to update user information. Please try again.",
          icon: "error",
          confirmButtonText: "OK",
        });
        await fetchUserData();
      }
    } catch (error) {
      console.error(
        "Error updating user:",
        error.response ? error.response.data : error
      );

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

  const handleAvatarSelect = (config) => {
    setEditableUser({
      ...editableUser,
      avatar: config,
    });
    setIsAvatarModalVisible(false);
  };

  const handleUploadAvatar = async (avatarUrl) => {
    try {
      setUploading(true);
      for (let i = 0; i <= 100; i += 20) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setUploadProgress(i);
      }
      setUploadProgress(100);
      setUploading(false);

      setEditableUser({
        ...editableUser,
        avatar: avatarUrl,
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      setUploading(false);
      setUploadProgress(0);
    }
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
      footer={null}
      width={1000}
      className="user-profile-modal"
      zIndex={1001}
      closable={false}
    >
      <div className="user-details-container">
        <div className="avatar-container">
          {editableUser && editableUser.avatar ? (
            <NiceAvatar
              style={{ width: 150, height: 150 }}
              {...editableUser.avatar}
            />
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
              {editableUser && editableUser.name ? editableUser.name[0] : ""}
            </Avatar>
          )}
          <div className="user-status-dot" />
          {isEditing && (
            <div
              className="avatar-edit-button"
              onClick={() => setIsAvatarModalVisible(true)}
            >
              <CameraOutlined className="edit-avatar-icon" />
            </div>
          )}
        </div>

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
              value={editableUser ? editableUser.division : ""}
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
          {uploading && <Progress percent={uploadProgress} status="active" />}
          <div className="button-group">
            <Button
              type={isEditing ? "primary" : "default"}
              onClick={isEditing ? handleSave : handleEdit}
              className="button-save"
            >
              {isEditing ? "Save" : "Edit"}
            </Button>
            <Button onClick={handleCancel} className="button-cancel">
              {isEditing ? "Cancel" : "Close"}
            </Button>
          </div>
        </div>
      </div>

      <AvatarSelectionModal
        visible={isAvatarModalVisible}
        onCancel={() => setIsAvatarModalVisible(false)}
        onSelect={handleAvatarSelect}
      />
    </Modal>
  );
};

export default UserProfileModal;
