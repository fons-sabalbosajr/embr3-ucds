import React from "react";
import { Avatar } from "antd";
import { UserOutlined } from "@ant-design/icons";
import NiceAvatar from "react-nice-avatar"; // Ensure this is the correct import for your avatar library

const AvatarWithName = ({ avatar, name, size = 30 }) => {
  const renderNiceAvatar = () => (
    <NiceAvatar
      style={{ width: size, height: size }} // Use size prop
      {...avatar} // Pass avatar properties directly
    />
  );

  const renderDefaultAvatar = () => (
    <Avatar
      icon={<UserOutlined />}
      style={{ backgroundColor: "#87d068", width: size, height: size }} // Use size prop
    />
  );

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {avatar ? renderNiceAvatar() : renderDefaultAvatar()}
      <span style={{ marginLeft: 8 }}>{name}</span> {/* Display the name */}
    </div>
  );
};

export default AvatarWithName;
