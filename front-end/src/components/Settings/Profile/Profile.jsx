import React, { useEffect, useState } from "react";
import {
  Button,
  Spin,
  Typography,
  message,
  Input,
  Tabs,
  Row,
  Col,
  Divider,
  Form,
  Modal, Upload
} from "antd";
import { SaveOutlined, CameraOutlined } from "@ant-design/icons";
import axios from "axios";
import AvatarWithName from "../../AvatarwithName";
import "./profile.css";

const { TabPane } = Tabs;

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [form] = Form.useForm();
  const [avatarFile, setAvatarFile] = useState(null);

  
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axios.get("https://embr3-ucds.onrender.com/current-user");
        setUser(response.data);
        form.setFieldsValue(response.data);
      } catch (error) {
        message.error("Failed to fetch user information");
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [form]);

  const handleProfileUpdate = async (values) => {
    try {
      await axios.put(
        `https://embr3-ucds.onrender.com/api/profile/update/${user._id}`,
        values
      );
      message.success("Profile updated successfully");

      // Fetch updated user data after successful update
      fetchUser(); // Reload the updated data
    } catch (error) {
      message.error("Failed to update profile");
      console.error("Error updating profile:", error);
    }
  };

  const confirmSaveChanges = () => {
    Modal.confirm({
      title: "Confirm Changes",
      content: "Are you sure you want to save these changes?",
      okText: "Yes",
      cancelText: "No",
      onOk: () => {
        form.submit();
      },
    });
  };


  const handleFileChange = (info) => {
    if (info.file.status === "done") {
      message.success("Avatar updated successfully");
      setAvatarFile(null);
      fetchUser(); // Reload user data to reflect the new avatar
    } else if (info.file.status === "error") {
      message.error("Failed to update avatar");
    }
  };

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      await axios.post(`https://embr3-ucds.onrender.com/api/profile/upload-avatar/${user._id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      message.success("Avatar uploaded successfully");
      fetchUser(); // Reload user data to reflect the new avatar
    } catch (error) {
      message.error("Failed to upload avatar");
      console.error("Error uploading avatar:", error);
    }
  };


  // Fetch user function (for reloading updated data)
  const fetchUser = async () => {
    try {
      const response = await axios.get("https://embr3-ucds.onrender.com/current-user");
      setUser(response.data);
      form.setFieldsValue(response.data);
    } catch (error) {
      message.error("Failed to fetch user information");
      console.error("Error fetching user data:", error);
    }
  };

  if (loading) {
    return <Spin tip="Loading..." />;
  }

  const [division, designation] = user.division
    ? user.division.split("/").map((item) => item.trim())
    : ["", ""];

  return (
    <div className="profile-container">
      <Tabs
        defaultActiveKey="1"
        size="large"
        tabPosition="top"
        className="profile-tabs"
      >
        <TabPane tab="General" key="1">
          <Row gutter={24} className="profile-header">
            <Col span={24} md={8} className="profile-avatar-col">
              <div className="avatar-container">
                <div className="avatar-wrapper">
                  <AvatarWithName avatar={user.avatar} size={150} />
                  <div className="change-avatar-btn">
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleUpload(file);
                        return false; // Prevent auto-upload
                      }}
                      onChange={handleFileChange}
                    >
                      <CameraOutlined />
                    </Upload>
                  </div>
                </div>
                <Input
                  id="file-input"
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <p className="avatar-details">
                  {user.name} <br />@{user.username} <br />
                  {division} <br />
                  {designation}
                </p>
              </div>
            </Col>
            <Col span={24} md={16}>
              <div className="profile-details">
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleProfileUpdate}
                >
                  <Form.Item
                    label="Name"
                    name="name"
                    rules={[{ message: "Please enter your name" }]}
                  >
                    <Input placeholder="Enter your name" />
                  </Form.Item>
                  <Form.Item
                    label="Username"
                    name="username"
                    rules={[
                      {
                        message: "Please enter your username",
                      },
                    ]}
                  >
                    <Input placeholder="Enter your username" />
                  </Form.Item>
                  <Form.Item
                    label="Division/Designation"
                    name="division"
                    rules={[
                      {
                        message: "Please enter your division/designation",
                      },
                    ]}
                  >
                    <Input placeholder="Enter your division and designation" />
                  </Form.Item>
                  <Form.Item
                    label="Email Address"
                    name="email"
                    rules={[{ message: "Please enter your email" }]}
                  >
                    <Input type="email" placeholder="Enter your email" />
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={confirmSaveChanges}
                    >
                      Update
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            </Col>
          </Row>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default Profile;
