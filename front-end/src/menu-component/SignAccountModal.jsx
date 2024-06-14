import React, { useState, useEffect } from "react";
import { Modal, Avatar, Input, Button, Divider, Tooltip } from "antd";
import AvatarSelectionModal from "../components/AvatarSelectionModal";
import { UserOutlined, UploadOutlined } from "@ant-design/icons";
import "./signaccountmodal.css";
import axios from "axios";
import Swal from "sweetalert2";

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
  const [selectedAvatar, setSelectedAvatar] = useState(null); // State to store selected avatar URL
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchPassword();
    }
  }, [visible]);

  const fetchPassword = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8081/api/generate-password"
      );
      const { password } = response.data;
      setGeneratePassword(password);
    } catch (error) {
      console.error("Error fetching password:", error);
    }
  };

  useEffect(() => {
    if (user) {
      const firstName = user.name.split(" ")[0]; // Assuming first part is first name
      const lastName = user.name.split(" ")[1]; // Assuming second part is last name
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
          "http://localhost:8081/api/newusers",
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
          `http://localhost:8081/api/status/${response.data.user._id}`
        );

        console.log(
          "Status updated in sign-up collection:",
          updateResponse.data
        );

        // Handle success based on both requests
        if (userResponse.status === 201 && updateResponse.status === 200) {
          Swal.fire({
            icon: "success",
            title: "Success!",
            text: "User saved and approved successfully.",
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

        // Check if the error response indicates user was saved
        if (error.response && error.response.data && error.response.data.user) {
          Swal.fire({
            icon: "success",
            title: "Success!",
            text: "User saved successfully despite an error.",
          });
          onCancel(); // Close the modal after successful save
        } else {
          Swal.fire({
            icon: "error",
            title: "Error!",
            text: `Failed to save user. ${
              error.response
                ? error.response.data.error
                : "Please check server logs for details."
            }`,
          });
        }
      } finally {
        setApproving(false); // Reset loading state
      }
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Handle cancel action
      console.log("User canceled save action");
    }
  };

  const handleAvatarSelect = (avatarUrl) => {
    setSelectedAvatar(avatarUrl); // Update selectedAvatar state with the chosen URL
    setAvatarModalVisible(false); // Close the avatar selection modal
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
              <NiceAvatar
                style={{ width: 150, height: 150 }}
                src={selectedAvatar}
                className="avatar"
              />
            ) : (
              <Avatar
                size={150}
                icon={<UserOutlined />}
                style={{ marginBottom: 10 }}
              />
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
            onSelectAvatar={handleAvatarSelect} // Pass handleAvatarSelect function as a prop
          />
        </div>
      )}
    </Modal>
  );
};

export default SignAccountModal;
