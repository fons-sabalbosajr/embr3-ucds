import { Modal, Avatar, Input, Select, Button, Tabs, Table } from "antd";
import "./useraccountmodal.css";
import { UserOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";

const { TabPane } = Tabs;

const UserProfileModal = ({ user, visible, onCancel }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState({ ...user });
  const [originalUser, setOriginalUser] = useState({ ...user });

  useEffect(() => {
    setEditableUser({ ...user });
    setOriginalUser({ ...user });
  }, [user]);

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    setIsEditing(false);
    setOriginalUser({ ...editableUser });
  };

  const handleCancel = () => {
    if (isEditing) {
      Modal.confirm({
        title: "Cancel Editing",
        content:
          "Are you sure you want to cancel editing? Your changes will be discarded.",
        okText: "Yes",
        cancelText: "No",
        onOk: () => {
          setIsEditing(false);
          setEditableUser({ ...originalUser });
        },
      });
    } else {
      onCancel();
    }
  };

  const handleChange = (field, value) => {
    setEditableUser({
      ...editableUser,
      [field]: value,
    });
  };

  const recentChangesColumns = [
    {
      title: "Date",
      dataIndex: "date",
    },
    {
      title: "Change",
      dataIndex: "change",
    },
  ];

  const encodedDataColumns = [
    {
      title: "Key",
      dataIndex: "key",
    },
    {
      title: "Value",
      dataIndex: "value",
    },
  ];

  const statusDotClass =
    user && user.status === "online"
      ? "user-status-dot online"
      : "user-status-dot offline";

  return (
    <Modal
      title={
        <div className="modal-title-container">
          <span>User Profile</span>
          <div className="modal-title-line"></div>
        </div>
      }
      visible={visible}
      onCancel={handleCancel}
      footer={null} // No footer buttons by default
      width={1000} // Set the width of the modal
      className="user-profile-modal"
      zIndex={1001}
      closable={false}
    >
      <div className="user-details-container">
        {editableUser && (
          <div className="avatar-container">
            {editableUser.avatar ? (
              <Avatar size={150} src={user.avatar} icon={<UserOutlined />} />
            ) : (
              <Avatar
                size={150}
                className="user-status-item-avatar"
                style={{
                  fontSize: "50px",
                  backgroundColor: "#f56a00",
                  verticalAlign: "middle",
                }}
              >
                {editableUser.name ? editableUser.name[0] : ""}
              </Avatar>
            )}
            <div className={`user-status-dot ${editableUser.status}`} />
          </div>
        )}

        <div className="user-info">
          <div className="user-info-column">
            <p>Name:</p>
            <Input
              placeholder="Enter Name"
              value={editableUser ? editableUser.name : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <p>Designation:</p>
            <Input
              placeholder="Enter Designation"
              value={editableUser ? editableUser.designation : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("designation", e.target.value)}
            />
          </div>

          <div className="user-info-column">
            <p>Email Address:</p>
            <Input
              placeholder="Enter Email Address"
              value={editableUser ? editableUser.email : ""}
              disabled={!isEditing}
              onChange={(e) => handleChange("email", e.target.value)}
            />
            <p>Permission:</p>
            <Select
              value={editableUser ? editableUser.permission : "user"}
              style={{ width: 120 }}
              disabled={!isEditing}
              onChange={(value) => handleChange("permission", value)}
            >
              <Select.Option value="user">User</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          </div>
        </div>

      </div>

      <div className="tab-container">
        <Tabs defaultActiveKey="1" tabBarStyle={{ marginBottom: 0 }}>
          <TabPane tab="Recent Changes" key="1">
            <Table
              columns={recentChangesColumns}
              dataSource={[]} // Add your data source here
            />
          </TabPane>
          <TabPane tab="Encoded Data" key="2">
            <Table
              columns={encodedDataColumns}
              dataSource={[]} // Add your data source here
            />
          </TabPane>
        </Tabs>

        <div className="modal-footer-container">
          <Button type={isEditing ? "primary" : "default"} onClick={handleEdit}>
            {isEditing ? "Save" : "Edit"}
          </Button>
          <Button onClick={handleCancel}>
            {isEditing ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserProfileModal;
