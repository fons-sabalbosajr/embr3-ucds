import React, { useEffect, useState } from "react";
import { Button, Divider, Modal, Segmented, Space, Tag, Typography } from "antd";
import {
  BulbOutlined,
  LogoutOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Profile from "../Settings/Profile/Profile";
import Help from "../Settings/Help/Help";
import Suggestion from "../Settings/Suggestion/Suggestion";
import AvatarWithName from "../AvatarwithName";
import { accountTypeFor } from "../../shared/accountTypes";
import { useTheme } from "../../theme/ThemeProvider";
import { fetchUserByUsername } from "../../api/userService";
import "./popoveruser.css";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// The account panel behind the avatar: who is signed in (name, handle,
// account type, division), the appearance switch, the account actions, and
// sign-out. Kept small on purpose — it is a menu, not a page.
// ---------------------------------------------------------------------------

const UserPopover = ({ name, userHandle, handleLogout, userData, division, role, onNavigate }) => {
  const [modal, setModal] = useState(null); // 'profile' | 'help' | 'feature'
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const modalWidth = modal === "help" ? 700 : modal === "feature" ? 600 : windowWidth <= 1080 ? 600 : 420;
  const type = accountTypeFor(role || userData?.role || userData?.permission, userData?.ermsUnit);

  const go = (path) => {
    onNavigate?.();
    navigate(path);
  };

  const prefetch = () => {
    fetchUserByUsername(userHandle).catch(() => {});
  };

  return (
    <div className="eu-account-panel">
      <div className="eu-account-head">
        <AvatarWithName userHandle={userHandle} size="48px" />
        <div className="eu-account-who">
          <Text strong className="eu-account-name">{name}</Text>
          <Text type="secondary" className="eu-account-handle">@{userHandle}</Text>
          <Space size={4} wrap>
            <Tag color={type.color} style={{ marginInlineEnd: 0 }}>{type.label}</Tag>
            {userData?.isDemo && <Tag color="gold" style={{ marginInlineEnd: 0 }}>demo</Tag>}
          </Space>
          {division && <Text type="secondary" className="eu-account-division">{division}</Text>}
        </div>
      </div>

      <div className="eu-account-theme">
        <Text type="secondary" className="eu-account-label">Appearance</Text>
        <Segmented
          block
          size="small"
          value={mode}
          onChange={setMode}
          options={[
            { value: "light", label: <span><SunOutlined /> Light</span> },
            { value: "dark", label: <span><MoonOutlined /> Dark</span> },
          ]}
        />
        <Text type="secondary" className="eu-account-hint">Saved to your account — the same on every device.</Text>
      </div>

      <Divider className="eu-account-divider" />

      <div className="eu-account-actions">
        <Button type="text" block icon={<UserOutlined />} onMouseEnter={prefetch} onClick={() => setModal("profile")}>
          My profile
        </Button>
        <Button type="text" block icon={<SettingOutlined />} onClick={() => go("/universe/settings/general")}>
          Settings
        </Button>
        <Button type="text" block icon={<QuestionCircleOutlined />} onClick={() => setModal("help")}>
          Help
        </Button>
        <Button type="text" block icon={<BulbOutlined />} onClick={() => setModal("feature")}>
          Suggest a feature
          <Tag color="volcano" style={{ marginInlineStart: 8, marginInlineEnd: 0 }}>beta</Tag>
        </Button>
      </div>

      <Divider className="eu-account-divider" />

      <Button block danger icon={<LogoutOutlined />} onClick={handleLogout} className="eu-account-signout">
        Sign out
      </Button>

      <Modal open={Boolean(modal)} onCancel={() => setModal(null)} footer={null} width={modalWidth} destroyOnClose>
        {modal === "profile" && <Profile name={name} username={userHandle} />}
        {modal === "help" && <Help name={name} username={userHandle} theme={mode} />}
        {modal === "feature" && <Suggestion name={name} username={userHandle} theme={mode} />}
      </Modal>
    </div>
  );
};

export default UserPopover;
