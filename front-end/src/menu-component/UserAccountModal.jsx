import {
  Modal,
  Avatar,
  Input,
  Select,
  Button,
  Tabs,
  Table,
  Progress,
  ConfigProvider,
} from "antd";
import "./useraccountmodal.css";
import { UserOutlined, CameraOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import AvatarSelectionModal from "../components/AvatarSelectionModalProfile";
import AvatarWithName from "../components/AvatarwithName";
import NiceAvatar from "react-nice-avatar";
import CryptoJS from "crypto-js";

const { TabPane } = Tabs;

const UserProfileModal = ({
  user,
  visible,
  onCancel,
  fetchUserData,
  userHandle,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState(
    user ? { ...user, avatar: user.avatar || null } : null
  );
  const [originalUser, setOriginalUser] = useState({ ...user });
  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newAvatarUrl, setNewAvatarUrl] = useState(null); // To store new avatar URL

  useEffect(() => {
    if (user) {
      setEditableUser({ ...user, avatar: user.avatar || null });
    }
  }, [user]);

  const avatarProps = editableUser?.avatar;

  useEffect(() => {
    // Retrieve the username from local storage using userHandle
    const encryptedUsername = localStorage.getItem("encryptedUsername");
    if (encryptedUsername) {
      const bytes = CryptoJS.AES.decrypt(
        encryptedUsername,
        import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY
      );
      const decryptedUsername = bytes.toString(CryptoJS.enc.Utf8);

      // Fetch user data using the decrypted username
      fetchUserData(decryptedUsername).then((userData) => {
        setEditableUser(userData);
        setOriginalUser(userData);
      });
    }
  }, [userHandle]);

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    try {
      let updatedUserData = { ...editableUser };

      // If a new avatar is set, update the URL
      if (newAvatarUrl) {
        updatedUserData.avatar = newAvatarUrl;
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
          text: "User  information updated successfully!",
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
          {editableUser ? (
            <AvatarWithName userHandle={editableUser.username} size="100px" />
          ) : (
            <Avatar
              size={100}
              icon={<UserOutlined />}
              style={{ verticalAlign: "middle" }}
            />
          )}
        </div>

        <div className="user-info">
          <div className="user-info-column">
            <p className="label-user">Employee ID:</p>
            <Input
              placeholder="Employee ID"
              value={editableUser ? editableUser.empid : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("empid", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Name:</p>
            <Input
              placeholder="Enter Name"
              value={editableUser ? editableUser.name : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Division/Section:</p>
            <Input
              placeholder="Enter Division/Section"
              value={editableUser ? editableUser.division : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("division", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Designation:</p>
            <Input
              placeholder="Enter Designation"
              value={editableUser ? editableUser.designation : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("designation", e.target.value)}
              className="input-label"
            />
          </div>

          <div className="user-info-column">
            <p className="label-user">Email Address:</p>
            <Input
              placeholder="Enter Email Address"
              value={editableUser ? editableUser.email : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("email", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Office:</p>
            <Input
              placeholder="Enter Office"
              value={editableUser ? editableUser.office : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("office", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Region:</p>
            <Input
              placeholder="Enter Region"
              value={editableUser ? editableUser.region : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("region", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Permission:</p>
            <ConfigProvider
              theme={{
                components: {
                  Select: {
                    fontSize: 11,
                  },
                },
              }}
            >
              <Select
                value={editableUser ? editableUser.permission : "user"}
                className="select-permission"
                disabled={!isEditing}
                onChange={(value) => handleChange("permission", value)}
              >
                <Select.Option value="viewer">Viewer</Select.Option>
                <Select.Option value="contributor">Contributor</Select.Option>
                <Select.Option value="admin">Admin</Select.Option>
                <Select.Option value="developer">Developer</Select.Option>
              </Select>
            </ConfigProvider>
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
