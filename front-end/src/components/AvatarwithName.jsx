import React from "react";
import { Avatar } from "antd";
import NiceAvatar from "react-nice-avatar"; // Assuming you are using this library for avatars

const AvatarWithName = ({ avatar, name }) => {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <NiceAvatar
        style={{ width: "30px", height: "30px", marginRight: "8px" }}
        {...avatar}
      />
      <span>{name}</span>
    </div>
  );
};

export default AvatarWithName;
