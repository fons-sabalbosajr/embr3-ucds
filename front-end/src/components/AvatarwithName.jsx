import React from "react";
import { Avatar } from "antd";
import { UserOutlined } from "@ant-design/icons";
import NiceAvatar from "react-nice-avatar"; // Adjust based on your avatar library


const AvatarWithName = ({ avatar, name }) => (
    <div style={{ display: "flex", alignItems: "center" }}>
      {avatar ? (
        <NiceAvatar
          style={{ width: 30, height: 30 }} // Adjust dimensions as needed
          {...avatar} // Pass avatar properties directly if compatible with NiceAvatar
        />
      ) : (
        <Avatar
          icon={<UserOutlined />}
          style={{ backgroundColor: "#87d068" }}
        >
          {name && name.charAt(0)}
        </Avatar>
      )}
      <span style={{ marginLeft: "8px" }}>{name}</span>
    </div>
  );
  

export default AvatarWithName;