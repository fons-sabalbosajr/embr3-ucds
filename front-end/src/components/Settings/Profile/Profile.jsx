import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Button, Input, Typography, Progress, Skeleton, Empty } from "antd";
import { message } from "../../../shared/feedback";
import {
  CameraFilled,
  UploadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import CryptoJS from "crypto-js";
import "./profile.css";
import { fetchUserDetails, uploadUserPhoto } from "../../../api/userService";
import { API_BASE_URL } from "../../../config/api";

const { Paragraph } = Typography;

const Profile = ({ username }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadButtons, setShowUploadButtons] = useState(false);

  const encryptionKey = import.meta.env.VITE_CRYPTOJS_ENCRYPTION_KEY;

  // Load from localStorage
  useEffect(() => {
    const encrypted = localStorage.getItem("ucds_user_profile");
    if (encrypted && encryptionKey) {
      try {
        const bytes = CryptoJS.AES.decrypt(encrypted, encryptionKey);
        const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        if (decrypted && decrypted.username === username) {
          setUserData(decrypted);
          setLoading(false);
        }
      } catch (err) {
        console.warn("Failed to decrypt user profile from cache.");
      }
    }
  }, [username, encryptionKey]);

  const fetchUserData = useCallback(async () => {
    setFetching(true);
    try {
      const data = await fetchUserDetails(username);
      setUserData(data);
      if (encryptionKey) {
        const encrypted = CryptoJS.AES.encrypt(
          JSON.stringify(data),
          encryptionKey
        ).toString();
        localStorage.setItem("ucds_user_profile", encrypted);
      }
    } catch (error) {
      message.error("Error fetching user details.");
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [username, encryptionKey]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handlePhotoChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setPhoto({ file, url: URL.createObjectURL(file) });
      setShowUploadButtons(true);
    }
  };

  const handleUpload = async () => {
    if (!photo?.file) {
      message.error("Please select an image to upload.");
      return;
    }
    setUploading(true);
    try {
      const updatedUser = await uploadUserPhoto(username, photo.file);
      setUserData(updatedUser);
      if (encryptionKey) {
        const encrypted = CryptoJS.AES.encrypt(
          JSON.stringify(updatedUser),
          encryptionKey
        ).toString();
        localStorage.setItem("ucds_user_profile", encrypted);
      }
      message.success("Profile photo updated successfully!");
      setPhoto(null);
      setShowUploadButtons(false);
    } catch (error) {
      message.error(error.message || "Failed to update photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setPhoto(null);
    setShowUploadButtons(false);
    document.getElementById("file-input").value = "";
  };

  const triggerFileInput = () => {
    document.getElementById("file-input").click();
  };

  const renderProfileField = (label, value) => {
    if (!value || value.trim() === "") return null;
    return (
      <Paragraph className="paragraph-input">
        <span className="label-title-profile">{label}</span>
        <Input value={value} className="input-field" readOnly />
      </Paragraph>
    );
  };

  if (loading || fetching) {
    return (
      <div className="profile-container">
        <Skeleton.Avatar size={80} shape="circle" active />
        <Skeleton paragraph={{ rows: 6 }} active />
      </div>
    );
  }

  if (!userData) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Empty description="No user data found" />
      </div>
    );
  }

  return (
    <div className="profile-container">
      <Row gutter={16} className="row-avatar">
        <Col>
          <div className="avatar-container">
            <img
              src={
                photo ? photo.url : `${API_BASE_URL}${userData.avatar}`
              }
              alt="Profile Avatar"
              className="profile-avatar"
            />
          </div>
          <div className="button-container">
            <input
              type="file"
              accept="image/*"
              id="file-input"
              onChange={handlePhotoChange}
              style={{ display: "none" }}
            />
            <Button
              type="primary"
              onClick={triggerFileInput}
              size="small"
              icon={<CameraFilled />}
              className="button-avatar"
            >
              Update Photo
            </Button>
          </div>
        </Col>
      </Row>

      {showUploadButtons && (
        <Row gutter={16} justify="center" className="button-row-avatar">
          <Col>
            <Button
              type="primary"
              size="small"
              onClick={handleUpload}
              loading={uploading}
              icon={<UploadOutlined />}
              style={{ marginRight: 8 }}
            >
              Upload
            </Button>
            <Button
              type="primary"
              danger
              size="small"
              onClick={handleCancel}
              icon={<DeleteOutlined />}
            >
              Cancel
            </Button>
            {uploading && (
              <Progress percent={50} size="small" style={{ marginTop: 8 }} />
            )}
          </Col>
        </Row>
      )}

      <Row gutter={16} justify="left">
        <Col span={24} className="profile-info">
          {renderProfileField("Employee ID:", userData.empid)}
          {renderProfileField("Full Name:", userData.name)}
          {renderProfileField("Email:", userData.email)}
          {renderProfileField("Designation:", userData.designation)}
          {renderProfileField("Division:", userData.division)}
          {renderProfileField("Office:", userData.office)}
          {renderProfileField("Region:", userData.region)}
          {renderProfileField("Account Created:", userData.accountCreated)}
        </Col>
      </Row>
    </div>
  );
};

export default Profile;
