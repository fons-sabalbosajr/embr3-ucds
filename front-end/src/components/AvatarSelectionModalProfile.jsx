import React, { useState } from "react";
import { Modal, Avatar, Upload, message, Button, Progress } from "antd";
import NiceAvatar, { genConfig } from "react-nice-avatar";
import { SelectOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import domtoimage from "dom-to-image";
import download from "downloadjs";
import "./avatarselectionmodal.css";

const { Dragger } = Upload;

const AvatarSelectionModal = ({ visible, onSelect, onCancel, onUpload }) => {
  const [avatars, setAvatars] = useState(generateInitialAvatars());
  const [customAvatar, setCustomAvatar] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Function to generate initial random avatars
  function generateInitialAvatars() {
    const newAvatars = [];
    for (let i = 0; i < 10; i++) {
      newAvatars.push(genConfig());
    }
    return newAvatars;
  }

  const handleCustomUpload = async (file) => {
    setUploading(true);
    for (let percent = 0; percent <= 100; percent += 10) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setUploadProgress(percent);
    }
    const avatarUrl = URL.createObjectURL(file);
    setCustomAvatar(avatarUrl);
    setUploading(false);
    setUploadProgress(0);
    if (typeof onUpload === "function") {
      onUpload(avatarUrl); // Pass the URL to the parent component
    } else {
      console.error("onUpload is not a function");
    }
  };
  

  // Function to download avatar as image
  const handleDownloadAvatar = () => {
    const node = document.getElementById("avatar-container");

    // Use dom-to-image library to convert DOM node to image
    domtoimage
      .toPng(node)
      .then(function (dataUrl) {
        // Use downloadjs to trigger download of image file
        download(dataUrl, "avatar.png");
      })
      .catch(function (error) {
        console.error("Error generating avatar image:", error);
      });
  };

  const handleSelectAvatar = (config) => {
    if (typeof onSelect === "function") {
      onSelect(config); // Pass the avatar configuration object
    } else {
      console.error("onSelect is not a function");
    }
  };

  const handleCustomSelect = () => {
    if (typeof onSelect === "function" && customAvatar) {
      onSelect(customAvatar);
      setCustomAvatar(null);
    } else {
      console.error(
        "Custom avatar is not selected or onSelect is not a function"
      );
    }
  };

  // Function to generate new random avatars
  const handleGenerateRandomAvatars = () => {
    const newAvatars = generateInitialAvatars();
    setAvatars(newAvatars);
  };

  // Render the modal with avatars and custom upload
  return (
    <Modal
      title="Select or Upload an Avatar"
      visible={visible}
      onCancel={onCancel}
      footer={null}
      maskClosable={false} // Prevent closing modal on mask click
    >
      <div className="avatar-selection-container">
        <div className="avatar-grid">
          {avatars.map((config, index) => (
            <div
              key={index}
              className="avatar-grid-item"
              onClick={() => handleSelectAvatar(config)}
            >
              <NiceAvatar
                style={{ width: "80px", height: "80px" }}
                {...config}
              />
            </div>
          ))}
        </div>
        <Button
          onClick={handleGenerateRandomAvatars}
          className="generate-avatar-btn"
          type="primary"
          size="small"
        >
          Generate Avatar
        </Button>

        {/* Custom avatar upload section */}
        <div className="custom-avatar-container">
          <div className="custom-avatar-title">Or Upload a Custom Avatar</div>
          <div className="custom-avatar-upload">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleCustomUpload(e.target.files[0])}
              style={{ display: "none" }}
            />
            <div className="custom-avatar-buttons">
              <input
                id="avatar-upload-input"
                type="file"
                accept="image/*"
                onChange={(e) => handleCustomUpload(e.target.files[0])}
                style={{ display: "none" }}
              />
            </div>
            {customAvatar && (
              <>
                <Avatar id="avatar-container" size={100} src={customAvatar} />
                <Button
                  type="primary"
                  onClick={handleCustomSelect}
                  className="button-select-custom-avatar"
                  size="small"
                >
                  <UploadOutlined />
                </Button>
              </>
            )}
            {uploading && <Progress percent={uploadProgress} status="active" />}
          </div>
        </div>

        {/* Button to download avatar as image */}
        <div className="download-avatar-button">
          <Button
            className="custom-avatar-button"
            type="primary"
            size="small"
            onClick={() =>
              document.getElementById("avatar-upload-input").click()
            }
          >
            <SelectOutlined />
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={handleDownloadAvatar}
            className="btn-download"
          >
            <DownloadOutlined />
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AvatarSelectionModal;
