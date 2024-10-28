import React from 'react';
import NiceAvatar from "react-nice-avatar";

const UserAvatar = ({ userData }) => {
  // Check if userData is provided and contains username
  if (!userData || !userData.username) {
    return <div>No user data available</div>; // Fallback message
  }

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
    <NiceAvatar
      style={{ width: "100px", height: "100px", marginRight: "8px" }}
      {...userData.avatar}
    />
  </div>
  );
};

export default UserAvatar;