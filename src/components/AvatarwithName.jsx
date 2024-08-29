import React from 'react';
import { Avatar } from "antd";
import { UserOutlined } from "@ant-design/icons";
import NiceAvatar from "react-nice-avatar";

const AvatarWithName = ({ avatar }) => {
  if (!avatar) {
    return <NiceAvatar style={{ width: '30px', height: '30px' }} />;
  }
  return <NiceAvatar style={{ width: '30px', height: '30px' }} {...avatar} />; // Spread the avatar object
};

export default AvatarWithName;