import React, { useState, useEffect } from "react";
import { Row, Col, Button, Input, Typography, Progress } from "antd";
import {
  CameraFilled,
  UploadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import "./profile.css"; // Import the CSS file

const { Paragraph } = Typography;

const Profile = ({ username }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadButtons, setShowUploadButtons] = useState(false);

  // Fetch user data based on username
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(
          `http://localhost:8081/api/users?username=${username}`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          setUserData(data[0]); // Assume the first result is the correct user
        } else {
          console.error("No user data found for the given username.");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [username]);

  const handlePhotoChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setPhoto({
        file,
        url: URL.createObjectURL(file),
      });
      setShowUploadButtons(true);
    }
  };

  const handleUpload = () => {
    setUploading(true);
    // Simulate upload process
    setTimeout(() => {
      setUploading(false);
      setShowUploadButtons(false);
      console.log("Photo uploaded successfully!");
    }, 2000);
  };

  const handleCancel = () => {
    setPhoto(null);
    setShowUploadButtons(false);
  };

  const triggerFileInput = () => {
    document.getElementById("file-input").click();
  };

  if (loading) {
    return <p>Loading user data...</p>;
  }

  if (!userData) {
    return <p>No user data found.</p>;
  }

  return (
    <div className="profile-container">
      <Row gutter={16} justify="center" className="row-avatar">
        <Col>
          <div className="avatar-container">
            {photo ? (
              <img
                src={photo.url}
                alt="Selected Photo"
                className="profile-avatar"
              />
            ) : (
              <img
                src={`http://localhost:8081${userData.avatar}`}
                alt="Profile Avatar"
                className="profile-avatar"
              />
            )}
          </div>
        </Col>
      </Row>
      <Row gutter={16} justify="center" className="row-avatar">
        <Col span={24}>
          <input
            type="file"
            accept="image/*"
            id="file-input"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
          <div className="button-container">
            <Button
              type="primary"
              onClick={triggerFileInput}
              className="save-button"
              size="small"
              icon={<CameraFilled />}
            >
              Update Photo
            </Button>
            {showUploadButtons && (
              <>
                <Button
                  type="primary"
                  size="small"
                  onClick={handleUpload}
                  loading={uploading}
                  icon={<UploadOutlined />}
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
                  <Progress percent={uploading ? 50 : 100} size="small" />
                )}
              </>
            )}
          </div>
        </Col>
      </Row>
      <Row gutter={16} justify="left">
        <Col span={24} className="profile-info">
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Employee ID:</span>
            <Input
              value={userData.empid || ""}
              className="input-field"
              placeholder="Employee ID"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Full Name:</span>
            <Input
              value={userData.name || "N/A"}
              className="input-field"
              placeholder="Full Name"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Email:</span>
            <Input
              value={userData.email || ""}
              className="input-field"
              placeholder="Email Address"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Designation:</span>
            <Input
              value={userData.designation || ""}
              className="input-field"
              placeholder="Designation"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Division:</span>
            <Input
              value={userData.division || ""}
              className="input-field"
              placeholder="Division"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Office:</span>
            <Input
              value={userData.office || ""}
              className="input-field"
              placeholder="Office"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Region:</span>
            <Input
              value={userData.region || ""}
              className="input-field"
              placeholder="Region"
              readOnly
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Account Created:</span>
            <Input
              value={userData.accountCreated || ""}
              className="input-field"
              placeholder="Account Created"
              readOnly
            />
          </Paragraph>
        </Col>
      </Row>
    </div>
  );
};

export default Profile;
