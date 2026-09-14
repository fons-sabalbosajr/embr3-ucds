import React, { useState, useEffect } from "react";
import { Modal, Avatar, Input, Button, Tag, Upload, Card } from "antd";
import { UserOutlined, UploadOutlined } from "@ant-design/icons";
import AvatarSelectionModalProfile from "../../../components/AvatarSelectionModalProfile";
import "./signaccountmodal.css";
import axios from "axios";
import Swal from "sweetalert2";
import { API_BASE_URL } from "../../../config/api";

const SignAccountModal = ({ user, visible, onCancel, onUpdate }) => {
  const [editableUser , setEditableUser ] = useState({
    name: '',
    email: '',
    division: '',
    status: '',
    username: '',
    password: '',
  });
  const [uploadAvatarVisible, setUploadAvatarVisible] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [generateUsername, setGenerateUsername] = useState("");
  const [generatePassword, setGeneratePassword] = useState("");
  const [approving, setApproving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    if (visible) {
      fetchPassword();
    }
  }, [visible]);

  const fetchPassword = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/generate-password`
      );
      const { password } = response.data;
      setGeneratePassword(password);
    } catch (error) {
      console.error("Error fetching password:", error);
    }
  };

  useEffect(() => {
    if (user && user.name) {
      const nameParts = user.name.split(" ");
      const firstName = nameParts[0] || ""; // Default to an empty string if undefined
      const lastName = nameParts[1] || ""; // Default to an empty string if undefined
      const firstLetter = firstName.charAt(0).toLowerCase();
      const surname = lastName.toLowerCase();
      const username = `${firstLetter}${surname}`;
      setGenerateUsername(username);
    } else {
      setGenerateUsername(""); // Fallback if user or user.name is undefined
    }
  }, [user]);

  const handleUploadAvatar = (file) => {
    setAvatarFile(file);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl); 
  };

  const handleSave = async () => {
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
        const { name, email, division, status } = editableUser ; // Use editableUser  for user details
        const username = generateUsername; // Using generated username
        const password = generatePassword; // Using generated password
  
        const formData = new FormData();
        if (avatarFile) {
          formData.append("avatar", avatarFile); // Append the actual file object here
        }
        formData.append("name", name);
        formData.append("email", email);
        formData.append("division", division);
        formData.append("status", status);
        formData.append("username", username);
        formData.append("password", password);
  
        // Add default values for other fields
        formData.append("canAccessRangePicker", false);
        formData.append("canGenerateData", false);
        formData.append("canManageData", false);
        formData.append("canViewAdminPanel", false);
        formData.append("canViewDataHistory", false);
        formData.append("designation", "n/a");
        formData.append("office", "n/a");
        formData.append("region", "n/a");
  
        // Step 1: Add user to 'users' collection
        const userResponse = await axios.post(
          `${API_BASE_URL}/api/newusers`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data', // Ensure correct content type
            },
          }
        );
  
        // The server sends the credentials email and says whether it went.
        // Before, the browser sent it through EmailJS after the fact and
        // reported success regardless — so an administrator was told the
        // credentials were on their way when nothing had been sent.
        if (userResponse.status === 201) {
          const { emailSent } = userResponse.data || {};
          Swal.fire({
            icon: emailSent ? "success" : "warning",
            title: emailSent ? "Account created" : "Account created — email not sent",
            text: emailSent
              ? `The sign-in details have been emailed to ${email}.`
              : `The account exists, but the credentials email to ${email} could not be sent. ` +
                `Pass the username and password on to the user another way, or ask them to use "Forgot your password?" on the sign-in page.`,
          });
          onCancel(); // Close the modal after successful save
        } else {
          console.error("Unexpected response status:", userResponse.status);
          Swal.fire({
            icon: "error",
            title: "Error!",
            text: "Failed to save user. Check server logs for details.",
          });
        }
      } catch (error) {
        console.error("Error saving user:", error);
        Swal.fire({
          icon: "error",
          title: "Error!",
          text: `Failed to save user. ${error.response ? error.response.data.error : "Please check server logs for details."}`,
        });
      } finally {
        setApproving(false); // Reset loading state
      }
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      console.log("User  canceled save action");
    }
  };


  useEffect(() => {
    if (user) {
      setEditableUser(user); // Update editableUser  when user prop changes
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditableUser({ ...editableUser, [name]: value });
  };

  return (
    <>
      <Modal
        title="User  Details"
        open={visible}
        onCancel={onCancel}
        footer={[
          <Button key="cancel" onClick={onCancel}>
            Cancel
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            Save
          </Button>,
        ]}
        width={800}
      >
        <div className={`modal-content ${document.body.classList.contains('dark') ? 'dark' : ''}`}>
          <div className="avatar-section">
            <Avatar
              src={avatarPreview || undefined}
              size={120}
              icon={<UserOutlined />}
              className="avatar"
            />
            <Button
              onClick={() => setUploadAvatarVisible(true)}
              className="change-avatar-btn"
              icon={<UploadOutlined />}
            ></Button>
          </div>
          <div className="user-details">
            <div>
              <label className="details-label">Name:</label>
              <Input
                name="name"
                value={editableUser.name || ""} // Provide a default value
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="details-label">Email:</label>
              <Input
                name="email"
                value={editableUser.email || ""} // Provide a default value
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="details-label">Division:</label>
              <Input
                name="division"
                value={editableUser.division || ""} // Provide a default value
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="details-label">Position:</label>
              <Input
                name="position"
                value={editableUser.position || ""} // Provide a default value
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="details-label">Status:</label>
              <Tag
                color={
                  editableUser.status === "approved"
                    ? "green"
                    : editableUser.status === "rejected"
                    ? "red"
                    : "orange"
                }
              >
                {editableUser.status || "Unknown"}{" "}
                {/* Provide a default value */}
              </Tag>
            </div>
          </div>

          <Card
            title="Create User Credentials"
            size="small"
            className="create-user-section"
          >
            <div className="generate-section">
              <p className="details-label">Generate Username:</p>
              <Input
                value={generateUsername}
                onChange={(e) => setGenerateUsername(e.target.value)} 
                className="generate-username-input"
              />
            </div>
            <div className="generate-section">
              <p className="details-label">Generate Password:</p>
              <Input.Password
                value={generatePassword}
                className="generate-password-input"
              />
              <Button
                onClick={fetchPassword}
                className="generate-password-btn"
                type="primary"
              >
                Generate
              </Button>
            </div>
          </Card>
        </div>
      </Modal>
      <AvatarSelectionModalProfile
        visible={uploadAvatarVisible}
        onCancel={() => setUploadAvatarVisible(false)}
        onUpload={handleUploadAvatar}
      />
    </>
  );
};

export default SignAccountModal;
