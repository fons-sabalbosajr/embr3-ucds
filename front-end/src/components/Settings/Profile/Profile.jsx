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
} from "antd";
import {
  CameraFilled,
  UploadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import UserAvatar from "./UserAvatar"; // Fixed spacing
import "./profile.css";

const { Paragraph, Text } = Typography;

const Profile = ({ userHandle }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [division, setDivision] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [designation, setDesignation] = useState("");
  const [office, setOffice] = useState("");
  const [region, setRegion] = useState("");
  const [accountCreated, setAccountCreated] = useState("");
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadButtons, setShowUploadButtons] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(
          `http://localhost:8081/api/users?username=${userHandle}`
        );
        if (!response.ok) {
          throw new Error("User  not found");
        }
        const data = await response.json();
        setUserData(data[0]);
        setName(data[0].name);
        setDivision(data[0].division);
        setEmployeeId(data[0].employeeId);
        setFullName(data[0].fullName);
        setEmail(data[0].email);
        setPosition(data[0].position);
        setDesignation(data[0].designation);
        setOffice(data[0].office);
        setRegion(data[0].region);
        setAccountCreated(data[0].accountCreated);
      } catch (error) {
        setError(error.message);
        console.log("Error fetching user data:", error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userHandle]);

  const handlePhotoChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      const imageUrl = URL.createObjectURL(selectedFile);
      setPhoto({ file: selectedFile, url: imageUrl });
      setShowUploadButtons(true);
    }
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append("photo", photo.file);

    setUploading(true);
    setUploadProgress(0);

    try {
      const response = await fetch(`http://localhost:8081/api/users/update`, {
        method: "POST",
        body: formData,
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percent);
        },
      });

      if (!response.ok) {
        throw new Error("Failed to update user photo");
      }

      message.success("Profile photo updated successfully!");
      setShowUploadButtons(false);
      setPhoto(null);
    } catch (error) {
      message.error("Error updating photo: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    document.getElementById("file-input").click();
  };

  const handleCancel = () => {
    setPhoto(null);
    setShowUploadButtons(false);
    document.getElementById("file-input").value = ""; // Reset the file input
  };

  if (loading) {
    return <Spin tip="Loading..." />;
  }

  if (error) {
    return null;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  return (
    <div className="profile-container">
      <Row gutter={16} justify="center" className="row-avatar">
        <Col>
          <div className="avatar-container">
            {photo ? (
              <img src={photo.url} alt="Selected Photo " />
            ) : (
              <UserAvatar userData={userData} />
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
                  icon={<DeleteOutlined/>}
                >
                  Cancel
                </Button>
                {uploading && (
                  <Progress percent={uploadProgress} size="small" />
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
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="input-field"
              placeholder="Employee ID"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Full Name:</span>
            <Input
              value={name || "N/A"}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Full Name"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Email:</span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="Email Address"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Designation:</span>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="input-field"
              placeholder="Position"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Division:</span>
            <Input
              value={division}
              onChange={(e) => setDesignation(e.target.value)}
              className="input-field"
              placeholder="Designation"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Office:</span>
            <Input
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="input-field"
              placeholder="Office"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Region:</span>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="input-field"
              placeholder="Region"
              disabled
            />
          </Paragraph>
          <Paragraph className="paragraph-input">
            <span className="label-title-profile">Account Created:</span>
            <Input
              value={accountCreated}
              onChange={(e) => setAccountCreated(e.target.value)}
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
