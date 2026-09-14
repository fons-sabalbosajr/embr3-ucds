import { Avatar, Input, Button, Tabs, Table, Progress, Tag } from "antd";
import { message } from "../../../shared/feedback";
import "./useraccountmodal.css";
import { UserOutlined, CameraOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import AvatarSelectionModal from "../../../components/AvatarSelectionModalProfile";
import { accountType } from "../../../shared/accountTypes";
import AvatarWithName from "../../../components/AvatarwithName";
import CryptoJS from "crypto-js";
import { API_BASE_URL } from "../../../config/api";

const { TabPane } = Tabs;

const UserAccountModal = ({ userHandle, user, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState(
    user ? { ...user, avatar: user.avatar || null } : null
  );
  const [originalUser, setOriginalUser] = useState({ ...user });
  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newAvatarUrl, setNewAvatarUrl] = useState(null); // To store new avatar URL
  const [loading, setLoading] = useState(false);

  const fetchUserData = async (username = editableUser?.username) => {
    if (!username) return null;
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/users?username=${username}`
      );
      if (response.data && response.data.length > 0) {
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error("Error fetching user data:", error);
      return null;
    }
  };

  // Handler for uploading avatar
  const handleAvatarChange = (info) => {
    if (info.file.status === "uploading") {
      setUploading(true);
    }
    if (info.file.status === "done") {
      message.success(`${info.file.name} file uploaded successfully`);
      setNewAvatarUrl(info.file.response?.url); // Assuming the response contains the new avatar URL
      setUploading(false);
    } else if (info.file.status === "error") {
      message.error(`${info.file.name} file upload failed.`);
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      // Show loading indicator
      Swal.fire({
        title: "Saving...",
        text: "Please wait while we update the user info.",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
  
      let updatedUserData = { ...editableUser };
  
      if (newAvatarUrl) {
        updatedUserData.avatar = newAvatarUrl;
      }
  
      const response = await axios.put(
        `${API_BASE_URL}/api/users/${editableUser._id}`,
        updatedUserData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
  
      Swal.close(); // Close loading indicator after response
  
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
        const refreshed = await fetchUserData();
        if (refreshed) setEditableUser(refreshed);
      }
    } catch (error) {
      Swal.close(); // Close loading if error occurs
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
  

  const handleEdit = () => {
    setIsEditing(true);
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
      onClose?.();
    }
  };

  const handleAvatarModal = () => {
    setIsAvatarModalVisible(true);
  };

  const handleAvatarModalClose = () => {
    setIsAvatarModalVisible(false);
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

  useEffect(() => {
    if (userHandle) {
      const encryptedUsername = localStorage.getItem("encryptedUsername");
      if (encryptedUsername) {
        const bytes = CryptoJS.AES.decrypt(
          encryptedUsername,
          import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY // Ensure this is available in your environment
        );
        const decryptedUsername = bytes.toString(CryptoJS.enc.Utf8);

        setLoading(true);
        fetchUserData(decryptedUsername)
          .then((userData) => {
            setEditableUser(userData);
            setOriginalUser(userData); // Keep original data for comparison
          })
          .catch((error) => {
            console.error("Error fetching user data:", error);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    }
  }, [userHandle]);

  if (!user) return null;

 return (
    <div className="profile-container">
      <div className="profile-top-section">
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

        <div className="user-info-columns-container">
          <div className="user-info-column">
            <p className="label-user">Employee ID:</p>
            <Input
              placeholder="Employee ID"
              value={editableUser ? editableUser.empid : ""}
              onChange={(e) => handleChange("empid", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Name:</p>
            <Input
              placeholder="Enter Name"
              value={editableUser ? editableUser.name : ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Division/Section:</p>
            <Input
              placeholder="Enter Division/Section"
              value={editableUser ? editableUser.division : ""}
              onChange={(e) => handleChange("division", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Designation:</p>
            <Input
              placeholder="Enter Designation"
              value={editableUser ? editableUser.designation : ""}
              onChange={(e) => handleChange("designation", e.target.value)}
              className="input-label"
            />
          </div>

          <div className="user-info-column">
            <p className="label-user">Email Address:</p>
            <Input
              placeholder="Enter Email Address"
              value={editableUser ? editableUser.email : ""}
              onChange={(e) => handleChange("email", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Office:</p>
            <Input
              placeholder="Enter Office"
              value={editableUser ? editableUser.office : ""}
              onChange={(e) => handleChange("office", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Region:</p>
            <Input
              placeholder="Enter Region"
              value={editableUser ? editableUser.region : ""}
              onChange={(e) => handleChange("region", e.target.value)}
              className="input-label"
            />
            <p className="label-user">Account type:</p>
            {/* Read-only here. The type is set by the Developer under Edit Access,
                which also designates storage containers. */}
            <Tag color={accountType(editableUser?.permission).color} style={{ marginTop: 4 }}>
              {accountType(editableUser?.permission).label}
            </Tag>
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
    </div>
  );
};

export default UserAccountModal;
