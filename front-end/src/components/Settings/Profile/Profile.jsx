import React, { useEffect, useState } from "react";
import {
  Typography,
  Row,
  Col,
  Spin,
  Input,
  Button,
  message,
  Progress,
  Skeleton,
} from "antd";
import {
  CameraFilled,
  UploadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import "./profile.css";

const { Paragraph } = Typography;

const Profile = ({ userHandle, prefetchedUserData }) => {
  const [userData, setUserData] = useState(prefetchedUserData || null);
  const [loading, setLoading] = useState(!prefetchedUserData); // Only load if not prefetched
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadButtons, setShowUploadButtons] = useState(false);

  useEffect(() => {
    if (prefetchedUserData) return; // Skip fetching if data is already prefetched

    const fetchUserData = async () => {
      try {
        const response = await fetch(
          `http://localhost:8081/api/users?username=${userHandle}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch user data");
        }
        const data = await response.json();
        setUserData(data[0]);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userHandle, prefetchedUserData]);

  // Handle photo change
  const handlePhotoChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setPhoto({
        file,
        url: URL.createObjectURL(file), // Create a local URL for preview
      });
      setShowUploadButtons(true);
    }
  };

  // Handle photo upload
  const handleUpload = async () => {
    if (!photo || !photo.file) {
      message.error("Please select an image to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("photo", photo.file);
    formData.append("username", userHandle);

    setUploading(true);

    try {
      const response = await fetch(`http://localhost:8081/api/users/update`, {
        method: "POST",
        body: formData,
      });

      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(responseBody.message || "Failed to update user photo");
      }

      setUserData((prevData) => ({
        ...prevData,
        avatar: responseBody.avatar, // Update avatar URL in user data
      }));
      setPhoto(null); // Clear photo state after successful upload
      message.success("Profile photo updated successfully!");
    } catch (error) {
      console.error(error);
      message.error("Error updating photo: " + error.message);
    } finally {
      setUploading(false);
      setShowUploadButtons(false);
    }
  };

  // Trigger file input
  const triggerFileInput = () => {
    document.getElementById("file-input").click();
  };

  // Handle cancel photo upload
  const handleCancel = () => {
    setPhoto(null);
    setShowUploadButtons(false);
    document.getElementById("file-input").value = ""; // Reset the file input
  };

  // Render loading state
  if (loading) {
    return <Skeleton active />;
  }

  // Render error state
  if (error) {
    return <div>Error: {error}</div>;
  }

  // Render no user data state
  if (!userData) {
    return <div>No user data available.</div>;
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
        <Col span={24}>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Employee ID:</span>
            <Input
              value={userData.empid || ""}
              className="input-field"
              placeholder="Employee ID"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Full Name:</span>
            <Input
              value={userData.name || "N/A"}
              className="input-field"
              placeholder="Full Name"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Email:</span>
            <Input
              value={userData.email || ""}
              className="input-field"
              placeholder="Email Address"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Designation:</span>
            <Input
              value={userData.designation || ""}
              className="input-field"
              placeholder="Designation"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Division:</span>
            <Input
              value={userData.division || ""}
              className="input-field"
              placeholder="Division"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Office:</span>
            <Input
              value={userData.office || ""}
              className="input-field"
              placeholder="Office"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Region:</span>
            <Input
              value={userData.region || ""}
              className="input-field"
              placeholder="Region"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Account Created:</span>
            <Input
              value={userData.accountCreated || ""}
              className="input-field"
              placeholder="Account Created"
              disabled
            />
          </Paragraph>
        </Col>
      </Row>
    </div>
  );
};

export default Profile;
