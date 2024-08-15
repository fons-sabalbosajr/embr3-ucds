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
      overlayStyle={{ width: "600px", maxWidth: "800px", fontSize: "11px" }}
    >
      <Badge count={notifications.length} offset={[10, 0]}>
        <BellOutlined
          className={`notification-icon ${
            theme === "dark" ? "dark-theme" : "light-theme"
          }`}
        />
      </Badge>
    </Popover>
  );
};

export default NotificationsPopover;
