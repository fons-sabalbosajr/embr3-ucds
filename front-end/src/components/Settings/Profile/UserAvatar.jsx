import React from "react";
import { Avatar } from "antd";
import DefaultAvatar from "../../DefaultAvatar";
import { API_BASE_URL } from "../../../config/api";

const UserAvatar = ({ userData }) => {
  if (!userData || !userData.username) {
    return <div>No user data available</div>;
  }
  const photo = typeof userData.avatar === "string" && userData.avatar ? userData.avatar : null;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {photo ? (
        <Avatar src={`${API_BASE_URL}${photo}`} size={100} style={{ marginRight: 8 }} />
      ) : (
        <DefaultAvatar name={userData.name || userData.username} size={100} style={{ marginRight: 8 }} />
      )}
    </div>
  );
};

export default UserAvatar;
