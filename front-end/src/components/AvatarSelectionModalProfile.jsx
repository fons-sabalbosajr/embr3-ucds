import React, { useState } from "react";
import { Modal, Upload, Button, Avatar } from "antd";
import { message } from "../shared/feedback";
import { UploadOutlined, UserOutlined } from "@ant-design/icons";

// Generate a default avatar using UI Avatars

const AvatarSelectionModalProfile = ({ visible, onCancel, onUpload }) => {
  const [photo, setPhoto] = useState(null); // State for storing the uploaded avatar preview

  const handleAvatarChange = (info) => {
    const file = info.file.originFileObj; // Get the uploaded file
    if (file) {
      setPhoto({
        file,
        url: URL.createObjectURL(file), // Create a local URL for preview
      });

      console.log("Image uploaded successfully!");
      console.log("File Name:", file.name);
      console.log("File Size:", file.size); // Size in bytes
      console.log("File Type:", file.type);
    }
  };

  const handleConfirmUpload = () => {
    if (!photo || !photo.file) {
      message.error("Please select an image to upload.");
      return;
    }

    // Pass the photo file to the parent component
    onUpload(photo.file); // Pass the actual file object
    message.success("Avatar selected successfully!");
    console.log("Uploaded Image File:", photo.file);
    onCancel(); // Close the modal after selecting the avatar
  };

  const handleCancel = () => {
    setPhoto(null);
    onCancel(); // Close the modal when cancel is clicked
  };

  const handleClear = () => {
    setPhoto(null);
  };

  const beforeUpload = (file) => {
    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      message.error("You can only upload image files!");
    }
    return isImage;
  };

  return (
    <Modal
      title="Please select an image to upload"
      visible={visible}
      onCancel={handleCancel}
      footer={[
        <Upload
          showUploadList={false}
          onChange={handleAvatarChange}
          beforeUpload={beforeUpload} // Ensure only image files are uploaded
          key="upload"
        >
          <Button
            type="primary"
            style={{ marginRight: 10 }}
          >
            {photo ? "Change Avatar" : "Upload Avatar"}
          </Button>
        </Upload>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirmUpload}
          disabled={!photo} // Disable Confirm button if no photo is uploaded
        >
          Confirm Avatar
        </Button>,
        <Button key="cancel" onClick={handleClear} disabled={!photo}>
          Clear
        </Button>,
      ]}
    >
      <div style={{ marginTop: 16, textAlign: "center" }}>
        {photo ? (
          <Avatar src={photo.url} size={100} />
        ) : (
          <Avatar size={100} icon={<UserOutlined />} />
        )}
      </div>
    </Modal>
  );
};

export default AvatarSelectionModalProfile;