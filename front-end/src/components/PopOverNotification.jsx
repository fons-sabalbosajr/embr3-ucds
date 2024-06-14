import React from 'react';
import { Popover, Badge } from 'antd';
import { BellOutlined } from '@ant-design/icons';

const NotificationsPopover = ({ popoverContent, theme, notifications }) => {
  return (
    <Popover
      content={popoverContent}
      title="Notifications"
      trigger="click"
      placement="bottomRight"
      overlayStyle={{ width: "600px", maxWidth: "800px" }}
    >
      <Badge count={notifications.length} offset={[10, 0]}>
        <BellOutlined
          className={`notification-icon ${
            theme === "light" ? "light-theme-icon" : "dark-theme-icon"
          }`}
        />
      </Badge>
    </Popover>
  );
};

export default NotificationsPopover;
