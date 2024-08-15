import React, { useState, useEffect } from "react";
import { Modal, Avatar, Input, Button, Divider, Tooltip } from "antd";
import AvatarSelectionModal from "../components/AvatarSelectionModalProfile";
import { UserOutlined, UploadOutlined } from "@ant-design/icons";
import "./signaccountmodal.css";
import NiceAvatar from "react-nice-avatar";
import axios from "axios";
import Swal from "sweetalert2";
import emailjs from "emailjs-com"; // Add this import

const getStatusColor = (status) => {
  switch (status) {
    case "Approved":
      return "#52c41a"; // Green
    case "Pending":
      return "#faad14"; // Yellow
    default:
      return "#87d068"; // Default background color
  }
};

const SignAccountModal = ({ user, visible, onCancel }) => {
  const [generateUsername, setGenerateUsername] = useState("");
  const [generatePassword, setGeneratePassword] = useState("");
  const [approving, setApproving] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchPassword();
    }
  }, [visible]);

  const fetchPassword = async () => {
    try {
      const response = await axios.get(
        "https://embr3-ucds.onrender.com/api/generate-password"
      );
      const { password } = response.data;
      setGeneratePassword(password);
    } catch (error) {
      console.error("Error fetching password:", error);
    }
  };

  useEffect(() => {
    if (user) {
      const firstName = user.name.split(" ")[0];
      const lastName = user.name.split(" ")[1];
      const firstLetter = firstName.charAt(0).toLowerCase();
      const surname = lastName.toLowerCase();
      const username = `${firstLetter}${surname}`;
      setGenerateUsername(username);
    }
  }, [user]);

  const handleApprove = async () => {
    const result = await Swal.fire({
      title: "Confirm Save",
      text: "Are you sure you want to save this user?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, save it",
      cancelButtonText: "No, cancel",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      setApproving(true); // Set loading state

      try {
        const { name, email, division, status } = user;
        const username = generateUsername; // Using generated username
        const password = generatePassword; // Using generated password

        // Step 1: Add user to 'users' collection
        const userResponse = await axios.post(
          "https://embr3-ucds.onrender.com/api/newusers",
          {
            name,
            email,
            division,
            status,
            username,
            password,
          }
        );

        console.log("User saved response:", userResponse.data);

        // Step 2: Update status in 'sign-up' collection
        const updateResponse = await axios.put(
          `https://embr3-ucds.onrender.com/api/status/${user._id}`
        );

        console.log(
          "Status updated in sign-up collection:",
          updateResponse.data
        );

        // Handle success based on both requests
        if (userResponse.status === 201 && updateResponse.status === 200) {
          // Send credentials email to the user
          await sendCredentialsEmail(email, username, password);

          Swal.fire({
            icon: "success",
            title: "Success!",
            text: "User saved and approved successfully. Credentials have been sent to the user's email.",
          });
          onCancel(); // Close the modal after successful save
        } else {
          console.error("Unexpected response status:", userResponse.status);
          Swal.fire({
            icon: "error",
            title: "Error!",
            text: "Failed to save user or update status. Check server logs for details.",
          });
        }
      } catch (error) {
        console.error("Error saving user:", error);

        Swal.fire({
          icon: "error",
          title: "Error!",
          text: `Failed to save user. ${
            error.response
              ? error.response.data.error
              : "Please check server logs for details."
          }`,
        });
      } finally {
        setApproving(false); // Reset loading state
      }
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Handle cancel action
      console.log("User canceled save action");
    }
  };

  const sendCredentialsEmail = async (email, username, password) => {
    // Environment variables
    const serviceId = "service_0etqm0f";
    const templateId = "template_b72q5bm";
    const publicKey = "bgYF-06ZE7QHB5_lJ";

    if (!serviceId || !templateId || !publicKey) {
      console.error("Missing EmailJS configuration");
      return;
    }

    const templateParams = {
      to_email: email,
      username,
      password,
    };

    try {
      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      console.log("Credentials email sent successfully!");
    } catch (error) {
      console.error("Error sending credentials email:", error);
    }
  };

  const handleAvatarSelect = (config) => {
    setSelectedAvatar(config); // Store the entire configuration object
    setAvatarModalVisible(false); // Close the avatar selection modal
  };

  const handleAvatarUpload = (avatarUrl) => {
    setSelectedAvatar({ src: avatarUrl });
  };

  return (
    <Modal
      title="User Details"
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
    >
      {user && (
        <div className="modal-content">
          <div className="avatar-section">
            {selectedAvatar ? (
              <Avatar size={150} src={selectedAvatar.src} />
            ) : (
              <Avatar size={150} icon={<UserOutlined />} />
            )}
            <Tooltip title="Change Avatar">
              <Button
                shape="rounded"
                icon={<UploadOutlined />}
                onClick={() => setAvatarModalVisible(true)}
                className="change-avatar-btn"
              />
            </Tooltip>
            <div className="user-details">
              <p className="details-label">Name:</p>
              <Input value={user.name} readOnly className="detail-input" />
              <p className="details-label">Email:</p>
              <Input value={user.email} readOnly className="detail-input" />
              <p className="details-label">Division/Section:</p>
              <Input value={user.division} readOnly className="detail-input" />
              <p className="details-label">Approval Status:</p>
              <span style={{ color: getStatusColor(user.status) }}>
                {user.status}
              </span>
            </div>
          </div>
          <Divider className="section-divider" />

          <div className="create-user-section">
            <h3 className="credential-label">Create User Credentials</h3>
            <div className="generate-section">
              <p className="details-label">Generate Username:</p>
              <Input
                value={generateUsername}
                className="generate-username-input"
                readOnly
              />
            </div>
            <div className="generate-section">
              <p className="details-label">Generate Password:</p>
              <Input.Password
                value={generatePassword}
                className="generate-password-input"
                readOnly
              />
              <Button onClick={fetchPassword} className="generate-password-btn">
                Generate
              </Button>
            </div>
          </div>

          <div style={{ marginTop: "24px", textAlign: "right" }}>
            <Button onClick={onCancel} style={{ marginRight: "8px" }}>
              Cancel
            </Button>
            <Button type="primary" onClick={handleApprove} loading={approving}>
              Approve
            </Button>
          </div>

          <AvatarSelectionModal
            visible={avatarModalVisible}
            onCancel={() => setAvatarModalVisible(false)}
            onSelect={handleAvatarSelect}
            onUpload={handleAvatarUpload}
          />
        </div>
      )}
    </Modal>
  );
};

export default SignAccountModal;
